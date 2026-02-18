// ─── GitHub Scraper ─────────────────────────────────────────────────
// Scrapes GitHub repositories with contribution stats via GraphQL.
// Strategy: Single GraphQL query gets all repos + metadata + commit counts.

use chrono::{DateTime, Utc};
use serde::Deserialize;
use tauri::State;
use std::collections::HashMap;

use crate::{PosDb, PosConfig};
use super::super::error::{PosError, db_context};
use super::super::utils::gen_id;
use super::{build_http_client, ScraperResponse};

// ─── GraphQL Response Types ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GraphQLResponse {
    data: Option<GraphQLData>,
    errors: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct GraphQLData {
    viewer: Viewer,
}

#[derive(Debug, Deserialize)]
struct Viewer {
    repositories: RepositoryConnection,
}

#[derive(Debug, Deserialize)]
struct RepositoryConnection {
    nodes: Vec<GraphQLRepository>,
    #[serde(rename = "pageInfo")]
    page_info: PageInfo,
}

#[derive(Debug, Deserialize)]
struct PageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
    #[serde(rename = "endCursor")]
    end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQLRepository {
    name: String,
    owner: Owner,
    description: Option<String>,
    is_private: bool,
    is_fork: bool,
    stargazer_count: i32,
    fork_count: i32,
    #[serde(rename = "watchers")]
    watchers_connection: WatchersConnection,
    disk_usage: Option<i32>,
    created_at: String,
    updated_at: String,
    url: String,
    homepage_url: Option<String>,
    repository_topics: RepositoryTopics,
    primary_language: Option<Language>,
    default_branch_ref: Option<BranchRef>,
}

#[derive(Debug, Deserialize)]
struct Owner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct Language {
    name: String,
}

#[derive(Debug, Deserialize)]
struct WatchersConnection {
    #[serde(rename = "totalCount")]
    total_count: i32,
}

#[derive(Debug, Deserialize)]
struct RepositoryTopics {
    nodes: Vec<RepositoryTopic>,
}

#[derive(Debug, Deserialize)]
struct RepositoryTopic {
    topic: Topic,
}

#[derive(Debug, Deserialize)]
struct Topic {
    name: String,
}

#[derive(Debug, Deserialize)]
struct BranchRef {
    target: BranchTarget,
}

#[derive(Debug, Deserialize)]
struct BranchTarget {
    history: CommitHistory,
}

#[derive(Debug, Deserialize)]
struct CommitHistory {
    #[serde(rename = "totalCount")]
    total_count: i32,
}

// ─── Scraper Command ────────────────────────────────────────────────

