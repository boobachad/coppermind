use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use super::error::{PosError, db_context};
use super::utils::gen_id;

// ─── Row type ───────────────────────────────────────────────────────
// Uses chrono::DateTime<Utc> for TIMESTAMPTZ columns.
// sqlx decodes natively; serde serializes to ISO 8601 "2026-02-10T22:16:23.092025Z".

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRow {
    pub id: String,
    pub date: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub category: String,
    pub title: String,
    pub description: String,
    pub is_productive: bool,
    pub is_shadow: bool,
    pub goal_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─── Request/Response types ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivityRequest {
    pub start_time: String,       // ISO 8601 from frontend
    pub end_time: String,         // ISO 8601 from frontend
    pub category: String,
    pub title: String,
    pub description: String,
    pub is_productive: Option<bool>,
    pub goal_id: Option<String>,
    pub updates: Option<Vec<MetricUpdate>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricUpdate {
    pub metric_id: String,
    pub value: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityResponse {
    pub activities: Vec<ActivityRow>,
    pub total_minutes: i64,
    pub productive_minutes: i64,
    pub goal_directed_minutes: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DateRange {
    pub min_date: Option<String>,
    pub max_date: Option<String>,
}



// ─── Commands ───────────────────────────────────────────────────────

/// GET activities for a date with computed metrics.
#[tauri::command]
pub async fn get_activities(
    db: State<'_, PosDb>,
    date: String,
) -> Result<ActivityResponse, PosError> {
    let pool = &db.0;

    let rows = sqlx::query_as::<_, ActivityRow>(
        r#"SELECT id, date, start_time, end_time, category, title, description,
                  is_productive, is_shadow, goal_id, created_at
           FROM pos_activities
           WHERE date = $1
           ORDER BY start_time ASC"#,
    )
    .bind(&date)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("get_activities", e))?;

    // Compute metrics in O(n) — chrono arithmetic is native, no parsing needed
    let mut total_minutes: i64 = 0;
    let mut productive_minutes: i64 = 0;
    let mut goal_directed_minutes: i64 = 0;

    for a in &rows {
        let dur = (a.end_time - a.start_time).num_minutes();
        total_minutes += dur;
        if a.is_productive {
            productive_minutes += dur;
        }
        if a.goal_id.is_some() {
            goal_directed_minutes += dur;
        }
    }

    Ok(ActivityResponse {
        activities: rows,
        total_minutes,
        productive_minutes,
        goal_directed_minutes,
    })
}

/// CREATE activity with optional metric updates + goal verification.
/// Transaction: insert activity → link metrics → verify goal.
#[tauri::command]
pub async fn create_activity(
    db: State<'_, PosDb>,
    req: CreateActivityRequest,
) -> Result<ActivityRow, PosError> {
    let pool = &db.0;

    // Parse ISO 8601 strings from frontend into chrono DateTime<Utc>
    let start: DateTime<Utc> = req.start_time.parse::<DateTime<chrono::FixedOffset>>()
        .map(|d| d.with_timezone(&Utc))
        .or_else(|_| req.start_time.parse::<DateTime<Utc>>())
        .map_err(|e| PosError::InvalidInput(format!("Invalid start_time: {}", e)))?;
    let end: DateTime<Utc> = req.end_time.parse::<DateTime<chrono::FixedOffset>>()
        .map(|d| d.with_timezone(&Utc))
        .or_else(|_| req.end_time.parse::<DateTime<Utc>>())
        .map_err(|e| PosError::InvalidInput(format!("Invalid end_time: {}", e)))?;

    if start >= end {
        return Err(PosError::InvalidInput("end_time must be after start_time".into()));
    }

    let date = start.format("%Y-%m-%d").to_string();
    let activity_id = gen_id();
    let is_productive = req.is_productive.unwrap_or(true);

    let mut tx = pool.begin().await.map_err(|e| db_context("TX begin", e))?;

    // 1. Insert activity — sqlx+chrono handles DateTime<Utc> → TIMESTAMPTZ natively
    sqlx::query(
        r#"INSERT INTO pos_activities
           (id, date, start_time, end_time, category, title, description, is_productive, is_shadow, goal_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)"#,
    )
    .bind(&activity_id)
    .bind(&date)
    .bind(start)
    .bind(end)
    .bind(&req.category)
    .bind(&req.title)
    .bind(&req.description)
    .bind(is_productive)
    .bind(&req.goal_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| db_context("insert activity", e))?;

    // 2. Handle metric updates
    if let Some(updates) = &req.updates {
        for u in updates {
            if u.value == 0 { continue; }

            let am_id = gen_id();
            sqlx::query(
                "INSERT INTO pos_activity_metrics (id, activity_id, goal_metric_id, value) VALUES ($1, $2, $3, $4)",
            )
            .bind(&am_id)
            .bind(&activity_id)
            .bind(&u.metric_id)
            .bind(u.value)
            .execute(&mut *tx)
            .await
            .map_err(|e| db_context("insert activity_metric", e))?;

            // Increment goal metric current_value
            sqlx::query(
                "UPDATE pos_goal_metrics SET current_value = current_value + $1 WHERE id = $2",
            )
            .bind(u.value)
            .bind(&u.metric_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| db_context("update goal_metric", e))?;
        }
    }

    // 3. If linked to a goal, mark as verified + auto-resolve debt
    if let Some(ref gid) = req.goal_id {
        sqlx::query("UPDATE pos_goals SET is_verified = TRUE WHERE id = $1")
            .bind(gid)
            .execute(&mut *tx)
            .await
            .map_err(|e| db_context("verify goal", e))?;

        // Auto-resolve debt: delete debt row if exists (CASCADE safe, goal remains)
        sqlx::query("DELETE FROM pos_debt_goals WHERE goal_id = $1")
            .bind(gid)
            .execute(&mut *tx)
            .await
            .map_err(|e| db_context("auto-resolve debt", e))?;
    }

    tx.commit().await.map_err(|e| db_context("TX commit", e))?;

    // Fetch the created activity
    let activity = sqlx::query_as::<_, ActivityRow>(
        r#"SELECT id, date, start_time, end_time, category, title, description,
                  is_productive, is_shadow, goal_id, created_at
           FROM pos_activities WHERE id = $1"#,
    )
    .bind(&activity_id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("fetch created activity", e))?;

    log::info!(
        "[POS] Created activity {} (goal: {:?}, metrics: {})",
        activity.id,
        req.goal_id,
        req.updates.as_ref().map_or(0, |u| u.len())
    );

    Ok(activity)
}

/// UPDATE: Modify activity details (time, category, description, productive flag).
#[tauri::command]
pub async fn update_activity(
    db: State<'_, PosDb>,
    id: String,
    req: CreateActivityRequest,
) -> Result<ActivityRow, PosError> {
    let pool = &db.0;

    let start: DateTime<Utc> = req.start_time.parse::<DateTime<chrono::FixedOffset>>()
        .map(|d| d.with_timezone(&Utc))
        .or_else(|_| req.start_time.parse::<DateTime<Utc>>())
        .map_err(|e| PosError::InvalidInput(format!("Invalid start_time: {}", e)))?;
    let end: DateTime<Utc> = req.end_time.parse::<DateTime<chrono::FixedOffset>>()
        .map(|d| d.with_timezone(&Utc))
        .or_else(|_| req.end_time.parse::<DateTime<Utc>>())
        .map_err(|e| PosError::InvalidInput(format!("Invalid end_time: {}", e)))?;

    if start >= end {
        return Err(PosError::InvalidInput("end_time must be after start_time".into()));
    }

    let date = start.format("%Y-%m-%d").to_string();
    let is_productive = req.is_productive.unwrap_or(true);

    sqlx::query(
        r#"UPDATE pos_activities SET
           date = $1, start_time = $2, end_time = $3, category = $4,
           title = $5, description = $6, is_productive = $7
           WHERE id = $8"#,
    )
    .bind(&date)
    .bind(start)
    .bind(end)
    .bind(&req.category)
    .bind(&req.title)
    .bind(&req.description)
    .bind(is_productive)
    .bind(&id)
    .execute(pool)
    .await
    .map_err(|e| db_context("update activity", e))?;

    let activity = sqlx::query_as::<_, ActivityRow>(
        r#"SELECT id, date, start_time, end_time, category, title, description,
                  is_productive, is_shadow, goal_id, created_at
           FROM pos_activities WHERE id = $1"#,
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("fetch updated activity", e))?;

    log::info!("[POS] Updated activity {}", id);
    Ok(activity)
}

/// PATCH: Link an activity to a goal + mark goal verified.
/// Transactional: both writes succeed or both roll back.
#[tauri::command]
pub async fn patch_activity(
    db: State<'_, PosDb>,
    id: String,
    goal_id: String,
) -> Result<ActivityRow, PosError> {
    let pool = &db.0;
    let mut tx = pool.begin().await.map_err(|e| db_context("TX begin", e))?;

    sqlx::query("UPDATE pos_activities SET goal_id = $1 WHERE id = $2")
        .bind(&goal_id)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| db_context("patch activity", e))?;

    sqlx::query("UPDATE pos_goals SET is_verified = TRUE WHERE id = $1")
        .bind(&goal_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| db_context("verify goal", e))?;

    tx.commit().await.map_err(|e| db_context("TX commit", e))?;

    let activity = sqlx::query_as::<_, ActivityRow>(
        r#"SELECT id, date, start_time, end_time, category, title, description,
                  is_productive, is_shadow, goal_id, created_at
           FROM pos_activities WHERE id = $1"#,
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("fetch patched activity", e))?;

    log::info!("[POS] Linked activity {} → goal {}", id, goal_id);
    Ok(activity)
}

/// GET the min/max activity dates (for grid date range).
#[tauri::command]
pub async fn get_activity_range(
    db: State<'_, PosDb>,
) -> Result<DateRange, PosError> {
    let pool = &db.0;

    let row: (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT MIN(date), MAX(date) FROM pos_activities",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("get activity range", e))?;

    Ok(DateRange {
        min_date: row.0,
        max_date: row.1,
    })
}

/// GET activities for multiple dates in a single query (batch optimization).
/// Returns a map of date -> ActivityResponse.
#[tauri::command]
pub async fn get_activities_batch(
    db: State<'_, PosDb>,
    dates: Vec<String>,
) -> Result<std::collections::HashMap<String, ActivityResponse>, PosError> {
    log::info!("[CMD] get_activities_batch called with {} dates", dates.len());
    let pool = &db.0;

    if dates.is_empty() {
        log::info!("[CMD] get_activities_batch: empty dates, returning empty map");
        return Ok(std::collections::HashMap::new());
    }

    log::info!("[CMD] get_activities_batch: querying database...");
    // Fetch all activities for all dates in one query
    let rows = sqlx::query_as::<_, ActivityRow>(
        r#"SELECT id, date, start_time, end_time, category, title, description,
                  is_productive, is_shadow, goal_id, created_at
           FROM pos_activities
           WHERE date = ANY($1)
           ORDER BY date ASC, start_time ASC"#,
    )
    .bind(&dates)
    .fetch_all(pool)
    .await
    .map_err(|e| {
        log::error!("[CMD] get_activities_batch: DB error: {}", e);
        db_context("get_activities_batch", e)
    })?;

    log::info!("[CMD] get_activities_batch: fetched {} rows, computing metrics", rows.len());

    // Group by date and compute metrics
    let mut result = std::collections::HashMap::new();

    for date in &dates {
        let date_activities: Vec<ActivityRow> = rows
            .iter()
            .filter(|a| &a.date == date)
            .cloned()
            .collect();

        let mut total_minutes: i64 = 0;
        let mut productive_minutes: i64 = 0;
        let mut goal_directed_minutes: i64 = 0;

        for a in &date_activities {
            let dur = (a.end_time - a.start_time).num_minutes();
            total_minutes += dur;
            if a.is_productive {
                productive_minutes += dur;
            }
            if a.goal_id.is_some() {
                goal_directed_minutes += dur;
            }
        }

        result.insert(
            date.clone(),
            ActivityResponse {
                activities: date_activities,
                total_minutes,
                productive_minutes,
                goal_directed_minutes,
            },
        );
    }

    log::info!("[CMD] get_activities_batch: returning {} date entries", result.len());
    Ok(result)
}
