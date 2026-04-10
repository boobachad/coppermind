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

    // Check for exact URL match to avoid false positives from LIKE
    let existing = sqlx::query_as::<_, KnowledgeItemRow>(
        "SELECT id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at \
         FROM knowledge_items \
         WHERE content = $1 \
         LIMIT 1"
    )
    .bind(&url)
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
    const ALLOWED_STATUSES: &[&str] = &["Inbox", "Planned", "Completed", "Archived"];
    if !ALLOWED_STATUSES.contains(&status.as_str()) {
        return Err(PosError::InvalidInput(format!(
            "Invalid status '{}': must be one of {:?}",
            status, ALLOWED_STATUSES
        )));
    }

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

    // Validate date format before constructing daily_id
    chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| PosError::InvalidInput(format!("Invalid date format '{}': expected YYYY-MM-DD", date)))?;

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

    // Collect unique source types across all stored URLs for tagging
    let mut source_tags: Vec<String> = vec!["daily-capture".to_string(), date.clone()];
    if let Some(arr) = metadata["urls"].as_array() {
        let mut seen = std::collections::HashSet::new();
        for entry in arr {
            if let Some(st) = entry.get("source_type").and_then(|v| v.as_str()) {
                if seen.insert(st.to_string()) {
                    source_tags.push(st.to_string());
                }
            }
        }
    }

    let row = sqlx::query_as::<_, KnowledgeItemRow>(
        r#"INSERT INTO knowledge_items
           (id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at)
           VALUES ($1, $2, 'DailyCapture', $3, $4, 'Inbox', NULL, NULL, NULL, $5, $5)
           ON CONFLICT (id) DO UPDATE SET
              tags = EXCLUDED.tags,
              content = EXCLUDED.content,
              metadata = EXCLUDED.metadata,
              updated_at = EXCLUDED.updated_at
           RETURNING id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at"#
    )
    .bind(&daily_id)
    .bind(&source_tags)
    .bind(format!("{} links captured on {}", total_urls, date))
    .bind(sqlx::types::Json(metadata))
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("upsert daily KB", e))?;

    log::info!("[KB] Captured {} links for date {}", urls.len(), date);
    Ok(row)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackfillResult {
    pub dates_processed: usize,
    pub urls_captured: usize,
    pub dates: Vec<String>,
}

/// Strip trailing punctuation that the regex may capture as part of a URL
/// e.g. "https://github.com/rough-stuff," → "https://github.com/rough-stuff"
fn clean_url(url: &str) -> String {
    url.trim_end_matches(|c: char| matches!(c, ',' | ')' | '.' | ';' | ':' | '>' | '"' | '\'' | ']'))
        .to_string()
}

