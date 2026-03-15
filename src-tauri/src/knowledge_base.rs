use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;

// ─── Row types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeItemRow {
    pub id: String,
    pub tags: Vec<String>,
    pub source: String,              // "ActivityLog" | "Manual" | "BrowserExtension" | "Journal"
    pub content: String,             // Multi-line text, can contain URLs, notes, anything
    pub metadata: Option<sqlx::types::Json<serde_json::Value>>, // Title, Tags, Difficulty, RelatedItemIds
    pub status: String,              // "Inbox" | "Planned" | "Completed" | "Archived"
    pub next_review_date: Option<DateTime<Utc>>,
    pub linked_note_id: Option<String>,        // Link to local SQLite notes table
    pub linked_journal_date: Option<String>,   // Link to journal entry (YYYY-MM-DD)
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeLinkRow {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub link_type: String,           // "related" | "blocks" | "requires"
    pub created_at: DateTime<Utc>,
}

// ─── Request types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlCapture {
    pub url: String,
    pub activity_id: String,
    pub activity_title: String,
    pub activity_category: String,
    pub detected_in: String,  // "title" | "description"
    pub url_type: String,     // "leetcode" | "codeforces" | "github" | "generic"
}

// Generic link capture — source-agnostic, works from any context with title/description/links
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureLink {
    pub url: String,
    pub url_type: String,          // "leetcode" | "codeforces" | "github" | "generic"
    pub source_type: String,       // "activity" | "note" | "journal" | "manual" | etc.
    pub source_id: String,         // ID of the originating entity
    pub source_title: String,      // Human-readable title of the source
    pub source_context: String,    // "title" | "description" | "content" — where the link was found
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKnowledgeItemRequest {
    pub tags: Vec<String>,
    pub source: String,
    pub content: String,
    pub metadata: Option<serde_json::Value>,
    pub status: Option<String>,
    pub next_review_date: Option<String>, // ISO 8601
    pub linked_note_id: Option<String>,
    pub linked_journal_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKnowledgeItemRequest {
    pub tags: Option<Vec<String>>,
    pub content: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub status: Option<String>,
    pub next_review_date: Option<String>, // ISO 8601
    pub linked_note_id: Option<String>,
    pub linked_journal_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeItemFilters {
    pub status: Option<String>,
    pub item_type: Option<String>,
    pub search: Option<String>,
    pub due_for_review: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKnowledgeLinkRequest {
    pub source_id: String,
    pub target_id: String,
    pub link_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateCheckResult {
    pub is_duplicate: bool,
    pub existing_items: Vec<KnowledgeItemRow>,
}

// ─── Commands ───────────────────────────────────────────────────────

/// Create a new knowledge item
#[tauri::command]
pub async fn create_knowledge_item(
    db: State<'_, PosDb>,
    req: CreateKnowledgeItemRequest,
) -> PosResult<KnowledgeItemRow> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();

    let next_review = req.next_review_date
        .as_ref()
        .and_then(|s| s.parse::<DateTime<Utc>>().ok());

    let metadata_json = req.metadata.as_ref().map(|m| sqlx::types::Json(m.clone()));

    let row = sqlx::query_as::<_, KnowledgeItemRow>(
        r#"INSERT INTO knowledge_items (
            id, tags, source, content, metadata, status, next_review_date, 
            linked_note_id, linked_journal_date, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        RETURNING id, tags, source, content, metadata, status, next_review_date, 
                  linked_note_id, linked_journal_date, created_at, updated_at"#,
    )
    .bind(&id)
    .bind(&req.tags)
    .bind(&req.source)
    .bind(&req.content)
    .bind(metadata_json)
    .bind(req.status.unwrap_or_else(|| "Inbox".to_string()))
    .bind(next_review)
    .bind(&req.linked_note_id)
    .bind(&req.linked_journal_date)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("create_knowledge_item", e))?;

    // Temporal linking: Find activities that overlap with KB item creation time
    // Query activities where created_at falls between start_time and end_time
    let overlapping_activities: Vec<(String,)> = sqlx::query_as(
        r#"SELECT id FROM pos_activities 
           WHERE $1 >= start_time AND $1 <= end_time
           ORDER BY start_time DESC
           LIMIT 5"#
    )
    .bind(now)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    // Create temporal links to overlapping activities using activity_knowledge_links table
    for (activity_id,) in overlapping_activities {
        let link_id = gen_id();
        let _ = sqlx::query(
            r#"INSERT INTO activity_knowledge_links (id, activity_id, kb_item_id, link_type, created_at)
               VALUES ($1, $2, $3, 'temporal', $4)
               ON CONFLICT (activity_id, kb_item_id) DO NOTHING"#
        )
        .bind(&link_id)
        .bind(&activity_id)
        .bind(&id)
        .bind(now)
        .execute(pool)
        .await;
        
        log::info!("[KB] Temporal link created: KB {} -> Activity {}", id, activity_id);
    }

    log::info!("[KB] Created knowledge item {} with tags {:?}", id, req.tags);
    Ok(row)
}

/// Get knowledge items with optional filters
#[tauri::command]
pub async fn get_knowledge_items(
    db: State<'_, PosDb>,
    filters: Option<KnowledgeItemFilters>,
) -> PosResult<Vec<KnowledgeItemRow>> {
    let pool = &db.0;

    let mut query = "SELECT id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at FROM knowledge_items WHERE 1=1".to_string();
    let mut bindings: Vec<String> = Vec::new();

    if let Some(f) = filters {
        if let Some(status) = f.status {
            query.push_str(&format!(" AND status = ${}", bindings.len() + 1));
            bindings.push(status);
        }

        if let Some(tag) = f.item_type {
            query.push_str(&format!(" AND ${}=ANY(tags)", bindings.len() + 1));
            bindings.push(tag);
        }

        if let Some(search) = f.search {
            query.push_str(&format!(" AND (content ILIKE ${} OR metadata::text ILIKE ${})", 
                bindings.len() + 1, bindings.len() + 1));
            bindings.push(format!("%{}%", search));
        }

        if let Some(true) = f.due_for_review {
            query.push_str(" AND next_review_date IS NOT NULL AND next_review_date <= NOW()");
        }
    }

    query.push_str(" ORDER BY created_at DESC");

    let mut q = sqlx::query_as::<_, KnowledgeItemRow>(&query);
    for binding in bindings {
        q = q.bind(binding);
    }

    let rows = q.fetch_all(pool)
        .await
        .map_err(|e| db_context("get_knowledge_items", e))?;

    Ok(rows)
}

/// Update a knowledge item
#[tauri::command]
pub async fn update_knowledge_item(
    db: State<'_, PosDb>,
    id: String,
    req: UpdateKnowledgeItemRequest,
) -> PosResult<KnowledgeItemRow> {
    let pool = &db.0;
    let now = Utc::now();

    // Build dynamic update query
    let mut updates: Vec<String> = Vec::new();
    let mut bind_index = 1;

    if req.tags.is_some() {
        updates.push(format!("tags = ${}", bind_index));
        bind_index += 1;
    }
    if req.content.is_some() {
        updates.push(format!("content = ${}", bind_index));
        bind_index += 1;
    }
    if req.metadata.is_some() {
        updates.push(format!("metadata = ${}", bind_index));
        bind_index += 1;
    }
    if req.status.is_some() {
        updates.push(format!("status = ${}", bind_index));
        bind_index += 1;
    }
    if req.next_review_date.is_some() {
        updates.push(format!("next_review_date = ${}", bind_index));
        bind_index += 1;
    }
    if req.linked_note_id.is_some() {
        updates.push(format!("linked_note_id = ${}", bind_index));
        bind_index += 1;
    }
    if req.linked_journal_date.is_some() {
        updates.push(format!("linked_journal_date = ${}", bind_index));
        bind_index += 1;
    }

    updates.push(format!("updated_at = ${}", bind_index));

    let query = format!(
        "UPDATE knowledge_items SET {} WHERE id = ${} RETURNING id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at",
        updates.join(", "),
        bind_index + 1
    );

    let mut q = sqlx::query_as::<_, KnowledgeItemRow>(&query);

    if let Some(v) = req.tags {
        q = q.bind(v);
    }
    if let Some(v) = req.content {
        q = q.bind(v);
    }
    if let Some(v) = req.metadata {
        q = q.bind(sqlx::types::Json(v));
    }
    if let Some(v) = req.status {
        q = q.bind(v);
    }
    if let Some(v) = req.next_review_date {
        let parsed = v.parse::<DateTime<Utc>>().ok();
        q = q.bind(parsed);
    }
    if let Some(v) = req.linked_note_id {
        q = q.bind(v);
    }
    if let Some(v) = req.linked_journal_date {
        q = q.bind(v);
    }

    q = q.bind(now).bind(&id);

    let row = q.fetch_one(pool)
        .await
        .map_err(|e| db_context("update_knowledge_item", e))?;

    log::info!("[KB] Updated knowledge item {}", id);
    Ok(row)
}

/// Delete a knowledge item
#[tauri::command]
pub async fn delete_knowledge_item(
    db: State<'_, PosDb>,
    id: String,
) -> PosResult<()> {
    let pool = &db.0;

    sqlx::query("DELETE FROM knowledge_items WHERE id = $1")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| db_context("delete_knowledge_item", e))?;

    log::info!("[KB] Deleted knowledge item {}", id);
    Ok(())
}

/// Create a knowledge link
#[tauri::command]
pub async fn create_knowledge_link(
    db: State<'_, PosDb>,
    req: CreateKnowledgeLinkRequest,
) -> PosResult<KnowledgeLinkRow> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();

    let row = sqlx::query_as::<_, KnowledgeLinkRow>(
        r#"INSERT INTO knowledge_links (id, source_id, target_id, link_type, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, source_id, target_id, link_type, created_at"#,
    )
    .bind(&id)
    .bind(&req.source_id)
    .bind(&req.target_id)
    .bind(&req.link_type)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("create_knowledge_link", e))?;

    log::info!("[KB] Created link {} -> {}", req.source_id, req.target_id);
    Ok(row)
}

