use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use super::error::{PosError, db_context};
use super::utils::gen_id;

// ─── Row types (native chrono for TIMESTAMPTZ) ──────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GoalRow {
    pub id: String,
    pub date: String,
    pub description: String,
    pub problem_id: Option<String>,
    pub is_verified: bool,
    pub recurring_goal_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GoalMetricRow {
    pub id: String,
    pub goal_id: String,
    pub label: String,
    pub target_value: i32,
    pub current_value: i32,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RecurringGoalRow {
    pub id: String,
    pub description: String,
    pub frequency: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RecurringGoalMetricRow {
    pub id: String,
    pub recurring_goal_id: String,
    pub label: String,
    pub target_value: i32,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DebtGoalRow {
    pub id: String,
    pub goal_id: String,
    pub original_date: String,
    pub description: String,
    pub problem_id: Option<String>,
    pub transitioned_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
}

// ─── Composite response ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalWithDetails {
    #[serde(flatten)]
    pub goal: GoalRow,
    pub metrics: Vec<GoalMetricRow>,
    pub activities: Vec<super::activities::ActivityRow>,
    pub recurring_goal: Option<RecurringGoalRow>,
}

// ─── Request types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateGoalRequest {
    pub date: Option<String>,        // YYYY-MM-DD (required for one-off)
    pub description: String,
    pub problem_id: Option<String>,  // URL or slug
    pub metrics: Option<Vec<MetricInput>>,
    pub frequency: Option<String>,   // e.g. "Mon,Tue,Wed" or "Daily"
}

#[derive(Debug, Deserialize)]
pub struct MetricInput {
    pub label: Option<String>,
    pub target_value: i32,
    pub unit: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionResponse {
    pub transitioned: i32,
    pub message: String,
}



// ─── Helpers ────────────────────────────────────────────────────────

/// Check if a recurring goal's frequency matches a given date.
/// e.g. "Daily" always matches, "Mon,Tue" matches if date falls on Mon or Tue.
fn is_recurring_day(frequency: &str, date_str: &str) -> bool {
    if frequency == "Daily" {
        return true;
    }
    if let Ok(date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        let day_name = date.format("%a").to_string(); // Mon, Tue, Wed...
        frequency.contains(&day_name)
    } else {
        false
    }
}

/// Parse a LeetCode/Codeforces problem URL into a normalized slug.
/// - https://leetcode.com/problems/two-sum/ → leetcode-two-sum
/// - https://codeforces.com/problemset/problem/2193/H → cf-2193H
/// - Already a slug → pass through
fn normalize_problem_id(problem_id: &str) -> String {
    if problem_id.contains("leetcode.com/problems/") {
        if let Some(cap) = problem_id.split("problems/").nth(1) {
            let slug = cap.trim_end_matches('/').split('/').next().unwrap_or(cap);
            return format!("leetcode-{}", slug);
        }
    } else if problem_id.contains("codeforces.com/problemset/problem/") {
        let parts: Vec<&str> = problem_id.split("problem/").collect();
        if parts.len() > 1 {
            let rest: Vec<&str> = parts[1].split('/').collect();
            if rest.len() >= 2 {
                return format!("cf-{}{}", rest[0], rest[1].trim_end_matches('/'));
            }
        }
    }
    problem_id.to_string()
}

// ─── Commands ───────────────────────────────────────────────────────

/// Fetch goals for a date. Auto-generates from active recurring templates if needed.
/// Auto-transitions old unverified goals to debt.
/// Returns goals with their metrics, linked activities, and recurring template info.
#[tauri::command]
pub async fn get_goals(
    db: State<'_, PosDb>,
    date: String,
) -> Result<Vec<GoalWithDetails>, PosError> {
    log::info!("[CMD] get_goals called for date: {}", date);
    let pool = &db.0;

    // 0. Auto-transition old unverified goals to debt (lazy cleanup)
    log::info!("[CMD] get_goals: checking for old unverified goals");
    let unverified = sqlx::query_as::<_, GoalRow>(
        "SELECT id, date, description, problem_id, is_verified, recurring_goal_id, created_at FROM pos_goals WHERE date < $1 AND is_verified = FALSE",
    )
    .bind(&date)
    .fetch_all(pool)
    .await
    .map_err(|e| {
        log::error!("[CMD] get_goals: DB error finding old unverified: {}", e);
        db_context("find old unverified", e)
    })?;

    if !unverified.is_empty() {
        log::info!("[CMD] get_goals: transitioning {} old goals to debt", unverified.len());
        for goal in &unverified {
            let debt_id = gen_id();
            sqlx::query(
                "INSERT INTO pos_debt_goals (id, goal_id, original_date, description, problem_id) VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(&debt_id)
            .bind(&goal.id)
            .bind(&goal.date)
            .bind(&goal.description)
            .bind(&goal.problem_id)
            .execute(pool)
            .await
            .map_err(|e| db_context("insert debt goal", e))?;
        }
        log::info!("[POS] Auto-transitioned {} old unverified goals to debt", unverified.len());
    }

    // 1. Fetch existing goals for this date
    let mut goals = sqlx::query_as::<_, GoalRow>(
        "SELECT id, date, description, problem_id, is_verified, recurring_goal_id, created_at FROM pos_goals WHERE date = $1 ORDER BY created_at ASC",
    )
    .bind(&date)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("fetch goals", e))?;

    // 2. Check and generate recurring goals (only if not already generated)
    let active_recurring = sqlx::query_as::<_, RecurringGoalRow>(
        "SELECT id, description, frequency, is_active, created_at, updated_at FROM pos_recurring_goals WHERE is_active = TRUE",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("fetch recurring goals", e))?;

    let existing_recurring_ids: std::collections::HashSet<String> = goals
        .iter()
        .filter_map(|g| g.recurring_goal_id.clone())
        .collect();

    let mut created_count = 0;

    for template in &active_recurring {
        if !existing_recurring_ids.contains(&template.id) && is_recurring_day(&template.frequency, &date) {
            // Fetch template metrics
            let template_metrics = sqlx::query_as::<_, RecurringGoalMetricRow>(
                "SELECT id, recurring_goal_id, label, target_value, unit FROM pos_recurring_goal_metrics WHERE recurring_goal_id = $1",
            )
            .bind(&template.id)
            .fetch_all(pool)
            .await
            .map_err(|e| db_context("fetch template metrics", e))?;

            // Create goal instance
            let goal_id = gen_id();
            sqlx::query(
                "INSERT INTO pos_goals (id, date, description, recurring_goal_id, is_verified) VALUES ($1, $2, $3, $4, FALSE)",
            )
            .bind(&goal_id)
            .bind(&date)
            .bind(&template.description)
            .bind(&template.id)
            .execute(pool)
            .await
            .map_err(|e| db_context("Create recurring instance", e))?;

            // Copy metrics from template to goal instance
            for tm in &template_metrics {
                let gm_id = gen_id();
                sqlx::query(
                    "INSERT INTO pos_goal_metrics (id, goal_id, label, target_value, current_value, unit) VALUES ($1, $2, $3, $4, 0, $5)",
                )
                .bind(&gm_id)
                .bind(&goal_id)
                .bind(&tm.label)
                .bind(tm.target_value)
                .bind(&tm.unit)
                .execute(pool)
                .await
                .map_err(|e| db_context("Copy metric", e))?;
            }

            created_count += 1;
        }
    }

    // 3. If we created new instances, refetch
    if created_count > 0 {
        goals = sqlx::query_as::<_, GoalRow>(
            "SELECT id, date, description, problem_id, is_verified, recurring_goal_id, created_at FROM pos_goals WHERE date = $1 ORDER BY created_at ASC",
        )
        .bind(&date)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("Refetch goals", e))?;
    }

    // 4. Enrich each goal with metrics, activities, recurring template
    let mut result = Vec::with_capacity(goals.len());
    for goal in goals {
        let metrics = sqlx::query_as::<_, GoalMetricRow>(
            "SELECT id, goal_id, label, target_value, current_value, unit FROM pos_goal_metrics WHERE goal_id = $1",
        )
        .bind(&goal.id)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("Fetch goal metrics", e))?;

        let activities = sqlx::query_as::<_, super::activities::ActivityRow>(
            r#"SELECT id, date, start_time, end_time, category, description,
                      is_productive, is_shadow, goal_id, created_at
               FROM pos_activities WHERE goal_id = $1"#,
        )
        .bind(&goal.id)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("Fetch goal activities", e))?;

        let recurring_goal = if let Some(ref rg_id) = goal.recurring_goal_id {
            sqlx::query_as::<_, RecurringGoalRow>(
                "SELECT id, description, frequency, is_active, created_at, updated_at FROM pos_recurring_goals WHERE id = $1",
            )
            .bind(rg_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| db_context("Fetch recurring template", e))?
        } else {
            None
        };

        result.push(GoalWithDetails {
            goal,
            metrics,
            activities,
            recurring_goal,
        });
    }

    Ok(result)
}

