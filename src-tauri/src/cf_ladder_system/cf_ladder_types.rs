// CF Ladder & Category Types
// Extracted from cf_ladder_system.rs to keep files under 600 lines

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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
    #[sqlx(default)]
    pub solved_by_friends: Option<Vec<String>>,
    #[sqlx(default)]
    pub status: Option<String>,
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

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CFCategoryRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub problem_count: i32,
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
pub struct ImportCategoryRequest {
    pub html_content: String,
    pub category_name: Option<String>,
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

// ─── Parser Types ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ParsedLadder {
    pub title: String,
    pub description: Option<String>,
    pub ladder_difficulty: Option<i32>,  // 1-10
    pub rating_min: Option<i32>,
    pub rating_max: Option<i32>,
    pub problems: Vec<ParsedProblem>,
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

#[derive(Debug, Clone)]
pub struct ParsedCategory {
    pub name: String,
    pub problems: Vec<ParsedCategoryProblem>,
}

#[derive(Debug, Clone)]
pub struct ParsedCategoryProblem {
    pub position: i32,
    pub problem_id: String,
    pub name: String,
    pub url: String,
    pub judge: String,
    pub year: Option<String>,
    pub contest: Option<String>,
    pub difficulty: Option<i32>,
}

// ─── Bulk Operations Types ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BulkAction {
    SaveToLadder,
    GoalForToday,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkAddProblemsRequest {
    pub urls: Vec<String>,
    pub action: BulkAction,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkAddProblemsResponse {
    pub added_count: i32,
    pub skipped_count: i32,
    pub errors: Vec<String>,
}