/// Scrape GitHub repositories with contribution stats via GraphQL.
#[tauri::command]
pub async fn scrape_github(
    db: State<'_, PosDb>,
    config: State<'_, PosConfig>,
) -> Result<ScraperResponse, PosError> {
    let pool = &db.0;
    let username = config.0.require_github_username()
        .map_err(|e| PosError::InvalidInput(e))?;
    let token = config.0.require_github_token()
        .map_err(|e| PosError::InvalidInput(e))?;

    log::info!("[GITHUB SCRAPER] Starting sync for {}", username);

    let client = build_http_client();
    
    // Step 1: Fetch user's commit contributions per repo (YOUR commits only)
    let user_commits = fetch_user_contributions(&client, token).await?;
    log::info!("[GITHUB] Found contributions in {} repositories", user_commits.len());
    
    // Step 2: Fetch full repo details for repos where user has commits
    let all_repos = fetch_repos_details(&client, token, &user_commits).await?;
    log::info!("[GITHUB] Fetched details for {} repositories", all_repos.len());

    // Step 3: Store repos in database
    let mut new_count = 0i32;
    let mut updated_count = 0i32;
    
    for (repo, user_commit_count) in &all_repos {
        let full_name = format!("{}/{}", repo.owner.login, repo.name);
        
        // Skip repos with 0 user commits
        if *user_commit_count == 0 {
            log::debug!("[GITHUB] Skipping {} (0 user commits)", full_name);
            continue;
        }

        log::info!("[GITHUB] Processing {} ({} your commits)", full_name, user_commit_count);

        // Check if repo exists
        let existing: Option<(String, DateTime<Utc>)> = sqlx::query_as(
            "SELECT id, synced_at FROM github_repositories WHERE username = $1 AND full_name = $2"
        )
        .bind(username)
        .bind(&full_name)
        .fetch_optional(pool)
        .await
        .map_err(|e| db_context("Check existing repo", e))?;
        
        if let Some((id, _)) = existing {
            update_repository_from_graphql(pool, &id, repo, *user_commit_count).await?;
            updated_count += 1;
        } else {
            insert_repository_from_graphql(pool, username, repo, *user_commit_count).await?;
            new_count += 1;
        }
    }

    // Step 4: Fetch and store accurate user-level stats directly from GitHub
    log::info!("[GITHUB] Fetching accurate user stats from GitHub API");
    let user_stats = fetch_user_contribution_stats_direct(&client, token).await?;
    
    // Store user stats with accurate GitHub data
    sqlx::query(
        r#"INSERT INTO github_user_stats
           (username, total_repos, total_commits, total_prs, total_issues, total_reviews,
            total_stars_received, current_streak_days, longest_streak_days,
            languages_breakdown, top_repos, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, '{}', '[]', NOW())
           ON CONFLICT (username) DO UPDATE SET
           total_repos = $2, total_commits = $3, total_prs = $4, total_issues = $5,
           total_reviews = $6, synced_at = NOW()"#
    )
    .bind(username)
    .bind(user_stats.total_repos)
    .bind(user_stats.total_commits)
    .bind(user_stats.total_prs)
    .bind(user_stats.total_issues)
    .bind(user_stats.total_reviews)
    .execute(pool)
    .await
    .map_err(|e| db_context("Upsert user stats", e))?;

    log::info!("[GITHUB] User stats updated: {} commits, {} PRs, {} issues", 
        user_stats.total_commits, user_stats.total_prs, user_stats.total_issues);

    // Step 5: Update additional stats from repos (stars, languages, top repos) WITHOUT overwriting commit counts
    update_additional_user_stats(pool, username).await?;

    log::info!("[GITHUB SCRAPER] Sync complete: {} new, {} updated", new_count, updated_count);
    Ok(ScraperResponse {
        platform: "github".into(),
        new_submissions: new_count,
        total_submissions: (new_count + updated_count),
        shadow_activities: 0,
    })
}

// ─── Helper Functions ───────────────────────────────────────────────

