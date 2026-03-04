use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;

/// Reusable explicit column list for `unified_goals` table.
/// Kept here (next to UnifiedGoalRow) so schema changes only need one update.
pub const UNIFIED_GOAL_COLS: &str = "id, text, description, completed, completed_at, verified, \
    date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, \
    linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt";

#[derive(Debug, Serialize, Deserialize, Clone, sqlx::Type)]
#[sqlx(type_name = "jsonb")]
pub struct UnifiedGoalMetric {
    pub id: String,
    pub label: String,
    pub target: f64,
    pub current: f64,
    pub unit: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedGoalRow {
    pub id: String,
    pub text: String,
    pub description: Option<String>,
    pub completed: bool,
    pub completed_at: Option<DateTime<Utc>>,
    pub verified: bool,
    pub date: Option<String>, // Local date YYYY-MM-DD (when goal is due)
    pub recurring_pattern: Option<String>,
    pub recurring_template_id: Option<String>,
    pub priority: String,
    pub urgent: bool,
    pub metrics: Option<sqlx::types::Json<Vec<UnifiedGoalMetric>>>,
    pub problem_id: Option<String>,
    pub linked_activity_ids: Option<sqlx::types::Json<Vec<String>>>,
    pub labels: Option<sqlx::types::Json<Vec<String>>>,
    pub parent_goal_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub original_date: Option<String>,
    pub is_debt: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGoalRequest {
    pub text: String,
    pub description: Option<String>,
    pub date: Option<String>, // Local date YYYY-MM-DD
    pub recurring_pattern: Option<String>,
    pub priority: Option<String>,
    pub urgent: Option<bool>,
    pub metrics: Option<Vec<UnifiedGoalMetric>>,
    pub problem_id: Option<String>,
    pub labels: Option<Vec<String>>,
    pub parent_goal_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGoalRequest {
    pub text: Option<String>,
    pub description: Option<String>,
    pub completed: Option<bool>,
    pub verified: Option<bool>,
    pub date: Option<String>, // Local date YYYY-MM-DD
    pub recurring_pattern: Option<String>,
    pub priority: Option<String>,
    pub urgent: Option<bool>,
    pub metrics: Option<Vec<UnifiedGoalMetric>>,
    pub problem_id: Option<String>,
    pub labels: Option<Vec<String>>,
    pub parent_goal_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalFilters {
    pub completed: Option<bool>,
    pub urgent: Option<bool>,
    pub is_debt: Option<bool>,
    pub has_recurring: Option<bool>,
    pub search: Option<String>,
    pub date_range: Option<(DateTime<Utc>, DateTime<Utc>)>, // Start, End
    pub today_local: Option<String>, // YYYY-MM-DD in local timezone (for debt marking)
}

#[tauri::command]
pub async fn create_unified_goal(
    db: State<'_, PosDb>,
    req: CreateGoalRequest,
) -> PosResult<UnifiedGoalRow> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();

    let metrics_json = req.metrics.as_ref().map(|m| sqlx::types::Json(m.clone()));
    let labels_json = req.labels.as_ref().map(|l| sqlx::types::Json(l.clone()));

    // DATE-ONLY LOGIC (matches activities.rs pattern):
    // Frontend sends YYYY-MM-DD string (no time component)
    // date: Always set (either from req or today's date)
    let date = if let Some(date_str) = &req.date {
        // User provided a due date
        date_str.clone()
    } else {
        // No due date = due today
        now.format("%Y-%m-%d").to_string()
    };

    let row = sqlx::query_as::<_, UnifiedGoalRow>(
        r#"INSERT INTO unified_goals (
            id, text, description, completed, completed_at, verified,
            date, recurring_pattern, recurring_template_id, priority, urgent,
            metrics, problem_id, linked_activity_ids, labels, parent_goal_id,
            created_at, updated_at, original_date, is_debt
        ) VALUES ($1, $2, $3, false, NULL, false, $4, $5, NULL, $6, $7, $8, $9, NULL, $10, $11, $12, $12, NULL, false)
        RETURNING id, text, description, completed, completed_at, verified, date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt"#,
    )
    .bind(&id)
    .bind(&req.text)
    .bind(&req.description)
    .bind(&date)
    .bind(&req.recurring_pattern)
    .bind(req.priority.unwrap_or_else(|| "medium".to_string()))
    .bind(req.urgent.unwrap_or(false))
    .bind(metrics_json)
    .bind(&req.problem_id)
    .bind(labels_json)
    .bind(&req.parent_goal_id)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("create_unified_goal", e))?;

    Ok(row)
}

#[tauri::command]
pub async fn get_unified_goals(
    db: State<'_, PosDb>,
    filters: Option<GoalFilters>,
) -> PosResult<Vec<UnifiedGoalRow>> {
    let pool = &db.0;

    // Exclude recurring templates from list view (they're internal generation blueprints)
    // Only show: regular goals + recurring instances
    let mut query = "SELECT id, text, description, completed, completed_at, verified, date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt FROM unified_goals WHERE 1=1 AND NOT (recurring_pattern IS NOT NULL AND recurring_template_id IS NULL)".to_string();

    // ─── LAZY DEBT LOGIC ───
    // Automatically move overdue goals to Debt. 
    // We do this before fetching so the UI always sees the latest state.
    // Definition of Debt: Past Due AND Not Completed AND Not Already Debt.

    // DATE-ONLY COMPARISON (matches activities.rs pattern):
    // Goals are date-only (no time component)
    // Compare date (TEXT YYYY-MM-DD) with today's date
    
    // Get today's local date from frontend (already calculated using time utils)
    let today_local_from_frontend = filters.as_ref().and_then(|f| f.today_local.clone());
    let today_local = today_local_from_frontend
        .clone()
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());

