// ─── Cross-Reference Tauri Commands ─────────────────────────────────
// Command handlers for entity resolution and validation.

use chrono::Utc;
use tauri::State;

use crate::PosDb;
use crate::pos::utils::gen_id;
use super::models::{
    CrossReference, EntityReference, CachedEntity,
    ResolveReferenceRequest, CrossReferenceError,
};
use super::resolver;
use super::registry;

/// Resolves a single entity reference by type and identifier.
///
/// # Arguments
/// * `entity_type` - Type of entity (note, kb, journal, etc.)
/// * `identifier` - Primary identifier for the entity
/// * `sub_identifier` - Optional sub-identifier (e.g., "slot" or "activity" for grid)
/// * `sub_sub_identifier` - Optional sub-sub-identifier (e.g., slot number or activity name)
/// * `db` - Database connection state
///
/// # Errors
/// Returns error if entity type is unknown or entity doesn't exist
#[tauri::command]
#[must_use]
pub async fn resolve_entity_reference(
    entity_type: String,
    identifier: String,
    sub_identifier: Option<String>,
    sub_sub_identifier: Option<String>,
    db: State<'_, PosDb>,
) -> Result<EntityReference, String> {
    let pool = &db.0;
    
    let result = match entity_type.as_str() {
        "note" => resolver::resolve_note(pool, &identifier).await,
        "kb" => resolver::resolve_kb_item(pool, &identifier, sub_identifier.as_deref()).await,
        "journal" => resolver::resolve_journal(pool, &identifier).await,
        "goal" => resolver::resolve_goal(pool, &identifier).await,
        "milestone" => resolver::resolve_milestone(pool, &identifier).await,
        "activity" => resolver::resolve_activity(pool, &identifier).await,
        "grid" => resolver::resolve_grid(pool, &identifier, sub_identifier.as_deref(), sub_sub_identifier.as_deref()).await,
        "ladder" => resolver::resolve_ladder(pool, &identifier, sub_identifier.as_deref()).await,
        "category" => resolver::resolve_category(pool, &identifier, sub_identifier.as_deref()).await,
        "sheets" => resolver::resolve_sheets(pool, &identifier, sub_identifier.as_deref()).await,
        "book" => resolver::resolve_book(pool, &identifier).await,
        "retrospective" => resolver::resolve_retrospective(pool, &identifier).await,
        "url" => resolver::resolve_url(&identifier),
        _ => Err(CrossReferenceError::InvalidEntityType(entity_type)),
    };
    
    result.map_err(|e| e.to_string())
}

/// Validates multiple entity references in a single batch operation.
///
/// # Arguments
/// * `references` - Vector of reference requests to validate
/// * `db` - Database connection state
///
/// # Performance
/// Processes all references in O(n) time with batched database queries
#[tauri::command]
#[must_use]
pub async fn batch_validate_references(
    references: Vec<ResolveReferenceRequest>,
    db: State<'_, PosDb>,
) -> Result<Vec<EntityReference>, String> {
    let mut results = Vec::with_capacity(references.len());
    
    for req in references {
        match resolve_entity_reference(
            req.entity_type.clone(),
            req.identifier.clone(),
            req.sub_identifier,
            None, // sub_sub_identifier not used in batch validation
            db.clone(),
        ).await {
            Ok(entity) => results.push(entity),
            Err(_) => results.push(EntityReference {
                entity_type: req.entity_type,
                entity_id: req.identifier.clone(),
                title: req.identifier,
                preview: None,
                exists: false,
            }),
        }
    }
    
    Ok(results)
}

/// Fetches all entities for client-side cache initialization.
///
/// # Arguments
/// * `db` - Database connection state
///
/// # Performance
/// Loads all entities in O(n) time with indexed queries
#[tauri::command]
#[must_use]
pub async fn get_all_entities_for_cache(
    db: State<'_, PosDb>,
) -> Result<Vec<CachedEntity>, String> {
    let pool = &db.0;
    let mut entities = Vec::new();
    
    // Fetch all entity types
    entities.extend(resolver::fetch_notes_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_kb_items_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_journals_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_goals_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_milestones_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_books_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_retrospectives_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_ladders_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_categories_for_cache(pool).await.unwrap_or_default());
    entities.extend(resolver::fetch_sheets_for_cache(pool).await.unwrap_or_default());
    
    Ok(entities)
}

