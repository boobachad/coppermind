use chrono::{DateTime, Duration, Utc};
use sqlx::PgPool;

use super::utils::gen_id;

/// Shadow activity duration in minutes.
/// Configurable via SHADOW_ACTIVITY_MINUTES env var (default 30).
fn shadow_duration_minutes() -> i64 {
    std::env::var("SHADOW_ACTIVITY_MINUTES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30)
}

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
pub async fn process_shadow_log(pool: &PgPool, sub: &ShadowInput) -> Result<Option<String>, String> {
    let dur = Duration::minutes(shadow_duration_minutes());
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
    .map_err(|e| format!("Shadow check: {e}"))?;

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
    let mut tx = pool.begin().await.map_err(|e| format!("Shadow TX begin: {e}"))?;

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
    .map_err(|e| format!("Create shadow activity: {e}"))?;

    log::info!("[SHADOW] Created activity {} for {}", activity_id, sub.problem_id);

    // 2. Find matching unverified goal (same date + problem_id)
    let matching_goal: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM pos_goals WHERE date = $1 AND problem_id = $2 AND is_verified = FALSE LIMIT 1",
    )
    .bind(&date)
    .bind(&sub.problem_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| format!("Shadow goal match: {e}"))?;

    // 3. If matched, link activity to goal and verify
    if let Some((goal_id,)) = matching_goal {
        sqlx::query("UPDATE pos_activities SET goal_id = $1 WHERE id = $2")
            .bind(&goal_id)
            .bind(&activity_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Shadow link: {e}"))?;

        sqlx::query("UPDATE pos_goals SET is_verified = TRUE WHERE id = $1")
            .bind(&goal_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Shadow verify: {e}"))?;

        log::info!("[SHADOW] Linked activity {} to goal {} and marked verified", activity_id, goal_id);
    }

    tx.commit().await.map_err(|e| format!("Shadow TX commit: {e}"))?;

    Ok(Some(activity_id))
}

/// Batch process submissions → shadow activities.
/// Returns count of new shadow activities created.
pub async fn process_submissions(pool: &PgPool, submissions: &[ShadowInput]) -> Result<i32, String> {
    let mut count = 0;
    for sub in submissions {
        if let Some(_) = process_shadow_log(pool, sub).await? {
            count += 1;
        }
    }
    log::info!("[SHADOW] Processed {}/{} submissions", count, submissions.len());
    Ok(count)
}
