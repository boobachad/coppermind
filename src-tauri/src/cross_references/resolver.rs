// ─── Entity Resolvers ───────────────────────────────────────────────
// Functions to resolve entity references to actual database records.

use sqlx::PgPool;

use super::models::{EntityReference, CachedEntity, CrossReferenceError};

/// Resolves a note entity by ID or title fuzzy match.
#[must_use]
pub async fn resolve_note(
    pool: &PgPool,
    identifier: &str,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM notes WHERE id = $1 OR title ILIKE $2 LIMIT 1"
    )
    .bind(identifier)
    .bind(format!("%{}%", identifier))
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, title)) => Ok(EntityReference {
            entity_type: "note".to_string(),
            entity_id: id,
            title,
            preview: None,
            exists: true,
        }),
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "note".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a KB item by ID with optional tag filtering.
#[must_use]
pub async fn resolve_kb_item(
    pool: &PgPool,
    identifier: &str,
    sub_identifier: Option<&str>,
) -> Result<EntityReference, CrossReferenceError> {
    let (id, tag_filter) = if let Some(sub) = sub_identifier {
        (sub, Some(identifier))
    } else {
        (identifier, None)
    };
    
    let result = if let Some(tag) = tag_filter {
        sqlx::query_as::<_, (String, String)>(
            "SELECT id, content FROM knowledge_items WHERE id = $1 AND $2 = ANY(tags) LIMIT 1"
        )
        .bind(id)
        .bind(tag)
        .fetch_optional(pool)
        .await?
    } else {
        sqlx::query_as::<_, (String, String)>(
            "SELECT id, content FROM knowledge_items WHERE id = $1 LIMIT 1"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?
    };
    
    match result {
        Some((id, content)) => {
            let preview: String = content.chars().take(100).collect();
            Ok(EntityReference {
                entity_type: "kb".to_string(),
                entity_id: id,
                title: preview.clone(),
                preview: Some(preview),
                exists: true,
            })
        },
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "kb".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a journal entry by date.
#[must_use]
pub async fn resolve_journal(
    pool: &PgPool,
    date: &str,
) -> Result<EntityReference, CrossReferenceError> {
    if !is_valid_date(date) {
        return Err(CrossReferenceError::InvalidDateFormat(date.to_string()));
    }
    
    let result = sqlx::query_as::<_, (String,)>(
        "SELECT date FROM journal_entries WHERE date = $1 LIMIT 1"
    )
    .bind(date)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((date,)) => Ok(EntityReference {
            entity_type: "journal".to_string(),
            entity_id: date.clone(),
            title: format!("Journal: {}", date),
            preview: None,
            exists: true,
        }),
        None => Ok(EntityReference {
            entity_type: "journal".to_string(),
            entity_id: date.to_string(),
            title: format!("Journal: {}", date),
            preview: None,
            exists: false,
        }),
    }
}

/// Resolves a goal by ID.
#[must_use]
pub async fn resolve_goal(
    pool: &PgPool,
    identifier: &str,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM pos_goals WHERE id = $1 LIMIT 1"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, title)) => Ok(EntityReference {
            entity_type: "goal".to_string(),
            entity_id: id,
            title,
            preview: None,
            exists: true,
        }),
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "goal".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a milestone by ID.
#[must_use]
pub async fn resolve_milestone(
    pool: &PgPool,
    identifier: &str,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM pos_milestones WHERE id = $1 LIMIT 1"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, title)) => Ok(EntityReference {
            entity_type: "milestone".to_string(),
            entity_id: id,
            title,
            preview: None,
            exists: true,
        }),
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "milestone".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves an activity by ID.
#[must_use]
pub async fn resolve_activity(
    pool: &PgPool,
    identifier: &str,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM pos_activities WHERE id = $1 LIMIT 1"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, title)) => Ok(EntityReference {
            entity_type: "activity".to_string(),
            entity_id: id,
            title,
            preview: None,
            exists: true,
        }),
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "activity".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a grid page or specific slot by date.
#[must_use]
pub async fn resolve_grid(
    pool: &PgPool,
    date: &str,
    slot: Option<&str>,
) -> Result<EntityReference, CrossReferenceError> {
    if !is_valid_date(date) {
        return Err(CrossReferenceError::InvalidDateFormat(date.to_string()));
    }
    
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pos_activities WHERE date = $1"
    )
    .bind(date)
    .fetch_one(pool)
    .await?;
    
    let title = if let Some(slot_id) = slot {
        format!("Grid: {} ({})", date, slot_id)
    } else {
        format!("Grid: {}", date)
    };
    
    Ok(EntityReference {
        entity_type: "grid".to_string(),
        entity_id: date.to_string(),
        title,
        preview: Some(format!("{} activities", count)),
        exists: count > 0,
    })
}

