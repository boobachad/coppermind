use chrono::Utc;
use serde_json::json;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;
use crate::knowledge_base::{KnowledgeItemRow, KnowledgeLinkRow, CaptureLink};

// ─── Quick Save & Backlinks ─────────────────────────────────────────

/// Quick save a link to knowledge inbox
#[tauri::command]
pub async fn quick_save_link(
    db: State<'_, PosDb>,
    url: String,
) -> PosResult<KnowledgeItemRow> {
    let pool = &db.0;

    // Check for duplicate URL using LIKE to find URL anywhere in content
    let existing = sqlx::query_as::<_, KnowledgeItemRow>(
        "SELECT id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at \
         FROM knowledge_items \
         WHERE content LIKE $1 \
         LIMIT 1"
    )
    .bind(format!("%{}%", url))
    .fetch_optional(pool)
    .await
    .map_err(|e| db_context("check duplicate link", e))?;

    if let Some(item) = existing {
        return Err(PosError::InvalidInput(format!("Link already exists with ID: {}", item.id)));
    }

    let id = gen_id();
    let now = Utc::now();

    let row = sqlx::query_as::<_, KnowledgeItemRow>(
        r#"INSERT INTO knowledge_items
           (id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at)
           VALUES ($1, ARRAY['link']::TEXT[], 'Manual', $2, NULL, 'Inbox', NULL, NULL, NULL, $3, $3)
           RETURNING id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at"#
    )
    .bind(&id)
    .bind(&url)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("quick_save_link", e))?;

    log::info!("[KB] Quick saved link: {}", id);
    Ok(row)
}

/// Get backlinks for a knowledge item (bidirectional)
#[tauri::command]
pub async fn get_backlinks(
    db: State<'_, PosDb>,
    item_id: String,
) -> PosResult<Vec<KnowledgeLinkRow>> {
    let pool = &db.0;

    let links = sqlx::query_as::<_, KnowledgeLinkRow>(
        r#"SELECT id, source_id, target_id, link_type, created_at FROM knowledge_links
           WHERE source_id = $1 OR target_id = $1
           ORDER BY created_at DESC"#
    )
    .bind(&item_id)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("get_backlinks", e))?;

    Ok(links)
}

/// Bulk update knowledge item status
#[tauri::command]
pub async fn bulk_update_kb_status(
    db: State<'_, PosDb>,
    item_ids: Vec<String>,
    status: String,
) -> PosResult<i64> {
    let pool = &db.0;
    let now = Utc::now();

    let result = sqlx::query(
        "UPDATE knowledge_items SET status = $1, updated_at = $2 WHERE id = ANY($3)"
    )
    .bind(&status)
    .bind(now)
    .bind(&item_ids)
    .execute(pool)
    .await
    .map_err(|e| db_context("bulk_update_kb_status", e))?;

    log::info!("[KB] Bulk updated {} items to status: {}", result.rows_affected(), status);
    Ok(result.rows_affected() as i64)
}

/// Get KB items linked to an activity (temporal or manual links)
#[tauri::command]
pub async fn get_kb_items_for_activity(
    db: State<'_, PosDb>,
    activity_id: String,
) -> PosResult<Vec<KnowledgeItemRow>> {
    let pool = &db.0;

    let items = sqlx::query_as::<_, KnowledgeItemRow>(
        r#"SELECT ki.id, ki.tags, ki.source, ki.content, ki.metadata, ki.status,
                  ki.next_review_date, ki.linked_note_id, ki.linked_journal_date,
                  ki.created_at, ki.updated_at
           FROM knowledge_items ki
           INNER JOIN activity_knowledge_links akl ON ki.id = akl.kb_item_id
           WHERE akl.activity_id = $1
           ORDER BY akl.created_at DESC"#
    )
    .bind(&activity_id)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("get_kb_items_for_activity", e))?;

    log::info!("[KB] Retrieved {} KB items for activity {}", items.len(), activity_id);
    Ok(items)
}

/// Capture links from any source into the daily KB item
#[tauri::command]
pub async fn capture_daily_urls(
    db: State<'_, PosDb>,
    date: String,  // YYYY-MM-DD
    urls: Vec<CaptureLink>,
) -> PosResult<KnowledgeItemRow> {
    let pool = &db.0;
    let daily_id = format!("daily_{}", date);
    let now = Utc::now();

    if urls.is_empty() {
        return Err(PosError::InvalidInput("No URLs provided".to_string()));
    }

    // Fetch existing daily KB item
    let existing = sqlx::query_as::<_, KnowledgeItemRow>(
        "SELECT id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at \
         FROM knowledge_items WHERE id = $1"
    )
    .bind(&daily_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| db_context("fetch daily KB", e))?;

    // Build new link entries with source fingerprint
    let new_links: Vec<serde_json::Value> = urls.iter().map(|u| {
        json!({
            "url": u.url,
            "url_type": u.url_type,
            "source_type": u.source_type,
            "source_id": u.source_id,
            "source_title": u.source_title,
            "source_context": u.source_context,
            "timestamp": now
        })
    }).collect();

    let metadata = if let Some(item) = existing {
        let mut meta: serde_json::Value = item.metadata
            .map(|m| m.0)
            .unwrap_or_else(|| json!({"urls": []}));

        if let Some(urls_array) = meta.get_mut("urls").and_then(|v| v.as_array_mut()) {
            // Deduplicate by (url, source_id) pair
            let existing_keys: std::collections::HashSet<(String, String)> = urls_array
                .iter()
                .filter_map(|v| {
                    let url = v.get("url").and_then(|u| u.as_str()).map(String::from)?;
                    let sid = v.get("source_id").and_then(|s| s.as_str()).unwrap_or("").to_string();
                    Some((url, sid))
                })
                .collect();

            for link in new_links {
                let url_str = link.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
                let sid_str = link.get("source_id").and_then(|s| s.as_str()).unwrap_or("").to_string();
                if !existing_keys.contains(&(url_str, sid_str)) {
                    urls_array.push(link);
                }
            }
        } else {
            meta["urls"] = json!(new_links);
        }

        meta
    } else {
        json!({"urls": new_links})
    };

    let total_urls = metadata["urls"].as_array().map(|a| a.len()).unwrap_or(0);

    let row = sqlx::query_as::<_, KnowledgeItemRow>(
        r#"INSERT INTO knowledge_items
           (id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at)
           VALUES ($1, ARRAY['daily-capture', 'log-activity', $2]::TEXT[], 'ActivityLog', $3, $4, 'Inbox', NULL, NULL, NULL, $5, $5)
           ON CONFLICT (id) DO UPDATE SET
              tags = EXCLUDED.tags,
              content = EXCLUDED.content,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
           RETURNING id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at"#
    )
    .bind(&daily_id)
    .bind(&date)
    .bind(format!("{} links captured on {}", total_urls, date))
    .bind(sqlx::types::Json(metadata))
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("upsert daily KB", e))?;

    log::info!("[KB] Captured {} links for date {}", urls.len(), date);
    Ok(row)
}
