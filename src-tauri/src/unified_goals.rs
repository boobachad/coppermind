use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, db_context};
use crate::pos::utils::gen_id;

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
    pub due_date: Option<DateTime<Utc>>,
    pub recurring_pattern: Option<String>,
    pub recurring_template_id: Option<String>,
    pub priority: String,
    pub urgent: bool,
    pub metrics: Option<sqlx::types::Json<Vec<UnifiedGoalMetric>>>,
    pub problem_id: Option<String>,
    pub linked_activity_ids: Option<sqlx::types::Json<Vec<String>>>,
    pub labels: Option<sqlx::types::Json<Vec<String>>>,
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
    pub due_date: Option<String>,
    pub recurring_pattern: Option<String>,
    pub priority: Option<String>,
    pub urgent: Option<bool>,
    pub metrics: Option<Vec<UnifiedGoalMetric>>,
    pub problem_id: Option<String>,
    pub labels: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateGoalRequest {
    pub text: Option<String>,
    pub description: Option<String>,
    pub completed: Option<bool>,
    pub verified: Option<bool>,
    pub due_date: Option<String>,
    pub recurring_pattern: Option<String>,
    pub priority: Option<String>,
    pub urgent: Option<bool>,
    pub metrics: Option<Vec<UnifiedGoalMetric>>,
    pub problem_id: Option<String>,
    pub labels: Option<Vec<String>>,
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
    pub timezone_offset: Option<i32>, // Minutes from UTC (e.g. -330 for IST)
}

