use chrono::{DateTime, Utc, Datelike};
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
    pub target_metric: String,      // e.g., "Pushups", "LeetCode Problems"
    pub target_value: i32,           // Calculated: daily_amount × days_in_period
    pub daily_amount: i32,           // User input: amount per day
    pub period_type: String,         // "monthly" | "weekly" | "daily"
    pub period_start: DateTime<Utc>, // Start of period
    pub period_end: DateTime<Utc>,   // End of period
    pub strategy: String,            // Always "EvenDistribution" (auto-calculated)
    pub current_value: i32,          // Aggregated from all linked daily goals
    pub problem_id: Option<String>,  // LeetCode/Codeforces problem URL
    pub recurring_pattern: Option<String>, // "Daily" or "Mon,Tue,Wed"
    pub label: Option<String>,       // Metric label (e.g., "pushups")
    pub unit: Option<String>,        // Metric unit (e.g., "reps")
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ─── Request types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMilestoneRequest {
    pub target_metric: String,
    pub daily_amount: i32,          // User input: amount per day
    pub period_start: String,       // ISO 8601 date (e.g., "2026-02-01")
    pub period_end: String,         // ISO 8601 date (e.g., "2026-02-28")
    pub period_type: String,        // "monthly" | "weekly" | "daily"
    pub problem_id: Option<String>, // LeetCode/Codeforces URL
    pub recurring_pattern: Option<String>, // "Daily" or "Mon,Tue,Wed"
    pub label: Option<String>,      // Metric label
    pub unit: Option<String>,       // Metric unit
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMilestoneRequest {
    pub target_value: Option<i32>,
    pub strategy: Option<String>,
}

// ─── Response types ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalancerResult {
    pub milestone_id: String,
    pub updated_goals: i32,
    pub daily_required: i32,
    pub is_real_milestone: bool,  // true for monthly, false for weekly/daily
    pub message: String,
}

// ─── Helper Functions ───────────────────────────────────────────────

/// Calculate target_value from daily_amount and period length
/// Handles leap years for February periods
fn calculate_target_value(
    daily_amount: i32,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
) -> i32 {
    let days_in_period = (period_end - period_start).num_days() + 1; // +1 to include both start and end
    daily_amount * days_in_period as i32
}

/// Check if a recurring pattern matches a given date.
/// Pattern is comma-separated days: "Mon,Tue,Wed" or all 7 days for daily
fn is_recurring_day(pattern: &str, date_str: &str) -> bool {
    if pattern.is_empty() {
        return true; // Empty pattern = all days
    }
    
    let days: Vec<&str> = pattern.split(',').filter(|s| !s.is_empty()).collect();
    if days.len() == 7 {
        return true; // All 7 days selected = daily
    }
    
    if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        let day_name = date.format("%a").to_string(); // Mon, Tue, Wed...
        pattern.contains(&day_name)
    } else {
        false
    }
}

/// Generate daily goal instances for a milestone based on recurring pattern
async fn generate_daily_instances(
    pool: &sqlx::PgPool,
    milestone: &MilestoneRow,
    pattern: &str,
) -> PosResult<()> {
    let mut curr = milestone.period_start;
    let end = milestone.period_end;
    
    // Calculate initial daily target (even distribution)
    let total_days = (end - curr).num_days() + 1;
    let daily_target = (milestone.target_value as f64 / total_days as f64).ceil() as i32;
    
    let label = milestone.label.as_deref().unwrap_or("Target");
    let unit = milestone.unit.as_deref().unwrap_or("units");
    
    while curr <= end {
        let day_name = curr.format("%a").to_string(); // Mon, Tue, Wed...
        let date_str = curr.format("%Y-%m-%d").to_string();
        
        // Check if this day matches the pattern
        let should_generate = is_recurring_day(pattern, &date_str);
        
        if should_generate {
            let goal_id = gen_id();
            let metric_id = gen_id();
            let date_str = curr.format("%Y-%m-%d").to_string();
            
            // Create metrics JSON
            let metrics_json = serde_json::json!([{
                "id": metric_id,
                "label": label,
                "target": daily_target,
                "current": 0,
                "unit": unit
            }]);
            
            // Insert daily goal instance
            sqlx::query(
                r#"INSERT INTO unified_goals (
                    id, text, description, completed, completed_at, verified,
                    due_date, due_date_local, recurring_pattern, recurring_template_id, 
                    priority, urgent, metrics, problem_id, linked_activity_ids, labels, 
                    parent_goal_id, created_at, updated_at, original_date, is_debt
                ) VALUES ($1, $2, $3, false, NULL, false, $4, $5, NULL, NULL, 'medium', false, $6, $7, NULL, NULL, $8, NOW(), NOW(), NULL, false)
                ON CONFLICT (recurring_template_id, due_date_local) DO NOTHING"#
            )
            .bind(&goal_id)
            .bind(&milestone.target_metric)
            .bind(format!("Daily target: {} {}", daily_target, unit).as_str())
            .bind(curr)
            .bind(&date_str)
            .bind(&metrics_json)
            .bind(&milestone.problem_id)
            .bind(&milestone.id) // parent_goal_id links to milestone
            .execute(pool)
            .await
            .map_err(|e| db_context("generate daily instance", e))?;
        }
        
        curr = curr + chrono::Duration::days(1);
    }
    
    log::info!("[MILESTONE] Generated daily instances for milestone {}", milestone.id);
    Ok(())
}

