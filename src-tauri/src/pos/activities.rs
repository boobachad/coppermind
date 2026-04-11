use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use super::error::{PosError, PosResult, db_context};
use super::utils::gen_id;

// ─── Row type ───────────────────────────────────────────────────────

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
    pub goal_ids: Option<Vec<String>>,
    pub milestone_id: Option<String>,
    pub book_id: Option<String>,
    pub pages_read: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub food_items: Option<Vec<String>>,
}

// ─── Request/Response types ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivityRequest {
    pub start_time: String,
    pub end_time: String,
    pub category: String,
    pub title: String,
    pub description: String,
    pub is_productive: Option<bool>,
    pub goal_ids: Option<Vec<String>>,
    pub milestone_id: Option<String>,
    pub book_id: Option<String>,
    pub pages_read: Option<i32>,
    pub updates: Option<Vec<MetricUpdate>>,
    pub date: Option<String>,
    pub food_items: Option<Vec<String>>,
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

// ─── Shared SELECT columns ───────────────────────────────────────────
// Single source of truth — update here if schema changes.
const SELECT_COLS: &str =
    "id, date, start_time, end_time, category, title, description,
     is_productive, is_shadow, goal_ids, milestone_id, book_id, pages_read, created_at,
     food_items";

// ─── Commands ───────────────────────────────────────────────────────

/// GET activities for a date with computed metrics.
#[tauri::command]
pub async fn get_activities(
    db: State<'_, PosDb>,
    date: String,
) -> PosResult<ActivityResponse> {
    let pool = &db.0;

    let sql = format!(
        "SELECT {} FROM pos_activities WHERE date = $1 ORDER BY start_time ASC",
        SELECT_COLS
    );
    let rows = sqlx::query_as::<_, ActivityRow>(&sql)
        .bind(&date)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("get_activities", e))?;

    let mut total_minutes: i64 = 0;
    let mut productive_minutes: i64 = 0;
    let mut goal_directed_minutes: i64 = 0;

    for a in &rows {
        let dur = (a.end_time - a.start_time).num_minutes();
        total_minutes += dur;
        if a.is_productive { productive_minutes += dur; }
        if a.goal_ids.is_some() || a.milestone_id.is_some() { goal_directed_minutes += dur; }
    }

    Ok(ActivityResponse { activities: rows, total_minutes, productive_minutes, goal_directed_minutes })
}

/// CREATE activity with optional metric updates + goal verification.
#[tauri::command]
pub async fn create_activity(
    db: State<'_, PosDb>,
    req: CreateActivityRequest,
) -> PosResult<ActivityRow> {
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

    let date = req.date.unwrap_or_else(|| start.format("%Y-%m-%d").to_string());
    let activity_id = gen_id();
    let is_productive = req.is_productive.unwrap_or(true);

    if req.goal_ids.is_some() && req.milestone_id.is_some() {
        return Err(PosError::InvalidInput("Cannot link to both goals and milestone".into()));
    }

    let mut tx = pool.begin().await.map_err(|e| db_context("TX begin", e))?;

    sqlx::query(
        r#"INSERT INTO pos_activities
           (id, date, start_time, end_time, category, title, description,
            is_productive, is_shadow, goal_ids, milestone_id, book_id, pages_read, food_items)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9, $10, $11, $12, $13)"#,
    )
    .bind(&activity_id)
    .bind(&date)
    .bind(start)
    .bind(end)
    .bind(&req.category)
    .bind(&req.title)
    .bind(&req.description)
    .bind(is_productive)
    .bind(&req.goal_ids)
    .bind(&req.milestone_id)
    .bind(&req.book_id)
    .bind(req.pages_read)
    .bind(&req.food_items)
    .execute(&mut *tx)
    .await
    .map_err(|e| db_context("insert activity", e))?;

    if let Some(updates) = &req.updates {
        for u in updates {
            if u.value == 0 { continue; }
            let am_id = gen_id();
            sqlx::query(
                "INSERT INTO pos_activity_metrics (id, activity_id, goal_metric_id, value) VALUES ($1, $2, $3, $4)",
            )
            .bind(&am_id).bind(&activity_id).bind(&u.metric_id).bind(u.value)
            .execute(&mut *tx).await.map_err(|e| db_context("insert activity_metric", e))?;

            sqlx::query("UPDATE pos_goal_metrics SET current_value = current_value + $1 WHERE id = $2")
                .bind(u.value).bind(&u.metric_id)
                .execute(&mut *tx).await.map_err(|e| db_context("update goal_metric", e))?;
        }
    }

    if let Some(ref goal_ids) = req.goal_ids {
        for gid in goal_ids {
            sqlx::query("UPDATE unified_goals SET verified = TRUE WHERE id = $1")
                .bind(gid).execute(&mut *tx).await.map_err(|e| db_context("verify goal", e))?;
        }
    }

    if let Some(ref milestone_id) = req.milestone_id {
        if let Some(updates) = &req.updates {
            let total = updates.iter().map(|u| u.value).sum::<i32>();
            if total > 0 {
                sqlx::query("UPDATE goal_periods SET current_value = current_value + $1 WHERE id = $2")
                    .bind(total).bind(milestone_id)
                    .execute(&mut *tx).await.map_err(|e| db_context("increment milestone", e))?;
            }
        }
    }

    tx.commit().await.map_err(|e| db_context("TX commit", e))?;

    let sql = format!("SELECT {} FROM pos_activities WHERE id = $1", SELECT_COLS);
    let activity = sqlx::query_as::<_, ActivityRow>(&sql)
        .bind(&activity_id)
        .fetch_one(pool)
        .await
        .map_err(|e| db_context("fetch created activity", e))?;

    log::info!("[POS] Created activity {} (goals: {:?}, milestone: {:?})", activity.id, req.goal_ids, req.milestone_id);
    Ok(activity)
}

