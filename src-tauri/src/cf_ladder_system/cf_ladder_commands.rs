// CF Ladder Commands
// Extracted from cf_ladder_system.rs to keep files under 600 lines

use chrono::Utc;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;
use super::cf_ladder_types::*;
use super::cf_ladder_parser::parse_ladder_html;

// ─── Import Ladder ──────────────────────────────────────────────────

#[tauri::command]
pub async fn import_ladder_from_html(
    req: ImportLadderRequest,
    db: State<'_, PosDb>,
) -> PosResult<CFLadderRow> {
    let parsed = parse_ladder_html(&req.html_content)?;
    
    let now = Utc::now();

    // Check if ladder already exists
    let existing_ladder = sqlx::query_scalar::<sqlx::Postgres, String>(
        "SELECT id FROM cf_ladders WHERE name = $1 AND source = $2"
    )
    .bind(&parsed.title)
    .bind(&req.source)
    .fetch_optional(&db.0)
    .await
    .map_err(|e| db_context("check existing ladder", e))?;

    let ladder_id = if let Some(id) = existing_ladder {
        // Update existing ladder with ALL metadata
        sqlx::query(
            "UPDATE cf_ladders SET description = $1, rating_min = $2, rating_max = $3, difficulty = $4, problem_count = $5 WHERE id = $6"
        )
        .bind(&parsed.description)
        .bind(parsed.rating_min)
        .bind(parsed.rating_max)
        .bind(parsed.ladder_difficulty)
        .bind(parsed.problems.len() as i32)
        .bind(&id)
        .execute(&db.0)
        .await
        .map_err(|e| db_context("update cf_ladder", e))?;
        id
    } else {
        // Insert new ladder with ALL metadata
        let new_id = gen_id();
        sqlx::query(
            "INSERT INTO cf_ladders (id, name, description, rating_min, rating_max, difficulty, source, problem_count, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
        )
        .bind(&new_id)
        .bind(&parsed.title)
        .bind(&parsed.description)
        .bind(parsed.rating_min)
        .bind(parsed.rating_max)
        .bind(parsed.ladder_difficulty)
        .bind(&req.source)
        .bind(parsed.problems.len() as i32)
        .bind(now)
        .execute(&db.0)
        .await
        .map_err(|e| db_context("insert cf_ladder", e))?;
        new_id
    };
    
    // Insert problems (preventing duplicates via manual check)
    for problem in parsed.problems {
        let problem_row_id = gen_id();
        
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM cf_ladder_problems WHERE ladder_id = $1 AND problem_id = $2)"
        )
        .bind(&ladder_id)
        .bind(&problem.problem_id)
        .fetch_one(&db.0)
        .await
        .unwrap_or(false);

        if !exists {
             sqlx::query::<sqlx::Postgres>(
                "INSERT INTO cf_ladder_problems 
                 (id, ladder_id, problem_id, problem_name, problem_url, position, difficulty, online_judge, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
            )
            .bind(&problem_row_id)
            .bind(&ladder_id)
            .bind(&problem.problem_id)
            .bind(&problem.name)
            .bind(&problem.url)
            .bind(problem.position)
            .bind(problem.difficulty)
            .bind(&problem.judge)
            .bind(now)
            .execute(&db.0)
            .await
            .map_err(|e| db_context("insert cf_ladder_problem", e))?;
        }
    }
    
    let ladder = sqlx::query_as::<sqlx::Postgres, CFLadderRow>(
        "SELECT id, name, description, rating_min, rating_max, difficulty, source, problem_count, created_at FROM cf_ladders WHERE id = $1"
    )
    .bind(&ladder_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_ladder", e))?;
    
    Ok(ladder)
}

