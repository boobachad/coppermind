use crate::PosDb;
use crate::pos::utils::gen_id;
use crate::pos::error::PosError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgQueryResult;
use sqlx::PgPool;
use tauri::State;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CFFriendRow {
    pub id: String,
    pub cf_handle: String,
    pub name: String,
    pub rating: Option<i32>,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CFSubmissionRow {
    pub id: String,
    pub friend_id: String,
    pub problem_id: String,
    pub problem_name: String,
    pub problem_url: String,
    pub contest_id: i32,
    pub problem_index: String,
    pub difficulty: Option<i32>,
    pub solved_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct AddFriendRequest {
    pub cf_handle: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct SyncFriendRequest {
    pub friend_id: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FriendsLadderProblem {
    pub problem_id: String,
    pub problem_name: String,
    pub problem_url: String,
    pub difficulty: Option<i32>,
    pub solved_by_count: i32,
    pub solved_by_friends: Vec<String>,
    pub most_recent_solve: DateTime<Utc>,
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
    id: i64,
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

async fn fetch_cf_submissions(handle: &str) -> Result<Vec<CFSubmission>, PosError> {
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

// ============================================================================
// Commands
// ============================================================================

#[tauri::command]
pub async fn add_cf_friend(
    db: State<'_, PosDb>,
    request: AddFriendRequest,
) -> Result<CFFriendRow, PosError> {
    let pool = &db.0;
    let id = gen_id();
    let now = Utc::now();
    
    // Verify handle exists via CF API
    let _ = fetch_cf_submissions(&request.cf_handle).await?;
    
    let friend: CFFriendRow = sqlx::query_as(
        r#"
        INSERT INTO cf_friends (id, cf_handle, name, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (cf_handle) DO UPDATE
        SET name = EXCLUDED.name
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(&request.cf_handle)
    .bind(&request.name)
    .bind(now)
    .fetch_one(pool)
    .await
    .map_err(|e| PosError::Database(format!("Failed to add friend: {}", e)))?;
    
    Ok(friend)
}

#[tauri::command]
pub async fn get_cf_friends(
    db: State<'_, PosDb>,
) -> Result<Vec<CFFriendRow>, PosError> {
    let pool = &db.0;
    
    let friends: Vec<CFFriendRow> = sqlx::query_as(
        r#"
        SELECT * FROM cf_friends
        ORDER BY created_at DESC
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
    request: SyncFriendRequest,
) -> Result<i32, PosError> {
    let pool = &db.0;
    
    // Get friend
    let friend: CFFriendRow = sqlx::query_as(
        "SELECT * FROM cf_friends WHERE id = $1"
    )
    .bind(&request.friend_id)
    .fetch_one(pool)
    .await
    .map_err(|e| PosError::Database(format!("Friend not found: {}", e)))?;
    
    // Fetch submissions from CF API
    let submissions: Vec<CFSubmission> = fetch_cf_submissions(&friend.cf_handle).await?;
    
    // Filter for AC (Accepted) submissions only
    let ac_submissions: Vec<CFSubmission> = submissions
        .into_iter()
        .filter(|s| s.verdict.as_deref() == Some("OK"))
        .collect();
    
    let mut imported_count = 0;
    
    for sub in ac_submissions {
        if let Some(contest_id) = sub.problem.contest_id {
            let problem_url = format!(
                "http://codeforces.com/problemset/problem/{}/{}",
                contest_id,
                sub.problem.index
            );
            
            let problem_id = format!("cf_{}_{}", contest_id, sub.problem.index);
            let solved_at = DateTime::from_timestamp(sub.creation_time_seconds, 0)
                .unwrap_or(Utc::now());
            
            // Insert submission (ignore if duplicate)
            let result: PgQueryResult = sqlx::query(
                r#"
                INSERT INTO cf_friend_submissions 
                (id, friend_id, problem_id, problem_name, problem_url, contest_id, problem_index, difficulty, solved_at, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
            .bind(solved_at)
            .bind(Utc::now())
            .execute(pool)
            .await?;
            
            if result.rows_affected() > 0 {
                imported_count += 1;
            }
        }
    }
    
    // Update last_synced_at
    sqlx::query("UPDATE cf_friends SET last_synced_at = $1 WHERE id = $2")
        .bind(Utc::now())
        .bind(&friend.id)
        .execute(pool)
        .await
        .map_err(|e| PosError::Database(format!("Failed to update sync time: {}", e)))?;
    
    Ok(imported_count)
}

#[tauri::command]
pub async fn delete_cf_friend(
    db: State<'_, PosDb>,
    friend_id: String,
) -> Result<(), PosError> {
    let pool = &db.0;
    
    // Delete submissions first
    sqlx::query("DELETE FROM cf_friend_submissions WHERE friend_id = $1")
        .bind(&friend_id)
        .execute(pool)
        .await
        .map_err(|e| PosError::Database(format!("Failed to delete submissions: {}", e)))?;
    
    // Delete friend
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
    friend_ids: Vec<String>,
    min_difficulty: Option<i32>,
    max_difficulty: Option<i32>,
    limit: Option<i32>,
) -> Result<Vec<FriendsLadderProblem>, PosError> {
    let pool = &db.0;
    let limit = limit.unwrap_or(100);
    
    // Build query with optional difficulty filters
    let mut query = String::from(
        r#"
        SELECT 
            problem_id,
            problem_name,
            problem_url,
            difficulty,
            COUNT(DISTINCT friend_id) as solved_by_count,
            ARRAY_AGG(DISTINCT f.name) as solved_by_friends,
            MAX(solved_at) as most_recent_solve
        FROM cf_friend_submissions s
        JOIN cf_friends f ON s.friend_id = f.id
        WHERE 1=1
        "#,
    );
    
    if !friend_ids.is_empty() {
        query.push_str(" AND friend_id = ANY($1)");
    }
    if min_difficulty.is_some() {
        query.push_str(" AND difficulty >= $2");
    }
    if max_difficulty.is_some() {
        query.push_str(" AND difficulty <= $3");
    }
    
    query.push_str(
        r#"
        GROUP BY problem_id, problem_name, problem_url, difficulty
        ORDER BY solved_by_count DESC, most_recent_solve DESC
        LIMIT $4
        "#,
    );
    
    // Execute query (simplified - would need proper parameter binding)
    let problems: Vec<FriendsLadderProblem> = sqlx::query_as(&query)
        .bind(&friend_ids[..])
        .bind(min_difficulty.unwrap_or(0))
        .bind(max_difficulty.unwrap_or(4000))
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|e| PosError::Database(format!("Failed to generate ladder: {}", e)))?;
    
    Ok(problems)
}
