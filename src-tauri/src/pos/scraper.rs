use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use super::shadow::{self, ShadowInput};

// ─── Response types ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ScraperResponse {
    pub platform: String,
    pub new_submissions: i32,
    pub total_submissions: i32,
    pub shadow_activities: i32,
}

// ─── LeetCode GraphQL types ────────────────────────────────────────

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

// ─── Codeforces REST types ─────────────────────────────────────────

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

// ─── ID generator ───────────────────────────────────────────────────

fn gen_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("c{}{:08x}", ts, rand_u32())
}

fn rand_u32() -> u32 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let s = RandomState::new();
    let mut h = s.build_hasher();
    h.write_u8(0);
    h.finish() as u32
}

// ─── LeetCode Scraper ───────────────────────────────────────────────

/// Scrape LeetCode submissions via GraphQL. Accepted only.
/// Creates submissions + shadow activities. Backfills difficulty/tags.
#[tauri::command]
pub async fn scrape_leetcode(
    db: State<'_, PosDb>,
) -> Result<ScraperResponse, String> {
    let pool = &db.0;
    let username = std::env::var("LEETCODE_USERNAME")
        .map_err(|_| "LEETCODE_USERNAME not configured in environment")?;

    log::info!("[LEETCODE SCRAPER] Starting sync for {}", username);

    let client = reqwest::Client::new();

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
        .await
        .map_err(|e| format!("LeetCode request: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("LeetCode API returned {}", resp.status()));
    }

    let data: LeetCodeGqlResponse = resp.json().await
        .map_err(|e| format!("LeetCode parse: {e}"))?;

    let submissions = data.data
        .and_then(|d| d.recent_submission_list)
        .ok_or("Invalid response from LeetCode API")?;

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
            .map_err(|_| format!("Invalid timestamp: {}", sub.timestamp))?;
        let submitted_time = DateTime::from_timestamp(ts_secs, 0)
            .ok_or("Invalid Unix timestamp")?;
        let problem_id = format!("leetcode-{}", sub.title_slug);

        // Idempotency: check by submitted_time (UNIQUE constraint)
        let existing: Option<(String, Option<String>, Vec<String>)> = sqlx::query_as(
            "SELECT id, difficulty, tags FROM pos_submissions WHERE submitted_time = $1",
        )
        .bind(submitted_time)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Check existing: {e}"))?;

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
                .map_err(|e| format!("Backfill: {e}"))?;
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
        .map_err(|e| format!("Insert submission: {e}"))?;

        shadow_inputs.push(ShadowInput {
            submitted_time,
            problem_id,
            problem_title: sub.title.clone(),
            platform: "leetcode".into(),
        });
        new_count += 1;
    }

    // 3. Shadow-log new submissions
    let shadow_count = shadow::process_submissions(pool, &shadow_inputs).await?;

    log::info!("[LEETCODE SCRAPER] Sync complete: {} new submissions", new_count);
    Ok(ScraperResponse {
        platform: "leetcode".into(),
        new_submissions: new_count,
        total_submissions: total,
        shadow_activities: shadow_count,
    })
}

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

    let result = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&body)
        .send()
        .await;

    match result {
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

// ─── Codeforces Scraper ─────────────────────────────────────────────

/// Scrape Codeforces submissions via REST API. Accepted only (verdict == "OK").
/// Creates submissions + shadow activities. Backfills rating/tags.
#[tauri::command]
pub async fn scrape_codeforces(
    db: State<'_, PosDb>,
) -> Result<ScraperResponse, String> {
    let pool = &db.0;
    let handle = std::env::var("CODEFORCES_HANDLE")
        .map_err(|_| "CODEFORCES_HANDLE not configured in environment")?;

    log::info!("[CODEFORCES SCRAPER] Starting sync for {}", handle);

    let client = reqwest::Client::new();
    let url = format!("https://codeforces.com/api/user.status?handle={}", handle);

    let resp = client.get(&url).send().await
        .map_err(|e| format!("Codeforces request: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Codeforces API returned {}", resp.status()));
    }

    let data: CodeforcesApiResponse = resp.json().await
        .map_err(|e| format!("Codeforces parse: {e}"))?;

    if data.status != "OK" {
        return Err("Codeforces API returned non-OK status".into());
    }

    let submissions = data.result.ok_or("Invalid response from Codeforces API")?;
    let total = submissions.len() as i32;
    let mut new_count = 0i32;
    let mut shadow_inputs: Vec<ShadowInput> = Vec::new();

    for sub in &submissions {
        // Only accepted submissions (verdict == "OK")
        if sub.verdict.as_deref() != Some("OK") {
            continue;
        }

        let submitted_time = DateTime::from_timestamp(sub.creation_time_seconds, 0)
            .ok_or("Invalid Unix timestamp")?;
        let contest_id = sub.problem.contest_id.unwrap_or(0);
        let problem_id = format!("cf-{}{}", contest_id, sub.problem.index);

        // Idempotency check
        let existing: Option<(String, Option<i32>, Vec<String>)> = sqlx::query_as(
            "SELECT id, rating, tags FROM pos_submissions WHERE submitted_time = $1",
        )
        .bind(submitted_time)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Check existing: {e}"))?;

        if let Some((ref id, rating, ref tags)) = existing {
            // Backfill if metadata missing
            if rating.is_none() || tags.is_empty() {
                sqlx::query("UPDATE pos_submissions SET rating = $1, tags = $2 WHERE id = $3")
                    .bind(sub.problem.rating)
                    .bind(&sub.problem.tags)
                    .bind(id)
                    .execute(pool)
                    .await
                    .map_err(|e| format!("Backfill: {e}"))?;
                log::info!("[CODEFORCES] Backfilled metadata for {}", sub.problem.name);
            }
            continue;
        }

        // Create new submission
        let sub_id = gen_id();
        sqlx::query(
            r#"INSERT INTO pos_submissions
               (id, platform, problem_id, problem_title, submitted_time, verdict, language, rating, tags)
               VALUES ($1, 'codeforces', $2, $3, $4, 'Accepted', $5, $6, $7)"#,
        )
        .bind(&sub_id)
        .bind(&problem_id)
        .bind(&sub.problem.name)
        .bind(submitted_time)
        .bind(&sub.programming_language)
        .bind(sub.problem.rating)
        .bind(&sub.problem.tags)
        .execute(pool)
        .await
        .map_err(|e| format!("Insert submission: {e}"))?;

        shadow_inputs.push(ShadowInput {
            submitted_time,
            problem_id,
            problem_title: sub.problem.name.clone(),
            platform: "codeforces".into(),
        });
        new_count += 1;
    }

    // Shadow-log new submissions
    let shadow_count = shadow::process_submissions(pool, &shadow_inputs).await?;

    log::info!("[CODEFORCES SCRAPER] Sync complete: {} new submissions", new_count);
    Ok(ScraperResponse {
        platform: "codeforces".into(),
        new_submissions: new_count,
        total_submissions: total,
        shadow_activities: shadow_count,
    })
}