    log::info!(
        "[UnifiedGoals] Debt marking: frontend_sent={:?}, using={}",
        today_local_from_frontend,
        today_local
    );

    // Mark goals as debt if date < today_local
    // Set original_date = date when transitioning to debt
    let debt_result = sqlx::query(
        r#"UPDATE unified_goals 
           SET is_debt = TRUE,
               original_date = date
           WHERE completed = FALSE 
           AND is_debt = FALSE 
           AND date IS NOT NULL 
           AND date < $1"#
    )
    .bind(&today_local)
    .execute(pool)
    .await
    .map_err(|e| db_context("update debt status", e))?;

    log::info!("[UnifiedGoals] Debt marking result: {} rows affected", debt_result.rows_affected());

    // ─── LAZY GENERATION LOGIC ───
    // Check for active recurring templates and generate instances.
    // ONLY create instances on days that match the recurring pattern.
    // Each instance is due on that specific day only (date-only, no time).
    
    let (gen_start, gen_end) = if let Some(Some((start, end))) = filters.as_ref().map(|f| f.date_range) {
        (start, end)
    } else {
        // Default to today only (use today_local from frontend, not UTC)
        // Parse today_local string to DateTime for consistency with date_range logic
        let today_str = today_local.clone();
        let today_dt = chrono::NaiveDate::parse_from_str(&today_str, "%Y-%m-%d")
            .ok()
            .and_then(|d| d.and_hms_opt(0, 0, 0))
            .map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc))
            .unwrap_or_else(|| Utc::now());
        (today_dt, today_dt)
    };

    // 1. Fetch active templates (goals with recurring_pattern set, and NOT an instance themselves)
    let templates = sqlx::query_as::<_, UnifiedGoalRow>(
        "SELECT id, text, description, completed, completed_at, verified, date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt FROM unified_goals WHERE recurring_pattern IS NOT NULL AND recurring_template_id IS NULL AND completed = FALSE"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("fetch recurring templates", e))?;

    // 2. Iterate through each day in the range
    let mut curr: DateTime<Utc> = gen_start;
    
    // Safety clamp to avoid infinite loops
    let max_days = 366; 
    let mut days_processed = 0;

    while curr <= gen_end && days_processed < max_days {
        // Generate date string for this day
        let date_str = curr.format("%Y-%m-%d").to_string();
        let day_name = curr.format("%a").to_string(); // Mon, Tue, Wed...

        for tmpl in &templates {
            if let Some(ref pattern) = tmpl.recurring_pattern {
                // Check if today matches the pattern (e.g. "Mon,Wed" contains "Mon")
                if pattern.contains(&day_name) || pattern == "Daily" {
                    // Create instance for this date
                    // DATE-ONLY: date = date_str (matches activities.rs pattern)
                    let new_id = gen_id();
                    let now = Utc::now();

                    // ON CONFLICT (recurring_template_id, date): unique index enforces
                    // idempotency at the DB level — safe against concurrent requests.
                    let insert_result = sqlx::query(
                        r#"INSERT INTO unified_goals (
                            id, text, description, completed, completed_at, verified,
                            date, recurring_pattern, recurring_template_id, priority, urgent,
                            metrics, problem_id, linked_activity_ids, labels, parent_goal_id,
                            created_at, updated_at, original_date, is_debt
                        ) VALUES ($1, $2, $3, false, NULL, false, $4, NULL, $5, $6, $7, $8, $9, NULL, $10, NULL, $11, $11, NULL, false)
                        ON CONFLICT (recurring_template_id, date) DO NOTHING"#
                    )
                    .bind(&new_id)
                    .bind(&tmpl.text)
                    .bind(&tmpl.description)
                    .bind(&date_str)        // date (TEXT, e.g. "2026-03-03")
                    .bind(&tmpl.id)         // recurring_template_id
                    .bind(&tmpl.priority)
                    .bind(tmpl.urgent)
                    .bind(&tmpl.metrics)
                    .bind(&tmpl.problem_id)
                    .bind(&tmpl.labels)
                    .bind(now)
                    .execute(pool)
                    .await;

                    match insert_result {
                        Ok(result) => {
                            if result.rows_affected() > 0 {
                                log::info!("[Unified] Generated recurring instance '{}' for {}", tmpl.text, date_str);
                            }
                        },
                        Err(e) => log::error!("[Unified] Failed to generate instance: {}", e),
                    }
                }
            }
        }
        
        // Advance exactly one day
        curr = curr + chrono::Duration::days(1);
        days_processed += 1;
    }
    // ─────────────────────────────

    if let Some(f) = &filters {
        if let Some(completed) = f.completed {
            query.push_str(&format!(" AND completed = {}", completed));
        }
        if let Some(urgent) = f.urgent {
            query.push_str(&format!(" AND urgent = {}", urgent));
        }
        if let Some(is_debt) = f.is_debt {
            query.push_str(&format!(" AND is_debt = {}", is_debt));
        }
        if f.has_recurring == Some(true) {
            query.push_str(" AND recurring_pattern IS NOT NULL");
        } else if f.has_recurring == Some(false) {
            query.push_str(" AND recurring_pattern IS NULL");
        }
        if let Some(search) = &f.search {
            if !search.is_empty() {
                query.push_str(&format!(" AND (text ILIKE '%{}%' OR description ILIKE '%{}%')", search, search));
            }
        }
        if let Some((start, end)) = f.date_range {
            // DATE-ONLY COMPARISON (matches activities.rs pattern):
            // Filter by date (TEXT YYYY-MM-DD) falling in the range
            let start_date = start.format("%Y-%m-%d").to_string();
            let end_date = end.format("%Y-%m-%d").to_string();
            query.push_str(&format!(
                " AND (date >= '{}' AND date <= '{}')",
                start_date,
                end_date
            ));
        }
    }

    query.push_str(" ORDER BY created_at DESC");

    let rows = sqlx::query_as::<_, UnifiedGoalRow>(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| db_context("get_unified_goals", e))?;

    Ok(rows)
}

