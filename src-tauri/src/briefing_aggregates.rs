use serde::Serialize;

// ─── Shared sub-structs ──────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivityStat {
    pub date: String,                  // YYYY-MM-DD
    pub total_minutes: i32,
    pub productive_minutes: i32,
    pub goal_directed_minutes: i32,
    pub activity_count: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryTotal {
    pub category: String,
    pub minutes: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HourlyBucket {
    pub hour: i32,                     // 0-23
    pub count: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyGoalStat {
    pub week_num: i32,                 // 1-5
    pub week_start: String,            // YYYY-MM-DD
    pub goals_created: i32,
    pub goals_completed: i32,
    pub goals_debt: i32,
    pub completion_rate: f64,          // 0.0-1.0
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalPriorityBreakdown {
    pub high_completed: i32,
    pub high_total: i32,
    pub medium_completed: i32,
    pub medium_total: i32,
    pub low_completed: i32,
    pub low_total: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneMonthlyProgress {
    pub milestone_id: String,
    pub target_metric: String,
    pub unit: Option<String>,
    pub daily_amount: i32,
    pub target_value: i32,
    pub current_value: i32,            // aggregate from goal_periods.current_value
    pub daily_values: Vec<(String, i32)>,
    pub cumulative_actual: Vec<(String, i32)>,
    pub cumulative_expected: Vec<(String, i32)>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionMonthStats {
    pub total: i32,
    pub accepted: i32,
    pub by_difficulty: Vec<(String, i32)>,
    pub by_platform: Vec<(String, i32)>,
    pub by_verdict: Vec<(String, i32)>,
    pub by_week: Vec<(i32, i32)>,      // (week_num, count)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbMonthStats {
    pub items_added: i32,
    pub items_reviewed: i32,
    pub items_completed: i32,
    pub by_source: Vec<(String, i32)>,
    pub top_tags: Vec<(String, i32)>,  // top 10
    pub inbox_delta: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingMonthStats {
    pub total_pages: i32,
    pub total_minutes: i64,
    pub sessions: i32,
    pub books_active: i32,
    pub pages_per_day: Vec<(String, i32)>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetroData {
    pub energy: f64,
    pub satisfaction: f64,
    pub deep_work_hours: f64,
    pub accomplishments: Option<String>,
    pub challenges: Option<String>,
}

// ─── Monthly response ────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyBriefingResponse {
    pub year: i32,
    pub month: u32,
    pub daily_activity_stats: Vec<DailyActivityStat>,
    pub category_totals: Vec<CategoryTotal>,
    pub hourly_density: Vec<HourlyBucket>,
    pub total_productive_minutes: i64,
    pub total_logged_minutes: i64,
    pub total_goal_directed_minutes: i64,
    pub days_with_activity: i32,
    pub longest_streak: i32,
    pub weekly_goal_stats: Vec<WeeklyGoalStat>,
    pub goal_priority_breakdown: GoalPriorityBreakdown,
    pub total_goals_created: i32,
    pub total_goals_completed: i32,
    pub total_goals_verified: i32,
    pub total_debt_created: i32,
    pub milestone_progress: Vec<MilestoneMonthlyProgress>,
    pub submission_stats: SubmissionMonthStats,
    pub kb_stats: KbMonthStats,
    pub reading_stats: ReadingMonthStats,
    pub retrospective: Option<RetroData>,
}

// ─── Yearly response ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyRollup {
    pub month: String,                 // YYYY-MM
    pub productive_minutes: i64,
    pub total_logged_minutes: i64,
    pub goals_created: i32,
    pub goals_completed: i32,
    pub completion_rate: f64,
    pub debt_net_delta: i32,
    pub problems_solved: i32,
    pub pages_read: i32,
    pub kb_items_added: i32,
    pub kb_items_reviewed: i32,
    pub energy: Option<f64>,
    pub satisfaction: Option<f64>,
    pub deep_work_hours: Option<f64>,
    pub active_days: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YearlyTotals {
    pub total_productive_hours: f64,
    pub total_goals_completed: i32,
    pub total_problems_solved: i32,
    pub total_pages_read: i32,
    pub total_kb_items: i32,
    pub avg_completion_rate: f64,
    pub avg_energy: Option<f64>,
    pub avg_satisfaction: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YearlyBriefingResponse {
    pub year: i32,
    pub monthly_rollups: Vec<MonthlyRollup>,
    pub yearly_totals: YearlyTotals,
    pub best_month: Option<String>,
    pub worst_month: Option<String>,
    pub longest_streak_days: i32,
    pub longest_streak_start: Option<String>,
    pub total_active_days: i32,
    pub category_yearly_totals: Vec<CategoryTotal>,
    pub submission_rating_progression: Vec<(String, i32)>,
}
