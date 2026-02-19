use chrono::{DateTime, Utc, Datelike};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;

// ─── Row types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyGoalRow {
    pub id: String,
    pub target_metric: String,      // e.g., "Pushups", "LeetCode Problems"
    pub target_value: i32,
    pub period_start: DateTime<Utc>, // Start of month
    pub period_end: DateTime<Utc>,   // End of month
    pub strategy: String,            // "EvenDistribution" | "FrontLoad" | "Manual"
    pub current_value: i32,          // Aggregated from all linked daily goals
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ─── Request types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMonthlyGoalRequest {
    pub target_metric: String,
    pub target_value: i32,
    pub period_start: String,       // ISO 8601 date (e.g., "2026-02-01")
    pub period_end: String,         // ISO 8601 date (e.g., "2026-02-28")
    pub strategy: Option<String>,   // Default: "EvenDistribution"
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMonthlyGoalRequest {
    pub target_value: Option<i32>,
    pub strategy: Option<String>,
}

// ─── Response types ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalancerResult {
    pub monthly_goal_id: String,
    pub updated_goals: i32,
    pub daily_required: i32,
    pub message: String,
}

// ─── Commands ───────────────────────────────────────────────────────

/// Create a new monthly goal
#[tauri::command]
pub async fn create_monthly_goal(
    db: State<'_, PosDb>,
    req: CreateMonthlyGoalRequest,
) -> PosResult<MonthlyGoalRow> {
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

    let strategy = req.strategy.unwrap_or_else(|| "EvenDistribution".to_string());

    let row = sqlx::query_as::<_, MonthlyGoalRow>(
        r#"INSERT INTO goal_periods (
            id, target_metric, target_value, period_start, period_end, strategy, current_value, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $7)
        RETURNING *"#,
    )
    .bind(&id)
    .bind(&req.target_metric)
    .bind(req.target_value)
    .bind(period_start)
    .bind(period_end)
    .bind(&strategy)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("create_monthly_goal", e))?;

    log::info!("[MONTHLY] Created monthly goal {} for {}", id, req.target_metric);
    Ok(row)
}

/// Get monthly goals with optional filtering
#[tauri::command]
pub async fn get_monthly_goals(
    db: State<'_, PosDb>,
    active_only: Option<bool>,
) -> PosResult<Vec<MonthlyGoalRow>> {
    let pool = &db.0;

    let query = if active_only.unwrap_or(false) {
        "SELECT id, target_metric, target_value, period_start, period_end, strategy, current_value, created_at, updated_at FROM goal_periods WHERE period_end >= NOW() ORDER BY period_start DESC"
    } else {
        "SELECT id, target_metric, target_value, period_start, period_end, strategy, current_value, created_at, updated_at FROM goal_periods ORDER BY period_start DESC"
    };

    let rows = sqlx::query_as::<_, MonthlyGoalRow>(query)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("get_monthly_goals", e))?;

    Ok(rows)
}

/// Update a monthly goal
#[tauri::command]
pub async fn update_monthly_goal(
    db: State<'_, PosDb>,
    id: String,
    req: UpdateMonthlyGoalRequest,
) -> PosResult<MonthlyGoalRow> {
    let pool = &db.0;
    let now = Utc::now();

    let mut updates: Vec<String> = vec!["updated_at = $1".to_string()];
    let mut bind_idx = 2;

    if req.target_value.is_some() {
        updates.push(format!("target_value = ${}", bind_idx));
        bind_idx += 1;
    }
    if req.strategy.is_some() {
        updates.push(format!("strategy = ${}", bind_idx));
    }

    let query = format!(
        "UPDATE goal_periods SET {} WHERE id = ${} RETURNING *",
        updates.join(", "),
        bind_idx + 1
    );

    let mut q = sqlx::query_as::<_, MonthlyGoalRow>(&query);
    q = q.bind(now);

    if let Some(v) = req.target_value {
        q = q.bind(v);
    }
    if let Some(v) = req.strategy {
        q = q.bind(v);
    }
    q = q.bind(&id);

    let row = q.fetch_one(pool)
        .await
        .map_err(|e| db_context("update_monthly_goal", e))?;

    log::info!("[MONTHLY] Updated monthly goal {}", id);
    Ok(row)
}