/// Resolves a ladder or specific problem.
#[must_use]
pub async fn resolve_ladder(
    pool: &PgPool,
    identifier: &str,
    problem: Option<&str>,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT id, name FROM cf_ladders WHERE id = $1 LIMIT 1"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, name)) => {
            let title = if let Some(prob) = problem {
                format!("{} - {}", name, prob)
            } else {
                name
            };
            Ok(EntityReference {
                entity_type: "ladder".to_string(),
                entity_id: id,
                title,
                preview: None,
                exists: true,
            })
        },
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "ladder".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a category or specific problem.
#[must_use]
pub async fn resolve_category(
    pool: &PgPool,
    identifier: &str,
    problem: Option<&str>,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT id, name FROM cf_categories WHERE id = $1 LIMIT 1"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, name)) => {
            let title = if let Some(prob) = problem {
                format!("{} - {}", name, prob)
            } else {
                name
            };
            Ok(EntityReference {
                entity_type: "category".to_string(),
                entity_id: id,
                title,
                preview: None,
                exists: true,
            })
        },
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "category".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a sheets problem.
#[must_use]
pub async fn resolve_sheets(
    pool: &PgPool,
    identifier: &str,
    _sub: Option<&str>,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT problem_id, problem_title FROM pos_submissions WHERE problem_id = $1 LIMIT 1"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, title)) => Ok(EntityReference {
            entity_type: "sheets".to_string(),
            entity_id: id,
            title,
            preview: None,
            exists: true,
        }),
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "sheets".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a book by ID.
#[must_use]
pub async fn resolve_book(
    pool: &PgPool,
    identifier: &str,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM books WHERE id = $1 LIMIT 1"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, title)) => Ok(EntityReference {
            entity_type: "book".to_string(),
            entity_id: id,
            title,
            preview: None,
            exists: true,
        }),
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "book".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a retrospective by ID.
#[must_use]
pub async fn resolve_retrospective(
    pool: &PgPool,
    identifier: &str,
) -> Result<EntityReference, CrossReferenceError> {
    let result = sqlx::query_as::<_, (String, String)>(
        "SELECT id, title FROM retrospectives WHERE id = $1 LIMIT 1"
    )
    .bind(identifier)
    .fetch_optional(pool)
    .await?;
    
    match result {
        Some((id, title)) => Ok(EntityReference {
            entity_type: "retrospective".to_string(),
            entity_id: id,
            title,
            preview: None,
            exists: true,
        }),
        None => Err(CrossReferenceError::EntityNotFound {
            entity_type: "retrospective".to_string(),
            identifier: identifier.to_string(),
        }),
    }
}

/// Resolves a URL (always valid).
#[must_use]
pub fn resolve_url(url: &str) -> Result<EntityReference, CrossReferenceError> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(CrossReferenceError::InvalidUrlFormat(url.to_string()));
    }
    
    Ok(EntityReference {
        entity_type: "url".to_string(),
        entity_id: url.to_string(),
        title: url.to_string(),
        preview: None,
        exists: true,
    })
}

// ─── Cache Fetchers ─────────────────────────────────────────────────

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

// ─── Helper Functions ───────────────────────────────────────────────

/// Validates date format (YYYY-MM-DD).
fn is_valid_date(date: &str) -> bool {
    if date.len() != 10 {
        return false;
    }
    
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return false;
    }
    
    parts[0].len() == 4 && parts[1].len() == 2 && parts[2].len() == 2
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
}
