use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;

// ─── Row types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneRow {
    pub id: String,
    pub target_metric: String,
    pub target_value: i32,
    pub daily_amount: i32,
    pub period_type: String,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub current_value: i32,
    pub problem_id: Option<String>,
    pub unit: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ─── Request types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMilestoneRequest {
    pub target_metric: String,
    pub daily_amount: i32,
    pub period_start: String,
    pub period_end: String,
    pub period_type: String,
    pub problem_id: Option<String>,
    pub unit: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMilestoneRequest {
    pub target_value: Option<i32>,
}

// ─── Response types ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalancerResult {
    pub milestone_id: String,
    pub target_metric: String,
    pub updated_goals: i32,
    pub daily_required: i32,
    pub is_real_milestone: bool,
    pub message: String,
}

// ─── Helpers ────────────────────────────────────────────────────────

fn calculate_target_value(
    daily_amount: i32,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
) -> i32 {
    let days_in_period = (period_end - period_start).num_days() + 1;
    daily_amount * days_in_period as i32
}

const MILESTONE_COLS: &str =
    "id, target_metric, target_value, daily_amount, period_type, period_start, period_end, \
     current_value, problem_id, unit, created_at, updated_at";

// ─── Commands ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_milestone(
    db: State<'_, PosDb>,
    req: CreateMilestoneRequest,
) -> PosResult<MilestoneRow> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();

    let period_start = req.period_start.parse::<DateTime<Utc>>()
        .map_err(|e| PosError::InvalidInput(format!("Invalid period_start: {}", e)))?;
    let period_end = req.period_end.parse::<DateTime<Utc>>()
        .map_err(|e| PosError::InvalidInput(format!("Invalid period_end: {}", e)))?;

    if period_start >= period_end {
        return Err(PosError::InvalidInput("period_end must be after period_start".into()));
    }
    if !["monthly", "weekly", "daily"].contains(&req.period_type.as_str()) {
        return Err(PosError::InvalidInput("period_type must be 'monthly', 'weekly', or 'daily'".into()));
    }

    let target_value = calculate_target_value(req.daily_amount, period_start, period_end);

    let row = sqlx::query_as::<_, MilestoneRow>(
        &format!(
            "INSERT INTO goal_periods (
                id, target_metric, target_value, daily_amount, period_type, period_start, period_end,
                current_value, problem_id, unit, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $10)
            RETURNING {MILESTONE_COLS}"
        )
    )
    .bind(&id).bind(&req.target_metric).bind(target_value).bind(req.daily_amount)
    .bind(&req.period_type).bind(period_start).bind(period_end)
    .bind(&req.problem_id).bind(&req.unit).bind(now)
    .fetch_one(pool).await
    .map_err(|e| db_context("create_milestone", e))?;

    log::info!("[MILESTONE] Created {} {} for {} (daily: {}, target: {})",
        req.period_type, id, req.target_metric, req.daily_amount, target_value);
    Ok(row)
}

#[tauri::command]
pub async fn get_milestones(
    db: State<'_, PosDb>,
    active_only: Option<bool>,
) -> PosResult<Vec<MilestoneRow>> {
    let pool = &db.0;
    let query = if active_only.unwrap_or(false) {
        format!("SELECT {MILESTONE_COLS} FROM goal_periods WHERE period_end >= NOW() ORDER BY period_start DESC")
    } else {
        format!("SELECT {MILESTONE_COLS} FROM goal_periods ORDER BY period_start DESC")
    };
    sqlx::query_as::<_, MilestoneRow>(&query)
        .fetch_all(pool).await
        .map_err(|e| db_context("get_milestones", e))
}

#[tauri::command]
pub async fn update_milestone(
    db: State<'_, PosDb>,
    id: String,
    req: UpdateMilestoneRequest,
) -> PosResult<MilestoneRow> {
    let pool = &db.0;
    let now = Utc::now();

    let mut updates: Vec<String> = vec!["updated_at = $1".to_string()];
    let bind_idx = 2;
    if req.target_value.is_some() {
        updates.push(format!("target_value = ${}", bind_idx));
    }

    let query = format!(
        "UPDATE goal_periods SET {} WHERE id = ${} RETURNING {MILESTONE_COLS}",
        updates.join(", "),
        bind_idx + 1
    );

    let mut q = sqlx::query_as::<_, MilestoneRow>(&query);
    q = q.bind(now);
    if let Some(v) = req.target_value { q = q.bind(v); }
    q = q.bind(&id);

    let row = q.fetch_one(pool).await
        .map_err(|e| db_context("update_milestone", e))?;

    log::info!("[MILESTONE] Updated {}", id);
    Ok(row)
}