// ─── Commands ───────────────────────────────────────────────────────

/// Create a new milestone
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

    // Validate period_type
    if !["monthly", "weekly", "daily"].contains(&req.period_type.as_str()) {
        return Err(PosError::InvalidInput("period_type must be 'monthly', 'weekly', or 'daily'".into()));
    }

    // Calculate target_value from daily_amount × days_in_period
    let target_value = calculate_target_value(req.daily_amount, period_start, period_end);

    let row = sqlx::query_as::<_, MilestoneRow>(
        r#"INSERT INTO goal_periods (
            id, target_metric, target_value, daily_amount, period_type, period_start, period_end, 
            strategy, current_value, problem_id, recurring_pattern, label, unit, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'EvenDistribution', 0, $8, $9, $10, $11, $12, $12)
        RETURNING id, target_metric, target_value, daily_amount, period_type, period_start, period_end, 
                  strategy, current_value, problem_id, recurring_pattern, label, unit, created_at, updated_at"#,
    )
    .bind(&id)
    .bind(&req.target_metric)
    .bind(target_value)
    .bind(req.daily_amount)
    .bind(&req.period_type)
    .bind(period_start)
    .bind(period_end)
    .bind(&req.problem_id)
    .bind(&req.recurring_pattern)
    .bind(&req.label)
    .bind(&req.unit)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("create_milestone", e))?;

    // Generate daily instances if recurring_pattern is set
    if let Some(ref pattern) = req.recurring_pattern {
        generate_daily_instances(pool, &row, pattern).await?;
    }

    log::info!("[MILESTONE] Created {} milestone {} for {} (daily_amount: {}, target_value: {})", 
        req.period_type, id, req.target_metric, req.daily_amount, target_value);
    Ok(row)
}

/// Get milestones with optional filtering
#[tauri::command]
pub async fn get_milestones(
    db: State<'_, PosDb>,
    active_only: Option<bool>,
) -> PosResult<Vec<MilestoneRow>> {
    let pool = &db.0;

    let query = if active_only.unwrap_or(false) {
        "SELECT id, target_metric, target_value, daily_amount, period_type, period_start, period_end, strategy, current_value, problem_id, recurring_pattern, label, unit, created_at, updated_at FROM goal_periods WHERE period_end >= NOW() ORDER BY period_start DESC"
    } else {
        "SELECT id, target_metric, target_value, daily_amount, period_type, period_start, period_end, strategy, current_value, problem_id, recurring_pattern, label, unit, created_at, updated_at FROM goal_periods ORDER BY period_start DESC"
    };

    let rows = sqlx::query_as::<_, MilestoneRow>(query)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("get_milestones", e))?;

    Ok(rows)
}

/// Update a milestone
#[tauri::command]
pub async fn update_milestone(
    db: State<'_, PosDb>,
    id: String,
    req: UpdateMilestoneRequest,
) -> PosResult<MilestoneRow> {
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
        "UPDATE goal_periods SET {} WHERE id = ${} RETURNING id, target_metric, target_value, daily_amount, period_type, period_start, period_end, strategy, current_value, problem_id, recurring_pattern, label, unit, created_at, updated_at",
        updates.join(", "),
        bind_idx + 1
    );

    let mut q = sqlx::query_as::<_, MilestoneRow>(&query);
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
        .map_err(|e| db_context("update_milestone", e))?;

    log::info!("[MILESTONE] Updated milestone {}", id);
    Ok(row)
}