/// Fetch user's commit contributions per repository (all-time)
/// Fetches year-by-year since contributionsCollection only allows 1-year ranges
async fn fetch_user_contributions(
    client: &reqwest::Client,
    token: &str,
) -> Result<HashMap<String, i32>, PosError> {
    let mut all_contributions: HashMap<String, i32> = HashMap::new();
    
    // Fetch contributions year by year (starting from 2021)
    let current_year = 2026;
    let start_year = 2021;
    
    for year in start_year..=current_year {
        let from = format!("{}-01-01T00:00:00Z", year);
        let to = format!("{}-12-31T23:59:59Z", year);
        
        let query = r#"
            query($from: DateTime!, $to: DateTime!) {
                viewer {
                    contributionsCollection(from: $from, to: $to) {
                        commitContributionsByRepository(maxRepositories: 100) {
                            repository {
                                nameWithOwner
                            }
                            contributions {
                                totalCount
                            }
                        }
                    }
                }
            }
        "#;

        let body = serde_json::json!({
            "query": query,
            "variables": { "from": from, "to": to }
        });

        log::info!("[GITHUB] Fetching contributions for year {}", year);

        let resp = client
            .post("https://api.github.com/graphql")
            .header("Authorization", format!("Bearer {}", token))
            .header("User-Agent", "coppermind-pos")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body_text = resp.text().await.unwrap_or_default();
            log::error!("[GITHUB] GraphQL error {}: {}", status, body_text);
            return Err(PosError::External(format!("GitHub GraphQL error: {}", status)));
        }

        #[derive(Debug, Deserialize)]
        struct ContribResponse {
            data: Option<ContribData>,
            errors: Option<Vec<serde_json::Value>>,
        }

        #[derive(Debug, Deserialize)]
        struct ContribData {
            viewer: ContribViewer,
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ContribViewer {
            contributions_collection: ContribCollection,
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ContribCollection {
            commit_contributions_by_repository: Vec<RepoContrib>,
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RepoContrib {
            repository: RepoName,
            contributions: ContribCount,
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct RepoName {
            name_with_owner: String,
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ContribCount {
            total_count: i32,
        }

        let data: ContribResponse = resp.json().await?;

        if let Some(errors) = data.errors {
            log::error!("[GITHUB] GraphQL errors for year {}: {:?}", year, errors);
            continue; // Skip this year but continue with others
        }

        if let Some(viewer_data) = data.data {
            let collection = viewer_data.viewer.contributions_collection;
            let repo_count = collection.commit_contributions_by_repository.len();
            
            for repo_contrib in collection.commit_contributions_by_repository {
                let repo_name = repo_contrib.repository.name_with_owner;
                let count = repo_contrib.contributions.total_count;
                
                // Aggregate commits across years
                *all_contributions.entry(repo_name).or_insert(0) += count;
            }
            
            log::info!("[GITHUB] Year {} had contributions in {} repos", year, repo_count);
        }

        // Rate limiting between years
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    log::info!("[GITHUB] Found total contributions in {} repos across all years", all_contributions.len());
    Ok(all_contributions)
}

/// Fetch full repo details for specific repos
async fn fetch_repos_details(
    client: &reqwest::Client,
    token: &str,
    user_commits: &HashMap<String, i32>,
) -> Result<Vec<(GraphQLRepository, i32)>, PosError> {
    let mut results = Vec::new();
    
    // Fetch repos in batches via GraphQL with retry logic
    let mut cursor: Option<String> = None;
    let mut page = 1;

    loop {
        let query = r#"
            query($cursor: String) {
                viewer {
                    repositories(first: 100, after: $cursor, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
                        nodes {
                            name
                            owner { login }
                            description
                            isPrivate
                            isFork
                            stargazerCount
                            forkCount
                            watchers { totalCount }
                            diskUsage
                            createdAt
                            updatedAt
                            url
                            homepageUrl
                            repositoryTopics(first: 10) {
                                nodes {
                                    topic { name }
                                }
                            }
                            primaryLanguage { name }
                            defaultBranchRef {
                                target {
                                    ... on Commit {
                                        history {
                                            totalCount
                                        }
                                    }
                                }
                            }
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }
            }
        "#;

        let variables = if let Some(c) = &cursor {
            serde_json::json!({ "cursor": c })
        } else {
            serde_json::json!({ "cursor": null })
        };

        let body = serde_json::json!({
            "query": query,
            "variables": variables
        });

        log::info!("[GITHUB] Fetching repo details page {} via GraphQL", page);

        // Retry logic for transient errors (502, 503, etc.)
        let mut attempts = 0;
        let max_attempts = 3;
        let resp = loop {
            attempts += 1;
            
            let response = client
                .post("https://api.github.com/graphql")
                .header("Authorization", format!("Bearer {}", token))
                .header("User-Agent", "coppermind-pos")
                .json(&body)
                .send()
                .await?;

            if response.status().is_success() {
                break response;
            }

            let status = response.status();
            
            // Retry on 502/503 (server errors)
            if (status.as_u16() == 502 || status.as_u16() == 503) && attempts < max_attempts {
                let backoff_ms = 1000 * (2_u64.pow(attempts - 1)); // Exponential backoff
                log::warn!("[GITHUB] Got {}, retrying in {}ms (attempt {}/{})", status, backoff_ms, attempts, max_attempts);
                std::thread::sleep(std::time::Duration::from_millis(backoff_ms));
                continue;
            }

            // Non-retryable error or max attempts reached
            let body_text = response.text().await.unwrap_or_default();
            log::error!("[GITHUB] GraphQL error {}: {}", status, body_text);
            return Err(PosError::External(format!("GitHub GraphQL error: {}", status)));
        };

        let data: GraphQLResponse = resp.json().await?;

        if let Some(errors) = data.errors {
            log::error!("[GITHUB] GraphQL errors: {:?}", errors);
            return Err(PosError::External(format!("GraphQL errors: {:?}", errors)));
        }

        let viewer = data.data
            .ok_or_else(|| PosError::External("No data in GraphQL response".into()))?
            .viewer;

        let repos = viewer.repositories;
        log::info!("[GITHUB] Page {} returned {} repos", page, repos.nodes.len());
        
        // Match repos with user commit counts
        for repo in repos.nodes {
            let full_name = format!("{}/{}", repo.owner.login, repo.name);
            let user_commit_count = user_commits.get(&full_name).copied().unwrap_or(0);
            
            // Only include repos where user has commits
            if user_commit_count > 0 {
                results.push((repo, user_commit_count));
            }
        }

        if !repos.page_info.has_next_page {
            break;
        }

        cursor = repos.page_info.end_cursor;
        page += 1;

        // Rate limiting
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    log::info!("[GITHUB] Matched {} repos with user contributions", results.len());
    Ok(results)
}

/// Insert new repository from GraphQL data
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