/// Redistribute remaining target across remaining days.
/// Uses goal_periods.current_value directly — no unified_goals queries.
#[tauri::command]
pub async fn run_balancer_engine(
    db: State<'_, PosDb>,
    milestone_id: String,
    timezone_offset: Option<i32>,
) -> PosResult<BalancerResult> {
    let pool = &db.0;

    let milestone = sqlx::query_as::<_, MilestoneRow>(
        &format!("SELECT {MILESTONE_COLS} FROM goal_periods WHERE id = $1")
    )
    .bind(&milestone_id)
    .fetch_one(pool).await
    .map_err(|e| db_context("fetch milestone", e))?;

    let is_real_milestone = milestone.period_type == "monthly";
    if !is_real_milestone {
        return Err(PosError::InvalidInput(
            "Balancer only runs on monthly milestones.".into()
        ));
    }

    let remaining_target = milestone.target_value - milestone.current_value;
    if remaining_target <= 0 {
        return Ok(BalancerResult {
            milestone_id,
            target_metric: milestone.target_metric,
            updated_goals: 0,
            daily_required: 0,
            is_real_milestone,
            message: "Milestone already complete!".to_string(),
        });
    }

    let offset_minutes = timezone_offset.unwrap_or(0);
    let now_local = Utc::now() + chrono::Duration::minutes(offset_minutes as i64);
    let today = now_local.date_naive();
    let end_date = (milestone.period_end + chrono::Duration::minutes(offset_minutes as i64)).date_naive();

    if today > end_date {
        return Err(PosError::InvalidInput("Milestone period has ended".into()));
    }

    let remaining_days = (end_date - today).num_days() + 1;
    if remaining_days <= 0 {
        return Err(PosError::InvalidInput("No remaining days in period".into()));
    }

    let daily_required = (remaining_target as f64 / remaining_days as f64).ceil() as i32;

    log::info!("[BALANCER] {} remaining={} days={} daily_required={}",
        milestone.target_metric, remaining_target, remaining_days, daily_required);

    Ok(BalancerResult {
        milestone_id,
        target_metric: milestone.target_metric,
        updated_goals: 0,
        daily_required,
        is_real_milestone,
        message: format!("{} per day for {} remaining days", daily_required, remaining_days),
    })
}

#[tauri::command]
pub async fn delete_milestone(
    db: State<'_, PosDb>,
    id: String,
) -> PosResult<()> {
    let pool = &db.0;
    sqlx::query("DELETE FROM goal_periods WHERE id = $1")
        .bind(&id).execute(pool).await
        .map_err(|e| db_context("delete_milestone", e))?;
    log::info!("[MILESTONE] Deleted {}", id);
    Ok(())
}

/// Additive UPSERT into milestone_daily_progress for a specific date.
/// Recomputes goal_periods.current_value = SUM(amount) after update.
#[tauri::command]
pub async fn increment_milestone_progress(
    db: State<'_, PosDb>,
    milestone_id: String,
    amount: i32,
    date: String,
) -> PosResult<MilestoneRow> {
    let pool = &db.0;

    chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| PosError::InvalidInput("Invalid date, expected YYYY-MM-DD".into()))?;

    let id = gen_id();

    // Additive UPSERT: add amount to existing day's amount
    sqlx::query(
        "INSERT INTO milestone_daily_progress (id, milestone_id, date, amount, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (milestone_id, date)
         DO UPDATE SET amount = milestone_daily_progress.amount + EXCLUDED.amount, updated_at = NOW()"
    )
    .bind(&id).bind(&milestone_id).bind(&date).bind(amount)
    .execute(pool).await
    .map_err(|e| db_context("upsert milestone_daily_progress", e))?;

    // Recompute aggregate from source of truth
    let updated = sqlx::query_as::<_, MilestoneRow>(
        &format!(
            "UPDATE goal_periods
             SET current_value = (
                 SELECT COALESCE(SUM(amount), 0) FROM milestone_daily_progress WHERE milestone_id = $1
             ),
             updated_at = NOW()
             WHERE id = $1
             RETURNING {MILESTONE_COLS}"
        )
    )
    .bind(&milestone_id)
    .fetch_one(pool).await
    .map_err(|e| db_context("recompute current_value", e))?;

    log::info!("[MILESTONE] Incremented {} by {} on {} (total now {})",
        milestone_id, amount, date, updated.current_value);
    Ok(updated)
}

