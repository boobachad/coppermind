use chrono::{DateTime, Utc, Datelike};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;
use crate::unified_goals::UnifiedGoalRow;

const UNIFIED_GOAL_COLS: &str = "id, text, description, completed, completed_at, verified, due_date, \
    recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, \
    linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt";

// ─── Row types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DebtArchiveRow {
    pub id: String,
    pub goal_id: String,
    pub original_month: String,    // YYYY-MM format
    pub archived_at: DateTime<Utc>,
    pub reason: Option<String>,
    pub goal_text: String,
    pub goal_data: Option<sqlx::types::Json<serde_json::Value>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebtTrailItem {
    pub date: String,              // YYYY-MM-DD
    pub debt_count: i32,
    pub goals: Vec<UnifiedGoalRow>,
}

// ─── Request types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionDebtRequest {
    pub month: String,             // YYYY-MM format
    pub reason: Option<String>,
}

// ─── Commands ───────────────────────────────────────────────────────

/// Get accumulated debt for a specific date
/// Returns all debt goals from previous dates (debt trail)
#[tauri::command]
pub async fn get_accumulated_debt(
    db: State<'_, PosDb>,
    date: String,                  // YYYY-MM-DD
    timezone_offset: Option<i32>,
) -> PosResult<Vec<UnifiedGoalRow>> {
    let pool = &db.0;

    // Parse the date and get all debt goals before this date
    let target_date = date.parse::<chrono::NaiveDate>()
        .map_err(|e| PosError::InvalidInput(format!("Invalid date: {}", e)))?;

    // Get debt goals that:
    // 1. Are marked as debt
    // 2. Are not completed
    // 3. Have original_date before target_date
    let rows = sqlx::query_as::<_, UnifiedGoalRow>(
        &format!("SELECT {} FROM unified_goals \
           WHERE is_debt = true \
           AND completed = false \
           AND original_date IS NOT NULL \
           AND original_date < $1 \
           ORDER BY original_date ASC, created_at ASC", UNIFIED_GOAL_COLS)
    )
    .bind(&date)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("get_accumulated_debt", e))?;

    Ok(rows)
}

/// Get debt trail grouped by date
/// Returns a summary of debt counts for each date before the target date
#[tauri::command]
pub async fn get_debt_trail(
    db: State<'_, PosDb>,
    end_date: String,              // YYYY-MM-DD
    days_back: Option<i32>,        // How many days to look back (default 30)
) -> PosResult<Vec<DebtTrailItem>> {
    let pool = &db.0;

    let days = days_back.unwrap_or(30);
    let end = end_date.parse::<chrono::NaiveDate>()
        .map_err(|e| PosError::InvalidInput(format!("Invalid date: {}", e)))?;
    
    let start = end - chrono::Duration::days(days as i64);
    let start_str = start.format("%Y-%m-%d").to_string();

    // Get all debt goals in the range
    let all_debt = sqlx::query_as::<_, UnifiedGoalRow>(
        &format!("SELECT {} FROM unified_goals \
           WHERE is_debt = true \
           AND completed = false \
           AND original_date IS NOT NULL \
           AND original_date >= $1 \
           AND original_date <= $2 \
           ORDER BY original_date ASC", UNIFIED_GOAL_COLS)
    )
    .bind(&start_str)
    .bind(&end_date)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("get_debt_trail", e))?;

    // Group by original_date
    let mut trail_map: std::collections::HashMap<String, Vec<UnifiedGoalRow>> = 
        std::collections::HashMap::new();

    for goal in all_debt {
        if let Some(ref date) = goal.original_date {
            trail_map.entry(date.clone()).or_insert_with(Vec::new).push(goal);
        }
    }

    // Convert to sorted vec
    let mut trail: Vec<DebtTrailItem> = trail_map
        .into_iter()
        .map(|(date, goals)| DebtTrailItem {
            debt_count: goals.len() as i32,
            date: date.clone(),
            goals,
        })
        .collect();

    trail.sort_by(|a, b| a.date.cmp(&b.date));

    Ok(trail)
}

