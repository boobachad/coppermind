use chrono::{DateTime, Duration, Utc};
use sqlx::PgPool;

use super::error::{PosError, PosResult, db_context};
use super::utils::gen_id;

/// Submission data needed by the shadow logger.
pub struct ShadowInput {
    pub submitted_time: DateTime<Utc>,
    pub problem_id: String,
    pub problem_title: String,
    pub platform: String,
}

/// Process a single submission → shadow activity.
/// Creates an activity spanning [submitted_time - DURATION, submitted_time]
/// with is_shadow = TRUE, then links to any matching unverified goal (same date + problem_id).
///
/// Returns the created activity ID, or None if a shadow activity already exists.
pub async fn process_shadow_log(
    pool: &PgPool,
    sub: &ShadowInput,
    duration_minutes: i64,
) -> PosResult<Option<String>> {
    let dur = Duration::minutes(duration_minutes);
    let start_time = sub.submitted_time - dur;
    let end_time = sub.submitted_time;
    let date = start_time.format("%Y-%m-%d").to_string();

    // Idempotency: check if shadow activity already exists for this end_time
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM pos_activities WHERE is_shadow = TRUE AND end_time = $1",
    )
    .bind(end_time)
    .fetch_optional(pool)
    .await
    .map_err(|e| db_context("shadow check", e))?;

    if existing.is_some() {
        log::info!("[SHADOW] Activity already exists for {} submission at {}", sub.platform, end_time);
        return Ok(None);
    }

    // Determine category from platform
    let category = match sub.platform.as_str() {
        "leetcode" => "coding_leetcode",
        "codeforces" => "coding_codeforces",
        _ => "coding",
    };

    let description = format!("{} - {}", sub.platform.to_uppercase(), sub.problem_title);
    let activity_id = gen_id();

    // Transactional: insert activity + optional goal linking
    let mut tx = pool.begin().await.map_err(|e| db_context("shadow TX begin", e))?;

    // 1. Create shadow activity
    sqlx::query(
        r#"INSERT INTO pos_activities
           (id, date, start_time, end_time, category, description, is_productive, is_shadow, goal_id)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, NULL)"#,
    )
    .bind(&activity_id)
    .bind(&date)
    .bind(start_time)
    .bind(end_time)
    .bind(category)
    .bind(&description)
    .execute(&mut *tx)
    .await
    .map_err(|e| db_context("create shadow activity", e))?;

    log::info!("[SHADOW] Created activity {} for {}", activity_id, sub.problem_id);

    // 2. Find matching unverified goal (same date + problem_id) - EXACT MATCH
    let matching_goal: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM pos_goals WHERE date = $1 AND problem_id = $2 AND is_verified = FALSE LIMIT 1",
    )
    .bind(&date)
    .bind(&sub.problem_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| db_context("shadow goal match", e))?;

    // 3. If matched, link activity to goal and verify
    if let Some((goal_id,)) = matching_goal {
        sqlx::query("UPDATE pos_activities SET goal_id = $1 WHERE id = $2")
            .bind(&goal_id)
            .bind(&activity_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| db_context("shadow link", e))?;

        sqlx::query("UPDATE pos_goals SET is_verified = TRUE WHERE id = $1")
            .bind(&goal_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| db_context("shadow verify", e))?;

        log::info!("[SHADOW] Linked activity {} to goal {} (exact match) and marked verified", activity_id, goal_id);
    } else {
        // SHADOW 2.0: Try generic matching by category
        // Find goal with matching category/keyword AND has metrics that need completion
        let generic_goal = match_goal_by_keyword(&mut *tx, &date, category).await?;

        if let Some((goal_id, metric_id)) = generic_goal {
            // Double link: link activity to goal AND increment metric
            sqlx::query("UPDATE pos_activities SET goal_id = $1 WHERE id = $2")
                .bind(&goal_id)
                .bind(&activity_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| db_context("shadow generic link", e))?;

            // Increment the metric's current_value by 1
            sqlx::query("UPDATE pos_goal_metrics SET current_value = current_value + 1 WHERE id = $1")
                .bind(&metric_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| db_context("shadow increment metric", e))?;

            // Check if goal is now complete (all metrics satisfied)
            let all_metrics_complete: Option<bool> = sqlx::query_scalar(
                r#"SELECT NOT EXISTS(
                    SELECT 1 FROM pos_goal_metrics 
                    WHERE goal_id = $1 AND current_value < target_value
                )"#
            )
            .bind(&goal_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| db_context("shadow check metrics", e))?;

            if all_metrics_complete.unwrap_or(false) {
                sqlx::query("UPDATE pos_goals SET is_verified = TRUE WHERE id = $1")
                    .bind(&goal_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| db_context("shadow verify generic", e))?;

                log::info!("[SHADOW 2.0] Linked activity {} to goal {} (generic match), incremented metric, goal COMPLETE", activity_id, goal_id);
            } else {
                log::info!("[SHADOW 2.0] Linked activity {} to goal {} (generic match), incremented metric", activity_id, goal_id);
            }
        }
    }

    tx.commit().await.map_err(|e| db_context("shadow TX commit", e))?;

    Ok(Some(activity_id))
}

/// Batch process submissions → shadow activities.
/// Returns count of new shadow activities created.
pub async fn process_submissions(
    pool: &PgPool,
    submissions: &[ShadowInput],
    duration_minutes: i64,
) -> PosResult<i32> {
    let mut count = 0;
    for sub in submissions {
        if let Some(_) = process_shadow_log(pool, sub, duration_minutes).await? {
            count += 1;
        }
    }
    log::info!("[SHADOW] Processed {}/{} submissions", count, submissions.len());
    Ok(count)
}

/// SHADOW 2.0: Match a goal by keyword/category when exact match fails.
/// Finds an unverified goal with matching category AND has metrics that need completion.
/// Returns (goal_id, metric_id) for the best match, or None.
async fn match_goal_by_keyword(
    conn: &mut sqlx::PgConnection,
    date: &str,
    category: &str,
) -> PosResult<Option<(String, String)>> {
    // Extract keyword from category (e.g., "coding_leetcode" → "leetcode")
    let keyword = if category.contains('_') {
        category.split('_').last().unwrap_or(category)
    } else {
        category
    };

    // Find goals on this date that:
    // 1. Are not verified yet
    // 2. Match the keyword (in description or category)
    // 3. Have at least one metric where current < target
    let result: Option<(String, String)> = sqlx::query_as(
        r#"SELECT g.id, gm.id
           FROM pos_goals g
           JOIN pos_goal_metrics gm ON g.id = gm.goal_id
           WHERE g.date = $1
           AND g.is_verified = FALSE
           AND (g.description ILIKE $2 OR g.category ILIKE $2)
           AND gm.current_value < gm.target_value
           ORDER BY gm.target_value - gm.current_value DESC
           LIMIT 1"#
    )
    .bind(date)
    .bind(format!("%{}%", keyword))
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| db_context("match_goal_by_keyword", e))?;

    if let Some((goal_id, metric_id)) = &result {
        log::info!("[SHADOW 2.0] Found generic match: goal {} with metric {} for keyword '{}'", 
            goal_id, metric_id, keyword);
    }

    Ok(result)
}

