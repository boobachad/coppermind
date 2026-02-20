// ─── LeetCode Scraper ───────────────────────────────────────────────
// Scrapes LeetCode submissions via GraphQL API.
// Strategy: Fetch recent 100 submissions, filter accepted, backfill metadata.

use chrono::DateTime;
use serde::Deserialize;
use tauri::State;

use crate::{PosDb, PosConfig};
use super::super::error::{PosError, PosResult, db_context};
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
) -> PosResult<ScraperResponse> {
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
// ─── User Stats Command ─────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeetCodeUserStats {
    pub username: String,
    pub ranking:  Option<i32>,
    pub total_solved: i32,
    pub easy_solved: i32,
    pub medium_solved: i32,
    pub hard_solved: i32,
    pub acceptance_rate: f64,
}

#[derive(Debug, Deserialize)]
struct LeetCodeGraphqlResponse {
    data: LeetCodeGraphqlData,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeetCodeGraphqlData {
    all_questions_count: Vec<CategoryCount>,
    matched_user: Option<LeetCodeMatchedUser>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeetCodeMatchedUser {
    username: String,
    profile: Option<LeetCodeUserProfile>,
    submit_stats: LeetCodeSubmitStats,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeetCodeUserProfile {
    ranking: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LeetCodeSubmitStats {
    ac_submission_num: Vec<CategoryCount>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CategoryCount {
    difficulty: String,
    count: i32,
}


#[tauri::command]
pub async fn get_leetcode_user_stats(
    db: State<'_, PosDb>,
    config: State<'_, PosConfig>,
    force_refresh: bool,
) -> PosResult<LeetCodeUserStats> {
    let pool = &db.0;
    
    // Check config first
    let username = match config.0.leetcode_username.clone() {
        Some(u) => u,
        None => return Err(PosError::InvalidInput("LeetCode username not configured".into())),
    };

    // If not forcing refresh, try to serve from cache if fresh (< 24 hrs)
    if !force_refresh {
         let cached: Option<(serde_json::Value, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
            "SELECT data, updated_at FROM pos_user_stats WHERE platform = 'leetcode'"
        )
        .fetch_optional(pool)
        .await
        .map_err(|e| db_context("Load cached stats", e))?; // Added error handling for fetch_optional

        if let Some((data, updated_at)) = cached {
            let now = chrono::Utc::now();
            let duration = now.signed_duration_since(updated_at);
            // If less than 24 hours old, valid cache
            if duration.num_hours() < 24 {
                if let Ok(stats) = serde_json::from_value::<LeetCodeUserStats>(data) {
                    log::info!("[LEETCODE] Serving stats from cache (age: {} hrs)", duration.num_hours());
                    return Ok(stats);
                } else {
                    log::warn!("[LEETCODE] Failed to parse cached stats, fetching fresh.");
                }
            } else {
                log::info!("[LEETCODE] Cached stats too old (age: {} hrs), fetching fresh.", duration.num_hours());
            }
        }
    }

    log::info!("[LEETCODE] Fetching fresh stats from API...");

    let client = build_http_client();
    let query = r#"
        query getUserProfile($username: String!) {
            allQuestionsCount { difficulty count }
            matchedUser(username: $username) {
                username
                profile { ranking }
                submitStats {
                    acSubmissionNum { difficulty count }
                }
            }
        }
    "#;

    let vars = serde_json::json!({ "username": username });
    let body = serde_json::json!({ "query": query, "variables": vars });

    let resp = client.post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&body)
        .send()
        .await?;

    let data: LeetCodeGraphqlResponse = resp.json().await?;

    let user = data.data.matched_user.ok_or(PosError::External("User not found".into()))?;
    let all_counts = data.data.all_questions_count;

    let get_count = |list: &[CategoryCount], diff: &str| -> i32 {
        list.iter().find(|c| c.difficulty == diff).map(|c| c.count).unwrap_or(0)
    };

    let total_solved = get_count(&user.submit_stats.ac_submission_num, "All");
    let easy_solved = get_count(&user.submit_stats.ac_submission_num, "Easy");
    let medium_solved = get_count(&user.submit_stats.ac_submission_num, "Medium");
    let hard_solved = get_count(&user.submit_stats.ac_submission_num, "Hard");

    let total_questions = get_count(&all_counts, "All");
    let acceptance_rate = if total_questions > 0 {
        (total_solved as f64 / total_questions as f64) * 100.0
    } else {
        0.0
    };

    let stats = LeetCodeUserStats {
        username: user.username,
        ranking: user.profile.unwrap().ranking,
        total_solved,
        easy_solved,
        medium_solved,
        hard_solved,
        acceptance_rate,
    };

    // Save to DB
    let json_data = serde_json::to_value(&stats).unwrap_or_default();
    sqlx::query(
        "INSERT INTO pos_user_stats (platform, username, data, updated_at) 
            VALUES ('leetcode', $1, $2, NOW())
            ON CONFLICT (platform) DO UPDATE 
            SET username = EXCLUDED.username, data = EXCLUDED.data, updated_at = NOW()"
    )
    .bind(&stats.username)
    .bind(json_data)
    .execute(pool)
    .await
    .map_err(|e| db_context("Save stats", e))?;
    
    log::info!("[LEETCODE] User stats updated and cached");
    Ok(stats)
}