/// UPDATE: Modify activity details and reconcile milestone current_value.
#[tauri::command]
pub async fn update_activity(
    db: State<'_, PosDb>,
    id: String,
    req: CreateActivityRequest,
) -> PosResult<ActivityRow> {
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

    let date = req.date.unwrap_or_else(|| start.format("%Y-%m-%d").to_string());
    let is_productive = req.is_productive.unwrap_or(true);

    if req.goal_ids.is_some() && req.milestone_id.is_some() {
        return Err(PosError::InvalidInput("Cannot link to both goals and milestone".into()));
    }

    let mut tx = pool.begin().await.map_err(|e| db_context("TX begin", e))?;

    let old: (Option<String>, Option<i32>) = sqlx::query_as(
        r#"SELECT a.milestone_id,
                  (SELECT COALESCE(SUM(m.value), 0)::int FROM pos_activity_metrics m WHERE m.activity_id = a.id)
           FROM pos_activities a WHERE a.id = $1"#,
    )
    .bind(&id).fetch_one(&mut *tx).await.map_err(|e| db_context("fetch old activity", e))?;

    let old_milestone_id = old.0;
    let old_metric_sum = old.1.unwrap_or(0);

    if let Some(ref old_mid) = old_milestone_id {
        if old_metric_sum > 0 {
            sqlx::query("UPDATE goal_periods SET current_value = GREATEST(0, current_value - $1) WHERE id = $2")
                .bind(old_metric_sum).bind(old_mid)
                .execute(&mut *tx).await.map_err(|e| db_context("reverse old milestone", e))?;
        }
    }

    sqlx::query(
        r#"UPDATE pos_activities SET
           date = $1, start_time = $2, end_time = $3, category = $4,
           title = $5, description = $6, is_productive = $7, goal_ids = $8,
           milestone_id = $9, book_id = $10, pages_read = $11, food_items = $12
           WHERE id = $13"#,
    )
    .bind(&date).bind(start).bind(end).bind(&req.category)
    .bind(&req.title).bind(&req.description).bind(is_productive).bind(&req.goal_ids)
    .bind(&req.milestone_id).bind(&req.book_id).bind(&req.pages_read).bind(&req.food_items)
    .bind(&id)
    .execute(&mut *tx).await.map_err(|e| db_context("update activity", e))?;

    if let Some(ref new_mid) = req.milestone_id {
        let new_total: i32 = req.updates.as_ref().map(|us| us.iter().map(|u| u.value).sum()).unwrap_or(0);
        if new_total > 0 {
            sqlx::query("UPDATE goal_periods SET current_value = current_value + $1 WHERE id = $2")
                .bind(new_total).bind(new_mid)
                .execute(&mut *tx).await.map_err(|e| db_context("apply new milestone", e))?;
        }
    }

    tx.commit().await.map_err(|e| db_context("TX commit", e))?;

    let sql = format!("SELECT {} FROM pos_activities WHERE id = $1", SELECT_COLS);
    let activity = sqlx::query_as::<_, ActivityRow>(&sql)
        .bind(&id).fetch_one(pool).await.map_err(|e| db_context("fetch updated activity", e))?;

    log::info!("[POS] Updated activity {} (old_milestone: {:?}, new_milestone: {:?})", id, old_milestone_id, req.milestone_id);
    Ok(activity)
}

