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
            let rows = sqlx::query_as::<sqlx::Postgres, (String, String, String, String, Option<i32>)>(
                r#"
                SELECT p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                FROM cf_category_problems p
                LEFT JOIN cf_category_progress cp
                  ON cp.category_id = p.category_id AND cp.problem_id = p.problem_id
                WHERE cp.id IS NULL
                GROUP BY p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                ORDER BY MIN(p.position)
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
            // Get user's actual Codeforces rating from pos_user_stats
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

            let mut target = 800;

            if let Some(rating) = user_rating {
                target = rating;
                log::info!("[CF RECOMMENDATIONS] Using user rating: {}", rating);
            } else {
                // Fallback 1: Check max difficulty from solved ladder problems
                let last_diff: Option<i32> = sqlx::query_scalar::<sqlx::Postgres, Option<i32>>(
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

                if let Some(diff) = last_diff {
                    target = diff;
                    log::info!("[CF RECOMMENDATIONS] Using max solved difficulty: {}", diff);
                } else {
                    // Fallback 2: Check if user has added themselves as a friend
                    let friend_rating: Option<i32> = sqlx::query_scalar("SELECT current_rating FROM cf_friends ORDER BY created_at DESC LIMIT 1")
                        .fetch_optional(&db.0)
                        .await
                        .unwrap_or(None)
                        .flatten();
                    
                    if let Some(rating) = friend_rating {
                        target = rating;
                        log::info!("[CF RECOMMENDATIONS] Using friend rating: {}", rating);
                    } else {
                        log::info!("[CF RECOMMENDATIONS] No rating found, using default: 800");
                    }
                }
            }

            // Search window: +/- 200 (min 800)
            let min_r = (target - 200).max(800);
            let max_r = target + 200;

            log::info!("[CF RECOMMENDATIONS] Rating range: {} - {} (target: {})", min_r, max_r, target);

            // 1. Try Ladder Problems
            let ladder_rows = sqlx::query_as::<sqlx::Postgres, CFLadderProblemRow>(
                r#"
                SELECT p.id, p.ladder_id, p.problem_id, p.problem_name, p.problem_url,
                       p.position, p.difficulty, p.online_judge, p.created_at
                FROM cf_ladder_problems p
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
            .map_err(|e| db_context("get rating recommendations (ladder)", e))?;

            for r in ladder_rows {
                recs.push(DailyRecommendation {
                    problem_id: r.problem_id.clone(),
                    problem_name: r.problem_name.clone(),
                    problem_url: r.problem_url.clone(),
                    online_judge: r.online_judge.clone(),
                    difficulty: r.difficulty,
                    reason: format!("Ladder problem at your level (~{})", target),
                    strategy: "rating".to_string(),
                });
            }

            // 2. Fill gaps with Category Problems
            if (recs.len() as i32) < n {
                let needed = n - (recs.len() as i32);
                let cat_rows = sqlx::query_as::<sqlx::Postgres, (String, String, String, String, Option<i32>)>(
                    r#"
                    SELECT p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                    FROM cf_category_problems p
                    LEFT JOIN cf_category_progress cp
                      ON cp.category_id = p.category_id AND cp.problem_id = p.problem_id
                    WHERE cp.id IS NULL
                      AND p.difficulty >= $1 AND p.difficulty <= $2
                    GROUP BY p.problem_id, p.problem_name, p.problem_url, p.online_judge, p.difficulty
                    ORDER BY p.difficulty
                    LIMIT $3
                    "#,
                )
                .bind(min_r)
                .bind(max_r)
                .bind(needed)
                .fetch_all(&db.0)
                .await
                .map_err(|e| db_context("get rating recommendations (category)", e))?;

                for (problem_id, problem_name, problem_url, online_judge, difficulty) in cat_rows {
                    // Avoid duplicates if problem exists in both ladder and category
                    if !recs.iter().any(|r| r.problem_id == problem_id) {
                         recs.push(DailyRecommendation {
                            problem_id,
                            problem_name,
                            problem_url,
                            online_judge,
                            difficulty,
                            reason: format!("Category problem at your level (~{})", target),
                            strategy: "rating".to_string(),
                        });
                    }
                }
            }
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
