use serde::Serialize;

/// Structured error types for POS operations
#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum PosError {
    Database(String),
    NotFound(String),
    InvalidInput(String),
    External(String),
}

impl std::fmt::Display for PosError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PosError::Database(msg) => write!(f, "Database error: {}", msg),
            PosError::NotFound(msg) => write!(f, "Not found: {}", msg),
            PosError::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            PosError::External(msg) => write!(f, "External service error: {}", msg),
        }
    }
}

impl From<sqlx::Error> for PosError {
    fn from(err: sqlx::Error) -> Self {
        PosError::Database(err.to_string())
    }
}

impl From<reqwest::Error> for PosError {
    fn from(err: reqwest::Error) -> Self {
        PosError::External(err.to_string())
    }
}

impl From<PosError> for String {
    fn from(err: PosError) -> Self {
        err.to_string()
    }
}

/// Helper to add context to database operations
pub fn db_context(operation: &str, err: sqlx::Error) -> PosError {
    PosError::Database(format!("{}: {}", operation, err))
}