/// Create a goal. Two modes:
/// - **Recurring** (frequency provided): creates template + metrics, then generates today's instance if matching
/// - **One-off** (no frequency): creates goal + metrics directly
#[tauri::command]
pub async fn create_goal(
    db: State<'_, PosDb>,
    req: CreateGoalRequest,
) -> Result<serde_json::Value, PosError> {
    let pool = &db.0;

    let final_problem_id = req.problem_id.as_deref().map(normalize_problem_id);

    // CASE A: Recurring Goal
    if let Some(ref frequency) = req.frequency {
        if frequency.is_empty() {
            return Err(PosError::InvalidInput("Frequency cannot be empty for recurring goals".into()));
        }

        let rg_id = gen_id();

        // 1. Create recurring goal template
        sqlx::query(
            "INSERT INTO pos_recurring_goals (id, description, frequency, is_active) VALUES ($1, $2, $3, TRUE)",
        )
        .bind(&rg_id)
        .bind(&req.description)
        .bind(frequency)
        .execute(pool)
        .await
        .map_err(|e| db_context("Create recurring", e))?;

        // 2. Create recurring goal metrics
        let mut template_metrics = Vec::new();
        if let Some(metrics) = &req.metrics {
            for m in metrics {
                let rgm_id = gen_id();
                let label = m.label.as_deref().unwrap_or("Target");
                sqlx::query(
                    "INSERT INTO pos_recurring_goal_metrics (id, recurring_goal_id, label, target_value, unit) VALUES ($1, $2, $3, $4, $5)",
                )
                .bind(&rgm_id)
                .bind(&rg_id)
                .bind(label)
                .bind(m.target_value)
                .bind(&m.unit)
                .execute(pool)
                .await
                .map_err(|e| db_context("Create recurring metric", e))?;

                template_metrics.push((label.to_string(), m.target_value, m.unit.clone()));
            }
        }

        // 3. If date provided and matches frequency, create today's instance
        if let Some(ref date) = req.date {
            // Validate: Cannot create goals for past dates
            let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
            if date < &today {
                return Err(PosError::InvalidInput(format!("Cannot create goals for past dates. Goal date: {}, Today: {}", date, today)));
            }
            
            if is_recurring_day(frequency, date) {
                let goal_id = gen_id();
                sqlx::query(
                    "INSERT INTO pos_goals (id, date, description, problem_id, recurring_goal_id, is_verified) VALUES ($1, $2, $3, $4, $5, FALSE)",
                )
                .bind(&goal_id)
                .bind(date)
                .bind(&req.description)
                .bind(&final_problem_id)
                .bind(&rg_id)
                .execute(pool)
                .await
                .map_err(|e| db_context("Create recurring instance", e))?;

                for (label, target, unit) in &template_metrics {
                    let gm_id = gen_id();
                    sqlx::query(
                        "INSERT INTO pos_goal_metrics (id, goal_id, label, target_value, current_value, unit) VALUES ($1, $2, $3, $4, 0, $5)",
                    )
                    .bind(&gm_id)
                    .bind(&goal_id)
                    .bind(label)
                    .bind(*target)
                    .bind(unit)
                    .execute(pool)
                    .await
                    .map_err(|e| db_context("Copy metric to instance", e))?;
                }
            }
        }

        // Fetch created recurring goal
        let rg = sqlx::query_as::<_, RecurringGoalRow>(
            "SELECT id, description, frequency, is_active, created_at, updated_at FROM pos_recurring_goals WHERE id = $1",
        )
        .bind(&rg_id)
        .fetch_one(pool)
        .await
        .map_err(|e| db_context("Fetch recurring", e))?;

        let rg_metrics = sqlx::query_as::<_, RecurringGoalMetricRow>(
            "SELECT id, recurring_goal_id, label, target_value, unit FROM pos_recurring_goal_metrics WHERE recurring_goal_id = $1",
        )
        .bind(&rg_id)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("Fetch recurring metrics", e))?;

        log::info!("[POS] Created recurring goal: {} (freq: {})", req.description, frequency);
        return Ok(serde_json::json!({
            "type": "recurring",
            "recurring_goal": rg,
            "metrics": rg_metrics,
        }));
    }

    // CASE B: One-off Goal
    let date = req.date.ok_or_else(|| PosError::InvalidInput("Date is required for one-off goals".into()))?;
    
    // Validate: Cannot create goals for past dates
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    if date < today {
        return Err(PosError::InvalidInput(format!("Cannot create goals for past dates. Goal date: {}, Today: {}", date, today)));
    }
    
    let goal_id = gen_id();

    sqlx::query(
        "INSERT INTO pos_goals (id, date, description, problem_id, is_verified) VALUES ($1, $2, $3, $4, FALSE)",
    )
    .bind(&goal_id)
    .bind(&date)
    .bind(&req.description)
    .bind(&final_problem_id)
    .execute(pool)
    .await
    .map_err(|e| db_context("Create goal", e))?;

    if let Some(metrics) = &req.metrics {
        for m in metrics {
            let gm_id = gen_id();
            let label = m.label.as_deref().unwrap_or("Target");
            sqlx::query(
                "INSERT INTO pos_goal_metrics (id, goal_id, label, target_value, current_value, unit) VALUES ($1, $2, $3, $4, 0, $5)",
            )
            .bind(&gm_id)
            .bind(&goal_id)
            .bind(label)
            .bind(m.target_value)
            .bind(&m.unit)
            .execute(pool)
            .await
            .map_err(|e| db_context("Create goal metric", e))?;
        }
    }

    let goal = sqlx::query_as::<_, GoalRow>(
        "SELECT id, date, description, problem_id, is_verified, recurring_goal_id, created_at FROM pos_goals WHERE id = $1",
    )
    .bind(&goal_id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("Fetch goal", e))?;

    let goal_metrics = sqlx::query_as::<_, GoalMetricRow>(
        "SELECT id, goal_id, label, target_value, current_value, unit FROM pos_goal_metrics WHERE goal_id = $1",
    )
    .bind(&goal_id)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("Fetch goal metrics", e))?;

    log::info!("[POS] Created one-off goal: {} (date: {})", req.description, date);
    Ok(serde_json::json!({
        "type": "one_off",
        "goal": goal,
        "metrics": goal_metrics,
    }))
}

