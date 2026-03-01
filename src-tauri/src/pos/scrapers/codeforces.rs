// ─── Codeforces Scraper ─────────────────────────────────────────────
// Scrapes Codeforces submissions via REST API.
// Strategy: Fetch all submissions, filter accepted, backfill metadata.

use chrono::DateTime;
use serde::Deserialize;
use tauri::State;

use crate::{PosDb, PosConfig};
use super::super::error::{PosError, PosResult, db_context};
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
) -> PosResult<ScraperResponse> {
    let pool = &db.0;
    let handle = config.0.require_codeforces_handle()
        .map_err(|e| PosError::InvalidInput(e))?;

    log::info!("[CODEFORCES SCRAPER] Starting sync for {}", handle);

    let client = build_http_client();
    // Fetch up to 10000 submissions (API max per request)
    let url = format!("https://codeforces.com/api/user.status?handle={}&from=1&count=10000", handle);

    // Retry logic with exponential backoff
    let mut last_error = String::new();
    let data: CodeforcesApiResponse = {
        let mut result = None;
        for i in 0..3 {
            if i > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(500 * i)).await;
            }

            let resp = match client.get(&url).send().await {
                Ok(r) => r,
                Err(e) => {
                    log::warn!("[CODEFORCES SCRAPER] Attempt {} failed: {}", i+1, e);
                    last_error = e.to_string();
                    continue;
                }
            };

            if !resp.status().is_success() {
                let status = resp.status();
                log::warn!("[CODEFORCES SCRAPER] Attempt {} failed with HTTP {}", i+1, status);
                last_error = format!("HTTP error: {}", status);
                continue;
            }

            match resp.json::<CodeforcesApiResponse>().await {
                Ok(d) => {
                    result = Some(d);
                    break;
                }
                Err(e) => {
                    log::warn!("[CODEFORCES SCRAPER] Attempt {} failed to parse JSON: {}", i+1, e);
                    last_error = format!("JSON parse error: {}", e);
                    continue;
                }
            }
        }
        
        result.ok_or_else(|| PosError::External(format!("Failed after 3 attempts: {}", last_error)))?
    };

    if data.status != "OK" {
        return Err(PosError::External("Codeforces API returned non-OK status".into()));
    }

    let submissions = data.result.ok_or_else(|| PosError::External("Invalid response from Codeforces API".into()))?;
    let total = submissions.len() as i32;
    log::info!("[CODEFORCES SCRAPER] API returned {} submissions", total);
    
    let mut new_count = 0i32;
    let mut skipped_count = 0i32;
    let mut shadow_inputs: Vec<ShadowInput> = Vec::new();

    for sub in &submissions {
        let submitted_time = DateTime::from_timestamp(sub.creation_time_seconds, 0)
            .ok_or_else(|| PosError::InvalidInput("Invalid Unix timestamp".into()))?;
        let contest_id = sub.problem.contest_id.unwrap_or(0);
        let problem_id = format!("cf-{}{}", contest_id, sub.problem.index);
        let verdict = sub.verdict.as_deref().unwrap_or("TESTING");

        // Idempotency check - fetch existing with verdict
        let existing: Option<(String, Option<i32>, Vec<String>, String)> = sqlx::query_as(
            "SELECT id, rating, tags, verdict FROM pos_submissions WHERE submitted_time = $1",
        )
        .bind(submitted_time)
        .fetch_optional(pool)
        .await
        .map_err(|e| db_context("Check existing", e))?;

        if let Some((ref id, rating, ref tags, ref old_verdict)) = existing {
            // Check if ANY field needs updating
            let needs_rating = rating.is_none() && sub.problem.rating.is_some();
            let needs_tags = tags.is_empty() && !sub.problem.tags.is_empty();
            let needs_verdict = old_verdict != verdict;
            
            if needs_rating || needs_tags || needs_verdict {
                sqlx::query("UPDATE pos_submissions SET rating = $1, tags = $2, verdict = $3 WHERE id = $4")
                    .bind(sub.problem.rating)
                    .bind(&sub.problem.tags)
                    .bind(verdict)
                    .bind(id)
                    .execute(pool)
                    .await
                    .map_err(|e| db_context("Backfill", e))?;
                
                let mut updates = Vec::new();
                if needs_rating { updates.push("rating".to_string()); }
                if needs_tags { updates.push("tags".to_string()); }
                if needs_verdict { 
                    updates.push(format!("verdict: {} → {}", old_verdict, verdict)); 
                }
                log::info!("[CODEFORCES] Backfilled {} for {}", updates.join(", "), sub.problem.name);
            }
            skipped_count += 1;
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

    // Auto-sync ladder progress
    let sync_msg = crate::cf_ladder_system::sync_ladder_progress_from_submissions(db.clone()).await.unwrap_or_else(|e| {
        log::error!("[CF SYNC] Failed to sync ladder progress: {}", e);
        "Sync failed".to_string()
    });

    log::info!("[CODEFORCES SCRAPER] Sync complete: {} new submissions. {} skipped (already exist)", new_count, skipped_count);
    Ok(ScraperResponse {
        platform: "codeforces".into(),
        new_submissions: new_count,
        total_submissions: total,
        shadow_activities: shadow_count,
    })
}
// ─── User Stats Command ─────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeforcesUserStats {
    pub handle: String,
    pub rating: Option<i32>,
    pub max_rating: Option<i32>,
    pub rank: Option<String>,
    pub max_rank: Option<String>,
    pub avatar: Option<String>,
    pub total_solved: i32,
    pub total_submissions: i32,
}

