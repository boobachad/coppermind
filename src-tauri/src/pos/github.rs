// ─── GitHub Backend Commands ────────────────────────────────────────
// Query commands for GitHub repositories and user stats.
// Works with repository-level aggregation (not individual commits).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::PosDb;
use super::error::{PosError, db_context};

// ─── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepository {
    pub id: String,
    pub username: String,
    pub repo_name: String,
    pub repo_owner: String,
    pub full_name: String,
    pub description: Option<String>,
    pub languages: Option<serde_json::Value>,
    pub primary_language: Option<String>,
    pub total_commits: i32,
    pub total_prs: i32,
    pub total_issues: i32,
    pub total_reviews: i32,
    pub stars: i32,
    pub forks: i32,
    pub watchers: i32,
    pub size_kb: i32,
    pub is_private: bool,
    pub is_fork: bool,
    pub first_commit_date: Option<DateTime<Utc>>,
    pub last_commit_date: Option<DateTime<Utc>>,
    pub repo_created_at: Option<DateTime<Utc>>,
    pub repo_updated_at: Option<DateTime<Utc>>,
    pub repo_url: Option<String>,
    pub homepage_url: Option<String>,
    pub topics: Option<serde_json::Value>,
    pub synced_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUserStats {
    pub username: String,
    pub total_repos: i32,
    pub total_commits: i32,
    pub total_prs: i32,
    pub total_issues: i32,
    pub total_reviews: i32,
    pub total_stars_received: i32,
    pub languages_breakdown: Option<serde_json::Value>,
    pub current_streak_days: i32,
    pub longest_streak_days: i32,
    pub contributions_by_year: Option<serde_json::Value>,
    pub top_repos: Option<serde_json::Value>,
    pub synced_at: DateTime<Utc>,
}

// ─── Commands ───────────────────────────────────────────────────────

/// Get GitHub repositories with optional filters
#[tauri::command]
pub async fn get_github_repositories(
    db: State<'_, PosDb>,
    username: String,
    language: Option<String>,
    min_commits: Option<i32>,
    sort_by: Option<String>, // "commits", "stars", "updated"
    limit: Option<i64>,
) -> Result<Vec<GitHubRepository>, PosError> {
    let pool = &db.0;
    
    let mut query = String::from(
        r#"SELECT id, username, repo_name, repo_owner, full_name, description,
                  languages, primary_language, total_commits, total_prs, total_issues, total_reviews,
                  stars, forks, watchers, size_kb, is_private, is_fork,
                  first_commit_date, last_commit_date, repo_created_at, repo_updated_at,
                  repo_url, homepage_url, topics, synced_at
           FROM github_repositories WHERE username = $1"#
    );
    
    let mut param_count = 2;
    let mut bind_values: Vec<String> = vec![username.clone()];
    
    if let Some(lang) = language {
        query.push_str(&format!(" AND primary_language = ${}", param_count));
        bind_values.push(lang);
        param_count += 1;
    }
    
    let _ = param_count; // Suppress unused warning
    
    if let Some(min) = min_commits {
        query.push_str(&format!(" AND total_commits >= {}", min));
    }
    
    // Sorting
    let sort_clause = match sort_by.as_deref() {
        Some("stars") => " ORDER BY stars DESC",
        Some("updated") => " ORDER BY repo_updated_at DESC NULLS LAST",
        _ => " ORDER BY total_commits DESC", // Default: commits
    };
    query.push_str(sort_clause);
    
    if let Some(l) = limit {
        query.push_str(&format!(" LIMIT {}", l));
    }
    
    // Use sqlx::query instead of query_as to avoid tuple limit
    let mut q = sqlx::query(&query);
    
    // Bind username
    q = q.bind(&username);
    
    // Bind optional language
    if bind_values.len() > 1 {
        q = q.bind(&bind_values[1]);
    }
    
    let rows = q.fetch_all(pool).await
        .map_err(|e| db_context("Fetch repositories", e))?;
    
    let repos = rows.into_iter().map(|row| {
        use sqlx::Row;
        GitHubRepository {
            id: row.get("id"),
            username: row.get("username"),
            repo_name: row.get("repo_name"),
            repo_owner: row.get("repo_owner"),
            full_name: row.get("full_name"),
            description: row.get("description"),
            languages: row.get("languages"),
            primary_language: row.get("primary_language"),
            total_commits: row.get("total_commits"),
            total_prs: row.get("total_prs"),
            total_issues: row.get("total_issues"),
            total_reviews: row.get("total_reviews"),
            stars: row.get("stars"),
            forks: row.get("forks"),
            watchers: row.get("watchers"),
            size_kb: row.get("size_kb"),
            is_private: row.get("is_private"),
            is_fork: row.get("is_fork"),
            first_commit_date: row.get("first_commit_date"),
            last_commit_date: row.get("last_commit_date"),
            repo_created_at: row.get("repo_created_at"),
            repo_updated_at: row.get("repo_updated_at"),
            repo_url: row.get("repo_url"),
            homepage_url: row.get("homepage_url"),
            topics: row.get("topics"),
            synced_at: row.get("synced_at"),
        }
    }).collect();
    
    Ok(repos)
}

/// Get GitHub user statistics
#[tauri::command]
pub async fn get_github_user_stats(
    db: State<'_, PosDb>,
    username: String,
) -> Result<GitHubUserStats, PosError> {
    let pool = &db.0;
    
    let row = sqlx::query(
        r#"SELECT username, total_repos, total_commits, total_prs, total_issues, total_reviews,
                  total_stars_received, languages_breakdown, current_streak_days, longest_streak_days,
                  contributions_by_year, top_repos, synced_at
           FROM github_user_stats WHERE username = $1"#
    )
    .bind(&username)
    .fetch_one(pool)
    .await
    .map_err(|e| db_context("Fetch user stats", e))?;
    
    use sqlx::Row;
    Ok(GitHubUserStats {
        username: row.get("username"),
        total_repos: row.get("total_repos"),
        total_commits: row.get("total_commits"),
        total_prs: row.get("total_prs"),
        total_issues: row.get("total_issues"),
        total_reviews: row.get("total_reviews"),
        total_stars_received: row.get("total_stars_received"),
        languages_breakdown: row.get("languages_breakdown"),
        current_streak_days: row.get("current_streak_days"),
        longest_streak_days: row.get("longest_streak_days"),
        contributions_by_year: row.get("contributions_by_year"),
        top_repos: row.get("top_repos"),
        synced_at: row.get("synced_at"),
    })
}
