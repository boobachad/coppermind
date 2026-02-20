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
// (Moved to cf_ladder_system.rs to unify data ingestion logic and fix parsing)


// ─── Daily Recommendations ───────────────────────────────────────────

#[tauri::command]
pub async fn get_daily_recommendations(
    db: State<'_, PosDb>,
    strategy: String,
    count: Option<i32>,
    category_id: Option<String>,
) -> PosResult<Vec<DailyRecommendation>> {
    let n = count.unwrap_or(5);
    let mut recs: Vec<DailyRecommendation> = Vec::new();

    match strategy.as_str() {
        "ladder" => {
            let rows = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
                r#"
                SELECT p.id, p.ladder_id, p.problem_id, p.problem_name, p.problem_url,
                       p.position, p.difficulty, p.online_judge, p.created_at
                FROM cf_ladder_problems p
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
            // Get user rating
            let user_rating: Option<i32> = sqlx::query_scalar::<sqlx::Postgres, Option<serde_json::Value>>(
                "SELECT data FROM pos_user_stats WHERE platform = 'codeforces'"
            )
            .fetch_optional(&db.0)
            .await
            .map_err(|e| db_context("get user stats", e))?
            .flatten()
            .and_then(|data| {
                data.get("rating")
                    .and_then(|r| r.as_i64())
                    .map(|r| r as i32)
            });

            // Map rating to A2OJ difficulty range
            let (min_diff, max_diff) = if let Some(rating) = user_rating {
                match rating {
                    0..=1199 => (1, 2),
                    1200..=1499 => (2, 3),
                    1500..=1799 => (3, 4),
                    1800..=2099 => (4, 5),
                    2100..=2399 => (5, 6),
                    2400..=2699 => (6, 7),
                    2700..=2999 => (7, 8),
                    3000..=3299 => (8, 9),
                    _ => (9, 10),
                }
            } else {
                (3, 4)  // Default to intermediate if no rating
            };
            
            // Branch based on whether category_id is provided
            if let Some(cat_id) = category_id {
                // SPECIFIC TOPIC: Get problems from selected category
                log::info!("[CF RECOMMENDATIONS] Category strategy (specific): category_id={}, difficulty {}-{}", 
                    cat_id, min_diff, max_diff);
                
                let category_problems = sqlx::query_as::<_, (String, String, String, String, Option<i32>)>(
                    r#"
                    SELECT p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                    FROM cf_category_problems p
                    WHERE p.category_id = $1
                    AND p.difficulty >= $2 
                    AND p.difficulty <= $3
                    AND NOT EXISTS (
                        SELECT 1 FROM pos_submissions s 
                        WHERE s.problem_id = ('cf-' || p.problem_id) 
                        AND s.platform = 'codeforces'
                        AND s.verdict = 'OK'
                    )
                    ORDER BY p.difficulty, p.position
                    LIMIT $4
                    "#
                )
                .bind(&cat_id)
                .bind(min_diff)
                .bind(max_diff)
                .bind(n)
                .fetch_all(&db.0)
                .await
                .map_err(|e| db_context("get category recommendations", e))?;
                
                // Get category name for better reason text
                let category_name: String = sqlx::query_scalar(
                    "SELECT name FROM cf_categories WHERE id = $1"
                )
                .bind(&cat_id)
                .fetch_one(&db.0)
                .await
                .unwrap_or_else(|_| "Unknown".to_string());
                
                for (problem_id, problem_name, problem_url, online_judge, difficulty) in category_problems {
                    recs.push(DailyRecommendation {
                        problem_id,
                        problem_name,
                        problem_url,
                        online_judge,
                        difficulty,
                        reason: format!("{} (difficulty {})", category_name, difficulty.unwrap_or(0)),
                        strategy: "category".to_string(),
                    });
                }
            } else {
                // RANDOM TOPICS: Get problems from all categories
                log::info!("[CF RECOMMENDATIONS] Category strategy (random): difficulty {}-{}", min_diff, max_diff);
                
                let category_problems = sqlx::query_as::<_, (String, String, String, String, Option<i32>)>(
                    r#"
                    SELECT p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                    FROM cf_category_problems p
                    WHERE p.difficulty >= $1 
                    AND p.difficulty <= $2
                    AND NOT EXISTS (
                        SELECT 1 FROM pos_submissions s 
                        WHERE s.problem_id = ('cf-' || p.problem_id) 
                        AND s.platform = 'codeforces'
                        AND s.verdict = 'OK'
                    )
                    GROUP BY p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                    ORDER BY p.difficulty, RANDOM()
                    LIMIT $3
                    "#
                )
                .bind(min_diff)
                .bind(max_diff)
                .bind(n)
                .fetch_all(&db.0)
                .await
                .map_err(|e| db_context("get category recommendations", e))?;
                
                for (problem_id, problem_name, problem_url, online_judge, difficulty) in category_problems {
                    recs.push(DailyRecommendation {
                        problem_id,
                        problem_name,
                        problem_url,
                        online_judge,
                        difficulty,
                        reason: format!("Topic-based problem (difficulty {})", difficulty.unwrap_or(0)),
                        strategy: "category".to_string(),
                    });
                }
            }
            
            log::info!("[CF RECOMMENDATIONS] Generated {} recommendations using category strategy", recs.len());
        }

        "rating" => {
            // 1. Get user's Codeforces rating
            let user_rating: Option<i32> = sqlx::query_scalar::<sqlx::Postgres, Option<serde_json::Value>>(
                "SELECT data FROM pos_user_stats WHERE platform = 'codeforces'"
            )
            .fetch_optional(&db.0)
            .await
            .map_err(|e| db_context("get user stats", e))?
            .flatten()
            .and_then(|data| {
                data.get("rating")
                    .and_then(|r| r.as_i64())
                    .map(|r| r as i32)
            });

            let target = user_rating.unwrap_or(800);
            let min_r = (target - 200).max(800);
            let max_r = target + 200;

            log::info!("[CF RECOMMENDATIONS] User rating: {}, Range: {}-{}", target, min_r, max_r);

            // 2. Find ladders that overlap with user's rating range
            let matching_ladders = sqlx::query_scalar::<_, String>(
                r#"
                SELECT id FROM cf_ladders 
                WHERE rating_min IS NOT NULL 
                AND rating_max IS NOT NULL
                AND rating_min <= $1 
                AND rating_max >= $2
                ORDER BY rating_min
                "#
            )
            .bind(max_r)
            .bind(min_r)
            .fetch_all(&db.0)
            .await
            .map_err(|e| db_context("find matching ladders", e))?;

            log::info!("[CF RECOMMENDATIONS] Found {} matching ladders", matching_ladders.len());

            // 3. Get unsolved problems from matching ladders
            let problems_per_ladder = if matching_ladders.is_empty() { 
                0 
            } else { 
                (n / matching_ladders.len() as i32).max(1) 
            };

            for ladder_id in matching_ladders.iter().take(3) {
                let ladder_problems = sqlx::query_as::<_, (String, String, String, String, Option<i32>)>(
                    r#"
                    SELECT p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                    FROM cf_ladder_problems p
                    WHERE p.ladder_id = $1 
                    AND NOT EXISTS (
                        SELECT 1 FROM pos_submissions s 
                        WHERE s.problem_id = ('cf-' || p.problem_id) 
                        AND s.platform = 'codeforces'
                        AND s.verdict = 'OK'
                    )
                    ORDER BY p.position
                    LIMIT $2
                    "#
                )
                .bind(ladder_id)
                .bind(problems_per_ladder)
                .fetch_all(&db.0)
                .await
                .map_err(|e| db_context("get ladder problems", e))?;

                for (problem_id, problem_name, problem_url, online_judge, difficulty) in ladder_problems {
                    if !recs.iter().any(|r| r.problem_id == problem_id) {
                        recs.push(DailyRecommendation {
                            problem_id,
                            problem_name,
                            problem_url,
                            online_judge,
                            difficulty,
                            reason: format!("From rating-matched ladder (~{})", target),
                            strategy: "rating".to_string(),
                        });
                    }
                }
            }

            // 4. Fallback: Use A2OJ difficulty for categories (if not enough from ladders)
            if recs.len() < n as usize {
                let needed = n - recs.len() as i32;
                
                // Map user rating to A2OJ difficulty (conservative)
                let (min_diff, max_diff) = match target {
                    0..=1199 => (1, 2),
                    1200..=1499 => (2, 3),
                    1500..=1799 => (3, 4),
                    1800..=2099 => (4, 5),
                    2100..=2399 => (5, 6),
                    2400..=2699 => (6, 7),
                    2700..=2999 => (7, 8),
                    3000..=3299 => (8, 9),
                    _ => (9, 10),
                };
                
                log::info!("[CF RECOMMENDATIONS] Fallback to categories: difficulty {}-{}", min_diff, max_diff);
                
                let category_problems = sqlx::query_as::<_, (String, String, String, String, Option<i32>)>(
                    r#"
                    SELECT p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                    FROM cf_category_problems p
                    WHERE p.difficulty >= $1 
                    AND p.difficulty <= $2
                    AND NOT EXISTS (
                        SELECT 1 FROM pos_submissions s 
                        WHERE s.problem_id = ('cf-' || p.problem_id) 
                        AND s.platform = 'codeforces'
                        AND s.verdict = 'OK'
                    )
                    GROUP BY p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                    ORDER BY p.difficulty, RANDOM()
                    LIMIT $3
                    "#
                )
                .bind(min_diff)
                .bind(max_diff)
                .bind(needed)
                .fetch_all(&db.0)
                .await
                .map_err(|e| db_context("get category fallback", e))?;
                
                for (problem_id, problem_name, problem_url, online_judge, difficulty) in category_problems {
                    if !recs.iter().any(|r| r.problem_id == problem_id) {
                        recs.push(DailyRecommendation {
                            problem_id,
                            problem_name,
                            problem_url,
                            online_judge,
                            difficulty,
                            reason: format!("A2OJ difficulty {} (your level: {})", 
                                difficulty.unwrap_or(0), 
                                (min_diff + max_diff) / 2
                            ),
                            strategy: "rating".to_string(),
                        });
                    }
                }
            }

            log::info!("[CF RECOMMENDATIONS] Generated {} recommendations using rating strategy", recs.len());
        }

        // "hybrid" and fallback — round-robin: ladder + friends + category
        _ => {
            let per = (n / 3).max(1);

            let ladder_rows = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
                r#"SELECT p.id, p.ladder_id, p.problem_id, p.problem_name, p.problem_url,
                          p.position, p.difficulty, p.online_judge, p.created_at
                   FROM cf_ladder_problems p
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
                   WHERE cp.id IS NULL 
                   GROUP BY p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                   ORDER BY MIN(p.position) 
                   LIMIT $1"#,
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