#[tauri::command]
pub async fn create_unified_goal(
    db: State<'_, PosDb>,
    req: CreateGoalRequest,
) -> Result<UnifiedGoalRow, PosError> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();

    let due_date_parsed = req.due_date.as_ref().and_then(|s| s.parse::<DateTime<Utc>>().ok());
    let metrics_json = req.metrics.as_ref().map(|m| sqlx::types::Json(m.clone()));
    let labels_json = req.labels.as_ref().map(|l| sqlx::types::Json(l.clone()));

    let row = sqlx::query_as::<_, UnifiedGoalRow>(
        r#"INSERT INTO unified_goals (
            id, text, description, completed, completed_at, verified,
            due_date, recurring_pattern, recurring_template_id, priority, urgent,
            metrics, problem_id, linked_activity_ids, labels,
            created_at, updated_at, original_date, is_debt
        ) VALUES ($1, $2, $3, false, NULL, false, $4, $5, NULL, $6, $7, $8, $9, NULL, $10, $11, $11, NULL, false)
        RETURNING *"#,
    )
    .bind(&id)
    .bind(&req.text)
    .bind(&req.description)
    .bind(due_date_parsed)
    .bind(&req.recurring_pattern)
    .bind(req.priority.unwrap_or_else(|| "medium".to_string()))
    .bind(req.urgent.unwrap_or(false))
    .bind(metrics_json)
    .bind(&req.problem_id)
    .bind(labels_json)
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
) -> Result<Vec<UnifiedGoalRow>, PosError> {
    let pool = &db.0;

    let mut query = "SELECT * FROM unified_goals WHERE 1=1".to_string();

    // ─── LAZY DEBT LOGIC ───
    // Automatically move overdue goals to Debt. 
    // We do this before fetching so the UI always sees the latest state.
    // Definition of Debt: Past Due AND Not Completed AND Not Already Debt.

    // Calculate "Today start" in UTC, based on user's timezone offset
    // If no filter/offset provided, default to UTC (offset=0).
    let offset_minutes = filters.as_ref().and_then(|f| f.timezone_offset).unwrap_or(0);
    
    // 1. Get current time in User's Local Timezone
    let now_utc = Utc::now();
    let now_local = now_utc + chrono::Duration::minutes(offset_minutes as i64);
    
    // 2. Get "Start of Today" in Local Time (e.g. 2026-02-17 00:00:00)
    let today_local = now_local.date_naive();
    
    // 3. Convert back to UTC to get the comparison threshold
    // threshold = (Today 00:00 Local) - Offset
    #[allow(deprecated)] // Date::and_hms is deprecated in favor of and_hms_opt, but we know 0,0,0 is valid
    let today_start_local = today_local.and_hms_opt(0, 0, 0).unwrap();
    let today_start_utc = DateTime::<Utc>::from_utc(today_start_local, Utc) - chrono::Duration::minutes(offset_minutes as i64);

    // We execute an UPDATE.
    // "due_date < today_start_utc": checks if due_date is strictly before today's start.
    sqlx::query(
        r#"UPDATE unified_goals 
           SET is_debt = TRUE 
           WHERE completed = FALSE 
           AND is_debt = FALSE 
           AND due_date IS NOT NULL 
           AND due_date < $1"#
    )
    .bind(today_start_utc)
    .execute(pool)
    .await
    .map_err(|e| db_context("update debt status", e))?;

    // ─── LAZY GENERATION LOGIC ───
    // If a date range is requested, check for active recurring templates and generate instances.
    // ─── LAZY GENERATION LOGIC ───
    // Check for active recurring templates and generate instances.
    // Default to "Today" if no range is requested (ensures List View has today's goals).
    
    let (gen_start, gen_end) = if let Some(Some((start, end))) = filters.as_ref().map(|f| f.date_range) {
        (start, end)
    } else {
         (now_utc, now_utc)
    };

    // 1. Fetch active templates (goals with recurring_pattern set, and NOT an instance themselves)
    let templates = sqlx::query_as::<_, UnifiedGoalRow>(
        "SELECT * FROM unified_goals WHERE recurring_pattern IS NOT NULL AND recurring_template_id IS NULL AND completed = FALSE"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("fetch recurring templates", e))?;

    // 2. Iterate through each day in the range
    let mut curr = gen_start;
    
    // Safety clamp to avoid infinite loops if invalid date range provided
    let max_days = 366; 
    let mut days_processed = 0;

    while curr <= gen_end && days_processed < max_days {
        // Apply timezone offset to determine the "Local Day Name"
        let offset_minutes = filters.as_ref().and_then(|f| f.timezone_offset).unwrap_or(0);
        let local_curr = curr + chrono::Duration::minutes(offset_minutes as i64);
        
        let date_str = local_curr.format("%Y-%m-%d").to_string();
        let day_name = local_curr.format("%a").to_string(); // Mon, Tue...

        // log::info!("[Unified] Checking generation for date: {} (Day: {})", date_str, day_name);

        for tmpl in &templates {
            if let Some(ref pattern) = tmpl.recurring_pattern {
                // Check if today matches the pattern (e.g. "Mon,Wed" contains "Mon")
                if pattern.contains(&day_name) || pattern == "Daily" {
                    // Check if an instance already exists for this template on this date
                    let new_id = gen_id();
                    let now = Utc::now();

                    // ON CONFLICT (recurring_template_id, due_date_local): unique index enforces
                    // idempotency at the DB level — safe against concurrent requests.
                    let insert_result = sqlx::query(
                        r#"INSERT INTO unified_goals (
                            id, text, description, completed, completed_at, verified,
                            due_date, due_date_local, recurring_pattern, recurring_template_id, priority, urgent,
                            metrics, problem_id, linked_activity_ids, labels,
                            created_at, updated_at, original_date, is_debt
                        ) VALUES ($1, $2, $3, false, NULL, false, $4, $5, NULL, $6, $7, $8, $9, $10, NULL, $11, $12, $12, NULL, false)
                        ON CONFLICT (recurring_template_id, due_date_local) DO NOTHING"#
                    )
                    .bind(&new_id)
                    .bind(&tmpl.text)
                    .bind(&tmpl.description)
                    .bind(local_curr)       // due_date (TIMESTAMPTZ, UTC)
                    .bind(&date_str)        // due_date_local (TEXT, e.g. "2026-02-18")
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
            // For daily view: Match goals that are due within range OR created within range (if no due date)
            // But realistically for a "Plan", we mostly care about Due Date.
            // Let's filter by due_date falling in the range.
            query.push_str(&format!(
                " AND (due_date >= '{}' AND due_date <= '{}')",
                start.to_rfc3339(),
                end.to_rfc3339()
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
) -> Result<UnifiedGoalRow, PosError> {
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
    
    // Logic for updating due_date and recurring_pattern
    // If user provided a due_date OR we need to auto-set it because recurring is cleared
    let mut final_due_date = req.due_date.clone();
    let pattern_update = req.recurring_pattern.clone();
    
    // Add due_date if it exists (either from req or auto-set)
    if final_due_date.is_some() {
        updates.push(format!("due_date = ${}", bind_idx));
        bind_idx += 1;
    }

    // Add recurring_pattern if it exists in request
    if let Some(ref p) = pattern_update {
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
        "UPDATE unified_goals SET {} WHERE id = ${} RETURNING *",
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
    
    if let Some(dd) = final_due_date {
        let parsed = dd.parse::<DateTime<Utc>>().ok();
        query = query.bind(parsed);
    }

    if let Some(p) = pattern_update {
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
) -> Result<(), PosError> {
    let pool = &db.0;

    sqlx::query("DELETE FROM unified_goals WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| db_context("delete_unified_goal", e))?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_unified_goal_completion(
    db: State<'_, PosDb>,
    id: String,
) -> Result<UnifiedGoalRow, PosError> {
    let pool = &db.0;
    let now = Utc::now();

    let row = sqlx::query_as::<_, UnifiedGoalRow>(
        r#"UPDATE unified_goals 
           SET completed = NOT completed,
               completed_at = CASE WHEN NOT completed THEN $1 ELSE NULL END,
               updated_at = $1
           WHERE id = $2
           RETURNING *"#,
    )
    .bind(now)
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("toggle_unified_goal_completion", e))?;

    Ok(row)
}

#[tauri::command]
pub async fn link_activity_to_unified_goal(
    db: State<'_, PosDb>,
    goal_id: String,
    activity_id: String,
) -> Result<UnifiedGoalRow, PosError> {
    let pool = &db.0;
    let now = Utc::now();

    // First check if the goal has metrics
    let goal = sqlx::query_as::<_, UnifiedGoalRow>("SELECT * FROM unified_goals WHERE id = $1")
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
           RETURNING *"#,
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
