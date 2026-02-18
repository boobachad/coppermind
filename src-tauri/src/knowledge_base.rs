use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, db_context};
use crate::pos::utils::gen_id;

// ─── Row types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeItemRow {
    pub id: String,
    pub item_type: String,           // "Link" | "Problem" | "NoteRef" | "StickyRef" | "Collection"
    pub source: String,              // "ActivityLog" | "Manual" | "BrowserExtension" | "Journal"
    pub content: String,             // URL or Text or JSON array of URLs for Collections
    pub metadata: Option<sqlx::types::Json<serde_json::Value>>, // Title, Tags, Difficulty, RelatedItemIds
    pub status: String,              // "Inbox" | "Planned" | "Completed" | "Archived"
    pub next_review_date: Option<DateTime<Utc>>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKnowledgeItemRequest {
    pub item_type: String,
    pub source: String,
    pub content: String,
    pub metadata: Option<serde_json::Value>,
    pub status: Option<String>,
    pub next_review_date: Option<String>, // ISO 8601
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKnowledgeItemRequest {
    pub item_type: Option<String>,
    pub content: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub status: Option<String>,
    pub next_review_date: Option<String>, // ISO 8601
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
) -> Result<KnowledgeItemRow, PosError> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();

    let next_review = req.next_review_date
        .as_ref()
        .and_then(|s| s.parse::<DateTime<Utc>>().ok());

    let metadata_json = req.metadata.as_ref().map(|m| sqlx::types::Json(m.clone()));

    let row = sqlx::query_as::<_, KnowledgeItemRow>(
        r#"INSERT INTO knowledge_items (
            id, item_type, source, content, metadata, status, next_review_date, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        RETURNING *"#,
    )
    .bind(&id)
    .bind(&req.item_type)
    .bind(&req.source)
    .bind(&req.content)
    .bind(metadata_json)
    .bind(req.status.unwrap_or_else(|| "Inbox".to_string()))
    .bind(next_review)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("create_knowledge_item", e))?;

    log::info!("[KB] Created knowledge item {} of type {}", id, req.item_type);
    Ok(row)
}

/// Get knowledge items with optional filters
#[tauri::command]
pub async fn get_knowledge_items(
    db: State<'_, PosDb>,
    filters: Option<KnowledgeItemFilters>,
) -> Result<Vec<KnowledgeItemRow>, PosError> {
    let pool = &db.0;

    let mut query = "SELECT * FROM knowledge_items WHERE 1=1".to_string();
    let mut bindings: Vec<String> = Vec::new();

    if let Some(f) = filters {
        if let Some(status) = f.status {
            query.push_str(&format!(" AND status = ${}", bindings.len() + 1));
            bindings.push(status);
        }

        if let Some(item_type) = f.item_type {
            query.push_str(&format!(" AND item_type = ${}", bindings.len() + 1));
            bindings.push(item_type);
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
) -> Result<KnowledgeItemRow, PosError> {
    let pool = &db.0;
    let now = Utc::now();

    // Build dynamic update query
    let mut updates: Vec<String> = Vec::new();
    let mut bind_index = 1;

    if req.item_type.is_some() {
        updates.push(format!("item_type = ${}", bind_index));
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

    updates.push(format!("updated_at = ${}", bind_index));

    let query = format!(
        "UPDATE knowledge_items SET {} WHERE id = ${} RETURNING *",
        updates.join(", "),
        bind_index + 1
    );

    let mut q = sqlx::query_as::<_, KnowledgeItemRow>(&query);

    if let Some(v) = req.item_type {
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
) -> Result<(), PosError> {
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
) -> Result<KnowledgeLinkRow, PosError> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();

    let row = sqlx::query_as::<_, KnowledgeLinkRow>(
        r#"INSERT INTO knowledge_links (id, source_id, target_id, link_type, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *"#,
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
) -> Result<Vec<KnowledgeLinkRow>, PosError> {
    let pool = &db.0;

    let query = match direction.as_deref() {
        Some("outgoing") => {
            "SELECT * FROM knowledge_links WHERE source_id = $1 ORDER BY created_at DESC"
        }
        Some("incoming") => {
            "SELECT * FROM knowledge_links WHERE target_id = $1 ORDER BY created_at DESC"
        }
        _ => {
            "SELECT * FROM knowledge_links WHERE source_id = $1 OR target_id = $1 ORDER BY created_at DESC"
        }
    };

    let rows = sqlx::query_as::<_, KnowledgeLinkRow>(query)
        .bind(&item_id)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("get_knowledge_links", e))?;

    Ok(rows)
}

/// Check for duplicate URLs in knowledge items
#[tauri::command]
pub async fn check_knowledge_duplicates(
    db: State<'_, PosDb>,
    content: String,
) -> Result<DuplicateCheckResult, PosError> {
    let pool = &db.0;

    // Check exact content match
    let rows = sqlx::query_as::<_, KnowledgeItemRow>(
        "SELECT * FROM knowledge_items WHERE content = $1"
    )
    .bind(&content)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("check_knowledge_duplicates", e))?;

    Ok(DuplicateCheckResult {
        is_duplicate: !rows.is_empty(),
        existing_items: rows,
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