/// Absolute SET for a specific date (edit path).
/// Recomputes goal_periods.current_value = SUM(amount) after update.
#[tauri::command]
pub async fn set_milestone_progress_for_date(
    db: State<'_, PosDb>,
    milestone_id: String,
    date: String,
    amount: i32,
) -> PosResult<MilestoneRow> {
    let pool = &db.0;

    chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| PosError::InvalidInput("Invalid date, expected YYYY-MM-DD".into()))?;

    let id = gen_id();

    // Absolute UPSERT: overwrite amount for this date
    sqlx::query(
        "INSERT INTO milestone_daily_progress (id, milestone_id, date, amount, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (milestone_id, date)
         DO UPDATE SET amount = EXCLUDED.amount, updated_at = NOW()"
    )
    .bind(&id).bind(&milestone_id).bind(&date).bind(amount)
    .execute(pool).await
    .map_err(|e| db_context("set milestone_daily_progress", e))?;

    // Recompute aggregate
    let updated = sqlx::query_as::<_, MilestoneRow>(
        &format!(
            "UPDATE goal_periods
             SET current_value = (
                 SELECT COALESCE(SUM(amount), 0) FROM milestone_daily_progress WHERE milestone_id = $1
             ),
             updated_at = NOW()
             WHERE id = $1
             RETURNING {MILESTONE_COLS}"
        )
    )
    .bind(&milestone_id)
    .fetch_one(pool).await
    .map_err(|e| db_context("recompute current_value (set)", e))?;

    log::info!("[MILESTONE] Set {} on {} to {} (total now {})",
        milestone_id, date, amount, updated.current_value);
    Ok(updated)
}

/// Get today's progress for a milestone from milestone_daily_progress.
#[tauri::command]
pub async fn get_milestone_today_progress(
    db: State<'_, PosDb>,
    milestone_id: String,
    today_date: String,
) -> PosResult<i32> {
    let pool = &db.0;

    let result: Option<i32> = sqlx::query_scalar(
        "SELECT amount FROM milestone_daily_progress WHERE milestone_id = $1 AND date = $2"
    )
    .bind(&milestone_id).bind(&today_date)
    .fetch_optional(pool).await
    .map_err(|e| db_context("get_milestone_today_progress", e))?;

    let progress = result.unwrap_or(0);
    log::info!("[MILESTONE] Today's progress for {} on {}: {}", milestone_id, today_date, progress);
    Ok(progress)
}

/// Get milestone with per-day breakdown from milestone_daily_progress.
#[tauri::command]
pub async fn get_milestone_with_daily_breakdown(
    db: State<'_, PosDb>,
    milestone_id: String,
) -> PosResult<serde_json::Value> {
    let pool = &db.0;

    let milestone = sqlx::query_as::<_, MilestoneRow>(
        &format!("SELECT {MILESTONE_COLS} FROM goal_periods WHERE id = $1")
    )
    .bind(&milestone_id)
    .fetch_one(pool).await
    .map_err(|e| db_context("get_milestone", e))?;

    let daily_progress: Vec<(String, i32)> = sqlx::query_as(
        "SELECT date, amount FROM milestone_daily_progress WHERE milestone_id = $1 ORDER BY date"
    )
    .bind(&milestone_id)
    .fetch_all(pool).await
    .map_err(|e| db_context("get_daily_breakdown", e))?;

    Ok(serde_json::json!({
        "milestone": milestone,
        "dailyBreakdown": daily_progress
    }))
}
