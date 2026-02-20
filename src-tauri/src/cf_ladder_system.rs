use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;
use scraper::{Html, Selector, ElementRef};

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;

// ─── Row Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CFLadderRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub rating_min: Option<i32>,
    pub rating_max: Option<i32>,
    pub difficulty: Option<i32>,
    pub source: String,
    pub problem_count: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CFLadderProblemRow {
    pub id: String,
    pub ladder_id: String,
    pub problem_id: String,
    pub problem_name: String,
    pub problem_url: String,
    pub position: i32,
    pub difficulty: Option<i32>,
    pub online_judge: String,
    pub created_at: DateTime<Utc>,
    #[sqlx(default)]
    pub solved_by_friends: Option<Vec<String>>,
    #[sqlx(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CFLadderProgressRow {
    pub id: String,
    pub ladder_id: String,
    pub problem_id: String,
    pub solved_at: Option<DateTime<Utc>>,
    pub attempts: i32,
    pub created_at: DateTime<Utc>,
}

// ─── Request Types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLadderRequest {
    pub html_content: String,
    pub source: String, // "A2OJ" | "Custom"
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackProgressRequest {
    pub ladder_id: String,
    pub problem_id: String,
    pub solved: bool,
}

// ─── Response Types ─────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LadderStats {
    pub total_problems: i32,
    pub solved: i32,
    pub attempted: i32,
    pub unsolved: i32,
    pub progress_percentage: f64,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CFCategoryRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub problem_count: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCategoryRequest {
    pub html_content: String,
    pub category_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyRecommendation {
    pub problem_id: String,
    pub problem_name: String,
    pub problem_url: String,
    pub online_judge: String,
    pub difficulty: Option<i32>,
    pub reason: String,
    pub strategy: String,
}

// ─── HTML Parser ────────────────────────────────────────────────────

pub fn parse_ladder_html(html: &str) -> PosResult<(String, Option<String>, Vec<ParsedProblem>)> {
    let document = Html::parse_document(html);
    
    // Extract title
    let title_sel = Selector::parse("title").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let title = document.select(&title_sel)
        .next()
        .map(|el: ElementRef| el.text().collect::<String>())
        .unwrap_or_default()
        .trim()
        .to_string();
    
    // Extract description from table if exists
    let desc_sel = Selector::parse("table tr td[colspan]").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let description = document.select(&desc_sel)
        .filter(|el: &ElementRef| el.text().collect::<String>().contains("Description"))
        .next()
        .map(|el: ElementRef| el.text().collect::<String>().trim().to_string());
    
    // Parse problem table
    let table_sel = Selector::parse("table").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let row_sel = Selector::parse("tr").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let cell_sel = Selector::parse("td").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let link_sel = Selector::parse("a").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    
    let mut problems = Vec::new();
    
    for table in document.select(&table_sel) {
        let rows = table.select(&row_sel);
        for (idx, row) in rows.enumerate() {
            if idx == 0 { continue; } // Skip header
            
            let cells: Vec<ElementRef> = row.select(&cell_sel).collect();
            if cells.len() < 3 { continue; }
            
            // Column 1: Position/ID
            let position = cells[0].text().collect::<String>().trim().parse::<i32>().unwrap_or(idx as i32);
            
            // Column 2: Problem name + URL
            if let Some(link) = cells[1].select(&link_sel).next() {
                let name = link.text().collect::<String>().trim().to_string();
                let url = link.value().attr("href").unwrap_or("").to_string();
                
                // Column 3: Online Judge
                let judge = if cells.len() > 2 {
                    cells[2].text().collect::<String>().trim().to_string()
                } else {
                    "Codeforces".to_string()
                };
                
                // Column 4: Difficulty (if exists)
                let difficulty = if cells.len() > 3 {
                    cells[cells.len() - 1].text().collect::<String>().trim().parse::<i32>().ok()
                } else {
                    None
                };
                
                // Extract problem_id from URL (e.g., "472D" from codeforces.com/problemset/problem/472/D)
                let problem_id = extract_problem_id(&url).unwrap_or_else(|| format!("prob_{}", position));
                
                problems.push(ParsedProblem {
                    position,
                    problem_id,
                    name,
                    url,
                    judge,
                    difficulty,
                });
            }
        }
    }
    
    Ok((title, description, problems))
}

#[derive(Debug, Clone)]
pub struct ParsedProblem {
    pub position: i32,
    pub problem_id: String,
    pub name: String,
    pub url: String,
    pub judge: String,
    pub difficulty: Option<i32>,
}

fn extract_problem_id(url: &str) -> Option<String> {
    // Handle Codeforces: http://codeforces.com/problemset/problem/472/D -> 472D
    if url.contains("codeforces.com/problemset/problem/") {
        let parts: Vec<&str> = url.split('/').collect();
        if parts.len() >= 2 {
            let contest_id = parts[parts.len() - 2];
            let index = parts[parts.len() - 1];
            return Some(format!("{}{}", contest_id, index));
        }
    }
    // For other judges, use URL hash
    None
}

// ─── Commands ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn import_ladder_from_html(
    req: ImportLadderRequest,
    db: State<'_, PosDb>,
) -> PosResult<CFLadderRow> {
    let (title, description, problems) = parse_ladder_html(&req.html_content)?;
    
    let now = Utc::now();

    // Check if ladder already exists
    let existing_ladder = sqlx::query_scalar::<sqlx::Postgres, String>(
        "SELECT id FROM cf_ladders WHERE name = $1 AND source = $2"
    )
    .bind(&title)
    .bind(&req.source)
    .fetch_optional(&db.0)
    .await
    .map_err(|e| db_context("check existing ladder", e))?;

    let ladder_id = if let Some(id) = existing_ladder {
        // Update existing ladder
        sqlx::query(
            "UPDATE cf_ladders SET description = $1, problem_count = $2 WHERE id = $3"
        )
        .bind(&description)
        .bind(problems.len() as i32)
        .bind(&id)
        .execute(&db.0)
        .await
        .map_err(|e| db_context("update cf_ladder", e))?;
        id
    } else {
        // Insert new ladder
        let new_id = gen_id();
        sqlx::query(
            "INSERT INTO cf_ladders (id, name, description, source, problem_count, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)"
        )
        .bind(&new_id)
        .bind(&title)
        .bind(&description)
        .bind(&req.source)
        .bind(problems.len() as i32)
        .bind(now)
        .execute(&db.0)
        .await
        .map_err(|e| db_context("insert cf_ladder", e))?;
        new_id
    };
    
    // Insert problems (preventing duplicates via manual check)
    for problem in problems {
        let problem_row_id = gen_id();
        
        // We check existence manually because there is no unique constraint on (ladder_id, problem_id)
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
    
    // Fetch and return
    let ladder = sqlx::query_as::<sqlx::Postgres, CFLadderRow>(
        "SELECT id, name, description, rating_min, rating_max, difficulty, source, problem_count, created_at FROM cf_ladders WHERE id = $1"
    )
    .bind(&ladder_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_ladder", e))?;
    
    Ok(ladder)
}

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
        ORDER BY p.position
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

#[tauri::command]
pub async fn track_ladder_progress(
    req: TrackProgressRequest,
    db: State<'_, PosDb>,
) -> PosResult<CFLadderProgressRow> {
    let progress_id = gen_id();
    let now = Utc::now();
    
    // Upsert progress
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

    // Count solved problems (verdict = OK)
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

    // Count attempted (has ANY submission, including OK, WRONG_ANSWER, COMPILATION_ERROR, etc.)
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

// ─── Ladder by ID ────────────────────────────────────────────────────

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

// ─── Categories ─────────────────────────────────────────────────────

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

    // Count solved problems (verdict = OK)
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

    // Count attempted (has ANY submission)
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

pub fn parse_category_html(html: &str) -> PosResult<(String, Vec<ParsedProblem>)> {
    let document = Html::parse_document(html);
    
    // Extract title (e.g., "A2OJ Category: Numerical_Integration")
    let title_sel = Selector::parse("title").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let raw_title = document.select(&title_sel)
        .next()
        .map(|el: ElementRef| el.text().collect::<String>())
        .unwrap_or_default()
        .trim()
        .to_string();
    
    let category_name = raw_title.replace("A2OJ Category:", "").trim().to_string();
    
    // Parse problem table
    let table_sel = Selector::parse("table").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let row_sel = Selector::parse("tr").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let cell_sel = Selector::parse("td").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    let link_sel = Selector::parse("a").map_err(|_| PosError::InvalidInput("Invalid selector".into()))?;
    
    let mut problems = Vec::new();
    
    for table in document.select(&table_sel) {
        let rows = table.select(&row_sel);
        for (idx, row) in rows.enumerate() {
            if idx == 0 { continue; } // Skip header
            
            let cells: Vec<ElementRef> = row.select(&cell_sel).collect();
            // Category table has ~6 cols: Id, Name, Judge, Year, Contest, Difficulty
            if cells.len() < 3 { continue; }
            
            // Col 0: Position
            let position = cells[0].text().collect::<String>().trim().parse::<i32>().unwrap_or(idx as i32);
            
            // Col 1: Problem name + URL
            if let Some(link) = cells[1].select(&link_sel).next() {
                let name = link.text().collect::<String>().trim().to_string();
                let url = link.value().attr("href").unwrap_or("").to_string();
                
                // Col 2: Online Judge
                let judge = cells[2].text().collect::<String>().trim().to_string();
                
                // Col 5: Difficulty (if exists)
                let difficulty = if cells.len() > 5 {
                    cells[5].text().collect::<String>().trim().parse::<i32>().ok()
                } else {
                    None
                };
                
                let problem_id = extract_problem_id(&url).unwrap_or_else(|| format!("cat_prob_{}", position));
                
                problems.push(ParsedProblem {
                    position,
                    problem_id,
                    name,
                    url,
                    judge,
                    difficulty,
                });
            }
        }
    }
    
    Ok((category_name, problems))
}

#[tauri::command]
pub async fn import_category_from_html(
    req: ImportCategoryRequest,
    db: State<'_, PosDb>,
) -> PosResult<CFCategoryRow> {
    let (parsed_name, problems) = parse_category_html(&req.html_content)?;
    let name = req.category_name.unwrap_or(parsed_name);
    
    let category_id = gen_id();
    let now = Utc::now();
    
    // Insert category
    sqlx::query::<sqlx::Postgres>(
        "INSERT INTO cf_categories (id, name, description, problem_count, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO UPDATE SET problem_count = $4
         RETURNING id, name, description, problem_count, created_at"
    )
    .bind(&category_id)
    .bind(&name)
    .bind::<Option<String>>(None)
    .bind(problems.len() as i32)
    .bind(now)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("insert cf_category", e))?;
    
    // Fetch the actual ID (in case of conflict update, we need the existing ID for FKs)
    let actual_cat_id: String = sqlx::query_scalar("SELECT id FROM cf_categories WHERE name = $1")
        .bind(&name)
        .fetch_one(&db.0)
        .await
        .map_err(|e| db_context("fetch cat id", e))?;

    // Insert problems
    for problem in problems {
        let problem_row_id = gen_id();
        sqlx::query::<sqlx::Postgres>(
            "INSERT INTO cf_category_problems 
             (id, category_id, problem_id, problem_name, problem_url, position, difficulty, online_judge, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        .bind(now)
        .execute(&db.0)
        .await
        .map_err(|e| db_context("insert cf_category_problem", e))?;
    }
    
    // Return row
    let category = sqlx::query_as::<sqlx::Postgres, CFCategoryRow>(
        "SELECT id, name, description, problem_count, created_at FROM cf_categories WHERE id = $1"
    )
    .bind(&actual_cat_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_category", e))?;
    
    Ok(category)
}

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

#[tauri::command]
pub async fn get_category_problems(
    db: State<'_, PosDb>,
    category_id: String,
) -> PosResult<Vec<CFLadderProblemRow>> {
    // Reuse CFLadderProblemRow — same shape as cf_category_problems
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
        ORDER BY p.position
        "#,
    )
    .bind(&category_id)
    .fetch_all(&db.0)
    .await
    .map_err(|e| db_context("get_category_problems", e))?;

    Ok(problems)
}

#[tauri::command]
pub async fn scan_and_import_public_data(
    db: State<'_, PosDb>,
) -> PosResult<String> {
    use std::fs;
    use std::path::Path;
    
    // Assume we are running from src-tauri, so look in ../public/cf-data
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
                            if let Ok(ladder) = import_ladder_from_html(req, db.clone()).await {
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

// ─── Post-Scrape Sync ───────────────────────────────────────────────

/// Syncs pos_submissions (Codeforces) with cf_ladder_progress and cf_category_progress.
/// Call this after a successful Codeforces scrape.
#[tauri::command]
pub async fn sync_ladder_progress_from_submissions(
    db: State<'_, PosDb>,
) -> PosResult<String> {
    let now = Utc::now();
    let pool = &db.0;

    log::info!("[CF SYNC] Starting ladder progress sync...");

    // Debug: Check what we have in pos_submissions
    let cf_submissions_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pos_submissions WHERE platform = 'codeforces' AND verdict = 'OK'"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    
    log::info!("[CF SYNC] Found {} OK Codeforces submissions in pos_submissions", cf_submissions_count);

    // Debug: Check ladder problems
    let ladder_problems_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM cf_ladder_problems"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    
    log::info!("[CF SYNC] Found {} problems in cf_ladder_problems", ladder_problems_count);

    // Debug: Check potential matches
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
    
    log::info!("[CF SYNC] Found {} potential ladder matches (submissions that match ladder problems)", potential_matches);

    // 1. Sync Ladder Progress
    // Match logic: pos_submissions.problem_id = "cf-" + ladder_problem.problem_id
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

    // Debug: Check category problems
    let category_problems_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM cf_category_problems"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0);
    
    log::info!("[CF SYNC] Found {} problems in cf_category_problems", category_problems_count);

    // Debug: Check potential category matches
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

    // 2. Sync Category Progress
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
