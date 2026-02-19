use crate::PosDb;
use crate::pos::error::{PosError, PosResult};
use crate::pos::utils::gen_id;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;

/// Represents a learning reflection linked to a goal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalReflection {
    pub id: String,
    pub goal_id: String,
    pub learning_text: String,
    pub created_at: DateTime<Utc>,
    pub kb_item_id: Option<String>,
}

/// Input for creating a reflection
#[derive(Debug, Deserialize)]
pub struct CreateReflectionInput {
    pub goal_id: String,
    pub learning_text: String,
    pub create_kb_item: bool,
}

/// Initialize the reflections table
pub async fn init_reflections_table(db: &PosDb) -> PosResult<()> {
    sqlx::query::<sqlx::Postgres>(
        r#"
        CREATE TABLE IF NOT EXISTS goal_reflections (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            learning_text TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            kb_item_id TEXT,
            FOREIGN KEY (goal_id) REFERENCES unified_goals(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to create goal_reflections table: {}", e)))?;

    // Create index on goal_id for fast lookups
    sqlx::query::<sqlx::Postgres>(
        r#"
        CREATE INDEX IF NOT EXISTS idx_reflections_goal_id ON goal_reflections(goal_id)
        "#,
    )
    .execute(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to create goal_reflections index: {}", e)))?;

    Ok(())
}

/// Create a new reflection for a goal
#[tauri::command]
pub async fn create_goal_reflection(
    db: tauri::State<'_, PosDb>,
    input: CreateReflectionInput,
) -> PosResult<GoalReflection> {
    let id = gen_id();
    let now = Utc::now();

    // Check if goal exists
    let goal_exists: bool = sqlx::query_scalar::<sqlx::Postgres, bool>(
        "SELECT EXISTS(SELECT 1 FROM unified_goals WHERE id = $1)"
    )
    .bind(&input.goal_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to check goal existence: {}", e)))?;

    if !goal_exists {
        return Err(PosError::NotFound(format!("Goal not found: {}", input.goal_id)));
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
        .bind("GoalReflection")
        .bind(&input.learning_text)
        .bind(serde_json::json!({
            "title": format!("Learning from goal completion"),
            "goalId": &input.goal_id
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
        INSERT INTO goal_reflections (id, goal_id, learning_text, created_at, kb_item_id)
        VALUES ($1, $2, $3, $4, $5)
        "#,
    )
    .bind(&id)
    .bind(&input.goal_id)
    .bind(&input.learning_text)
    .bind(&now)
    .bind(&kb_item_id)
    .execute(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to insert reflection: {}", e)))?;

    Ok(GoalReflection {
        id,
        goal_id: input.goal_id,
        learning_text: input.learning_text,
        created_at: now,
        kb_item_id,
    })
}

/// Get all reflections for a goal
#[tauri::command]
pub async fn get_goal_reflections(
    db: tauri::State<'_, PosDb>,
    goal_id: String,
) -> PosResult<Vec<GoalReflection>> {
    let rows: Vec<sqlx::postgres::PgRow> = sqlx::query::<sqlx::Postgres>(
        r#"
        SELECT id, goal_id, learning_text, created_at, kb_item_id
        FROM goal_reflections
        WHERE goal_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(&goal_id)
    .fetch_all(&db.0)
    .await
    .map_err(|e| PosError::Database(format!("Failed to fetch reflections: {}", e)))?;

    let reflections = rows
        .into_iter()
        .map(|row: sqlx::postgres::PgRow| {
            Ok(GoalReflection {
                id: row.try_get("id")?,
                goal_id: row.try_get("goal_id")?,
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
pub async fn delete_goal_reflection(
    db: tauri::State<'_, PosDb>,
    reflection_id: String,
) -> PosResult<()> {
    let result: sqlx::postgres::PgQueryResult = sqlx::query::<sqlx::Postgres>("DELETE FROM goal_reflections WHERE id = $1")
        .bind(&reflection_id)
        .execute(&db.0)
        .await
        .map_err(|e| PosError::Database(format!("Failed to delete reflection: {}", e)))?;

    if result.rows_affected() == 0 {
        return Err(PosError::NotFound(format!("Reflection not found: {}", reflection_id)));
    }

    Ok(())
}