/// PATCH: Link an activity to a goal + mark goal verified.
/// DEPRECATED: Use update_activity with goal_ids instead.
#[tauri::command]
pub async fn patch_activity(
    db: State<'_, PosDb>,
    id: String,
    goal_id: String,
) -> PosResult<ActivityRow> {
    let pool = &db.0;
    let mut tx = pool.begin().await.map_err(|e| db_context("TX begin", e))?;

    sqlx::query("UPDATE pos_activities SET goal_ids = ARRAY[$1::TEXT] WHERE id = $2")
        .bind(&goal_id).bind(&id)
        .execute(&mut *tx).await.map_err(|e| db_context("patch activity", e))?;

    sqlx::query("UPDATE unified_goals SET verified = TRUE WHERE id = $1")
        .bind(&goal_id)
        .execute(&mut *tx).await.map_err(|e| db_context("verify goal", e))?;

    tx.commit().await.map_err(|e| db_context("TX commit", e))?;

    let sql = format!("SELECT {} FROM pos_activities WHERE id = $1", SELECT_COLS);
    let activity = sqlx::query_as::<_, ActivityRow>(&sql)
        .bind(&id).fetch_one(pool).await.map_err(|e| db_context("fetch patched activity", e))?;

    log::info!("[POS] Linked activity {} → goal {}", id, goal_id);
    Ok(activity)
}

/// GET the min/max activity dates (for grid date range).
#[tauri::command]
pub async fn get_activity_range(db: State<'_, PosDb>) -> PosResult<DateRange> {
    let pool = &db.0;
    let row: (Option<String>, Option<String>) = sqlx::query_as(
        "SELECT MIN(date), MAX(date) FROM pos_activities",
    )
    .fetch_one(pool).await.map_err(|e| db_context("get activity range", e))?;
    Ok(DateRange { min_date: row.0, max_date: row.1 })
}

/// GET activities for multiple dates in a single query (batch optimization).
#[tauri::command]
pub async fn get_activities_batch(
    db: State<'_, PosDb>,
    dates: Vec<String>,
) -> PosResult<std::collections::HashMap<String, ActivityResponse>> {
    log::info!("[CMD] get_activities_batch called with {} dates", dates.len());
    let pool = &db.0;

    if dates.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let sql = format!(
        "SELECT {} FROM pos_activities WHERE date = ANY($1) ORDER BY date ASC, start_time ASC",
        SELECT_COLS
    );
    let rows = sqlx::query_as::<_, ActivityRow>(&sql)
        .bind(&dates)
        .fetch_all(pool)
        .await
        .map_err(|e| { log::error!("[CMD] get_activities_batch DB error: {}", e); db_context("get_activities_batch", e) })?;

    let mut result = std::collections::HashMap::new();
    for date in &dates {
        let date_activities: Vec<ActivityRow> = rows.iter().filter(|a| &a.date == date).cloned().collect();
        let mut total_minutes: i64 = 0;
        let mut productive_minutes: i64 = 0;
        let mut goal_directed_minutes: i64 = 0;
        for a in &date_activities {
            let dur = (a.end_time - a.start_time).num_minutes();
            total_minutes += dur;
            if a.is_productive { productive_minutes += dur; }
            if a.goal_ids.is_some() || a.milestone_id.is_some() { goal_directed_minutes += dur; }
        }
        result.insert(date.clone(), ActivityResponse { activities: date_activities, total_minutes, productive_minutes, goal_directed_minutes });
    }

    log::info!("[CMD] get_activities_batch: returning {} date entries", result.len());
    Ok(result)
}

/// GET all food activities, ordered by date desc.
#[tauri::command]
pub async fn get_food_activities(db: State<'_, PosDb>) -> PosResult<Vec<ActivityRow>> {
    let pool = &db.0;
    let sql = format!(
        "SELECT {} FROM pos_activities WHERE category = 'food' ORDER BY date DESC, start_time DESC",
        SELECT_COLS
    );
    sqlx::query_as::<_, ActivityRow>(&sql)
        .fetch_all(pool).await.map_err(|e| db_context("get_food_activities", e))
}

/// GET all development activities, ordered by date desc.
#[tauri::command]
pub async fn get_project_activities(db: State<'_, PosDb>) -> PosResult<Vec<ActivityRow>> {
    let pool = &db.0;
    let sql = format!(
        "SELECT {} FROM pos_activities WHERE category = 'development' ORDER BY date DESC, start_time DESC",
        SELECT_COLS
    );
    sqlx::query_as::<_, ActivityRow>(&sql)
        .fetch_all(pool).await.map_err(|e| db_context("get_project_activities", e))
}
