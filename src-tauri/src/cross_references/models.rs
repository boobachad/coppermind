// ─── Cross-Reference Data Models ────────────────────────────────────
// Type definitions for universal entity linking system.

use serde::{Deserialize, Serialize};

/// Cross-reference relationship between entities
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub struct CrossReference {
    pub id: String,
    pub source_entity_type: String,
    pub source_entity_id: String,
    pub source_field: String,
    pub target_entity_type: String,
    pub target_entity_id: String,
    pub reference_text: String,
    pub alias_text: Option<String>,
    pub position_start: i32,
    pub position_end: i32,
    pub created_at: String,  // UTC ISO 8601
    pub updated_at: String,  // UTC ISO 8601
}

/// Resolved entity reference with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub struct EntityReference {
    pub entity_type: String,
    pub entity_id: String,
    pub title: String,
    pub preview: Option<String>,
    pub exists: bool,
}

/// Request to resolve a single entity reference
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveReferenceRequest {
    pub entity_type: String,
    pub identifier: String,
    pub sub_identifier: Option<String>,
}

/// Request to validate multiple references in batch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchValidateRequest {
    pub references: Vec<ResolveReferenceRequest>,
}

/// Cached entity for client-side lookup
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub struct CachedEntity {
    pub entity_type: String,
    pub entity_id: String,
    pub title: String,
    pub searchable_text: String,
    pub metadata: Option<String>,
}

/// Parsed reference from text
#[derive(Debug, Clone)]
pub struct ParsedReference {
    pub entity_type: String,
    pub identifier: String,
    pub sub_identifier: Option<String>,
    pub sub_sub_identifier: Option<String>,
    pub alias_text: Option<String>,
    pub start_index: usize,
    pub end_index: usize,
    pub raw_text: String,
}

/// Custom error type for cross-reference operations
#[derive(Debug, thiserror::Error)]
pub enum CrossReferenceError {
    #[error("Entity not found: {entity_type}:{identifier}")]
    EntityNotFound {
        entity_type: String,
        identifier: String,
    },
    
    #[error("Invalid entity type: {0}")]
    InvalidEntityType(String),
    
    #[error("Invalid date format: {0}")]
    InvalidDateFormat(String),
    
    #[error("Invalid URL format: {0}")]
    InvalidUrlFormat(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Database error: {0}")]
    DatabaseError(String),
    
    #[error("Invalid reference syntax: {0}")]
    InvalidSyntax(String),
    
    #[error("Cache initialization failed: {0}")]
    CacheInitError(String),
}

impl From<sqlx::Error> for CrossReferenceError {
    fn from(err: sqlx::Error) -> Self {
        CrossReferenceError::DatabaseError(err.to_string())
    }
}

impl From<CrossReferenceError> for String {
    fn from(err: CrossReferenceError) -> String {
        err.to_string()
    }
}
