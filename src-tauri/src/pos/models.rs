use serde::{Deserialize, Serialize};

// ─── Activity ───────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Activity {
    pub id: String,
    pub date: String,             // YYYY-MM-DD
    pub start_time: String,       // ISO 8601 UTC
    pub end_time: String,         // ISO 8601 UTC
    pub category: String,
    pub description: String,
    pub is_productive: bool,
    pub is_shadow: bool,
    pub goal_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ActivityMetric {
    pub id: String,
    pub activity_id: String,
    pub goal_metric_id: String,
    pub value: i32,
}

// ─── Submission ─────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Submission {
    pub id: String,
    pub platform: String,
    pub problem_id: String,
    pub problem_title: String,
    pub submitted_time: String,   // ISO 8601 UTC
    pub verdict: String,
    pub language: String,
    pub rating: Option<i32>,
    pub difficulty: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
}

// ─── Goal ───────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Goal {
    pub id: String,
    pub date: String,             // YYYY-MM-DD
    pub description: String,
    pub problem_id: Option<String>,
    pub is_verified: bool,
    pub recurring_goal_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GoalMetric {
    pub id: String,
    pub goal_id: String,
    pub label: String,
    pub target_value: i32,
    pub current_value: i32,
    pub unit: String,
}

// ─── Recurring Goal ─────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RecurringGoal {
    pub id: String,
    pub description: String,
    pub frequency: String,        // "Mon,Tue,Wed" or "Daily"
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RecurringGoalMetric {
    pub id: String,
    pub recurring_goal_id: String,
    pub label: String,
    pub target_value: i32,
    pub unit: String,
}

// ─── Debt Goal ──────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DebtGoal {
    pub id: String,
    pub original_date: String,    // YYYY-MM-DD
    pub description: String,
    pub problem_id: Option<String>,
    pub transitioned_at: String,
    pub resolved_at: Option<String>,
}

// ─── Composite types for frontend responses ─────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalWithDetails {
    #[serde(flatten)]
    pub goal: Goal,
    pub metrics: Vec<GoalMetric>,
    pub activities: Vec<Activity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityDateMetrics {
    pub total_minutes: f64,
    pub productive_minutes: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    pub min_date: String,
    pub max_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScraperResponse {
    pub platform: String,
    pub new_submissions: i32,
    pub total_submissions: i32,
}
