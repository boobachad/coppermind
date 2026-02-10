use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::State;

use crate::PosDb;

// ─── Row type ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct SubmissionRow {
    pub id: String,
    pub platform: String,
    pub problem_id: String,
    pub problem_title: String,
    pub submitted_time: DateTime<Utc>,
    pub verdict: String,
    pub language: String,
    pub rating: Option<i32>,
    pub difficulty: Option<String>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
}

// ─── Commands ───────────────────────────────────────────────────────

/// Fetch last 100 submissions ordered by submitted_time DESC.
#[tauri::command]
pub async fn get_submissions(
    db: State<'_, PosDb>,
) -> Result<Vec<SubmissionRow>, String> {
    let pool = &db.0;

    let rows = sqlx::query_as::<_, SubmissionRow>(
        r#"SELECT id, platform, problem_id, problem_title, submitted_time,
                  verdict, language, rating, difficulty, tags, created_at
           FROM pos_submissions
           ORDER BY submitted_time DESC
           LIMIT 100"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Fetch submissions: {e}"))?;

    Ok(rows)
}
