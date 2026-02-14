// ─── Codeforces Scraper ─────────────────────────────────────────────
// Scrapes Codeforces submissions via REST API.
// Strategy: Fetch all submissions, filter accepted, backfill metadata.

use chrono::DateTime;
use serde::Deserialize;
use tauri::State;

use crate::{PosDb, PosConfig};
use super::super::error::{PosError, db_context};
use super::super::shadow::{self, ShadowInput};
use super::super::utils::gen_id;
use super::{build_http_client, ScraperResponse};

// ─── REST API Response Types ────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CodeforcesApiResponse {
    status: String,
    result: Option<Vec<CodeforcesSubmission>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeforcesSubmission {
    #[serde(default)]
    verdict: Option<String>,
    creation_time_seconds: i64,
    problem: CodeforcesProblem,
    programming_language: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeforcesProblem {
    contest_id: Option<i64>,
    index: String,
    name: String,
    rating: Option<i32>,
    #[serde(default)]
    tags: Vec<String>,
}

// ─── Scraper Command ────────────────────────────────────────────────

/// Scrape Codeforces submissions via REST API. Accepted only (verdict == "OK").
/// Creates submissions + shadow activities. Backfills rating/tags.
#[tauri::command]
pub async fn scrape_codeforces(
    db: State<'_, PosDb>,
    config: State<'_, PosConfig>,
) -> Result<ScraperResponse, PosError> {
    let pool = &db.0;
    let handle = config.0.require_codeforces_handle()
        .map_err(|e| PosError::InvalidInput(e))?;

    log::info!("[CODEFORCES SCRAPER] Starting sync for {}", handle);

    let client = build_http_client();
    let url = format!("https://codeforces.com/api/user.status?handle={}", handle);

    let resp = client.get(&url).send().await?;

    if !resp.status().is_success() {
        return Err(PosError::External(format!("Codeforces API returned {}", resp.status())));
    }

    let data: CodeforcesApiResponse = resp.json().await?;

    if data.status != "OK" {
        return Err(PosError::External("Codeforces API returned non-OK status".into()));
    }

    let submissions = data.result.ok_or_else(|| PosError::External("Invalid response from Codeforces API".into()))?;
    let total = submissions.len() as i32;
    let mut new_count = 0i32;
    let mut shadow_inputs: Vec<ShadowInput> = Vec::new();

    for sub in &submissions {
        let submitted_time = DateTime::from_timestamp(sub.creation_time_seconds, 0)
            .ok_or_else(|| PosError::InvalidInput("Invalid Unix timestamp".into()))?;
        let contest_id = sub.problem.contest_id.unwrap_or(0);
        let problem_id = format!("cf-{}{}", contest_id, sub.problem.index);
        let verdict = sub.verdict.as_deref().unwrap_or("TESTING");

        // Idempotency check
        let existing: Option<(String, Option<i32>, Vec<String>)> = sqlx::query_as(
            "SELECT id, rating, tags FROM pos_submissions WHERE submitted_time = $1",
        )
        .bind(submitted_time)
        .fetch_optional(pool)
        .await
        .map_err(|e| db_context("Check existing", e))?;

        if let Some((ref id, rating, ref tags)) = existing {
            // Backfill if metadata missing
            if rating.is_none() || tags.is_empty() {
                sqlx::query("UPDATE pos_submissions SET rating = $1, tags = $2 WHERE id = $3")
                    .bind(sub.problem.rating)
                    .bind(&sub.problem.tags)
                    .bind(id)
                    .execute(pool)
                    .await
                    .map_err(|e| db_context("Backfill", e))?;
                log::info!("[CODEFORCES] Backfilled metadata for {}", sub.problem.name);
            }
            continue;
        }

        // Create new submission with actual verdict
        let sub_id = gen_id();
        sqlx::query(
            r#"INSERT INTO pos_submissions
               (id, platform, problem_id, problem_title, submitted_time, verdict, language, rating, tags)
               VALUES ($1, 'codeforces', $2, $3, $4, $5, $6, $7, $8)"#,
        )
        .bind(&sub_id)
        .bind(&problem_id)
        .bind(&sub.problem.name)
        .bind(submitted_time)
        .bind(verdict)
        .bind(&sub.programming_language)
        .bind(sub.problem.rating)
        .bind(&sub.problem.tags)
        .execute(pool)
        .await
        .map_err(|e| db_context("Insert submission", e))?;

        // Only shadow-log accepted submissions
        if verdict == "OK" {
            shadow_inputs.push(ShadowInput {
                submitted_time,
                problem_id,
                problem_title: sub.problem.name.clone(),
                platform: "codeforces".into(),
            });
        }
        new_count += 1;
    }

    // Shadow-log new submissions
    let shadow_count = shadow::process_submissions(pool, &shadow_inputs, config.0.shadow_activity_minutes).await?;

    log::info!("[CODEFORCES SCRAPER] Sync complete: {} new submissions", new_count);
    Ok(ScraperResponse {
        platform: "codeforces".into(),
        new_submissions: new_count,
        total_submissions: total,
        shadow_activities: shadow_count,
    })
}
