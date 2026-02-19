use tauri::State;
use chrono::{DateTime, Utc};
use std::collections::HashMap;
use serde::Deserialize;

use crate::{PosDb, PosConfig};
use crate::pos::error::{PosError, PosResult, db_context};
use crate::pos::scrapers::ScraperResponse;
use super::super::build_http_client;
use super::db::{insert_repository_from_graphql, update_repository_from_graphql, update_additional_user_stats, fetch_user_contribution_stats_direct};
use super::types::{GraphQLRepository, GraphQLResponse};

#[tauri::command]
pub async fn scrape_github(
    db: State<'_, PosDb>,
    config: State<'_, PosConfig>,
) -> PosResult<ScraperResponse> {
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
) -> PosResult<HashMap<String, i32>> {
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
) -> PosResult<Vec<(GraphQLRepository, i32)>> {
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


