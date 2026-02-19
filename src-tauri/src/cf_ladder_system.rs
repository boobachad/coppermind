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
    #[sqlx(default)]
    pub solved_count: i64,
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
    
    let ladder_id = gen_id();
    let now = Utc::now();
    
    // Insert ladder
    sqlx::query::<sqlx::Postgres>(
        "INSERT INTO cf_ladders (id, name, description, source, problem_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&ladder_id)
    .bind(&title)
    .bind(&description)
    .bind(&req.source)
    .bind(problems.len() as i32)
    .bind(now)
    .execute(&db.0)
    .await
    .map_err(|e| db_context("insert cf_ladder", e))?;
    
    // Insert problems
    for problem in problems {
        let problem_row_id = gen_id();
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
    let problems = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
        "SELECT id, ladder_id, problem_id, problem_name, problem_url, position, difficulty, online_judge, created_at FROM cf_ladder_problems WHERE ladder_id = $1 ORDER BY position"
    )
    .bind(&ladder_id)
    .fetch_all(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_ladder_problems", e))?;
    
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
             RETURNING *"
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
             RETURNING *"
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
    let total: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        "SELECT COUNT(*) FROM cf_ladder_problems WHERE ladder_id = $1"
    )
    .bind(&ladder_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count cf_ladder_problems", e))?;

    let solved: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        "SELECT COUNT(*) FROM cf_ladder_progress WHERE ladder_id = $1 AND solved_at IS NOT NULL"
    )
    .bind(&ladder_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count solved", e))?;

    let attempted: i64 = sqlx::query_scalar::<sqlx::Postgres, i64>(
        "SELECT COUNT(*) FROM cf_ladder_progress WHERE ladder_id = $1 AND solved_at IS NULL"
    )
    .bind(&ladder_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("count attempted", e))?;

    let unsolved = (total - solved - attempted).max(0);
    let percentage = if total > 0 { (solved as f64 / total as f64) * 100.0 } else { 0.0 };

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