/// Fetch all unresolved debt goals ordered by original date (oldest first).
#[tauri::command]
pub async fn get_debt_goals(
    db: State<'_, PosDb>,
) -> Result<Vec<DebtGoalRow>, PosError> {
    log::info!("[CMD] get_debt_goals called");
    let pool = &db.0;

    let rows = sqlx::query_as::<_, DebtGoalRow>(
        "SELECT id, goal_id, original_date, description, problem_id, transitioned_at, resolved_at FROM pos_debt_goals WHERE resolved_at IS NULL ORDER BY original_date ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| {
        log::error!("[CMD] get_debt_goals: DB error: {}", e);
        db_context("Fetch debt goals", e)
    })?;

    log::info!("[CMD] get_debt_goals: returning {} debt goals", rows.len());
    Ok(rows)
}

/// Update a goal metric by incrementing its current_value.
/// Used when logging activities that contribute to goal progress.
#[tauri::command]
pub async fn update_goal_metric(
    db: State<'_, PosDb>,
    metric_id: String,
    increment: i32,
) -> Result<(), PosError> {
    let pool = &db.0;

    // Verify metric exists
    let exists: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM pos_goal_metrics WHERE id = $1",
    )
    .bind(&metric_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| db_context("Check goal metric", e))?;

    if exists.is_none() {
        return Err(PosError::NotFound(format!("Goal metric {} not found", metric_id)));
    }

    // Update current_value
    sqlx::query(
        "UPDATE pos_goal_metrics SET current_value = current_value + $1 WHERE id = $2",
    )
    .bind(increment)
    .bind(&metric_id)
    .execute(pool)
    .await
    .map_err(|e| db_context("Update goal metric", e))?;

    log::info!("[POS] Updated metric {} by {}", metric_id, increment);
    Ok(())
}