/// Backfill daily KB captures from all historical activities that contain URLs.
/// Safe to run multiple times — deduplicates by (normalized_url, source_id).
/// Also cleans up duplicate entries in existing daily items.
#[tauri::command]
pub async fn backfill_activity_urls(db: State<'_, PosDb>) -> PosResult<BackfillResult> {
    let pool = &db.0;

    #[derive(sqlx::FromRow)]
    struct ActivityRow {
        id: String,
        date: String,
        title: String,
        description: String,
    }

    // Fetch all activities that contain URLs
    let activities = sqlx::query_as::<_, ActivityRow>(
        r#"SELECT id, date, title, description
           FROM pos_activities
           WHERE title ~ 'https?://' OR description ~ 'https?://'
           ORDER BY date ASC, start_time ASC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("backfill fetch activities", e))?;

    if activities.is_empty() {
        return Ok(BackfillResult { dates_processed: 0, urls_captured: 0, dates: vec![] });
    }

    let url_re = regex::Regex::new(r"https?://[^\s]+")
        .map_err(|e| crate::pos::error::PosError::InvalidInput(e.to_string()))?;

    let detect_type = |url: &str| -> &'static str {
        if url.contains("leetcode.com")   { return "leetcode"; }
        if url.contains("codeforces.com") { return "codeforces"; }
        if url.contains("github.com")     { return "github"; }
        "other"
    };

    // Group by date
    let mut by_date: std::collections::BTreeMap<String, Vec<&ActivityRow>> =
        std::collections::BTreeMap::new();
    for act in &activities {
        by_date.entry(act.date.clone()).or_default().push(act);
    }

    let mut total_new = 0usize;
    let mut processed_dates: Vec<String> = vec![];

    for (date, acts) in &by_date {
        if chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
            continue;
        }

        let daily_id = format!("daily_{}", date);
        let now = Utc::now();

        // ── Build candidate links from activities ──────────────────
        // Dedup within this batch by (clean_url, source_id)
        let mut seen_in_batch: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
        let mut candidates: Vec<serde_json::Value> = vec![];

        for act in acts {
            let combined = format!("{} {}", act.title, act.description);
            for m in url_re.find_iter(&combined) {
                let raw = m.as_str();
                let url = clean_url(raw);
                if url.len() < 10 { continue; } // skip garbage

                let key = (url.clone(), act.id.clone());
                if seen_in_batch.contains(&key) { continue; }
                seen_in_batch.insert(key);

                let url_type = detect_type(&url);
                let context = if act.title.contains(raw) { "title" } else { "description" };
                candidates.push(json!({
                    "url": url,
                    "url_type": url_type,
                    "source_type": "activity",
                    "source_id": act.id,
                    "source_title": act.title,
                    "source_context": context,
                    "timestamp": now,
                }));
            }
        }

        if candidates.is_empty() { continue; }

        // ── Fetch existing daily item ──────────────────────────────
        let existing = sqlx::query_as::<_, KnowledgeItemRow>(
            "SELECT id, tags, source, content, metadata, status, next_review_date, \
             linked_note_id, linked_journal_date, created_at, updated_at \
             FROM knowledge_items WHERE id = $1",
        )
        .bind(&daily_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| db_context("backfill fetch existing", e))?;

        let (metadata, newly_added) = if let Some(ref item) = existing {
            let raw_meta: serde_json::Value = item.metadata
                .as_ref()
                .map(|m| m.0.clone())
                .unwrap_or_else(|| json!({"urls": []}));

            // Build seen set from existing entries (all new-shape: source_id)
            let existing_arr = raw_meta.get("urls")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            let mut seen_existing: std::collections::HashSet<(String, String)> =
                existing_arr.iter().filter_map(|v| {
                    let url = v.get("url").and_then(|u| u.as_str()).map(String::from)?;
                    let sid = v.get("source_id").and_then(|s| s.as_str()).unwrap_or("").to_string();
                    Some((url, sid))
                }).collect();

            // Merge candidates, skip already-present (url, source_id)
            let mut merged = existing_arr;
            let mut added = 0usize;
            for link in candidates {
                let url = link.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let sid = link.get("source_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let key = (url, sid);
                if !seen_existing.contains(&key) {
                    seen_existing.insert(key);
                    merged.push(link);
                    added += 1;
                }
            }

            (json!({"urls": merged}), added)
        } else {
            let added = candidates.len();
            (json!({"urls": candidates}), added)
        };

        // Always upsert: either creating new or cleaning up existing duplicates/legacy fields
        let count = metadata["urls"].as_array().map(|a| a.len()).unwrap_or(0);

        let mut source_tags: Vec<String> = vec!["daily-capture".to_string(), date.clone()];
        if let Some(arr) = metadata["urls"].as_array() {
            let mut seen_tags = std::collections::HashSet::new();
            for entry in arr {
                if let Some(st) = entry.get("source_type").and_then(|v| v.as_str()) {
                    if seen_tags.insert(st.to_string()) {
                        source_tags.push(st.to_string());
                    }
                }
            }
        }

        sqlx::query(
            r#"INSERT INTO knowledge_items
               (id, tags, source, content, metadata, status, next_review_date,
                linked_note_id, linked_journal_date, created_at, updated_at)
               VALUES ($1, $2, 'DailyCapture', $3, $4, 'Inbox', NULL, NULL, NULL, $5, $5)
               ON CONFLICT (id) DO UPDATE SET
                  source     = 'DailyCapture',
                  tags       = EXCLUDED.tags,
                  content    = EXCLUDED.content,
                  metadata   = EXCLUDED.metadata,
                  updated_at = EXCLUDED.updated_at"#,
        )
        .bind(&daily_id)
        .bind(&source_tags)
        .bind(format!("{} links captured on {}", count, date))
        .bind(sqlx::types::Json(metadata))
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| db_context("backfill upsert", e))?;

        total_new += newly_added;
        processed_dates.push(date.clone());
        log::info!("[KB Backfill] {} — {} new links ({} total)", date, newly_added, count);
    }

    log::info!("[KB Backfill] Done: {} dates, {} new links", processed_dates.len(), total_new);
    Ok(BackfillResult {
        dates_processed: processed_dates.len(),
        urls_captured: total_new,
        dates: processed_dates,
    })
}
