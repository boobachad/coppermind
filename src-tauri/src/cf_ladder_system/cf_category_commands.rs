// CF Category Commands
// Extracted from cf_ladder_system.rs to keep files under 600 lines

use chrono::Utc;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;
use super::cf_ladder_types::*;
use super::cf_ladder_parser::parse_category_html;

// ─── Get Category by ID ─────────────────────────────────────────────

#[tauri::command]
pub async fn get_category_by_id(
    category_id: String,
    db: State<'_, PosDb>,
) -> PosResult<CFCategoryRow> {
    let category = sqlx::query_as::<sqlx::Postgres, CFCategoryRow>(
        "SELECT id, name, description, problem_count, created_at FROM cf_categories WHERE id = $1"
    )
    .bind(&category_id)
    .fetch_optional(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_category_by_id", e))?
    .ok_or_else(|| PosError::NotFound(format!("Category not found: {}", category_id)))?;

    Ok(category)
}

// ─── Get Category Stats ─────────────────────────────────────────────

#[tauri::command]
pub async fn get_category_stats(
    category_id: String,
    db: State<'_, PosDb>,
) -> PosResult<LadderStats> {
    log::info!("[CF CATEGORY STATS] Getting stats for category: {}", category_id);
    
    let total: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        "SELECT COUNT(*) FROM cf_category_problems WHERE category_id = $1"
    )
    .bind(&category_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count cf_category_problems", e))?;

    log::info!("[CF CATEGORY STATS] Total problems in category: {}", total);

    let solved: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        r#"
        SELECT COUNT(DISTINCT p.problem_id)
        FROM cf_category_problems p
        WHERE p.category_id = $1
        AND EXISTS (
            SELECT 1 FROM pos_submissions s 
            WHERE s.problem_id = ('cf-' || p.problem_id) 
            AND s.platform = 'codeforces' 
            AND s.verdict = 'OK'
        )
        "#
    )
    .bind(&category_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count solved", e))?;

    log::info!("[CF CATEGORY STATS] Solved problems: {}", solved);

    let attempted: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        r#"
        SELECT COUNT(DISTINCT p.problem_id)
        FROM cf_category_problems p
        WHERE p.category_id = $1
        AND EXISTS (
            SELECT 1 FROM pos_submissions s 
            WHERE s.problem_id = ('cf-' || p.problem_id) 
            AND s.platform = 'codeforces'
        )
        "#
    )
    .bind(&category_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count attempted", e))?;

    log::info!("[CF CATEGORY STATS] Attempted problems: {}", attempted);

    let unsolved = (total - attempted).max(0);
    let percentage = if total > 0 { (solved as f64 / total as f64) * 100.0 } else { 0.0 };

    log::info!("[CF CATEGORY STATS] Final stats - Total: {}, Solved: {}, Attempted: {}, Unsolved: {}, Percentage: {:.2}%", 
        total, solved, attempted, unsolved, percentage);

    Ok(LadderStats {
        total_problems: total as i32,
        solved: solved as i32,
        attempted: attempted as i32,
        unsolved: unsolved as i32,
        progress_percentage: percentage,
    })
}

// ─── Import Category ────────────────────────────────────────────────

#[tauri::command]
pub async fn import_category_from_html(
    req: ImportCategoryRequest,
    db: State<'_, PosDb>,
) -> PosResult<CFCategoryRow> {
    let parsed = parse_category_html(&req.html_content)?;
    let name = req.category_name.unwrap_or(parsed.name);
    
    let category_id = gen_id();
    let now = Utc::now();
    
    sqlx::query::<sqlx::Postgres>(
        "INSERT INTO cf_categories (id, name, description, problem_count, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET problem_count = $4
         RETURNING id, name, description, problem_count, created_at"
    )
    .bind(&category_id)
    .bind(&name)
    .bind::<Option<String>>(None)
    .bind(parsed.problems.len() as i32)
    .bind(now)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("insert cf_category", e))?;
    
    let actual_cat_id: String = sqlx::query_scalar("SELECT id FROM cf_categories WHERE name = $1")
        .bind(&name)
        .fetch_one(&db.0)
        .await
        .map_err(|e| db_context("fetch cat id", e))?;

    for problem in parsed.problems {
        let problem_row_id = gen_id();
        sqlx::query::<sqlx::Postgres>(
            "INSERT INTO cf_category_problems 
             (id, category_id, problem_id, problem_name, problem_url, position, difficulty, online_judge, year, contest, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (category_id, problem_id) DO NOTHING"
        )
        .bind(&problem_row_id)
        .bind(&actual_cat_id)
        .bind(&problem.problem_id)
        .bind(&problem.name)
        .bind(&problem.url)
        .bind(problem.position)
        .bind(problem.difficulty)
        .bind(&problem.judge)
        .bind(&problem.year)
        .bind(&problem.contest)
        .bind(now)
        .execute(&db.0)
        .await
        .map_err(|e| db_context("insert cf_category_problem", e))?;
    }
    
    let category = sqlx::query_as::<sqlx::Postgres, CFCategoryRow>(
        "SELECT id, name, description, problem_count, created_at FROM cf_categories WHERE id = $1"
    )
    .bind(&actual_cat_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_category", e))?;
    
    Ok(category)
}

// ─── Get Categories ─────────────────────────────────────────────────

#[tauri::command]
pub async fn get_categories(
    db: State<'_, PosDb>,
) -> PosResult<Vec<CFCategoryRow>> {
    let categories = sqlx::query_as::<sqlx::Postgres, CFCategoryRow>(
        "SELECT id, name, description, problem_count, created_at FROM cf_categories ORDER BY created_at DESC"
    )
    .fetch_all(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_categories", e))?;
    
    Ok(categories)
}

// ─── Get Category Problems ──────────────────────────────────────────

#[tauri::command]
pub async fn get_category_problems(
    db: State<'_, PosDb>,
    category_id: String,
) -> PosResult<Vec<CFLadderProblemRow>> {
    let problems = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
        r#"
        SELECT
            p.id,
            p.category_id   AS ladder_id,
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
        FROM cf_category_problems p
        LEFT JOIN cf_friend_submissions fs ON p.problem_url = fs.problem_url
        LEFT JOIN cf_friends f ON fs.friend_id = f.id
        WHERE p.category_id = $1
        GROUP BY p.id
        ORDER BY 
            CASE 
                WHEN (SELECT s.verdict FROM pos_submissions s WHERE s.problem_id = ('cf-' || p.problem_id) AND s.platform = 'codeforces' ORDER BY s.submitted_time DESC LIMIT 1) = 'OK' THEN 1
                WHEN (SELECT s.verdict FROM pos_submissions s WHERE s.problem_id = ('cf-' || p.problem_id) AND s.platform = 'codeforces' ORDER BY s.submitted_time DESC LIMIT 1) IS NOT NULL THEN 2
                ELSE 3
            END,
            p.position
        "#,
    )
    .bind(&category_id)
    .fetch_all(&db.0)
    .await
    .map_err(|e| db_context("get_category_problems", e))?;

    Ok(problems)
}

// ─── Update Category Problem ────────────────────────────────────────

#[tauri::command]
pub async fn update_category_problem(
    db: State<'_, PosDb>,
    problem_id: String,
    year: Option<String>,
    contest: Option<String>,
) -> PosResult<()> {
    let mut query = String::from("UPDATE cf_category_problems SET ");
    let mut updates = Vec::new();
    let mut param_count = 1;
    
    if year.is_some() {
        updates.push(format!("year = ${}", param_count));
        param_count += 1;
    }
    
    if contest.is_some() {
        updates.push(format!("contest = ${}", param_count));
        param_count += 1;
    }
    
    if updates.is_empty() {
        return Ok(());
    }
    
    query.push_str(&updates.join(", "));
    query.push_str(&format!(" WHERE problem_id = ${}", param_count));
    
    let mut q = sqlx::query(&query);
    
    if let Some(y) = year {
        q = q.bind(if y.is_empty() { None } else { Some(y) });
    }
    
    if let Some(c) = contest {
        q = q.bind(if c.is_empty() { None } else { Some(c) });
    }
    
    q = q.bind(&problem_id);
    
    q.execute(&db.0)
        .await
        .map_err(|e| db_context("update category problem", e))?;
    
    Ok(())
}

// ─── Scan and Import Public Data ────────────────────────────────────

#[tauri::command]
pub async fn scan_and_import_public_data(
    db: State<'_, PosDb>,
) -> PosResult<String> {
    use std::fs;
    use std::path::Path;
    
    let base_path = Path::new("../public/cf-data");
    let ladders_path = base_path.join("ladders");
    let categories_path = base_path.join("categories");
    
    let mut stats = Vec::new();
    
    // Import Ladders
    if ladders_path.exists() {
        let mut count = 0;
        if let Ok(entries) = fs::read_dir(ladders_path) {
            for entry in entries.flatten() {
                if let Some(ext) = entry.path().extension() {
                    if ext == "html" {
                        if let Ok(content) = fs::read_to_string(entry.path()) {
                            let req = ImportLadderRequest {
                                html_content: content,
                                source: "A2OJ".to_string(),
                            };
                            if let Ok(ladder) = super::cf_ladder_commands::import_ladder_from_html(req, db.clone()).await {
                                log::info!("Imported ladder: {}", ladder.name);
                                count += 1;
                            }
                        }
                    }
                }
            }
        }
        stats.push(format!("Imported {} ladders", count));
    } else {
        stats.push("Ladders directory not found".to_string());
    }
    
    // Import Categories
    if categories_path.exists() {
        let mut count = 0;
        if let Ok(entries) = fs::read_dir(categories_path) {
            for entry in entries.flatten() {
                if let Some(ext) = entry.path().extension() {
                    if ext == "html" {
                        if let Ok(content) = fs::read_to_string(entry.path()) {
                            let req = ImportCategoryRequest {
                                html_content: content,
                                category_name: None,
                            };
                            if let Ok(cat) = import_category_from_html(req, db.clone()).await {
                                log::info!("Imported category: {}", cat.name);
                                count += 1;
                            }
                        }
                    }
                }
            }
        }
        stats.push(format!("Imported {} categories", count));
    } else {
        stats.push("Categories directory not found".to_string());
    }
    
    Ok(stats.join(", "))
}
