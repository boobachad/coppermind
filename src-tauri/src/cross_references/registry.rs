// ─── Reference Registry ─────────────────────────────────────────────
// Functions for parsing references from text and storing them.

use regex::Regex;
use sqlx::PgPool;

use super::models::{ParsedReference, CrossReference, CrossReferenceError};

/// Parses cross-references from text using regex.
///
/// Pattern: `(\w+):([^:\s|]+)(?::([^:\s|]+))?(?::([^:\s|]+))?(?:\|([^|\n]+))?`
/// - `(\w+)` - Entity type (note, kb, goal, etc.)
/// - `:` - Separator
/// - `([^:\s|]+)` - Primary identifier
/// - `(?::([^:\s|]+))?` - Optional sub-identifier
/// - `(?::([^:\s|]+))?` - Optional sub-sub-identifier
/// - `(?:\|([^|\n]+))?` - Optional alias text
///
/// # Examples
/// - `note:my-note` → note with ID "my-note"
/// - `grid:2024-03-06:slot:3` → grid date with slot 3
/// - `grid:2024-03-06:activity:Deep Work` → grid date with activity name
/// - `kb:item-id|Custom Title` → KB item with alias
pub fn parse_references(text: &str) -> Vec<ParsedReference> {
    let re = Regex::new(r"(\w+):([^:\s|]+)(?::([^:\s|]+))?(?::([^:\s|]+))?(?:\|([^|\n]+))?").unwrap();
    let mut references = Vec::new();
    
    for cap in re.captures_iter(text) {
        let entity_type = cap.get(1).unwrap().as_str().to_string();
        let identifier = cap.get(2).unwrap().as_str().to_string();
        let sub_identifier = cap.get(3).map(|m| m.as_str().to_string());
        let sub_sub_identifier = cap.get(4).map(|m| m.as_str().to_string());
        let alias_text = cap.get(5).map(|m| m.as_str().to_string());
        let start_index = cap.get(0).unwrap().start();
        let end_index = cap.get(0).unwrap().end();
        let raw_text = cap.get(0).unwrap().as_str().to_string();
        
        references.push(ParsedReference {
            entity_type,
            identifier,
            sub_identifier,
            sub_sub_identifier,
            alias_text,
            start_index,
            end_index,
            raw_text,
        });
    }
    
    references
}

/// Inserts a cross-reference into the database.
///
/// # Arguments
/// * `pool` - Database connection pool
/// * `cross_ref` - Cross-reference to insert
///
/// # Errors
/// Returns `CrossReferenceError::DatabaseError` on insert failure
pub async fn insert_cross_reference(
    pool: &PgPool,
    cross_ref: CrossReference,
) -> Result<(), CrossReferenceError> {
    sqlx::query(
        r#"INSERT INTO cross_references (
            id, source_entity_type, source_entity_id, source_field,
            target_entity_type, target_entity_id, reference_text, alias_text,
            position_start, position_end, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"#
    )
    .bind(&cross_ref.id)
    .bind(&cross_ref.source_entity_type)
    .bind(&cross_ref.source_entity_id)
    .bind(&cross_ref.source_field)
    .bind(&cross_ref.target_entity_type)
    .bind(&cross_ref.target_entity_id)
    .bind(&cross_ref.reference_text)
    .bind(&cross_ref.alias_text)
    .bind(cross_ref.position_start)
    .bind(cross_ref.position_end)
    .bind(&cross_ref.created_at)
    .bind(&cross_ref.updated_at)
    .execute(pool)
    .await?;
    
    Ok(())
}

/// Batch inserts multiple cross-references.
///
/// # Arguments
/// * `pool` - Database connection pool
/// * `cross_refs` - Vector of cross-references to insert
///
/// # Performance
/// Uses transaction for atomic batch insert
pub async fn batch_insert_cross_references(
    pool: &PgPool,
    cross_refs: Vec<CrossReference>,
) -> Result<(), CrossReferenceError> {
    let mut tx = pool.begin().await?;
    
    for cross_ref in cross_refs {
        sqlx::query(
            r#"INSERT INTO cross_references (
                id, source_entity_type, source_entity_id, source_field,
                target_entity_type, target_entity_id, reference_text, alias_text,
                position_start, position_end, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"#
        )
        .bind(&cross_ref.id)
        .bind(&cross_ref.source_entity_type)
        .bind(&cross_ref.source_entity_id)
        .bind(&cross_ref.source_field)
        .bind(&cross_ref.target_entity_type)
        .bind(&cross_ref.target_entity_id)
        .bind(&cross_ref.reference_text)
        .bind(&cross_ref.alias_text)
        .bind(cross_ref.position_start)
        .bind(cross_ref.position_end)
        .bind(&cross_ref.created_at)
        .bind(&cross_ref.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_simple_reference() {
        let text = "Check out note:my-note for details";
        let refs = parse_references(text);
        
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].entity_type, "note");
        assert_eq!(refs[0].identifier, "my-note");
        assert_eq!(refs[0].sub_identifier, None);
        assert_eq!(refs[0].alias_text, None);
    }
    
    #[test]
    fn test_parse_reference_with_sub_identifier() {
        let text = "See grid:2024-03-06:slot-3";
        let refs = parse_references(text);
        
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].entity_type, "grid");
        assert_eq!(refs[0].identifier, "2024-03-06");
        assert_eq!(refs[0].sub_identifier, Some("slot-3".to_string()));
    }
    
    #[test]
    fn test_parse_reference_with_alias() {
        let text = "Link to kb:item-123|Custom Title";
        let refs = parse_references(text);
        
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].entity_type, "kb");
        assert_eq!(refs[0].identifier, "item-123");
        assert_eq!(refs[0].alias_text, Some("Custom Title".to_string()));
    }
    
    #[test]
    fn test_parse_multiple_references() {
        let text = "See note:first and kb:second for more info";
        let refs = parse_references(text);
        
        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0].entity_type, "note");
        assert_eq!(refs[1].entity_type, "kb");
    }
}
