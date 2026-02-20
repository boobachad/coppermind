use crate::PosDb;
use crate::pos::utils::gen_id;
use crate::pos::error::{PosError, PosResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

// ============================================================================
// Types
// ============================================================================

/// Matches DB schema: cf_friends(id, cf_handle, display_name, current_rating, max_rating, last_synced, created_at)
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CFFriendRow {
    pub id: String,
    pub cf_handle: String,
    pub display_name: Option<String>,
    pub current_rating: Option<i32>,
    pub max_rating: Option<i32>,
    pub last_synced: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    /// Computed: count of synced submissions (added via query, not a real column)
    #[sqlx(default)]
    pub submission_count: Option<i64>,
    #[sqlx(default)]
    pub total_submissions: Option<i64>,
}

/// Matches DB schema: cf_friend_submissions(id, friend_id, problem_id, problem_name, problem_url,
///                                          contest_id, problem_index, difficulty, verdict,
///                                          submission_time, created_at)
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CFSubmissionRow {
    pub id: String,
    pub friend_id: String,
    pub problem_id: String,
    pub problem_name: String,
    pub problem_url: String,
    pub contest_id: Option<i32>,
    pub problem_index: String,
    pub difficulty: Option<i32>,
    pub verdict: String,
    pub submission_time: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddFriendRequest {
    pub cf_handle: String,
    pub display_name: Option<String>,
}

/// Return type for generate_friends_ladder
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FriendsLadderProblem {
    pub problem_id: String,
    pub problem_name: String,
    pub problem_url: String,
    pub difficulty: Option<i32>,
    pub solve_count: i64,
    pub solved_by: Vec<String>,
    pub most_recent_solve: Option<DateTime<Utc>>,
}

// ============================================================================
// CF API Integration
// ============================================================================

#[derive(Debug, Deserialize)]
struct CFApiResponse<T> {
    status: String,
    result: Option<T>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CFSubmission {
    contest_id: Option<i32>,
    problem: CFProblem,
    verdict: Option<String>,
    creation_time_seconds: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CFProblem {
    contest_id: Option<i32>,
    index: String,
    name: String,
    rating: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CFUser {
    handle: String,
    rating: Option<i32>,
    max_rating: Option<i32>,
    first_name: Option<String>,
    last_name: Option<String>,
    country: Option<String>,
    rank: Option<String>,
    max_rank: Option<String>,
}

async fn fetch_cf_submissions(handle: &str) -> PosResult<Vec<CFSubmission>> {
    let url = format!("https://codeforces.com/api/user.status?handle={}", handle);

    let response = reqwest::get(&url)
        .await
        .map_err(|e| PosError::External(format!("CF API request failed: {}", e)))?;

    let api_response: CFApiResponse<Vec<CFSubmission>> = response
        .json()
        .await
        .map_err(|e| PosError::External(format!("CF API parse failed: {}", e)))?;

    if api_response.status != "OK" {
        return Err(PosError::External("CF API returned non-OK status".to_string()));
    }

    Ok(api_response.result.unwrap_or_default())
}

async fn verify_cf_handle(handle: &str) -> PosResult<CFUser> {
    let url = format!("https://codeforces.com/api/user.info?handles={}", handle);

    let response = reqwest::get(&url)
        .await
        .map_err(|e| PosError::External(format!("CF API request failed: {}", e)))?;

    let api_response: CFApiResponse<Vec<CFUser>> = response
        .json()
        .await
        .map_err(|e| PosError::External(format!("CF API parse failed: {}", e)))?;

    if api_response.status != "OK" {
        return Err(PosError::External("CF API returned non-OK status or user not found".to_string()));
    }

    // The API returns a list, we asked for one handle
    api_response.result
        .and_then(|users| users.into_iter().next())
        .ok_or_else(|| PosError::External("User not found in CF response".to_string()))
}

// ============================================================================
// Commands
// ============================================================================

#[tauri::command]
pub async fn add_cf_friend(
    db: State<'_, PosDb>,
    request: AddFriendRequest,
) -> PosResult<CFFriendRow> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();
    // Verify handle exists via CF API (Lightweight check)
    let user_info = verify_cf_handle(&request.cf_handle).await?;
    
    // Use the canonical handle from CF (correct casing)
    let final_handle = user_info.handle;
    let display = request.display_name.unwrap_or_else(|| final_handle.clone());

    let friend: CFFriendRow = sqlx::query_as(
        r#"
        INSERT INTO cf_friends (id, cf_handle, display_name, current_rating, max_rating, max_rank, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (cf_handle) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            current_rating = EXCLUDED.current_rating,
            max_rating = EXCLUDED.max_rating
        RETURNING id, cf_handle, display_name, current_rating, max_rating, last_synced, created_at, 0::bigint AS total_submissions, NULL::bigint AS submission_count
        "#,
    )
    .bind(&id)
    .bind(&final_handle)
    .bind(&display)
    .bind(user_info.rating)
    .bind(user_info.max_rating)
    .bind(user_info.max_rank)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| PosError::Database(format!("Failed to add friend: {}", e)))?;

    Ok(friend)
}

#[tauri::command]
pub async fn get_cf_friends(
    db: State<'_, PosDb>,
) -> PosResult<Vec<CFFriendRow>> {
    let pool = &db.0;

    let friends: Vec<CFFriendRow> = sqlx::query_as(
        r#"
        SELECT f.id, f.cf_handle, f.display_name, f.current_rating, f.max_rating,
               f.last_synced, f.created_at, f.total_submissions,
               COUNT(s.id)::bigint AS submission_count
        FROM cf_friends f
        LEFT JOIN cf_friend_submissions s ON s.friend_id = f.id
        GROUP BY f.id
        ORDER BY f.created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| PosError::Database(format!("Failed to get friends: {}", e)))?;

    Ok(friends)
}

#[tauri::command]
pub async fn sync_cf_friend_submissions(
    db: State<'_, PosDb>,
    friend_id: String,
) -> PosResult<i32> {
    log::info!("[CF FRIEND] Syncing submissions for friend_id: {}", friend_id);
    let pool = &db.0;

    // Get friend
    let friend: CFFriendRow = sqlx::query_as(
        "SELECT id, cf_handle, display_name, current_rating, max_rating, last_synced, created_at, NULL::bigint AS submission_count FROM cf_friends WHERE id = $1"
    )
    .bind(&friend_id)
    .fetch_one(pool)
    .await
    .map_err(|e| PosError::Database(format!("Friend not found: {}", e)))?;

    // Fetch submissions from CF API
    let submissions = fetch_cf_submissions(&friend.cf_handle).await?;
    let total_count = submissions.len() as i64;
    log::info!("[CF FRIEND] Fetched {} submissions for {} from CF API", total_count, friend.cf_handle);

    // Filter for AC (Accepted) submissions only
    let ac_subs: Vec<CFSubmission> = submissions
        .into_iter()
        .filter(|s| s.verdict.as_deref() == Some("OK"))
        .collect();

    let mut imported_count: i32 = 0;

    for sub in ac_subs {
        if let Some(contest_id) = sub.problem.contest_id {
            let problem_url = format!(
                "https://codeforces.com/problemset/problem/{}/{}",
                contest_id,
                sub.problem.index
            );
            let problem_id = format!("cf_{}_{}", contest_id, sub.problem.index);
            let submission_time = DateTime::from_timestamp(sub.creation_time_seconds, 0)
                .unwrap_or_else(Utc::now);

            let result = sqlx::query(
                r#"
                INSERT INTO cf_friend_submissions
                (id, friend_id, problem_id, problem_name, problem_url,
                 contest_id, problem_index, difficulty, verdict, submission_time, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OK', $9, $10)
                ON CONFLICT (friend_id, problem_id) DO NOTHING
                "#,
            )
            .bind(gen_id())
            .bind(&friend.id)
            .bind(&problem_id)
            .bind(&sub.problem.name)
            .bind(&problem_url)
            .bind(contest_id)
            .bind(&sub.problem.index)
            .bind(sub.problem.rating)
            .bind(submission_time)
            .bind(Utc::now())
            .execute(pool)
            .await
            .map_err(|e| PosError::Database(format!("Failed to insert submission: {}", e)))?;

            if result.rows_affected() > 0 {
                imported_count += 1;
            }
        }
    }

    // Update last_synced and total_submissions
    sqlx::query("UPDATE cf_friends SET last_synced = $1, total_submissions = $2 WHERE id = $3")
        .bind(Utc::now())
        .bind(total_count)
        .bind(&friend.id)
        .execute(pool)
        .await
        .map_err(|e| PosError::Database(format!("Failed to update sync time: {}", e)))?;

    log::info!("[CF FRIEND] Sync complete for {}. Imported {} new AC submissions.", friend.cf_handle, imported_count);

    Ok(imported_count)
}

#[tauri::command]
pub async fn delete_cf_friend(
    db: State<'_, PosDb>,
    friend_id: String,
) -> PosResult<()> {
    let pool = &db.0;

    // CASCADE DELETE on cf_friend_submissions via FK constraint handles child rows
    sqlx::query("DELETE FROM cf_friends WHERE id = $1")
        .bind(&friend_id)
        .execute(pool)
        .await
        .map_err(|e| PosError::Database(format!("Failed to delete friend: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn generate_friends_ladder(
    db: State<'_, PosDb>,
    min_difficulty: Option<i32>,
    max_difficulty: Option<i32>,
    days_back: Option<i32>,
    limit: Option<i32>,
) -> PosResult<Vec<FriendsLadderProblem>> {
    let pool = &db.0;
    let limit = limit.unwrap_or(50);
    let min_diff = min_difficulty.unwrap_or(800);
    let max_diff = max_difficulty.unwrap_or(3500);
    let days = days_back.unwrap_or(90);

    let problems: Vec<FriendsLadderProblem> = sqlx::query_as(
        r#"
        SELECT
            s.problem_id,
            s.problem_name,
            s.problem_url,
            s.difficulty,
            COUNT(DISTINCT s.friend_id)::bigint                              AS solve_count,
            ARRAY_AGG(DISTINCT COALESCE(f.display_name, f.cf_handle))        AS solved_by,
            MAX(s.submission_time)                                            AS most_recent_solve
        FROM cf_friend_submissions s
        JOIN cf_friends f ON s.friend_id = f.id
        WHERE s.difficulty >= $1
          AND s.difficulty <= $2
          AND s.submission_time >= NOW() - ($3 * INTERVAL '1 day')
        GROUP BY s.problem_id, s.problem_name, s.problem_url, s.difficulty
        ORDER BY solve_count DESC, most_recent_solve DESC
        LIMIT $4
        "#,
    )
    .bind(min_diff)
    .bind(max_diff)
    .bind(days)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| PosError::Database(format!("Failed to generate ladder: {}", e)))?;

    Ok(problems)
}
