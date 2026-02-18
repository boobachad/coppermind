async fn insert_repository_from_graphql(
    pool: &sqlx::PgPool,
    username: &str,
    repo: &GraphQLRepository,
    commit_count: i32,
) -> Result<(), PosError> {
    let id = gen_id();
    let full_name = format!("{}/{}", repo.owner.login, repo.name);
    
    let repo_created_at = DateTime::parse_from_rfc3339(&repo.created_at)
        .ok()
        .map(|dt| dt.with_timezone(&Utc));
    let repo_updated_at = DateTime::parse_from_rfc3339(&repo.updated_at)
        .ok()
        .map(|dt| dt.with_timezone(&Utc));
    
    let topics: Vec<String> = repo.repository_topics.nodes.iter()
        .map(|t| t.topic.name.clone())
        .collect();
    
    sqlx::query(
        r#"INSERT INTO github_repositories
           (id, username, repo_name, repo_owner, full_name, description,
            languages, primary_language, total_commits, total_prs, total_issues, total_reviews,
            stars, forks, watchers, size_kb, is_private, is_fork,
            repo_created_at, repo_updated_at, repo_url, homepage_url, topics, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW())"#
    )
    .bind(&id)
    .bind(username)
    .bind(&repo.name)
    .bind(&repo.owner.login)
    .bind(&full_name)
    .bind(&repo.description)
    .bind(serde_json::json!({}))  // languages - TODO: fetch if needed
    .bind(repo.primary_language.as_ref().map(|l| l.name.clone()))
    .bind(commit_count)
    .bind(0)  // total_prs
    .bind(0)  // total_issues
    .bind(0)  // total_reviews
    .bind(repo.stargazer_count)
    .bind(repo.fork_count)
    .bind(repo.watchers_connection.total_count)
    .bind(repo.disk_usage.unwrap_or(0))
    .bind(repo.is_private)
    .bind(repo.is_fork)
    .bind(repo_created_at)
    .bind(repo_updated_at)
    .bind(&repo.url)
    .bind(&repo.homepage_url)
    .bind(serde_json::to_value(&topics).ok())
    .execute(pool)
    .await
    .map_err(|e| db_context("Insert repository", e))?;

    log::info!("[GITHUB] Inserted repo: {} ({} commits)", full_name, commit_count);
    Ok(())
}

/// Update existing repository from GraphQL data
async fn update_repository_from_graphql(
    pool: &sqlx::PgPool,
    id: &str,
    repo: &GraphQLRepository,
    commit_count: i32,
) -> Result<(), PosError> {
    let full_name = format!("{}/{}", repo.owner.login, repo.name);
    
    let repo_updated_at = DateTime::parse_from_rfc3339(&repo.updated_at)
        .ok()
        .map(|dt| dt.with_timezone(&Utc));
    
    let topics: Vec<String> = repo.repository_topics.nodes.iter()
        .map(|t| t.topic.name.clone())
        .collect();
    
    sqlx::query(
        r#"UPDATE github_repositories SET
           description = $1, languages = $2, primary_language = $3,
           total_commits = $4, total_prs = $5, total_issues = $6, total_reviews = $7,
           stars = $8, forks = $9, watchers = $10, size_kb = $11,
           repo_updated_at = $12, homepage_url = $13, topics = $14, synced_at = NOW()
           WHERE id = $15"#
    )
    .bind(&repo.description)
    .bind(serde_json::json!({}))  // languages
    .bind(repo.primary_language.as_ref().map(|l| l.name.clone()))
    .bind(commit_count)
    .bind(0)  // total_prs
    .bind(0)  // total_issues
    .bind(0)  // total_reviews
    .bind(repo.stargazer_count)
    .bind(repo.fork_count)
    .bind(repo.watchers_connection.total_count)
    .bind(repo.disk_usage.unwrap_or(0))
    .bind(repo_updated_at)
    .bind(&repo.homepage_url)
    .bind(serde_json::to_value(&topics).ok())
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| db_context("Update repository", e))?;

    log::info!("[GITHUB] Updated repo: {} ({} commits)", full_name, commit_count);
    Ok(())
}

/// Calculate and store user-level aggregated stats
async fn calculate_user_stats(
    pool: &sqlx::PgPool,
    username: &str,
) -> Result<(), PosError> {
    // Aggregate from github_repositories table
    let stats: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        r#"SELECT 
           COUNT(*) as total_repos,
           COALESCE(SUM(total_commits), 0) as total_commits,
           COALESCE(SUM(total_prs), 0) as total_prs,
           COALESCE(SUM(total_issues), 0) as total_issues,
           COALESCE(SUM(total_reviews), 0) as total_reviews,
           COALESCE(SUM(stars), 0) as total_stars
           FROM github_repositories WHERE username = $1"#
    )
    .bind(username)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("Aggregate stats", e))?;

    // Language breakdown
    let languages: Vec<(Option<String>, i64)> = sqlx::query_as(
        "SELECT primary_language, SUM(total_commits) as commits 
         FROM github_repositories 
         WHERE username = $1 AND primary_language IS NOT NULL 
         GROUP BY primary_language"
    )
    .bind(username)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("Language breakdown", e))?;

    let languages_breakdown: HashMap<String, i64> = languages
        .into_iter()
        .filter_map(|(lang, count)| lang.map(|l| (l, count)))
        .collect();

    // Top repos
    let top_repos: Vec<String> = sqlx::query_as(
        "SELECT full_name FROM github_repositories 
         WHERE username = $1 
         ORDER BY total_commits DESC 
         LIMIT 10"
    )
    .bind(username)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("Top repos", e))?
    .into_iter()
    .map(|(name,)| name)
    .collect();

    // Upsert user stats
    sqlx::query(
        r#"INSERT INTO github_user_stats
           (username, total_repos, total_commits, total_prs, total_issues, total_reviews,
            total_stars_received, languages_breakdown, top_repos, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (username) DO UPDATE SET
           total_repos = $2, total_commits = $3, total_prs = $4, total_issues = $5,
           total_reviews = $6, total_stars_received = $7, languages_breakdown = $8,
           top_repos = $9, synced_at = NOW()"#
    )
    .bind(username)
    .bind(stats.0 as i32)
    .bind(stats.1 as i32)
    .bind(stats.2 as i32)
    .bind(stats.3 as i32)
    .bind(stats.4 as i32)
    .bind(stats.5 as i32)
    .bind(serde_json::to_value(&languages_breakdown).ok())
    .bind(serde_json::to_value(&top_repos).ok())
    .execute(pool)
    .await
    .map_err(|e| db_context("Upsert user stats", e))?;

    log::info!("[GITHUB] Updated user stats for {}", username);
    Ok(())
}

