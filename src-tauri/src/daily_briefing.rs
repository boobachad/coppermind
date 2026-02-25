use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::unified_goals::UnifiedGoalRow;
use crate::milestones::{MilestoneRow, BalancerResult};
use crate::knowledge_base::KnowledgeItemRow;

// ─── Response types ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyBriefingResponse {
    pub date: String,                      // YYYY-MM-DD
    pub goals: Vec<UnifiedGoalRow>,        // Today's goals
    pub debt_goals: Vec<UnifiedGoalRow>,   // Overdue goals
    pub milestones: Vec<BalancerResult>,   // Active milestones
    pub kb_items_due: Vec<KnowledgeItemRow>, // KB items for review
    pub stats: BriefingStats,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefingStats {
    pub total_goals: i32,
    pub completed_goals: i32,
    pub debt_count: i32,
    pub kb_items_due_count: i32,
    pub milestones_on_track: i32,
    pub milestones_behind: i32,
}

// ─── Commands ───────────────────────────────────────────────────────

/// Get daily briefing - aggregates today's goals, debt, milestones, and KB items
#[tauri::command]
pub async fn get_daily_briefing(
    db: State<'_, PosDb>,
    local_date: String,  // YYYY-MM-DD
) -> PosResult<DailyBriefingResponse> {
    let pool = &db.0;

    // Parse local_date to DateTime for milestone queries
    let date_parsed = format!("{}T00:00:00Z", local_date)
        .parse::<DateTime<Utc>>()
        .map_err(|e| PosError::InvalidInput(format!("Invalid date format: {}", e)))?;

    // 1. Query today's goals (due_date_local = local_date AND completed = FALSE)
    let goals = sqlx::query_as::<_, UnifiedGoalRow>(
        "SELECT id, text, description, completed, completed_at, verified, due_date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt FROM unified_goals WHERE due_date_local = $1 AND completed = FALSE ORDER BY priority DESC, created_at ASC"
    )
    .bind(&local_date)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("fetch today's goals", e))?;

    // 2. Query debt goals (is_debt = TRUE AND completed = FALSE)
    let debt_goals = sqlx::query_as::<_, UnifiedGoalRow>(
        "SELECT id, text, description, completed, completed_at, verified, due_date, recurring_pattern, recurring_template_id, priority, urgent, metrics, problem_id, linked_activity_ids, labels, parent_goal_id, created_at, updated_at, original_date, is_debt FROM unified_goals WHERE is_debt = TRUE AND completed = FALSE ORDER BY due_date ASC"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("fetch debt goals", e))?;

    // 3. Query active milestones (period_start <= date AND period_end >= date)
    let milestone_rows = sqlx::query_as::<_, MilestoneRow>(
        "SELECT id, target_metric, target_value, daily_amount, period_type, period_start, period_end, strategy, current_value, problem_id, recurring_pattern, label, unit, created_at, updated_at FROM goal_periods WHERE period_start <= $1 AND period_end >= $1 ORDER BY period_start ASC"
    )
    .bind(date_parsed)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("fetch active milestones", e))?;

    // Convert milestones to BalancerResult format with stats
    let mut milestones = Vec::new();
    let mut milestones_on_track = 0;
    let mut milestones_behind = 0;

    for milestone in milestone_rows {
        // Calculate progress
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
        .bind(&milestone.id)
        .fetch_one(pool)
        .await
        .map_err(|e| db_context("aggregate milestone progress", e))?;

        let current_value = total_completed.unwrap_or(0);
        let remaining_target = milestone.target_value - current_value;
        
        // Calculate remaining days
        let remaining_days = (milestone.period_end - date_parsed).num_days() + 1;
        let daily_required = if remaining_days > 0 {
            (remaining_target as f64 / remaining_days as f64).ceil() as i32
        } else {
            remaining_target
        };

        // Determine if on track: current_value >= expected_value_by_now
        let days_elapsed = (date_parsed - milestone.period_start).num_days() + 1;
        let total_days = (milestone.period_end - milestone.period_start).num_days() + 1;
        let expected_by_now = if total_days > 0 {
            (milestone.target_value as f64 * days_elapsed as f64 / total_days as f64).floor() as i32
        } else {
            milestone.target_value
        };

        let is_on_track = current_value >= expected_by_now;
        if is_on_track {
            milestones_on_track += 1;
        } else {
            milestones_behind += 1;
        }

        let is_real_milestone = milestone.period_type == "monthly";

        milestones.push(BalancerResult {
            milestone_id: milestone.id.clone(),
            updated_goals: 0,  // Not applicable for briefing
            daily_required,
            is_real_milestone,
            message: format!("{}/{} completed", current_value, milestone.target_value),
        });
    }

    // 4. Query KB items due for review (next_review_date <= date AND status != 'Completed')
    let kb_items_due = sqlx::query_as::<_, KnowledgeItemRow>(
        "SELECT id, item_type, source, content, metadata, status, next_review_date, created_at, updated_at FROM knowledge_items WHERE next_review_date <= $1 AND status != 'Completed' ORDER BY next_review_date ASC"
    )
    .bind(date_parsed)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("fetch KB items due", e))?;

    // 5. Calculate stats
    let total_goals = goals.len() as i32;
    let completed_goals = goals.iter().filter(|g| g.completed).count() as i32;
    let debt_count = debt_goals.len() as i32;
    let kb_items_due_count = kb_items_due.len() as i32;

    let stats = BriefingStats {
        total_goals,
        completed_goals,
        debt_count,
        kb_items_due_count,
        milestones_on_track,
        milestones_behind,
    };

    log::info!("[BRIEFING] Generated daily briefing for {} - {} goals, {} debt, {} milestones, {} KB items",
        local_date, total_goals, debt_count, milestones.len(), kb_items_due_count);

    Ok(DailyBriefingResponse {
        date: local_date,
        goals,
        debt_goals,
        milestones,
        kb_items_due,
        stats,
    })
}