#[tauri::command]
pub async fn update_unified_goal(
    db: State<'_, PosDb>,
    id: String,
    req: UpdateGoalRequest,
) -> PosResult<UnifiedGoalRow> {
    let pool = &db.0;
    let now = Utc::now();

    let mut updates = vec!["updated_at = $1".to_string()];
    let mut bind_idx = 2;

    if let Some(ref text) = req.text {
        updates.push(format!("text = ${}", bind_idx));
        bind_idx += 1;
    }
    if let Some(ref description) = req.description {
        updates.push(format!("description = ${}", bind_idx));
        bind_idx += 1;
    }
    if let Some(completed) = req.completed {
        updates.push(format!("completed = ${}", bind_idx));
        bind_idx += 1;
        if completed {
            updates.push(format!("completed_at = ${}", bind_idx));
            bind_idx += 1;
        }
    }
    if let Some(verified) = req.verified {
        updates.push(format!("verified = ${}", bind_idx));
        bind_idx += 1;
    }
    
    // DATE-ONLY LOGIC (matches activities.rs pattern):
    // Frontend sends YYYY-MM-DD string (no time component)
    // Update date field directly
    if let Some(ref date_str) = req.date {
        updates.push(format!("date = ${}", bind_idx));
        bind_idx += 1;
    }

    if let Some(ref p) = req.recurring_pattern {
        updates.push(format!("recurring_pattern = ${}", bind_idx));
        bind_idx += 1;
    }

    if let Some(ref priority) = req.priority {
        updates.push(format!("priority = ${}", bind_idx));
        bind_idx += 1;
    }
    if let Some(urgent) = req.urgent {
        updates.push(format!("urgent = ${}", bind_idx));
        bind_idx += 1;
    }
    if let Some(ref metrics) = req.metrics {
        updates.push(format!("metrics = ${}", bind_idx));
        bind_idx += 1;
    }
    if let Some(ref problem_id) = req.problem_id {
        updates.push(format!("problem_id = ${}", bind_idx));
        bind_idx += 1;
    }
    if let Some(ref labels) = req.labels {
        updates.push(format!("labels = ${}", bind_idx));
        bind_idx += 1;
    }

    let query_str = format!(
        "UPDATE unified_goals SET {} WHERE id = ${} RETURNING id, text, description, completed, completed_at, verified, date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt",
        updates.join(", "),
        bind_idx
    );

    let mut query = sqlx::query_as::<_, UnifiedGoalRow>(&query_str).bind(now);

    if let Some(text) = req.text { query = query.bind(text); }
    if let Some(description) = req.description { query = query.bind(description); }
    if let Some(completed) = req.completed {
        query = query.bind(completed);
        if completed { query = query.bind(now); }
    }
    if let Some(verified) = req.verified { query = query.bind(verified); }
    
    // DATE-ONLY LOGIC (matches activities.rs pattern):
    // Frontend sends YYYY-MM-DD string (no time component)
    // Update date field directly
    if let Some(date_str) = req.date {
        query = query.bind(date_str);
    }

    if let Some(p) = req.recurring_pattern {
        // If empty string, bind NULL. Else bind the string.
        if p.is_empty() {
             query = query.bind(Option::<String>::None);
        } else {
             query = query.bind(Some(p));
        }
    }

    if let Some(priority) = req.priority { query = query.bind(priority); }
    if let Some(urgent) = req.urgent { query = query.bind(urgent); }
    if let Some(metrics) = req.metrics { query = query.bind(sqlx::types::Json(metrics)); }
    if let Some(problem_id) = req.problem_id { query = query.bind(problem_id); }
    if let Some(labels) = req.labels { query = query.bind(sqlx::types::Json(labels)); }

    query = query.bind(id);

    let row = query
        .fetch_one(pool)
        .await
        .map_err(|e| db_context("update_unified_goal", e))?;

    Ok(row)
}