/// Run the Balancer Engine - redistributes monthly goal across remaining days
#[tauri::command]
pub async fn run_balancer_engine(
    db: State<'_, PosDb>,
    monthly_goal_id: String,
    timezone_offset: Option<i32>, // Minutes from UTC
) -> PosResult<BalancerResult> {
    let pool = &db.0;

    // 1. Fetch monthly goal
    let monthly_goal = sqlx::query_as::<_, MonthlyGoalRow>(
        "SELECT id, target_metric, target_value, period_start, period_end, strategy, current_value, created_at, updated_at FROM goal_periods WHERE id = $1"
    )
    .bind(&monthly_goal_id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("fetch monthly goal", e))?;

    // 2. Calculate remaining target
    // Aggregate current_value from all linked unified_goals
    let total_completed: Option<i32> = sqlx::query_scalar(
        r#"SELECT COALESCE(SUM(
            CASE 
                WHEN metrics IS NOT NULL THEN 
                    (SELECT COALESCE(SUM((metric->>'current')::float), 0) 
                     FROM jsonb_array_elements(metrics) AS metric)
                ELSE 0
            END
        ), 0)::int
        FROM unified_goals 
        WHERE parent_goal_id = $1 AND completed = true"#
    )
    .bind(&monthly_goal_id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("aggregate completed", e))?;

    let completed = total_completed.unwrap_or(0);
    let remaining_target = monthly_goal.target_value - completed;

    if remaining_target <= 0 {
        return Ok(BalancerResult {
            monthly_goal_id: monthly_goal_id.clone(),
            updated_goals: 0,
            daily_required: 0,
            message: "Monthly goal already complete!".to_string(),
        });
    }

    // 3. Calculate remaining days
    let now_utc = Utc::now();
    let offset_minutes = timezone_offset.unwrap_or(0);
    let now_local = now_utc + chrono::Duration::minutes(offset_minutes as i64);
    let today = now_local.date_naive();
    
    let period_end = monthly_goal.period_end + chrono::Duration::minutes(offset_minutes as i64);
    let end_date = period_end.date_naive();

    if today > end_date {
        return Err(PosError::InvalidInput("Monthly goal period has ended".into()));
    }

    let remaining_days = (end_date - today).num_days() + 1; // +1 to include today

    if remaining_days <= 0 {
        return Err(PosError::InvalidInput("No remaining days in period".into()));
    }

    // 4. Calculate daily required based on strategy
    let daily_required = match monthly_goal.strategy.as_str() {
        "EvenDistribution" => {
            (remaining_target as f64 / remaining_days as f64).ceil() as i32
        }
        "FrontLoad" => {
            // FrontLoad: Higher targets in earlier days
            // Simple implementation: double the even distribution for early days
            let base = (remaining_target as f64 / remaining_days as f64).ceil() as i32;
            base * 2 // This would be more sophisticated in a full implementation
        }
        "Manual" => {
            // Manual: Don't auto-redistribute
            return Ok(BalancerResult {
                monthly_goal_id: monthly_goal_id.clone(),
                updated_goals: 0,
                daily_required: 0,
                message: "Manual strategy - no auto-redistribution".to_string(),
            });
        }
        _ => (remaining_target as f64 / remaining_days as f64).ceil() as i32,
    };

    // 5. Update future unified_goals that are linked to this monthly goal
    // Only update goals that are:
    // - Linked to this monthly_goal_id (parent_goal_id)
    // - Not completed
    // - Due date is today or later
    // - Not manually locked (we'll add a manual_override flag later)

    let mut tx = pool.begin().await.map_err(|e| db_context("TX begin", e))?;

    // Get future goals linked to this monthly goal
    let future_goals: Vec<(String,)> = sqlx::query_as(
        r#"SELECT id FROM unified_goals 
           WHERE parent_goal_id = $1 
           AND completed = false 
           AND due_date >= $2"#
    )
    .bind(&monthly_goal_id)
    .bind(now_utc)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| db_context("fetch future goals", e))?;

    let mut updated_count = 0;

    for (goal_id,) in &future_goals {
        // Update the goal's metrics to match daily_required
        // This assumes metrics is a JSONB array with a "target" field
        let update_result = sqlx::query(
            r#"UPDATE unified_goals 
               SET metrics = jsonb_set(
                   COALESCE(metrics, '[]'::jsonb),
                   '{0,target}',
                   $1::text::jsonb
               ),
               updated_at = NOW()
               WHERE id = $2"#
        )
        .bind(daily_required)
        .bind(goal_id)
        .execute(&mut *tx)
        .await;

        if update_result.is_ok() {
            updated_count += 1;
        }
    }

    tx.commit().await.map_err(|e| db_context("TX commit", e))?;

    log::info!("[BALANCER] Redistributed {} across {} future goals (daily: {})",
        monthly_goal.target_metric, updated_count, daily_required);

    Ok(BalancerResult {
        monthly_goal_id: monthly_goal_id.clone(),
        updated_goals: updated_count,
        daily_required,
        message: format!("Redistributed to {} goals, {} per day", updated_count, daily_required),
    })
}

/// Delete a monthly goal
#[tauri::command]
pub async fn delete_monthly_goal(
    db: State<'_, PosDb>,
    id: String,
) -> PosResult<()> {
    let pool = &db.0;

    sqlx::query("DELETE FROM goal_periods WHERE id = $1")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| db_context("delete_monthly_goal", e))?;

    log::info!("[MONTHLY] Deleted monthly goal {}", id);
    Ok(())
}