/// Update additional user stats (stars, languages, top repos) WITHOUT overwriting commit counts
async fn update_additional_user_stats(
    pool: &sqlx::PgPool,
    username: &str,
) -> Result<(), PosError> {
    // Aggregate stars from github_repositories table
    let total_stars: (i64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(stars), 0) FROM github_repositories WHERE username = $1"
    )
    .bind(username)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("Aggregate stars", e))?;

    // Language breakdown
    let languages: Vec<(Option<String>, i64)> = sqlx::query_as(
        "SELECT primary_language, SUM(total_commits) as commits 
         FROM github_repositories 
         WHERE username = $1 AND primary_language IS NOT NULL 
         GROUP BY primary_language"
    )
    .bind(username)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("Language breakdown", e))?;

    let languages_breakdown: HashMap<String, i64> = languages
        .into_iter()
        .filter_map(|(lang, count)| lang.map(|l| (l, count)))
        .collect();

    // Top repos
    let top_repos: Vec<String> = sqlx::query_as(
        "SELECT full_name FROM github_repositories 
         WHERE username = $1 
         ORDER BY total_commits DESC 
         LIMIT 10"
    )
    .bind(username)
    .fetch_all(pool)
    .await
    .map_err(|e| db_context("Top repos", e))?
    .into_iter()
    .map(|(name,)| name)
    .collect();

    // Update only stars, languages, and top repos (preserve commit counts from GitHub API)
    sqlx::query(
        r#"UPDATE github_user_stats SET
           total_stars_received = $1,
           languages_breakdown = $2,
           top_repos = $3
           WHERE username = $4"#
    )
    .bind(total_stars.0 as i32)
    .bind(serde_json::to_value(&languages_breakdown).ok())
    .bind(serde_json::to_value(&top_repos).ok())
    .bind(username)
    .execute(pool)
    .await
    .map_err(|e| db_context("Update additional stats", e))?;

    log::info!("[GITHUB] Updated additional user stats (stars, languages, top repos)");
    Ok(())
}

/// Fetch user contribution stats directly from GitHub (separate from repo sync)
/// This gets accurate all-time stats from GitHub's contribution calendar
async fn fetch_user_contribution_stats_direct(
    client: &reqwest::Client,
    token: &str,
) -> Result<UserContributionStats, PosError> {
    // Fetch all years of contributions to get accurate totals (starting from 2021)
    let current_year = 2026;
    let start_year = 2021;
    
    let mut total_commits = 0;
    let mut total_prs = 0;
    let mut total_issues = 0;
    let mut total_reviews = 0;
    let mut total_repos = 0;
    
    for year in start_year..=current_year {
        let from = format!("{}-01-01T00:00:00Z", year);
        let to = format!("{}-12-31T23:59:59Z", year);
        
        let query = r#"
            query($from: DateTime!, $to: DateTime!) {
                viewer {
                    contributionsCollection(from: $from, to: $to) {
                        totalCommitContributions
                        totalIssueContributions
                        totalPullRequestContributions
                        totalPullRequestReviewContributions
                        totalRepositoriesWithContributedCommits
                    }
                }
            }
        "#;

        let body = serde_json::json!({
            "query": query,
            "variables": { "from": from, "to": to }
        });

        let resp = client
            .post("https://api.github.com/graphql")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "coppermind-pos")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            continue; // Skip failed years
        }

        #[derive(Debug, Deserialize)]
        struct StatsResponse {
            data: Option<StatsData>,
        }

        #[derive(Debug, Deserialize)]
        struct StatsData {
            viewer: StatsViewer,
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct StatsViewer {
            contributions_collection: YearStats,
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct YearStats {
            total_commit_contributions: i32,
            total_issue_contributions: i32,
            total_pull_request_contributions: i32,
            total_pull_request_review_contributions: i32,
            total_repositories_with_contributed_commits: i32,
        }

        let data: StatsResponse = resp.json().await?;

        if let Some(viewer_data) = data.data {
            let stats = viewer_data.viewer.contributions_collection;
            total_commits += stats.total_commit_contributions;
            total_prs += stats.total_pull_request_contributions;
            total_issues += stats.total_issue_contributions;
            total_reviews += stats.total_pull_request_review_contributions;
            total_repos = total_repos.max(stats.total_repositories_with_contributed_commits);
        }

        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    log::info!("[GITHUB] Fetched all-time stats: {} commits, {} PRs, {} issues, {} reviews across {} repos",
        total_commits, total_prs, total_issues, total_reviews, total_repos);

    Ok(UserContributionStats {
        total_commits,
        total_prs,
        total_issues,
        total_reviews,
        total_repos,
    })
}

#[derive(Debug)]
struct UserContributionStats {
    total_commits: i32,
    total_prs: i32,
    total_issues: i32,
    total_reviews: i32,
    total_repos: i32,
}