#[tauri::command]
pub async fn delete_unified_goal(
    db: State<'_, PosDb>,
    id: String,
) -> PosResult<()> {
    let pool = &db.0;

    sqlx::query("DELETE FROM unified_goals WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| db_context("delete_unified_goal", e))?;

    Ok(())
}

// REMOVED: toggle_unified_goal_completion
// Goals can ONLY be completed via link_activity_to_unified_goal
// This enforces that all completed goals have verified activity proof

#[tauri::command]
pub async fn link_activity_to_unified_goal(
    db: State<'_, PosDb>,
    goal_id: String,
    activity_id: String,
) -> PosResult<UnifiedGoalRow> {
    let pool = &db.0;
    let now = Utc::now();

    // First check if the goal has metrics
    let goal = sqlx::query_as::<_, UnifiedGoalRow>("SELECT id, text, description, completed, completed_at, verified, date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt FROM unified_goals WHERE id = $1")
        .bind(&goal_id)
        .fetch_one(pool)
        .await
        .map_err(|e| db_context("fetch goal for linking", e))?;

    let should_complete = if let Some(metrics) = &goal.metrics {
        // If metrics exist (and are not empty), do NOT auto-complete.
        // Completion depends on metric progress, which is updated separately using update_unified_goal.
        metrics.0.is_empty()
    } else {
        // Binary goal: Linking an activity implies "I did it"
        true
    };

    let row = sqlx::query_as::<_, UnifiedGoalRow>(
        r#"UPDATE unified_goals 
           SET verified = TRUE,
               completed = CASE WHEN $1 THEN TRUE ELSE completed END,
               completed_at = CASE WHEN $1 THEN $2 ELSE completed_at END,
               updated_at = $2
           WHERE id = $3
           RETURNING id, text, description, completed, completed_at, verified, date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt"#,
    )
    .bind(should_complete)
    .bind(now)
    .bind(&goal_id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("link_activity_to_unified_goal", e))?;

    log::info!("[UnifiedGoals] Linked activity {} → goal {}", activity_id, goal_id);

    Ok(row)
}
