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