#[derive(Debug, Deserialize)]
struct CFUserInfoResponse {
    status: String,
    result: Option<Vec<CFUserInfo>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CFUserInfo {
    handle: String,
    rating: Option<i32>,
    max_rating: Option<i32>,
    rank: Option<String>,
    max_rank: Option<String>,
    title_photo: Option<String>, // avatar url
}

#[tauri::command]
pub async fn get_codeforces_user_stats(
    db: State<'_, PosDb>,
    config: State<'_, PosConfig>,
    force_refresh: bool,
) -> PosResult<CodeforcesUserStats> {
    let pool = &db.0;
    
    log::info!("[CODEFORCES STATS] Checking database connection...");
    
    // Test query to verify connection
    let test_result: Result<i64, _> = sqlx::query_scalar("SELECT COUNT(*) FROM pos_submissions")
        .fetch_one(pool)
        .await;
    
    log::info!("[CODEFORCES STATS] Total submissions in database: {:?}", test_result);
    
    let handle = match config.0.codeforces_handle.clone() {
        Some(h) => h,
        None => return Err(PosError::InvalidInput("Codeforces handle not configured".into())),
    };

    // Fetch local counts (always fast)
    let total_solved_result = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pos_submissions WHERE platform = 'codeforces' AND verdict = 'OK'"
    )
    .fetch_one(pool)
    .await;
    
    log::info!("[CODEFORCES STATS] Query result for solved: {:?}", total_solved_result);
    
    let total_solved: i32 = total_solved_result
        .unwrap_or(0)
        .try_into()
        .unwrap_or(0);