/// Transition uncompleted monthly goals to debt archive
/// Called at the end of each month to archive goals that weren't completed
#[tauri::command]
pub async fn transition_monthly_debt(
    db: State<'_, PosDb>,
    req: TransitionDebtRequest,
) -> PosResult<i32> {
    let pool = &db.0;

    // Parse month (YYYY-MM)
    let parts: Vec<&str> = req.month.split('-').collect();
    if parts.len() != 2 {
        return Err(PosError::InvalidInput("Month must be in YYYY-MM format".into()));
    }

    let year: i32 = parts[0].parse()
        .map_err(|_| PosError::InvalidInput("Invalid year".into()))?;
    let month: u32 = parts[1].parse()
        .map_err(|_| PosError::InvalidInput("Invalid month".into()))?;

    // Get the month's date range
    let month_start = chrono::NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| PosError::InvalidInput("Invalid month".into()))?;
    
    let month_end = if month == 12 {
        chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        chrono::NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .and_then(|d| d.pred_opt())
    .ok_or_else(|| PosError::InvalidInput("Invalid month end".into()))?;

    let start_str = month_start.format("%Y-%m-%d").to_string();
    let end_str = month_end.format("%Y-%m-%d").to_string();

    let mut tx = pool.begin().await.map_err(|e| db_context("TX begin", e))?;

    // Find all uncompleted goals in this month
    let uncompleted_goals = sqlx::query_as::<_, UnifiedGoalRow>(
        &format!("SELECT {} FROM unified_goals \
           WHERE completed = false \
           AND due_date IS NOT NULL \
           AND due_date_local >= $1 \
           AND due_date_local <= $2 \
           AND is_debt = false", UNIFIED_GOAL_COLS)
    )
    .bind(&start_str)
    .bind(&end_str)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| db_context("fetch uncompleted goals", e))?;

    let mut archived_count = 0;

    for goal in &uncompleted_goals {
        // Archive the goal
        let archive_id = gen_id();
        let goal_data = serde_json::json!({
            "description": goal.description,
            "priority": goal.priority,
            "metrics": goal.metrics,
            "labels": goal.labels,
        });

        sqlx::query(
            r#"INSERT INTO debt_archive (id, goal_id, original_month, reason, goal_text, goal_data, archived_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())"#
        )
        .bind(&archive_id)
        .bind(&goal.id)
        .bind(&req.month)
        .bind(&req.reason)
        .bind(&goal.text)
        .bind(sqlx::types::Json(&goal_data))
        .execute(&mut *tx)
        .await
        .map_err(|e| db_context("insert debt archive", e))?;

        // Mark as debt (keep in unified_goals for history)
        sqlx::query("UPDATE unified_goals SET is_debt = true WHERE id = $1")
            .bind(&goal.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| db_context("mark as debt", e))?;

        archived_count += 1;
    }

    tx.commit().await.map_err(|e| db_context("TX commit", e))?;

    log::info!("[DEBT] Archived {} goals from month {}", archived_count, req.month);
    Ok(archived_count)
}

/// Get archived debt for a specific month
#[tauri::command]
pub async fn get_debt_archive(
    db: State<'_, PosDb>,
    month: Option<String>,         // YYYY-MM, if None returns all
) -> PosResult<Vec<DebtArchiveRow>> {
    let pool = &db.0;

    let rows = if let Some(m) = month {
        sqlx::query_as::<_, DebtArchiveRow>(
            "SELECT id, goal_id, original_month, archived_at, reason, goal_text, goal_data FROM debt_archive WHERE original_month = $1 ORDER BY archived_at DESC"
        )
        .bind(&m)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, DebtArchiveRow>(
            "SELECT id, goal_id, original_month, archived_at, reason, goal_text, goal_data FROM debt_archive ORDER BY archived_at DESC LIMIT 100"
        )
        .fetch_all(pool)
        .await
    }
    .map_err(|e| db_context("get_debt_archive", e))?;

    Ok(rows)
}

/// Reset debt status for a new month
/// Clears is_debt flag for goals that should be retried
#[tauri::command]
pub async fn reset_debt_for_month(
    db: State<'_, PosDb>,
    goal_ids: Vec<String>,
) -> PosResult<i32> {
    let pool = &db.0;

    if goal_ids.is_empty() {
        return Ok(0);
    }

    // Build query with dynamic parameter count
    let placeholders: Vec<String> = (1..=goal_ids.len())
        .map(|i| format!("${}", i))
        .collect();
    
    let query = format!(
        "UPDATE unified_goals SET is_debt = false WHERE id IN ({})",
        placeholders.join(", ")
    );

    let mut q = sqlx::query(&query);
    for id in &goal_ids {
        q = q.bind(id);
    }

    let result = q.execute(pool).await
        .map_err(|e| db_context("reset_debt_for_month", e))?;

    log::info!("[DEBT] Reset {} goals from debt status", result.rows_affected());
    Ok(result.rows_affected() as i32)
}