/// Retrieves all backlinks pointing to a specific entity.
///
/// # Arguments
/// * `entity_type` - Type of target entity
/// * `entity_id` - ID of target entity
/// * `db` - Database connection state
///
/// # Performance
/// Uses indexed query for O(log n) lookup time
#[tauri::command]
#[must_use]
pub async fn get_entity_backlinks(
    entity_type: String,
    entity_id: String,
    db: State<'_, PosDb>,
) -> Result<Vec<CrossReference>, String> {
    let pool = &db.0;
    
    let backlinks = sqlx::query_as::<_, (
        String, String, String, String, String, String, String, Option<String>,
        i32, i32, String, String
    )>(
        "SELECT id, source_entity_type, source_entity_id, source_field, 
                target_entity_type, target_entity_id, reference_text, alias_text,
                position_start, position_end, created_at, updated_at
         FROM cross_references
         WHERE target_entity_type = $1 AND target_entity_id = $2
         ORDER BY created_at DESC"
    )
    .bind(&entity_type)
    .bind(&entity_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(backlinks.into_iter().map(|row| CrossReference {
        id: row.0,
        source_entity_type: row.1,
        source_entity_id: row.2,
        source_field: row.3,
        target_entity_type: row.4,
        target_entity_id: row.5,
        reference_text: row.6,
        alias_text: row.7,
        position_start: row.8,
        position_end: row.9,
        created_at: row.10,
        updated_at: row.11,
    }).collect())
}

/// Updates the reference registry for a source entity field.
///
/// # Arguments
/// * `source_entity_type` - Type of source entity
/// * `source_entity_id` - ID of source entity
/// * `source_field` - Field name containing references
/// * `text_content` - Text content to parse for references
/// * `db` - Database connection state
#[tauri::command]
pub async fn update_reference_registry(
    source_entity_type: String,
    source_entity_id: String,
    source_field: String,
    text_content: String,
    db: State<'_, PosDb>,
) -> Result<(), String> {
    let pool = &db.0;
    
    // Delete existing references for this source field
    sqlx::query(
        "DELETE FROM cross_references 
         WHERE source_entity_type = $1 
         AND source_entity_id = $2 
         AND source_field = $3"
    )
    .bind(&source_entity_type)
    .bind(&source_entity_id)
    .bind(&source_field)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    
    // Parse and insert new references
    let references = registry::parse_references(&text_content);
    
    for ref_data in references {
        let cross_ref = CrossReference {
            id: gen_id(),
            source_entity_type: source_entity_type.clone(),
            source_entity_id: source_entity_id.clone(),
            source_field: source_field.clone(),
            target_entity_type: ref_data.entity_type,
            target_entity_id: ref_data.identifier,
            reference_text: ref_data.raw_text,
            alias_text: ref_data.alias_text,
            position_start: ref_data.start_index as i32,
            position_end: ref_data.end_index as i32,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        
        registry::insert_cross_reference(pool, cross_ref).await
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Fetches activities for a specific date (for autocomplete).
///
/// # Arguments
/// * `date` - Date in YYYY-MM-DD format
/// * `db` - Database connection state
///
/// # Performance
/// O(log n) indexed query by date
#[tauri::command]
#[must_use]
pub async fn get_activities_for_date_autocomplete(
    date: String,
    db: State<'_, PosDb>,
) -> Result<Vec<CachedEntity>, String> {
    let pool = &db.0;
    resolver::fetch_activities_for_date(pool, &date)
        .await
        .map_err(|e| e.to_string())
}

/// Fetches recent grid dates (last 30 days with activities).
/// Used for instant autocomplete on [[grid: trigger.
///
/// # Arguments
/// * `db` - Database connection state
///
/// # Performance
/// O(log n) with date index, returns ~30 dates
#[tauri::command]
#[must_use]
pub async fn get_recent_grid_dates(
    db: State<'_, PosDb>,
) -> Result<Vec<String>, String> {
    let pool = &db.0;
    resolver::fetch_recent_grid_dates(pool)
        .await
        .map_err(|e| e.to_string())
}

/// Searches grid months by year (e.g., '2026' → ['2026-03', '2026-04']).
/// Returns all months with activities for the given year.
///
/// # Arguments
/// * `year` - Year in YYYY format (4 digits)
/// * `db` - Database connection state
///
/// # Performance
/// O(log n) with date index, max 12 months per year
#[tauri::command]
#[must_use]
pub async fn search_grid_months(
    year: String,
    db: State<'_, PosDb>,
) -> Result<Vec<String>, String> {
    let pool = &db.0;
    resolver::search_grid_months(pool, &year)
        .await
        .map_err(|e| e.to_string())
}

/// Searches grid dates in a specific month (e.g., '2026-03' → ['2026-03-07', '2026-03-27']).
/// Returns all dates with activities for the given year-month.
///
/// # Arguments
/// * `year_month` - Year-month in YYYY-MM format (7 chars)
/// * `db` - Database connection state
///
/// # Performance
/// O(log n) with date index, max 31 dates per month
#[tauri::command]
#[must_use]
pub async fn search_grid_dates_in_month(
    year_month: String,
    db: State<'_, PosDb>,
) -> Result<Vec<String>, String> {
    let pool = &db.0;
    resolver::search_grid_dates_in_month(pool, &year_month)
        .await
        .map_err(|e| e.to_string())
}