    let total_submissions_result = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pos_submissions WHERE platform = 'codeforces'"
    )
    .fetch_one(pool)
    .await;
    
    log::info!("[CODEFORCES STATS] Query result for total: {:?}", total_submissions_result);
    
    let total_submissions: i32 = total_submissions_result
        .unwrap_or(0)
        .try_into()
        .unwrap_or(0);

    log::info!("[CODEFORCES STATS] Local counts: solved={}, total={}", total_solved, total_submissions);

    // If not forcing refresh, try to serve from cache if fresh (< 24 hrs)
    if !force_refresh {
         let cached: Option<(serde_json::Value, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
            "SELECT data, updated_at FROM pos_user_stats WHERE platform = 'codeforces'"
        )
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

        if let Some((data, updated_at)) = cached {
            let now = chrono::Utc::now();
            let duration = now.signed_duration_since(updated_at);
            if duration.num_hours() < 24 {
                if let Ok(mut stats) = serde_json::from_value::<CodeforcesUserStats>(data) {
                    // Update dynamic counts
                    log::info!("[CODEFORCES STATS] Updating cached stats with fresh counts: solved={}, total={}", total_solved, total_submissions);
                    stats.total_solved = total_solved;
                    stats.total_submissions = total_submissions;
                    log::info!("[CODEFORCES] Serving stats from cache (age: {} hrs)", duration.num_hours());
                    return Ok(stats);
                }
            }
        }
    }

    log::info!("[CODEFORCES] Fetching fresh stats from API...");

    let client = build_http_client();
    let url = format!("https://codeforces.com/api/user.info?handles={}", handle);

    let api_result = async {
        let mut last_error = String::new();
        for i in 0..3 {
            if i > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(500 * i)).await;
            }
            
            let resp = match client.get(&url).send().await {
                Ok(r) => r,
                Err(e) => {
                    last_error = e.to_string();
                    continue;
                }
            };

            // Check HTTP status before parsing
            if !resp.status().is_success() {
                let status = resp.status();
                log::warn!("[CODEFORCES] Attempt {} failed with HTTP {}", i+1, status);
                last_error = format!("HTTP error: {}", status);
                continue;
            }

            let text = match resp.text().await {
                Ok(t) => t,
                Err(e) => {
                    last_error = e.to_string();
                    continue;
                }
            };
            
            let data: CFUserInfoResponse = match serde_json::from_str(&text) {
                Ok(d) => d,
                Err(e) => {
                    log::warn!("[CODEFORCES] Attempt {} failed to parse response: {}", i+1, text);
                    last_error = format!("Failed to parse Codeforces response: {}", e);
                    continue;
                }
            };

            if data.status != "OK" {
                last_error = "Codeforces API returned non-OK status".into();
                continue;
            }

            let user = match data.result
                .and_then(|users| users.into_iter().next()) {
                    Some(u) => u,
                    None => {
                        last_error = "User not found".into();
                        break; // No point retrying if user not found
                    }
                };

            return Ok::<CodeforcesUserStats, PosError>(CodeforcesUserStats {
                handle: user.handle,
                rating: user.rating,
                max_rating: user.max_rating,
                rank: user.rank,
                max_rank: user.max_rank,
                avatar: user.title_photo,
                total_solved, 
                total_submissions,
            });
        }
        
        log::error!("[CODEFORCES STATS] Failed to fetch from API after 3 attempts: {}", last_error);
        Err(PosError::External(last_error))
    }.await;

    match api_result {
        Ok(stats) => {
             log::info!("[CODEFORCES STATS] Successfully fetched from API: solved={}, total={}", stats.total_solved, stats.total_submissions);
             // Save to DB
            let json_data = serde_json::to_value(&stats).unwrap_or_default();
            sqlx::query(
                "INSERT INTO pos_user_stats (platform, username, data, updated_at) 
                 VALUES ('codeforces', $1, $2, NOW())
                 ON CONFLICT (platform) DO UPDATE 
                 SET username = EXCLUDED.username, data = EXCLUDED.data, updated_at = NOW()"
            )
            .bind(&stats.handle)
            .bind(json_data)
            .execute(pool)
            .await
            .map_err(|e| db_context("Save stats", e))?;
            
            log::info!("[CODEFORCES] User stats updated and cached");
            Ok(stats)
        }
        Err(e) => {
            log::warn!("[CODEFORCES] API fetch failed after 3 attempts: {}. Trying cache fallback.", e);
            // Fallback to strict cache even if old
             let cached: Option<(serde_json::Value,)> = sqlx::query_as(
                "SELECT data FROM pos_user_stats WHERE platform = 'codeforces'"
            )
            .fetch_optional(pool)
            .await
            .map_err(|db_err| db_context("Load cached stats", db_err))?;

            if let Some((data,)) = cached {
                let mut stats: CodeforcesUserStats = serde_json::from_value(data)
                    .map_err(|e| PosError::External(format!("Cache parse error: {}", e)))?;
                // Update counts from DB
                log::info!("[CODEFORCES STATS] Updating stale cache with fresh counts: solved={}, total={}", total_solved, total_submissions);
                stats.total_solved = total_solved;
                stats.total_submissions = total_submissions;
                log::info!("[CODEFORCES] Serving stale cache due to API unavailability");
                Ok(stats)
            } else {
                log::error!("[CODEFORCES] No cache available and API is down");
                Err(e)
            }
        }
    }
}
