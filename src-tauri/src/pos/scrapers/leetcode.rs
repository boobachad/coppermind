// ─── LeetCode Scraper ───────────────────────────────────────────────
// Scrapes LeetCode submissions via GraphQL API.
// Strategy: Fetch recent 100 submissions, filter accepted, backfill metadata.

use chrono::DateTime;
use serde::Deserialize;
use tauri::State;

use crate::{PosDb, PosConfig};
use super::super::error::{PosError, db_context};
use super::super::shadow::{self, ShadowInput};
use super::super::utils::gen_id;
use super::{build_http_client, ScraperResponse};

// ─── GraphQL Response Types ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct LeetCodeGqlResponse {
    data: Option<LeetCodeGqlData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeetCodeGqlData {
    recent_submission_list: Option<Vec<LeetCodeSubmission>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeetCodeSubmission {
    title: String,
    title_slug: String,
    timestamp: String,  // Unix seconds as string
    status_display: String,
    lang: String,
}

#[derive(Debug, Deserialize)]
struct LeetCodeQuestionResponse {
    data: Option<LeetCodeQuestionData>,
}

#[derive(Debug, Deserialize)]
struct LeetCodeQuestionData {
    question: Option<LeetCodeQuestion>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeetCodeQuestion {
    difficulty: Option<String>,
    topic_tags: Option<Vec<LeetCodeTag>>,
}

#[derive(Debug, Deserialize)]
struct LeetCodeTag {
    name: String,
}

// ─── Scraper Command ────────────────────────────────────────────────

/// Scrape LeetCode submissions via GraphQL. Accepted only.
/// Creates submissions + shadow activities. Backfills difficulty/tags.
#[tauri::command]
pub async fn scrape_leetcode(
    db: State<'_, PosDb>,
    config: State<'_, PosConfig>,
) -> Result<ScraperResponse, PosError> {
    let pool = &db.0;
    let username = config.0.require_leetcode_username()
        .map_err(|e| PosError::InvalidInput(e))?;

    log::info!("[LEETCODE SCRAPER] Starting sync for {}", username);

    let client = build_http_client();

    // 1. Fetch recent submissions via GraphQL
    let gql_query = r#"
        query getRecentSubmissions($username: String!, $limit: Int) {
            recentSubmissionList(username: $username, limit: $limit) {
                title
                titleSlug
                timestamp
                statusDisplay
                lang
            }
        }
    "#;

    let body = serde_json::json!({
        "query": gql_query,
        "variables": { "username": username, "limit": 100 }
    });

    let resp = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(PosError::External(format!("LeetCode API returned {}", resp.status())));
    }

    let data: LeetCodeGqlResponse = resp.json().await?;

    let submissions = data.data
        .and_then(|d| d.recent_submission_list)
        .ok_or_else(|| PosError::External("Invalid response from LeetCode API".into()))?;

    let total = submissions.len() as i32;
    let mut new_count = 0i32;
    let mut shadow_inputs: Vec<ShadowInput> = Vec::new();

    // 2. Process each accepted submission
    for sub in &submissions {
        if sub.status_display != "Accepted" {
            continue;
        }

        // Parse Unix timestamp
        let ts_secs: i64 = sub.timestamp.parse()
            .map_err(|_| PosError::InvalidInput(format!("Invalid timestamp: {}", sub.timestamp)))?;
        let submitted_time = DateTime::from_timestamp(ts_secs, 0)
            .ok_or_else(|| PosError::InvalidInput("Invalid Unix timestamp".into()))?;
        let problem_id = format!("leetcode-{}", sub.title_slug);

        // Idempotency: check by submitted_time (UNIQUE constraint)
        let existing: Option<(String, Option<String>, Vec<String>)> = sqlx::query_as(
            "SELECT id, difficulty, tags FROM pos_submissions WHERE submitted_time = $1",
        )
        .bind(submitted_time)
        .fetch_optional(pool)
        .await
        .map_err(|e| db_context("Check existing", e))?;

        // Backfill metadata if needed
        let needs_backfill = existing.as_ref()
            .map(|(_, d, t)| d.is_none() || t.is_empty())
            .unwrap_or(false);

        if existing.is_some() && !needs_backfill {
            continue; // Fully up-to-date
        }

        // Fetch question details (difficulty + tags)
        let (difficulty, tags) = fetch_leetcode_question(&client, &sub.title_slug).await;

        if let Some((ref id, _, _)) = existing {
            // Backfill only
            sqlx::query("UPDATE pos_submissions SET difficulty = $1, tags = $2 WHERE id = $3")
                .bind(&difficulty)
                .bind(&tags)
                .bind(id)
                .execute(pool)
                .await
                .map_err(|e| db_context("Backfill", e))?;
            log::info!("[LEETCODE] Backfilled metadata for {}", sub.title);
            continue;
        }

        // Create new submission
        let sub_id = gen_id();
        sqlx::query(
            r#"INSERT INTO pos_submissions
               (id, platform, problem_id, problem_title, submitted_time, verdict, language, difficulty, tags)
               VALUES ($1, 'leetcode', $2, $3, $4, $5, $6, $7, $8)"#,
        )
        .bind(&sub_id)
        .bind(&problem_id)
        .bind(&sub.title)
        .bind(submitted_time)
        .bind(&sub.status_display)
        .bind(&sub.lang)
        .bind(&difficulty)
        .bind(&tags)
        .execute(pool)
        .await
        .map_err(|e| db_context("Insert submission", e))?;

        shadow_inputs.push(ShadowInput {
            submitted_time,
            problem_id,
            problem_title: sub.title.clone(),
            platform: "leetcode".into(),
        });
        new_count += 1;
    }

    // 3. Shadow-log new submissions
    let shadow_count = shadow::process_submissions(pool, &shadow_inputs, config.0.shadow_activity_minutes).await?;

    log::info!("[LEETCODE SCRAPER] Sync complete: {} new submissions", new_count);
    Ok(ScraperResponse {
        platform: "leetcode".into(),
        new_submissions: new_count,
        total_submissions: total,
        shadow_activities: shadow_count,
    })
}

// ─── Helper Functions ───────────────────────────────────────────────

/// Fetch LeetCode question details (difficulty + topic tags).
async fn fetch_leetcode_question(client: &reqwest::Client, title_slug: &str) -> (Option<String>, Vec<String>) {
    let query = r#"
        query questionData($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                difficulty
                topicTags { name }
            }
        }
    "#;

    let body = serde_json::json!({
        "query": query,
        "variables": { "titleSlug": title_slug }
    });

    match client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&body)
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(data) = resp.json::<LeetCodeQuestionResponse>().await {
                if let Some(q) = data.data.and_then(|d| d.question) {
                    let tags = q.topic_tags
                        .unwrap_or_default()
                        .into_iter()
                        .map(|t| t.name)
                        .collect();
                    return (q.difficulty, tags);
                }
            }
        }
        Err(e) => {
            log::error!("[LEETCODE] Failed to fetch details for {}: {}", title_slug, e);
        }
    }
    (None, vec![])
}
