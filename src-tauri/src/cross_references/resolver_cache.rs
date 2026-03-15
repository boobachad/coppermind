// Cache fetcher functions — populate the entity search cache.

use sqlx::PgPool;
use super::models::{CachedEntity, CrossReferenceError};

/// Fetch all notes for cache.
pub async fn fetch_notes_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let notes = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM notes ORDER BY updated_at DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(notes.into_iter().map(|(id, title)| CachedEntity {
        entity_type: "note".to_string(),
        entity_id: id.clone(),
        title: title.clone(),
        searchable_text: title,
        metadata: None,
    }).collect())
}

/// Fetch all KB items for cache.
pub async fn fetch_kb_items_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let items = sqlx::query_as::<_, (String, String)>(
        "SELECT id, content FROM knowledge_items ORDER BY updated_at DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(items.into_iter().map(|(id, content)| {
        let preview: String = content.chars().take(100).collect();
        CachedEntity {
            entity_type: "kb".to_string(),
            entity_id: id,
            title: preview.clone(),
            searchable_text: preview,
            metadata: None,
        }
    }).collect())
}

/// Fetch all goals for cache.
pub async fn fetch_goals_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let goals = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM pos_goals ORDER BY updated_at DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(goals.into_iter().map(|(id, title)| CachedEntity {
        entity_type: "goal".to_string(),
        entity_id: id.clone(),
        title: title.clone(),
        searchable_text: title,
        metadata: None,
    }).collect())
}

/// Fetch all milestones for cache.
pub async fn fetch_milestones_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let milestones = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM pos_milestones ORDER BY updated_at DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(milestones.into_iter().map(|(id, title)| CachedEntity {
        entity_type: "milestone".to_string(),
        entity_id: id.clone(),
        title: title.clone(),
        searchable_text: title,
        metadata: None,
    }).collect())
}

/// Fetch all books for cache.
pub async fn fetch_books_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let books = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM books ORDER BY updated_at DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(books.into_iter().map(|(id, title)| CachedEntity {
        entity_type: "book".to_string(),
        entity_id: id.clone(),
        title: title.clone(),
        searchable_text: title,
        metadata: None,
    }).collect())
}

/// Fetch all retrospectives for cache.
pub async fn fetch_retrospectives_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let retros = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM retrospectives ORDER BY updated_at DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(retros.into_iter().map(|(id, title)| CachedEntity {
        entity_type: "retrospective".to_string(),
        entity_id: id.clone(),
        title: title.clone(),
        searchable_text: title,
        metadata: None,
    }).collect())
}

/// Fetch all journal entries for cache.
pub async fn fetch_journals_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let journals = sqlx::query_as::<_, (String,)>(
        "SELECT date FROM journal_entries ORDER BY date DESC"
    )
    .fetch_all(pool)
    .await?;

    Ok(journals.into_iter().map(|(date,)| {
        let title = format!("Journal: {}", date);
        CachedEntity {
            entity_type: "journal".to_string(),
            entity_id: date.clone(),
            title: title.clone(),
            searchable_text: title,
            metadata: Some(date),
        }
    }).collect())
}

/// Fetch all ladders for cache.
pub async fn fetch_ladders_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let ladders = sqlx::query_as::<_, (String, String)>(
        "SELECT id, name FROM cf_ladders ORDER BY name"
    )
    .fetch_all(pool)
    .await?;

    Ok(ladders.into_iter().map(|(id, name)| CachedEntity {
        entity_type: "ladder".to_string(),
        entity_id: id.clone(),
        title: name.clone(),
        searchable_text: name,
        metadata: None,
    }).collect())
}

/// Fetch all categories for cache.
pub async fn fetch_categories_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let categories = sqlx::query_as::<_, (String, String)>(
        "SELECT id, name FROM cf_categories ORDER BY name"
    )
    .fetch_all(pool)
    .await?;

    Ok(categories.into_iter().map(|(id, name)| CachedEntity {
        entity_type: "category".to_string(),
        entity_id: id.clone(),
        title: name.clone(),
        searchable_text: name,
        metadata: None,
    }).collect())
}

/// Fetch all sheets problems for cache.
pub async fn fetch_sheets_for_cache(pool: &PgPool) -> Result<Vec<CachedEntity>, CrossReferenceError> {
    let sheets = sqlx::query_as::<_, (String, String)>(
        "SELECT DISTINCT problem_id, problem_title FROM pos_submissions ORDER BY problem_title"
    )
    .fetch_all(pool)
    .await?;

    Ok(sheets.into_iter().map(|(id, title)| CachedEntity {
        entity_type: "sheets".to_string(),
        entity_id: id.clone(),
        title: title.clone(),
        searchable_text: title,
        metadata: None,
    }).collect())
}