/// Run the Balancer Engine - redistributes milestone across remaining days
/// Only runs on monthly milestones (is_real_milestone = true)
#[tauri::command]
pub async fn run_balancer_engine(
    db: State<'_, PosDb>,
    milestone_id: String,
    timezone_offset: Option<i32>, // Minutes from UTC
) -> PosResult<BalancerResult> {
    let pool = &db.0;

    // 1. Fetch milestone
    let milestone = sqlx::query_as::<_, MilestoneRow>(
        "SELECT id, target_metric, target_value, daily_amount, period_type, period_start, period_end, strategy, current_value, problem_id, recurring_pattern, label, unit, created_at, updated_at FROM goal_periods WHERE id = $1"
    )
    .bind(&milestone_id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("fetch milestone", e))?;

    // Check if this is a real milestone (monthly only)
    let is_real_milestone = milestone.period_type == "monthly";
    
    if !is_real_milestone {
        return Err(PosError::InvalidInput(
            "Balancer only runs on monthly milestones. Weekly/daily milestones are analytics-only.".into()
        ));
    }

    // 2. Calculate remaining target
    // Aggregate current_value from all linked unified_goals (daily instances)
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
        WHERE parent_goal_id = $1"#
    )
    .bind(&milestone_id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("aggregate completed", e))?;

    let completed = total_completed.unwrap_or(0);
    let remaining_target = milestone.target_value - completed;

    if remaining_target <= 0 {
        return Ok(BalancerResult {
            milestone_id: milestone_id.clone(),
            updated_goals: 0,
            daily_required: 0,
            is_real_milestone,
            message: "Milestone already complete!".to_string(),
        });
    }

    // 3. Calculate remaining days
    let now_utc = Utc::now();
    let offset_minutes = timezone_offset.unwrap_or(0);
    let now_local = now_utc + chrono::Duration::minutes(offset_minutes as i64);
    let today = now_local.date_naive();
    
    let period_end = milestone.period_end + chrono::Duration::minutes(offset_minutes as i64);
    let end_date = period_end.date_naive();

    if today > end_date {
        return Err(PosError::InvalidInput("Milestone period has ended".into()));
    }

    let remaining_days = (end_date - today).num_days() + 1; // +1 to include today

    if remaining_days <= 0 {
        return Err(PosError::InvalidInput("No remaining days in period".into()));
    }

    // 4. Calculate daily required (always even distribution)
    let daily_required = (remaining_target as f64 / remaining_days as f64).ceil() as i32;

    // 5. Update future unified_goals that are linked to this milestone
    // Only update goals that are:
    // - Linked to this milestone_id (parent_goal_id)
    // - Not completed
    // - Due date is today or later

    let mut tx = pool.begin().await.map_err(|e| db_context("TX begin", e))?;

    // Get future goals linked to this milestone
    let future_goals: Vec<(String,)> = sqlx::query_as(
        r#"SELECT id FROM unified_goals 
           WHERE parent_goal_id = $1 
           AND completed = false 
           AND due_date >= $2"#
    )
    .bind(&milestone_id)
    .bind(now_utc)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| db_context("fetch future goals", e))?;

    let mut updated_count = 0;
    let label = milestone.label.as_deref().unwrap_or("Target");

    for (goal_id,) in &future_goals {
        // Update the goal's metrics target value
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
        milestone.target_metric, updated_count, daily_required);

    Ok(BalancerResult {
        milestone_id: milestone_id.clone(),
        updated_goals: updated_count,
        daily_required,
        is_real_milestone,
        message: format!("Redistributed to {} goals, {} per day", updated_count, daily_required),
    })
}

/// Delete a milestone
#[tauri::command]
pub async fn delete_milestone(
    db: State<'_, PosDb>,
    id: String,
) -> PosResult<()> {
    let pool = &db.0;

    sqlx::query("DELETE FROM goal_periods WHERE id = $1")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| db_context("delete_milestone", e))?;

    log::info!("[MILESTONE] Deleted milestone {}", id);
    Ok(())
}
