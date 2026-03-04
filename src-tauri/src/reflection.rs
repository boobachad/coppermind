use crate::PosDb;
use crate::pos::error::{PosError, PosResult};
use crate::pos::utils::gen_id;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

/// Represents a learning reflection linked to a goal or milestone
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reflection {
    pub id: String,
    pub entity_type: String,  // 'goal' | 'milestone'
    pub entity_id: String,
    pub learning_text: String,
    pub created_at: DateTime<Utc>,
    pub kb_item_id: Option<String>,
}

/// Input for creating a reflection
#[derive(Debug, Deserialize)]
pub struct CreateReflectionInput {
    pub entity_type: String,  // 'goal' | 'milestone'
    pub entity_id: String,
    pub learning_text: String,
    pub create_kb_item: bool,
}

/// Initialize the reflections table
pub async fn init_reflections_table(db: &PosDb) -> PosResult<()> {
    sqlx::query::<sqlx::Postgres>(
        r#"
        CREATE TABLE IF NOT EXISTS reflections (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL CHECK (entity_type IN ('goal', 'milestone')),
            entity_id TEXT NOT NULL,
            learning_text TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            kb_item_id TEXT
        )
        "#,
    )
    .execute(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to create reflections table: {}", e)))?;

    // Create composite index for efficient lookups
    sqlx::query::<sqlx::Postgres>(
        r#"
        CREATE INDEX IF NOT EXISTS idx_reflections_entity ON reflections(entity_type, entity_id)
        "#,
    )
    .execute(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to create reflections index: {}", e)))?;

    Ok(())
}

/// Create a new reflection for a goal or milestone
#[tauri::command]
pub async fn create_reflection(
    db: tauri::State<'_, PosDb>,
    input: CreateReflectionInput,
) -> PosResult<Reflection> {
    let id = gen_id();
    let now = Utc::now();

    // Validate entity_type
    if input.entity_type != "goal" && input.entity_type != "milestone" {
        return Err(PosError::InvalidInput(format!("Invalid entity_type: {}", input.entity_type)));
    }

    // Validate entity exists
    let entity_exists: bool = match input.entity_type.as_str() {
        "goal" => {
            sqlx::query_scalar::<sqlx::Postgres, bool>(
                "SELECT EXISTS(SELECT 1 FROM unified_goals WHERE id = $1)"
            )
            .bind(&input.entity_id)
            .fetch_one(&db.0)
            .await
            .map_err(|e| PosError::Database(format!("Failed to check goal existence: {}", e)))?
        },
        "milestone" => {
            sqlx::query_scalar::<sqlx::Postgres, bool>(
                "SELECT EXISTS(SELECT 1 FROM pos_milestones WHERE id = $1)"
            )
            .bind(&input.entity_id)
            .fetch_one(&db.0)
            .await
            .map_err(|e| PosError::Database(format!("Failed to check milestone existence: {}", e)))?
        },
        _ => false,
    };

    if !entity_exists {
        return Err(PosError::NotFound(format!("{} not found: {}", input.entity_type, input.entity_id)));
    }

    let mut kb_item_id: Option<String> = None;

    // Create KB item if requested
    if input.create_kb_item {
        let kb_id = gen_id();
        
        sqlx::query::<sqlx::Postgres>(
            r#"
            INSERT INTO knowledge_items (id, type, source, content, metadata, status, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(&kb_id)
        .bind("Learning")
        .bind(format!("{}Reflection", if input.entity_type == "goal" { "Goal" } else { "Milestone" }))
        .bind(&input.learning_text)
        .bind(serde_json::json!({
            "title": format!("Learning from {} completion", input.entity_type),
            "entityType": &input.entity_type,
            "entityId": &input.entity_id
        }).to_string())
        .bind("Completed")
        .bind(&now)
        .execute(&db.0)
        .await
        .map_err(|e| PosError::Database(format!("Failed to create KB item: {}", e)))?;

        kb_item_id = Some(kb_id);
    }

    // Insert reflection
    sqlx::query::<sqlx::Postgres>(
        r#"
        INSERT INTO reflections (id, entity_type, entity_id, learning_text, created_at, kb_item_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(&id)
    .bind(&input.entity_type)
    .bind(&input.entity_id)
    .bind(&input.learning_text)
    .bind(&now)
    .bind(&kb_item_id)
    .execute(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to insert reflection: {}", e)))?;

    Ok(Reflection {
        id,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        learning_text: input.learning_text,
        created_at: now,
        kb_item_id,
    })
}

/// Get all reflections for an entity (goal or milestone)
#[tauri::command]
pub async fn get_reflections(
    db: tauri::State<'_, PosDb>,
    entity_type: String,
    entity_id: String,
) -> PosResult<Vec<Reflection>> {
    let rows: Vec<sqlx::postgres::PgRow> = sqlx::query::<sqlx::Postgres>(
        r#"
        SELECT id, entity_type, entity_id, learning_text, created_at, kb_item_id
        FROM reflections
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at DESC
        "#,
    )
    .bind(&entity_type)
    .bind(&entity_id)
    .fetch_all(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to fetch reflections: {}", e)))?;

    let reflections = rows
        .into_iter()
        .map(|row: sqlx::postgres::PgRow| {
            Ok(Reflection {
                id: row.try_get("id")?,
                entity_type: row.try_get("entity_type")?,
                entity_id: row.try_get("entity_id")?,
                learning_text: row.try_get("learning_text")?,
                created_at: row.try_get("created_at")?,
                kb_item_id: row.try_get("kb_item_id")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(|e| PosError::Database(format!("Failed to parse reflections: {}", e)))?;

    Ok(reflections)
}

/// Delete a reflection
#[tauri::command]
pub async fn delete_reflection(
    db: tauri::State<'_, PosDb>,
    reflection_id: String,
) -> PosResult<()> {
    let result: sqlx::postgres::PgQueryResult = sqlx::query::<sqlx::Postgres>("DELETE FROM reflections WHERE id = $1")
        .bind(&reflection_id)
        .execute(&db.0)
        .await
        .map_err(|e| PosError::Database(format!("Failed to delete reflection: {}", e)))?;

    if result.rows_affected() == 0 {
        return Err(PosError::NotFound(format!("Reflection not found: {}", reflection_id)));
    }

    Ok(())
}
