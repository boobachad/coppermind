// CF Ladder Bulk Operations
// Extracted to keep files under 600 lines

use chrono::Utc;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;
use super::cf_ladder_types::*;

// ─── URL Parsing ────────────────────────────────────────────────────

/// Parse problem URL to extract judge, problem_id, and name
/// Supports Codeforces and LeetCode URLs
fn parse_problem_url(url: &str) -> Result<(String, String, String), String> {
    let url = url.trim();
    
    // Codeforces: https://codeforces.com/problemset/problem/1234/A
    // Codeforces: https://codeforces.com/contest/1234/problem/A
    if url.contains("codeforces.com") {
        if let Some(problem_part) = url.split("/problem/").nth(1) {
            let parts: Vec<&str> = problem_part.split('/').collect();
            if parts.len() >= 2 {
                let contest_id = parts[0];
                let problem_letter = parts[1];
                let problem_id = format!("{}{}", contest_id, problem_letter);
                let name = format!("Problem {}", problem_letter);
                return Ok(("Codeforces".to_string(), problem_id, name));
            }
        }
        return Err(format!("Invalid Codeforces URL format: {}", url));
    }
    
    // LeetCode: https://leetcode.com/problems/two-sum/
    // LeetCode: https://leetcode.com/problems/two-sum/description/
    if url.contains("leetcode.com/problems/") {
        if let Some(problem_part) = url.split("/problems/").nth(1) {
            let slug = problem_part.trim_end_matches('/').split('/').next().unwrap_or("");
            if !slug.is_empty() {
                let problem_id = slug.to_string();
                // Convert slug to title case: "two-sum" -> "Two Sum"
                let name = slug
                    .split('-')
                    .map(|word| {
                        let mut chars = word.chars();
                        match chars.next() {
                            None => String::new(),
                            Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(" ");
                return Ok(("LeetCode".to_string(), problem_id, name));
            }
        }
        return Err(format!("Invalid LeetCode URL format: {}", url));
    }
    
    Err(format!("Unsupported URL format (only Codeforces and LeetCode supported): {}", url))
}

// ─── Custom Ladder Management ───────────────────────────────────────

/// Get or create "My Practice Ladder" for custom problem additions
async fn get_or_create_custom_ladder(db: &PosDb) -> PosResult<String> {
    let ladder_name = "My Practice Ladder";
    
    // Check if ladder exists
    let existing = sqlx::query_scalar::<sqlx::Postgres, String>(
        "SELECT id FROM cf_ladders WHERE name = $1 AND source = 'Custom'"
    )
    .bind(ladder_name)
    .fetch_optional(&db.0)
    .await
    .map_err(|e| db_context("check custom ladder", e))?;
    
    if let Some(id) = existing {
        return Ok(id);
    }
    
    // Create new ladder
    let ladder_id = gen_id();
    let now = Utc::now();
    
    sqlx::query(
        r#"INSERT INTO cf_ladders 
           (id, name, description, rating_min, rating_max, difficulty, source, problem_count, created_at)
           VALUES ($1, $2, $3, NULL, NULL, NULL, 'Custom', 0, $4)"#
    )
    .bind(&ladder_id)
    .bind(ladder_name)
    .bind("Custom practice problems added via bulk import")
    .bind(now)
    .execute(&db.0)
    .await
    .map_err(|e| db_context("create custom ladder", e))?;
    
    log::info!("[CF] Created custom ladder: {}", ladder_id);
    Ok(ladder_id)
}

// ─── Bulk Add Command ───────────────────────────────────────────────

/// Bulk add problems from URLs
#[tauri::command]
pub async fn bulk_add_problems(
    req: BulkAddProblemsRequest,
    db: State<'_, PosDb>,
) -> PosResult<BulkAddProblemsResponse> {
    let mut added_count = 0;
    let mut skipped_count = 0;
    let mut errors = Vec::new();
    
    let ladder_id = get_or_create_custom_ladder(&db).await?;
    let now = Utc::now();
    
    // Get current max position in ladder
    let max_position: Option<i32> = sqlx::query_scalar(
        "SELECT MAX(position) FROM cf_ladder_problems WHERE ladder_id = $1"
    )
    .bind(&ladder_id)
    .fetch_optional(&db.0)
    .await
    .map_err(|e| db_context("get max position", e))?
    .flatten();
    
    let mut current_position = max_position.unwrap_or(0);
    
    for url in &req.urls {
        let url = url.trim();
        if url.is_empty() {
            continue;
        }
        
        // Parse URL
        let (judge, problem_id, name) = match parse_problem_url(url) {
            Ok(parsed) => parsed,
            Err(e) => {
                errors.push(format!("{}: {}", url, e));
                skipped_count += 1;
                continue;
            }
        };
        
        // Check if problem already exists in this ladder
        let exists = sqlx::query_scalar::<sqlx::Postgres, bool>(
            "SELECT EXISTS(SELECT 1 FROM cf_ladder_problems WHERE ladder_id = $1 AND problem_id = $2)"
        )
        .bind(&ladder_id)
        .bind(&problem_id)
        .fetch_one(&db.0)
        .await
        .map_err(|e| db_context("check problem exists", e))?;
        
        if exists {
            errors.push(format!("{}: Problem already in ladder", url));
            skipped_count += 1;
            continue;
        }
        
        current_position += 1;
        let lp_id = gen_id();
        
        // Insert into cf_ladder_problems
        sqlx::query(
            r#"INSERT INTO cf_ladder_problems 
               (id, ladder_id, problem_id, problem_name, problem_url, position, difficulty, online_judge, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)"#
        )
        .bind(&lp_id)
        .bind(&ladder_id)
        .bind(&problem_id)
        .bind(&name)
        .bind(url)
        .bind(current_position)
        .bind(&judge)
        .bind(now)
        .execute(&db.0)
        .await
        .map_err(|e| {
            errors.push(format!("{}: Database error", url));
            db_context("insert ladder problem", e)
        })?;
        
        // Handle GoalForToday action
        if matches!(req.action, BulkAction::GoalForToday) {
            let goal_id = gen_id();
            let today = Utc::now().format("%Y-%m-%d").to_string();
            let due_date = Utc::now();
            
            // Create unified goal
            sqlx::query(
                r#"INSERT INTO unified_goals 
                   (id, text, due_date, due_date_local, completed, is_debt, problem_id, created_at)
                   VALUES ($1, $2, $3, $4, FALSE, FALSE, $5, $6)"#
            )
            .bind(&goal_id)
            .bind(&format!("Solve: {}", name))
            .bind(due_date)
            .bind(&today)
            .bind(&problem_id)
            .bind(now)
            .execute(&db.0)
            .await
            .map_err(|e| {
                errors.push(format!("{}: Failed to create goal", url));
                db_context("create goal", e)
            })?;
        }
        
        added_count += 1;
    }
    
    // Update ladder problem_count
    sqlx::query("UPDATE cf_ladders SET problem_count = (SELECT COUNT(*) FROM cf_ladder_problems WHERE ladder_id = $1) WHERE id = $1")
        .bind(&ladder_id)
        .execute(&db.0)
        .await
        .map_err(|e| db_context("update ladder count", e))?;
    
    log::info!("[CF] Bulk add: {} added, {} skipped, {} errors", added_count, skipped_count, errors.len());
    
    Ok(BulkAddProblemsResponse {
        added_count,
        skipped_count,
        errors,
    })
}
