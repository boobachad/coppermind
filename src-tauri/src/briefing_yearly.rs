use chrono::{DateTime, Datelike, Utc};
use std::collections::HashMap;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosResult, db_context};
use crate::briefing_aggregates::{
    CategoryTotal, MonthlyRollup, YearlyBriefingResponse, YearlyTotals,
};

// ─── Internal row types ──────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ActYearRow {
    date: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    category: String,
    is_productive: bool,
    is_shadow: bool,
    book_id: Option<String>,
    pages_read: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct GoalYearRow {
    date: String,
    completed: bool,
    is_debt: bool,
}

#[derive(sqlx::FromRow)]
struct SubYearRow {
    submitted_time: DateTime<Utc>,
    rating: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct KbYearRow {
    created_at: DateTime<Utc>,
    status: String,
    next_review_date: Option<DateTime<Utc>>,
}

#[derive(sqlx::FromRow)]
struct RetroYearRow {
    period_start: DateTime<Utc>,
    questions_data: serde_json::Value,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn month_key(year: i32, month: u32) -> String {
    format!("{}-{:02}", year, month)
}

fn compute_yearly_streak(active_days: &std::collections::HashSet<String>, year: i32) -> (i32, Option<String>) {
    let mut max_streak = 0i32;
    let mut cur = 0i32;
    let mut max_start: Option<String> = None;
    let mut cur_start: Option<String> = None;

    for m in 1u32..=12 {
        let days_in = {
            let next = if m == 12 { chrono::NaiveDate::from_ymd_opt(year + 1, 1, 1) }
                       else { chrono::NaiveDate::from_ymd_opt(year, m + 1, 1) };
            next.unwrap().pred_opt().unwrap().day()
        };
        for d in 1..=days_in {
            let date_str = format!("{}-{:02}-{:02}", year, m, d);
            if active_days.contains(&date_str) {
                if cur == 0 { cur_start = Some(date_str.clone()); }
                cur += 1;
                if cur > max_streak {
                    max_streak = cur;
                    max_start = cur_start.clone();
                }
            } else {
                cur = 0;
                cur_start = None;
            }
        }
    }
    (max_streak, max_start)
}

// ─── Command ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_yearly_briefing(
    db: State<'_, PosDb>,
    year: i32,
) -> PosResult<YearlyBriefingResponse> {
    let pool = &db.0;
    let year_start = format!("{}-01-01", year);
    let year_end = format!("{}-12-31", year);
    let ts_start = format!("{}T00:00:00Z", year_start).parse::<DateTime<Utc>>()
        .map_err(|e| crate::pos::error::PosError::InvalidInput(format!("date parse: {}", e)))?;
    let ts_end = format!("{}T23:59:59Z", year_end).parse::<DateTime<Utc>>()
        .map_err(|e| crate::pos::error::PosError::InvalidInput(format!("date parse: {}", e)))?;

    // All queries run concurrently
    let (act_rows, goal_rows, sub_rows, kb_rows, retro_rows) = tokio::try_join!(
        sqlx::query_as::<_, ActYearRow>(
            r#"SELECT date, start_time, end_time, category, is_productive, is_shadow, book_id, pages_read
               FROM pos_activities WHERE date >= $1 AND date <= $2 ORDER BY date"#
        ).bind(&year_start).bind(&year_end).fetch_all(pool),

        sqlx::query_as::<_, GoalYearRow>(
            r#"SELECT date, completed, is_debt FROM unified_goals
               WHERE date >= $1 AND date <= $2"#
        ).bind(&year_start).bind(&year_end).fetch_all(pool),

        sqlx::query_as::<_, SubYearRow>(
            r#"SELECT submitted_time, rating FROM pos_submissions
               WHERE EXTRACT(YEAR FROM submitted_time) = $1 ORDER BY submitted_time"#
        ).bind(year).fetch_all(pool),

        sqlx::query_as::<_, KbYearRow>(
            r#"SELECT created_at, status, next_review_date FROM knowledge_items
               WHERE EXTRACT(YEAR FROM created_at) = $1"#
        ).bind(year).fetch_all(pool),

        sqlx::query_as::<_, RetroYearRow>(
            r#"SELECT period_start, questions_data FROM retrospectives
               WHERE period_type = 'monthly' AND EXTRACT(YEAR FROM period_start) = $1
               ORDER BY period_start"#
        ).bind(year).fetch_all(pool),
    ).map_err(|e| db_context("get_yearly_briefing:parallel_fetch", e))?;

    // ── Per-month rollup maps ────────────────────────────────────────────────
    let mut prod_map: HashMap<String, i64> = HashMap::with_capacity(12);
    let mut logged_map: HashMap<String, i64> = HashMap::with_capacity(12);
    let mut cat_year_map: HashMap<String, i64> = HashMap::new();
    let mut active_days: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut pages_map: HashMap<String, i32> = HashMap::with_capacity(12);

    for row in &act_rows {
        if row.is_shadow { continue; }
        let dur = (row.end_time - row.start_time).num_minutes();
        let mk = &row.date[..7]; // YYYY-MM
        *logged_map.entry(mk.to_string()).or_insert(0) += dur;
        if row.is_productive { *prod_map.entry(mk.to_string()).or_insert(0) += dur; }
        *cat_year_map.entry(row.category.clone()).or_insert(0) += dur;
        active_days.insert(row.date.clone());
        if row.book_id.is_some() {
            *pages_map.entry(mk.to_string()).or_insert(0) += row.pages_read.unwrap_or(0);
        }
    }

    let mut goals_created_map: HashMap<String, i32> = HashMap::with_capacity(12);
    let mut goals_completed_map: HashMap<String, i32> = HashMap::with_capacity(12);
    let mut debt_created_map: HashMap<String, i32> = HashMap::with_capacity(12);

    for row in &goal_rows {
        let mk = &row.date[..7];
        *goals_created_map.entry(mk.to_string()).or_insert(0) += 1;
        if row.completed { *goals_completed_map.entry(mk.to_string()).or_insert(0) += 1; }
        if row.is_debt { *debt_created_map.entry(mk.to_string()).or_insert(0) += 1; }
    }

    let mut sub_count_map: HashMap<String, i32> = HashMap::with_capacity(12);
    let mut rating_progression: Vec<(String, i32)> = Vec::new();

    for row in &sub_rows {
        let mk = format!("{}-{:02}", row.submitted_time.year(), row.submitted_time.month());
        *sub_count_map.entry(mk).or_insert(0) += 1;
        if let Some(r) = row.rating {
            let date_str = format!("{}-{:02}-{:02}",
                row.submitted_time.year(), row.submitted_time.month(), row.submitted_time.day());
            rating_progression.push((date_str, r));
        }
    }

    let mut kb_added_map: HashMap<String, i32> = HashMap::with_capacity(12);
    let mut kb_reviewed_map: HashMap<String, i32> = HashMap::with_capacity(12);

    for row in &kb_rows {
        let mk = format!("{}-{:02}", row.created_at.year(), row.created_at.month());
        *kb_added_map.entry(mk).or_insert(0) += 1;
        if row.status != "Inbox" {
            if let Some(nrd) = row.next_review_date {
                if nrd >= ts_start && nrd <= ts_end {
                    *kb_reviewed_map.entry(
                        format!("{}-{:02}", nrd.year(), nrd.month())
                    ).or_insert(0) += 1;
                }
            }
        }
    }

    let retro_map: HashMap<String, &RetroYearRow> = retro_rows.iter()
        .map(|r| (format!("{}-{:02}", r.period_start.year(), r.period_start.month()), r))
        .collect();

    // ── Build 12 monthly rollups ─────────────────────────────────────────────
    let mut monthly_rollups: Vec<MonthlyRollup> = Vec::with_capacity(12);
    let mut active_day_counts: HashMap<String, i32> = HashMap::with_capacity(12);
    for d in &active_days {
        *active_day_counts.entry(d[..7].to_string()).or_insert(0) += 1;
    }

    for m in 1u32..=12 {
        let mk = month_key(year, m);
        let created = goals_created_map.get(&mk).copied().unwrap_or(0);
        let completed = goals_completed_map.get(&mk).copied().unwrap_or(0);
        let debt_created = debt_created_map.get(&mk).copied().unwrap_or(0);
        let retro = retro_map.get(&mk);

        monthly_rollups.push(MonthlyRollup {
            month: mk.clone(),
            productive_minutes: prod_map.get(&mk).copied().unwrap_or(0),
            total_logged_minutes: logged_map.get(&mk).copied().unwrap_or(0),
            goals_created: created,
            goals_completed: completed,
            completion_rate: if created > 0 { completed as f64 / created as f64 } else { 0.0 },
            debt_net_delta: debt_created,
            problems_solved: sub_count_map.get(&mk).copied().unwrap_or(0),
            pages_read: pages_map.get(&mk).copied().unwrap_or(0),
            kb_items_added: kb_added_map.get(&mk).copied().unwrap_or(0),
            kb_items_reviewed: kb_reviewed_map.get(&mk).copied().unwrap_or(0),
            energy: retro.and_then(|r| r.questions_data["energy"].as_f64()),
            satisfaction: retro.and_then(|r| r.questions_data["satisfaction"].as_f64()),
            deep_work_hours: retro.and_then(|r| r.questions_data["deep_work_hours"].as_f64()),
            active_days: active_day_counts.get(&mk).copied().unwrap_or(0),
        });
    }

    // ── Yearly totals ────────────────────────────────────────────────────────
    let total_productive_hours = monthly_rollups.iter().map(|m| m.productive_minutes).sum::<i64>() as f64 / 60.0;
    let total_goals_completed = monthly_rollups.iter().map(|m| m.goals_completed).sum();
    let total_problems_solved = monthly_rollups.iter().map(|m| m.problems_solved).sum();
    let total_pages_read = monthly_rollups.iter().map(|m| m.pages_read).sum();
    let total_kb_items = monthly_rollups.iter().map(|m| m.kb_items_added).sum();
    let rates: Vec<f64> = monthly_rollups.iter().filter(|m| m.goals_created > 0).map(|m| m.completion_rate).collect();
    let avg_completion_rate = if rates.is_empty() { 0.0 } else { rates.iter().sum::<f64>() / rates.len() as f64 };
    let energies: Vec<f64> = monthly_rollups.iter().filter_map(|m| m.energy).collect();
    let sats: Vec<f64> = monthly_rollups.iter().filter_map(|m| m.satisfaction).collect();
    let avg_energy = if energies.is_empty() { None } else { Some(energies.iter().sum::<f64>() / energies.len() as f64) };
    let avg_satisfaction = if sats.is_empty() { None } else { Some(sats.iter().sum::<f64>() / sats.len() as f64) };

    let yearly_totals = YearlyTotals {
        total_productive_hours,
        total_goals_completed,
        total_problems_solved,
        total_pages_read,
        total_kb_items,
        avg_completion_rate,
        avg_energy,
        avg_satisfaction,
    };

    let best_month = monthly_rollups.iter()
        .max_by_key(|m| m.productive_minutes)
        .filter(|m| m.productive_minutes > 0)
        .map(|m| m.month.clone());
    let worst_month = monthly_rollups.iter()
        .min_by_key(|m| m.productive_minutes)
        .filter(|m| m.productive_minutes > 0)
        .map(|m| m.month.clone());

    let (longest_streak_days, longest_streak_start) = compute_yearly_streak(&active_days, year);
    let total_active_days = active_days.len() as i32;

    let mut category_yearly_totals: Vec<CategoryTotal> = cat_year_map
        .into_iter().map(|(category, minutes)| CategoryTotal { category, minutes }).collect();
    category_yearly_totals.sort_by(|a, b| b.minutes.cmp(&a.minutes));

    log::info!("[BRIEFING] Yearly {}: {} active days, {} problems, {:.1}h productive",
        year, total_active_days, total_problems_solved, total_productive_hours);

    Ok(YearlyBriefingResponse {
        year,
        monthly_rollups,
        yearly_totals,
        best_month,
        worst_month,
        longest_streak_days,
        longest_streak_start,
        total_active_days,
        category_yearly_totals,
        submission_rating_progression: rating_progression,
    })
}