/// Get knowledge links (backlinks support)
#[tauri::command]
pub async fn get_knowledge_links(
    db: State<'_, PosDb>,
    item_id: String,
    direction: Option<String>, // "outgoing" | "incoming" | "both" (default)
) -> PosResult<Vec<KnowledgeLinkRow>> {
    let pool = &db.0;

    let query = match direction.as_deref() {
        Some("outgoing") => {
            "SELECT id, source_id, target_id, link_type, created_at FROM knowledge_links WHERE source_id = $1 ORDER BY created_at DESC"
        }
        Some("incoming") => {
            "SELECT id, source_id, target_id, link_type, created_at FROM knowledge_links WHERE target_id = $1 ORDER BY created_at DESC"
        }
        _ => {
            "SELECT id, source_id, target_id, link_type, created_at FROM knowledge_links WHERE source_id = $1 OR target_id = $1 ORDER BY created_at DESC"
        }
    };

    let rows = sqlx::query_as::<_, KnowledgeLinkRow>(query)
        .bind(&item_id)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("get_knowledge_links", e))?;

    Ok(rows)
}

/// Delete a knowledge link
#[tauri::command]
pub async fn delete_knowledge_link(
    db: State<'_, PosDb>,
    link_id: String,
) -> PosResult<()> {
    let pool = &db.0;

    let result = sqlx::query("DELETE FROM knowledge_links WHERE id = $1")
        .bind(&link_id)
        .execute(pool)
        .await
        .map_err(|e| db_context("delete_knowledge_link", e))?;

    if result.rows_affected() == 0 {
        return Err(PosError::NotFound(format!("Link not found: {}", link_id)));
    }

    log::info!("[KB] Deleted knowledge link {}", link_id);
    Ok(())
}

