// CF Categories & Daily Recommendations
// Split from cf_ladder_system.rs to stay under 600-line file limit

use chrono::Utc;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::utils::gen_id;
use crate::cf_ladder_system::{
    CFCategoryRow, CFLadderProblemRow, DailyRecommendation,
    ImportCategoryRequest, parse_ladder_html,
};

// ─── Categories ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_categories(
    db: State<'_, PosDb>,
) -> PosResult<Vec<CFCategoryRow>> {
    let categories = sqlx::query_as::<sqlx::Postgres, CFCategoryRow>(
        r#"
        SELECT c.*,
               COUNT(CASE WHEN cp.solved_at IS NOT NULL THEN 1 END)::bigint AS solved_count
        FROM cf_categories c
        LEFT JOIN cf_category_progress cp ON cp.category_id = c.id
        GROUP BY c.id
        ORDER BY c.name
        "#,
    )
    .fetch_all(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_categories", e))?;

    Ok(categories)
}

#[tauri::command]
pub async fn import_categories_from_html(
    req: ImportCategoryRequest,
    db: State<'_, PosDb>,
) -> PosResult<CFCategoryRow> {
    // Reuse parse_ladder_html — same table format, category name from title or override
    let (parsed_title, description, problems) = parse_ladder_html(&req.html_content)?;
    let category_name = req.category_name.unwrap_or(parsed_title);
    let category_id = gen_id();
    let now = Utc::now();

    sqlx::query::<sqlx::Postgres>(
        r#"
        INSERT INTO cf_categories (id, name, description, problem_count, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description, problem_count = EXCLUDED.problem_count
        "#,
    )
    .bind(&category_id)
    .bind(&category_name)
    .bind(&description)
    .bind(problems.len() as i32)
    .bind(now)
    .execute(&db.0)
    .await
    .map_err(|e| db_context("upsert cf_category", e))?;

    // Fetch the canonical id (in case of conflict update the existing row was kept)
    let row_id: String = sqlx::query_scalar::<sqlx::Postgres, String>(
        "SELECT id FROM cf_categories WHERE name = $1"
    )
    .bind(&category_name)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_category id", e))?;

    for problem in &problems {
        let prob_id = gen_id();
        sqlx::query::<sqlx::Postgres>(
            r#"
            INSERT INTO cf_category_problems
            (id, category_id, problem_id, problem_name, problem_url, position, difficulty, online_judge, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(&prob_id)
        .bind(&row_id)
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

    let category = sqlx::query_as::<sqlx::Postgres, CFCategoryRow>(
        r#"
        SELECT c.*, 0::bigint AS solved_count
        FROM cf_categories c WHERE c.id = $1
        "#,
    )
    .bind(&row_id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| db_context("fetch cf_category", e))?;

    Ok(category)
}

// ─── Daily Recommendations ───────────────────────────────────────────

#[tauri::command]
pub async fn get_daily_recommendations(
    db: State<'_, PosDb>,
    strategy: String,
    count: Option<i32>,
) -> PosResult<Vec<DailyRecommendation>> {
    let n = count.unwrap_or(5);
    let mut recs: Vec<DailyRecommendation> = Vec::new();

    match strategy.as_str() {
        "ladder" => {
            let rows = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
                r#"
                SELECT p.* FROM cf_ladder_problems p
                LEFT JOIN cf_ladder_progress pr
                  ON pr.ladder_id = p.ladder_id AND pr.problem_id = p.problem_id
                WHERE pr.id IS NULL
                ORDER BY p.position
                LIMIT $1
                "#,
            )
            .bind(n)
            .fetch_all(&db.0)
            .await
            .map_err(|e| db_context("get ladder recommendations", e))?;

            for r in rows {
                recs.push(DailyRecommendation {
                    problem_id: r.problem_id.clone(),
                    problem_name: r.problem_name.clone(),
                    problem_url: r.problem_url.clone(),
                    online_judge: r.online_judge.clone(),
                    difficulty: r.difficulty,
                    reason: "Next unsolved in your ladder".to_string(),
                    strategy: "ladder".to_string(),
                });
            }
        }

        "friends" => {
            let rows = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
                r#"
                SELECT DISTINCT ON (s.problem_id)
                    s.id, s.problem_id, s.problem_name, s.problem_url,
                    '' AS ladder_id, 0 AS position, s.difficulty, 'Codeforces' AS online_judge,
                    s.created_at
                FROM cf_friend_submissions s
                LEFT JOIN cf_ladder_progress pr ON pr.problem_id = s.problem_id
                WHERE pr.id IS NULL
                  AND s.problem_name <> ''
                ORDER BY s.problem_id, s.submission_time DESC
                LIMIT $1
                "#,
            )
            .bind(n)
            .fetch_all(&db.0)
            .await
            .map_err(|e| db_context("get friends recommendations", e))?;

            for r in rows {
                recs.push(DailyRecommendation {
                    problem_id: r.problem_id.clone(),
                    problem_name: r.problem_name.clone(),
                    problem_url: r.problem_url.clone(),
                    online_judge: r.online_judge.clone(),
                    difficulty: r.difficulty,
                    reason: "Solved by your friends".to_string(),
                    strategy: "friends".to_string(),
                });
            }
        }

        "category" => {
            let rows = sqlx::query_as::<sqlx::Postgres, (String, String, String, String, Option<i32>)>(
                r#"
                SELECT p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                FROM cf_category_problems p
                LEFT JOIN cf_category_progress cp
                  ON cp.category_id = p.category_id AND cp.problem_id = p.problem_id
                WHERE cp.id IS NULL
                ORDER BY p.position
                LIMIT $1
                "#,
            )
            .bind(n)
            .fetch_all(&db.0)
            .await
            .map_err(|e| db_context("get category recommendations", e))?;

            for (problem_id, problem_name, problem_url, online_judge, difficulty) in rows {
                recs.push(DailyRecommendation {
                    problem_id,
                    problem_name,
                    problem_url,
                    online_judge,
                    difficulty,
                    reason: "Unsolved in your categories".to_string(),
                    strategy: "category".to_string(),
                });
            }
        }

        "rating" => {
            // Problems from ladder within a 200-point rating window of the user's last solved
            let last_diff: Option<i64> = sqlx::query_scalar::<sqlx::Postgres, Option<i64>>(
                r#"
                SELECT MAX(p.difficulty)
                FROM cf_ladder_progress pr
                JOIN cf_ladder_problems p ON p.ladder_id = pr.ladder_id AND p.problem_id = pr.problem_id
                WHERE pr.solved_at IS NOT NULL AND p.difficulty IS NOT NULL
                "#,
            )
            .fetch_one(&db.0)
            .await
            .map_err(|e| db_context("get last difficulty", e))?;

            let target = last_diff.unwrap_or(1200) as i32;
            let min_r = target;
            let max_r = target + 200;

            let rows = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
                r#"
                SELECT p.* FROM cf_ladder_problems p
                LEFT JOIN cf_ladder_progress pr
                  ON pr.ladder_id = p.ladder_id AND pr.problem_id = p.problem_id
                WHERE pr.id IS NULL
                  AND p.difficulty >= $1 AND p.difficulty <= $2
                ORDER BY p.difficulty
                LIMIT $3
                "#,
            )
            .bind(min_r)
            .bind(max_r)
            .bind(n)
            .fetch_all(&db.0)
            .await
            .map_err(|e| db_context("get rating recommendations", e))?;

            for r in rows {
                recs.push(DailyRecommendation {
                    problem_id: r.problem_id.clone(),
                    problem_name: r.problem_name.clone(),
                    problem_url: r.problem_url.clone(),
                    online_judge: r.online_judge.clone(),
                    difficulty: r.difficulty,
                    reason: format!("Matches your current level (~{})", target),
                    strategy: "rating".to_string(),
                });
            }
        }

        // "hybrid" and fallback — round-robin: ladder + friends + category
        _ => {
            let per = (n / 3).max(1);

            let ladder_rows = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
                r#"SELECT p.* FROM cf_ladder_problems p
                   LEFT JOIN cf_ladder_progress pr ON pr.ladder_id = p.ladder_id AND pr.problem_id = p.problem_id
                   WHERE pr.id IS NULL ORDER BY p.position LIMIT $1"#,
            )
            .bind(per)
            .fetch_all(&db.0)
            .await
            .map_err(|e| db_context("hybrid: ladder", e))?;

            for r in ladder_rows {
                recs.push(DailyRecommendation {
                    problem_id: r.problem_id, problem_name: r.problem_name,
                    problem_url: r.problem_url, online_judge: r.online_judge,
                    difficulty: r.difficulty,
                    reason: "Next unsolved in your ladder".to_string(),
                    strategy: "ladder".to_string(),
                });
            }

            let friend_rows = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
                r#"SELECT DISTINCT ON (s.problem_id) s.id, s.problem_id, s.problem_name, s.problem_url,
                          '' AS ladder_id, 0 AS position, s.difficulty, 'Codeforces' AS online_judge, s.created_at
                   FROM cf_friend_submissions s
                   LEFT JOIN cf_ladder_progress pr ON pr.problem_id = s.problem_id
                   WHERE pr.id IS NULL AND s.problem_name <> ''
                   ORDER BY s.problem_id, s.submission_time DESC LIMIT $1"#,
            )
            .bind(per)
            .fetch_all(&db.0)
            .await
            .map_err(|e| db_context("hybrid: friends", e))?;

            for r in friend_rows {
                recs.push(DailyRecommendation {
                    problem_id: r.problem_id, problem_name: r.problem_name,
                    problem_url: r.problem_url, online_judge: r.online_judge,
                    difficulty: r.difficulty,
                    reason: "Solved by your friends".to_string(),
                    strategy: "friends".to_string(),
                });
            }

            let cat_rows = sqlx::query_as::<sqlx::Postgres, (String, String, String, String, Option<i32>)>(
                r#"SELECT p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                   FROM cf_category_problems p
                   LEFT JOIN cf_category_progress cp ON cp.category_id = p.category_id AND cp.problem_id = p.problem_id
                   WHERE cp.id IS NULL ORDER BY p.position LIMIT $1"#,
            )
            .bind(per)
            .fetch_all(&db.0)
            .await
            .map_err(|e| db_context("hybrid: category", e))?;

            for (problem_id, problem_name, problem_url, online_judge, difficulty) in cat_rows {
                recs.push(DailyRecommendation {
                    problem_id, problem_name, problem_url, online_judge, difficulty,
                    reason: "Unsolved in your categories".to_string(),
                    strategy: "category".to_string(),
                });
            }
        }
    }

    Ok(recs)
}