// ─── Get Ladders ────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_ladders(
    db: State<'_, PosDb>,
) -> PosResult<Vec<CFLadderRow>> {
    let ladders = sqlx::query_as::<sqlx::Postgres, CFLadderRow>(
        "SELECT id, name, description, rating_min, rating_max, difficulty, source, problem_count, created_at FROM cf_ladders ORDER BY created_at DESC"
    )
    .fetch_all(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_ladders", e))?;
    
    Ok(ladders)
}

// ─── Get Ladder by ID ───────────────────────────────────────────────

#[tauri::command]
pub async fn get_ladder_by_id(
    ladder_id: String,
    db: State<'_, PosDb>,
) -> PosResult<CFLadderRow> {
    let ladder = sqlx::query_as::<sqlx::Postgres, CFLadderRow>(
        "SELECT id, name, description, rating_min, rating_max, difficulty, source, problem_count, created_at FROM cf_ladders WHERE id = $1"
    )
    .bind(&ladder_id)
    .fetch_optional(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_ladder_by_id", e))?
    .ok_or_else(|| PosError::NotFound(format!("Ladder not found: {}", ladder_id)))?;

    Ok(ladder)
}

// ─── Get Ladder Problems ────────────────────────────────────────────

#[tauri::command]
pub async fn get_ladder_problems(
    ladder_id: String,
    db: State<'_, PosDb>,
) -> PosResult<Vec<CFLadderProblemRow>> {
    log::info!("[CF PROBLEMS] Fetching problems for ladder: {}", ladder_id);
    
    let problems = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
        r#"
        SELECT
            p.id,
            p.ladder_id,
            p.problem_id,
            p.problem_name,
            p.problem_url,
            p.position,
            p.difficulty,
            p.online_judge,
            p.created_at,
            array_remove(array_agg(DISTINCT COALESCE(f.display_name, f.cf_handle)), NULL) as solved_by_friends,
            (
                SELECT s.verdict 
                FROM pos_submissions s 
                WHERE s.problem_id = ('cf-' || p.problem_id) 
                AND s.platform = 'codeforces'
                ORDER BY s.submitted_time DESC
                LIMIT 1
            ) as status
        FROM cf_ladder_problems p
        LEFT JOIN cf_friend_submissions fs ON p.problem_url = fs.problem_url
        LEFT JOIN cf_friends f ON fs.friend_id = f.id
        WHERE p.ladder_id = $1
        GROUP BY p.id
        ORDER BY 
            CASE 
                WHEN (SELECT s.verdict FROM pos_submissions s WHERE s.problem_id = ('cf-' || p.problem_id) AND s.platform = 'codeforces' ORDER BY s.submitted_time DESC LIMIT 1) = 'OK' THEN 1
                WHEN (SELECT s.verdict FROM pos_submissions s WHERE s.problem_id = ('cf-' || p.problem_id) AND s.platform = 'codeforces' ORDER BY s.submitted_time DESC LIMIT 1) IS NOT NULL THEN 2
                ELSE 3
            END,
            p.position
        "#
    )
    .bind(&ladder_id)
    .fetch_all(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_ladder_problems", e))?;

    let solved_count = problems.iter().filter(|p| p.status.as_deref() == Some("OK")).count();
    let attempted_count = problems.iter().filter(|p| p.status.is_some() && p.status.as_deref() != Some("OK")).count();
    let unsolved_count = problems.iter().filter(|p| p.status.is_none()).count();
    
    log::info!("[CF PROBLEMS] Fetched {} problems: {} solved (OK), {} attempted (non-OK), {} unsolved", 
        problems.len(), solved_count, attempted_count, unsolved_count);

    Ok(problems)
}

// ─── Track Ladder Progress ──────────────────────────────────────────

#[tauri::command]
pub async fn track_ladder_progress(
    req: TrackProgressRequest,
    db: State<'_, PosDb>,
) -> PosResult<CFLadderProgressRow> {
    let progress_id = gen_id();
    let now = Utc::now();
    
    let progress = if req.solved {
        sqlx::query_as::<sqlx::Postgres, CFLadderProgressRow>(
            "INSERT INTO cf_ladder_progress (id, ladder_id, problem_id, solved_at, attempts, created_at)
             VALUES ($1, $2, $3, $4, 1, $5)
             ON CONFLICT (ladder_id, problem_id) 
             DO UPDATE SET solved_at = $4, attempts = cf_ladder_progress.attempts + 1
             RETURNING id, ladder_id, problem_id, solved_at, attempts, created_at"
        )
        .bind(&progress_id)
        .bind(&req.ladder_id)
        .bind(&req.problem_id)
        .bind(Some(now))
        .bind(now)
        .fetch_one(&db.0)
        .await
        .map_err(|e| db_context("track cf_ladder_progress", e))?
    } else {
        sqlx::query_as::<sqlx::Postgres, CFLadderProgressRow>(
            "INSERT INTO cf_ladder_progress (id, ladder_id, problem_id, attempts, created_at)
             VALUES ($1, $2, $3, 1, $4)
             ON CONFLICT (ladder_id, problem_id) 
             DO UPDATE SET attempts = cf_ladder_progress.attempts + 1
             RETURNING id, ladder_id, problem_id, solved_at, attempts, created_at"
        )
        .bind(&progress_id)
        .bind(&req.ladder_id)
        .bind(&req.problem_id)
        .bind(now)
        .fetch_one(&db.0)
        .await
        .map_err(|e| db_context("track cf_ladder_progress", e))?
    };
    
    Ok(progress)
}

// ─── Get Ladder Stats ───────────────────────────────────────────────

#[tauri::command]
pub async fn get_ladder_stats(
    ladder_id: String,
    db: State<'_, PosDb>,
) -> PosResult<LadderStats> {
    log::info!("[CF STATS] Getting stats for ladder: {}", ladder_id);
    
    let total: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        "SELECT COUNT(*) FROM cf_ladder_problems WHERE ladder_id = $1"
    )
    .bind(&ladder_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count cf_ladder_problems", e))?;

    log::info!("[CF STATS] Total problems in ladder: {}", total);

    let solved: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        r#"
        SELECT COUNT(DISTINCT p.problem_id)
        FROM cf_ladder_problems p
        WHERE p.ladder_id = $1
        AND EXISTS (
            SELECT 1 FROM pos_submissions s 
            WHERE s.problem_id = ('cf-' || p.problem_id) 
            AND s.platform = 'codeforces' 
            AND s.verdict = 'OK'
        )
        "#
    )
    .bind(&ladder_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count solved", e))?;

    log::info!("[CF STATS] Solved problems: {}", solved);

    let attempted: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        r#"
        SELECT COUNT(DISTINCT p.problem_id)
        FROM cf_ladder_problems p
        WHERE p.ladder_id = $1
        AND EXISTS (
            SELECT 1 FROM pos_submissions s 
            WHERE s.problem_id = ('cf-' || p.problem_id) 
            AND s.platform = 'codeforces'
        )
        "#
    )
    .bind(&ladder_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count attempted", e))?;

    log::info!("[CF STATS] Attempted problems (any submission): {}", attempted);

    let unsolved = (total - attempted).max(0);
    let percentage = if total > 0 { (solved as f64 / total as f64) * 100.0 } else { 0.0 };

    log::info!("[CF STATS] Final stats - Total: {}, Solved: {}, Attempted: {}, Unsolved: {}, Percentage: {:.2}%", 
        total, solved, attempted, unsolved, percentage);

    Ok(LadderStats {
        total_problems: total as i32,
        solved: solved as i32,
        attempted: attempted as i32,
        unsolved: unsolved as i32,
        progress_percentage: percentage,
    })
}

// ─── Sync Ladder Progress ───────────────────────────────────────────

#[tauri::command]
pub async fn sync_ladder_progress_from_submissions(
    db: State<'_, PosDb>,
) -> PosResult<String> {
    let now = Utc::now();
    let pool = &db.0;

    log::info!("[CF SYNC] Starting ladder progress sync...");

    let cf_submissions_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pos_submissions WHERE platform = 'codeforces' AND verdict = 'OK'"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    
    log::info!("[CF SYNC] Found {} OK Codeforces submissions in pos_submissions", cf_submissions_count);

    let ladder_problems_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM cf_ladder_problems"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    
    log::info!("[CF SYNC] Found {} problems in cf_ladder_problems", ladder_problems_count);

    let potential_matches: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM pos_submissions s
        JOIN cf_ladder_problems lp ON s.problem_id = ('cf-' || lp.problem_id)
        WHERE s.platform = 'codeforces' AND s.verdict = 'OK'
        "#
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    
    log::info!("[CF SYNC] Found {} potential ladder matches", potential_matches);

    let ladder_updated = sqlx::query(
        r#"
        INSERT INTO cf_ladder_progress (id, ladder_id, problem_id, solved_at, attempts, created_at)
        SELECT 
            gen_random_uuid()::text,
            lp.ladder_id,
            lp.problem_id,
            s.submitted_time,
            1,
            $1
        FROM pos_submissions s
        JOIN cf_ladder_problems lp ON s.problem_id = ('cf-' || lp.problem_id)
        LEFT JOIN cf_ladder_progress pr ON pr.ladder_id = lp.ladder_id AND pr.problem_id = lp.problem_id
        WHERE s.platform = 'codeforces' 
          AND s.verdict = 'OK'
          AND pr.id IS NULL
        "#
    )
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| db_context("sync ladder progress", e))?
    .rows_affected();

    log::info!("[CF SYNC] Ladder progress: {} new entries created", ladder_updated);

    let category_problems_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM cf_category_problems"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    
    log::info!("[CF SYNC] Found {} problems in cf_category_problems", category_problems_count);

    let potential_category_matches: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM pos_submissions s
        JOIN cf_category_problems cp ON s.problem_id = ('cf-' || cp.problem_id)
        WHERE s.platform = 'codeforces' AND s.verdict = 'OK'
        "#
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    
    log::info!("[CF SYNC] Found {} potential category matches", potential_category_matches);

    let category_updated = sqlx::query(
        r#"
        INSERT INTO cf_category_progress (id, category_id, problem_id, solved_at, created_at)
        SELECT 
            gen_random_uuid()::text,
            cp.category_id,
            cp.problem_id,
            s.submitted_time,
            $1
        FROM pos_submissions s
        JOIN cf_category_problems cp ON s.problem_id = ('cf-' || cp.problem_id)
        LEFT JOIN cf_category_progress pr ON pr.category_id = cp.category_id AND pr.problem_id = cp.problem_id
        WHERE s.platform = 'codeforces' 
          AND s.verdict = 'OK'
          AND pr.id IS NULL
        "#
    )
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| db_context("sync category progress", e))?
    .rows_affected();

    log::info!("[CF SYNC] Category progress: {} new entries created", category_updated);

    let msg = format!("Synced {} ladder items and {} category items", ladder_updated, category_updated);
    log::info!("[CF SYNC] {}", msg);
    Ok(msg)
}