/// Check for duplicate URLs in knowledge items (extracts URLs from content)
#[tauri::command]
pub async fn check_knowledge_duplicates(
    db: State<'_, PosDb>,
    content: String,
    editing_item_id: Option<String>,
) -> PosResult<DuplicateCheckResult> {
    let pool = &db.0;

    // Extract URLs from content
    let urls = extract_urls(&content);
    
    if urls.is_empty() {
        return Ok(DuplicateCheckResult {
            is_duplicate: false,
            existing_items: vec![],
        });
    }

    // Check if any extracted URL exists in any KB item's content
    let mut all_duplicates: Vec<KnowledgeItemRow> = Vec::new();
    
    for url in urls {
        let rows = sqlx::query_as::<_, KnowledgeItemRow>(
            "SELECT id, tags, source, content, metadata, status, next_review_date, linked_note_id, linked_journal_date, created_at, updated_at 
             FROM knowledge_items 
             WHERE content LIKE $1"
        )
        .bind(format!("%{}%", url))
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("check_knowledge_duplicates", e))?;
        
        all_duplicates.extend(rows);
    }

    // Deduplicate by ID
    all_duplicates.sort_by(|a, b| a.id.cmp(&b.id));
    all_duplicates.dedup_by(|a, b| a.id == b.id);

    // Exclude the item being edited
    if let Some(editing_id) = editing_item_id {
        all_duplicates.retain(|item| item.id != editing_id);
    }

    Ok(DuplicateCheckResult {
        is_duplicate: !all_duplicates.is_empty(),
        existing_items: all_duplicates,
    })
}

/// Extract URLs from text using regex
pub fn extract_urls(text: &str) -> Vec<String> {
    // Inline regex compilation (not a performance concern for this use case)
    match regex::Regex::new(
        r"https?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+"
    ) {
        Ok(url_regex) => url_regex
            .find_iter(text)
            .map(|m| m.as_str().to_string())
            .collect(),
        Err(_) => Vec::new(),
    }
}

