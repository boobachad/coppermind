// ─── GitHub Scraper ─────────────────────────────────────────────────
// Scrapes GitHub repositories with contribution stats via GraphQL.
// Strategy: Single GraphQL query gets all repos + metadata + commit counts.

// No imports needed for pure data types
use serde::Deserialize;

// ─── GraphQL Response Types ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct GraphQLResponse {
    pub(crate) data: Option<GraphQLData>,
    pub(crate) errors: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct GraphQLData {
    pub(crate) viewer: Viewer,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Viewer {
    pub(crate) repositories: RepositoryConnection,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RepositoryConnection {
    pub(crate) nodes: Vec<GraphQLRepository>,
    #[serde(rename = "pageInfo")]
    pub(crate) page_info: PageInfo,
}

#[derive(Debug, Deserialize)]
pub(crate) struct PageInfo {
    #[serde(rename = "hasNextPage")]
    pub(crate) has_next_page: bool,
    #[serde(rename = "endCursor")]
    pub(crate) end_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GraphQLRepository {
    pub(crate) name: String,
    pub(crate) owner: Owner,
    pub(crate) description: Option<String>,
    pub(crate) is_private: bool,
    pub(crate) is_fork: bool,
    pub(crate) stargazer_count: i32,
    pub(crate) fork_count: i32,
    #[serde(rename = "watchers")]
    pub(crate) watchers_connection: WatchersConnection,
    pub(crate) disk_usage: Option<i32>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) url: String,
    pub(crate) homepage_url: Option<String>,
    pub(crate) repository_topics: RepositoryTopics,
    pub(crate) primary_language: Option<Language>,
    pub(crate) default_branch_ref: Option<BranchRef>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Owner {
    pub(crate) login: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Language {
    pub(crate) name: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WatchersConnection {
    #[serde(rename = "totalCount")]
    pub(crate) total_count: i32,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RepositoryTopics {
    pub(crate) nodes: Vec<RepositoryTopic>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RepositoryTopic {
    pub(crate) topic: Topic,
}

#[derive(Debug, Deserialize)]
pub(crate) struct Topic {
    pub(crate) name: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BranchRef {
    pub(crate) target: BranchTarget,
}

#[derive(Debug, Deserialize)]
pub(crate) struct BranchTarget {
    pub(crate) history: CommitHistory,
}

#[derive(Debug, Deserialize)]
pub(crate) struct CommitHistory {
    #[serde(rename = "totalCount")]
    pub(crate) total_count: i32,
}