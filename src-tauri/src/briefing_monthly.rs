use chrono::{DateTime, Datelike, NaiveDate, Timelike, Utc};
use std::collections::HashMap;
use tauri::State;

use crate::PosDb;
use crate::pos::error::{PosResult, db_context};
use crate::briefing_aggregates::{
    CategoryTotal, DailyActivityStat, GoalPriorityBreakdown, HourlyBucket,
    KbMonthStats, MilestoneMonthlyProgress, MonthlyBriefingResponse,
    ReadingMonthStats, RetroData, SubmissionMonthStats, WeeklyGoalStat,
};

// ─── Internal row types ──────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ActRow {
    date: String,
    start_time: DateTime<Utc>,
    end_time: DateTime<Utc>,
    category: String,
    is_productive: bool,
    is_shadow: bool,
    goal_ids: Option<Vec<String>>,
    milestone_id: Option<String>,
    book_id: Option<String>,
    pages_read: Option<i32>,
}

#[derive(sqlx::FromRow)]
struct GoalRow {
    date: String,
    completed: bool,
    verified: bool,
    priority: String,
    is_debt: bool,
}

#[derive(sqlx::FromRow)]
struct SubRow {
    submitted_time: DateTime<Utc>,
    platform: String,
    verdict: String,
    difficulty: Option<String>,
}

#[derive(sqlx::FromRow)]
struct KbRow {
    source: String,
    tags: Vec<String>,
    status: String,
    next_review_date: Option<DateTime<Utc>>,
}

#[derive(sqlx::FromRow)]
struct MilestoneRow {
    id: String,
    target_metric: String,
    unit: Option<String>,
    daily_amount: i32,
    target_value: i32,
    current_value: i32,
    period_start: DateTime<Utc>,
    period_end: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct RetroRow {
    questions_data: serde_json::Value,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn days_in_month(year: i32, month: u32) -> u32 {
    NaiveDate::from_ymd_opt(year, month + 1, 1)
        .or_else(|| NaiveDate::from_ymd_opt(year + 1, 1, 1))
        .and_then(|d| d.pred_opt())
        .map(|d| d.day())
        .unwrap_or(30)
}

// Week number within month: days 1-7 = week 1, 8-14 = week 2, etc.
fn week_of_month(day: u32) -> i32 {
    ((day - 1) / 7 + 1) as i32
}

fn week_start_date(year: i32, month: u32, week_num: i32) -> String {
    let day = (week_num - 1) * 7 + 1;
    format!("{}-{:02}-{:02}", year, month, day)
}

fn compute_longest_streak(daily_stats: &[DailyActivityStat]) -> i32 {
    let mut max_streak = 0i32;
    let mut cur = 0i32;
    for stat in daily_stats {
        if stat.activity_count > 0 {
            cur += 1;
            max_streak = max_streak.max(cur);
        } else {
            cur = 0;
        }
    }
    max_streak
}

// ─── Command ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_monthly_briefing(
    db: State<'_, PosDb>,
    year: i32,
    month: u32,
) -> PosResult<MonthlyBriefingResponse> {
    let pool = &db.0;
    let month_start = format!("{}-{:02}-01", year, month);
    let last_day = days_in_month(year, month);
    let month_end = format!("{}-{:02}-{:02}", year, month, last_day);

    // Parse timestamps for TIMESTAMPTZ queries
    let ts_start = format!("{}T00:00:00Z", month_start)
        .parse::<DateTime<Utc>>()
        .map_err(|e| crate::pos::error::PosError::InvalidInput(format!("date parse: {}", e)))?;
    let ts_end = format!("{}T23:59:59Z", month_end)
        .parse::<DateTime<Utc>>()
        .map_err(|e| crate::pos::error::PosError::InvalidInput(format!("date parse: {}", e)))?;

    // Run all independent queries concurrently
    let (act_rows, goal_rows, sub_rows, kb_rows, milestone_rows, retro_row) = tokio::try_join!(
        sqlx::query_as::<_, ActRow>(
            r#"SELECT date, start_time, end_time, category, is_productive, is_shadow,
                      goal_ids, milestone_id, book_id, pages_read
               FROM pos_activities WHERE date >= $1 AND date <= $2 ORDER BY date, start_time"#
        ).bind(&month_start).bind(&month_end).fetch_all(pool),

        sqlx::query_as::<_, GoalRow>(
            r#"SELECT date, completed, verified, priority, is_debt
               FROM unified_goals WHERE date >= $1 AND date <= $2"#
        ).bind(&month_start).bind(&month_end).fetch_all(pool),

        sqlx::query_as::<_, SubRow>(
            r#"SELECT submitted_time, platform, verdict, difficulty
               FROM pos_submissions WHERE submitted_time >= $1 AND submitted_time <= $2"#
        ).bind(ts_start).bind(ts_end).fetch_all(pool),

        sqlx::query_as::<_, KbRow>(
            r#"SELECT source, tags, status, next_review_date
               FROM knowledge_items WHERE created_at >= $1 AND created_at <= $2"#
        ).bind(ts_start).bind(ts_end).fetch_all(pool),

        sqlx::query_as::<_, MilestoneRow>(
            r#"SELECT id, target_metric, unit, daily_amount, target_value, current_value, period_start, period_end
               FROM goal_periods WHERE period_start <= $1 AND period_end >= $2"#
        ).bind(ts_end).bind(ts_start).fetch_all(pool),

        sqlx::query_as::<_, RetroRow>(
            r#"SELECT questions_data FROM retrospectives
               WHERE period_type = 'monthly' AND period_start >= $1 AND period_start <= $2
               ORDER BY period_start DESC LIMIT 1"#
        ).bind(ts_start).bind(ts_end).fetch_optional(pool),
    ).map_err(|e| db_context("get_monthly_briefing:parallel_fetch", e))?;

    // ── Aggregate activities ─────────────────────────────────────────────────
    let mut daily_map: HashMap<String, DailyActivityStat> =
        HashMap::with_capacity(last_day as usize);
    let mut cat_map: HashMap<String, i64> = HashMap::new();
    let mut hour_buckets = [0i32; 24];
    let mut total_productive: i64 = 0;
    let mut total_logged: i64 = 0;
    let mut total_goal_directed: i64 = 0;

    for row in &act_rows {
        let dur = (row.end_time - row.start_time).num_minutes();
        if row.is_shadow { continue; }

        let stat = daily_map.entry(row.date.clone()).or_insert(DailyActivityStat {
            date: row.date.clone(),
            total_minutes: 0,
            productive_minutes: 0,
            goal_directed_minutes: 0,
            activity_count: 0,
        });
        stat.total_minutes += dur as i32;
        stat.activity_count += 1;
        total_logged += dur;

        if row.is_productive {
            stat.productive_minutes += dur as i32;
            total_productive += dur;
        }
        if row.goal_ids.is_some() || row.milestone_id.is_some() {
            stat.goal_directed_minutes += dur as i32;
            total_goal_directed += dur;
        }

        *cat_map.entry(row.category.clone()).or_insert(0) += dur;

        let h = row.start_time.hour() as usize;
        hour_buckets[h] += 1;
    }

    // Build sorted daily stats for all days in month
    let mut daily_activity_stats: Vec<DailyActivityStat> =
        Vec::with_capacity(last_day as usize);
    for d in 1..=last_day {
        let date_str = format!("{}-{:02}-{:02}", year, month, d);
        daily_activity_stats.push(daily_map.remove(&date_str).unwrap_or(DailyActivityStat {
            date: date_str,
            total_minutes: 0,
            productive_minutes: 0,
            goal_directed_minutes: 0,
            activity_count: 0,
        }));
    }

    let longest_streak = compute_longest_streak(&daily_activity_stats);
    let days_with_activity = daily_activity_stats.iter().filter(|s| s.activity_count > 0).count() as i32;

    let mut category_totals: Vec<CategoryTotal> = cat_map
        .into_iter()
        .map(|(category, minutes)| CategoryTotal { category, minutes })
        .collect();
    category_totals.sort_by(|a, b| b.minutes.cmp(&a.minutes));

    let hourly_density: Vec<HourlyBucket> = hour_buckets
        .iter()
        .enumerate()
        .map(|(h, &count)| HourlyBucket { hour: h as i32, count })
        .collect();

    // ── Aggregate goals ──────────────────────────────────────────────────────
    let mut weekly_map: HashMap<i32, WeeklyGoalStat> = HashMap::with_capacity(5);
    let mut priority_map: HashMap<String, (i32, i32)> = HashMap::new(); // (completed, total)
    let mut total_goals_created = 0i32;
    let mut total_goals_completed = 0i32;
    let mut total_goals_verified = 0i32;
    let mut total_debt_created = 0i32;

    for row in &goal_rows {
        let day: u32 = row.date.split('-').nth(2).and_then(|d| d.parse().ok()).unwrap_or(1);
        let wk = week_of_month(day);

        let ws = weekly_map.entry(wk).or_insert(WeeklyGoalStat {
            week_num: wk,
            week_start: week_start_date(year, month, wk),
            goals_created: 0,
            goals_completed: 0,
            goals_debt: 0,
            completion_rate: 0.0,
        });
        ws.goals_created += 1;
        total_goals_created += 1;

        if row.completed {
            ws.goals_completed += 1;
            total_goals_completed += 1;
        }
        if row.is_debt { ws.goals_debt += 1; total_debt_created += 1; }
        if row.verified { total_goals_verified += 1; }

        let entry = priority_map.entry(row.priority.clone()).or_insert((0, 0));
        entry.1 += 1;
        if row.completed { entry.0 += 1; }
    }

    let mut weekly_goal_stats: Vec<WeeklyGoalStat> = weekly_map.into_values().collect();
    for ws in &mut weekly_goal_stats {
        ws.completion_rate = if ws.goals_created > 0 {
            ws.goals_completed as f64 / ws.goals_created as f64
        } else { 0.0 };
    }
    weekly_goal_stats.sort_by_key(|w| w.week_num);

    let get_prio = |k: &str| priority_map.get(k).copied().unwrap_or((0, 0));
    let (hc, ht) = get_prio("high");
    let (mc, mt) = get_prio("medium");
    let (lc, lt) = get_prio("low");
    let goal_priority_breakdown = GoalPriorityBreakdown {
        high_completed: hc, high_total: ht,
        medium_completed: mc, medium_total: mt,
        low_completed: lc, low_total: lt,
    };

    // ── Aggregate submissions ────────────────────────────────────────────────
    let mut sub_total = 0i32;
    let mut sub_accepted = 0i32;
    let mut diff_map: HashMap<String, i32> = HashMap::new();
    let mut plat_map: HashMap<String, i32> = HashMap::new();
    let mut verdict_map: HashMap<String, i32> = HashMap::new();
    let mut sub_week_map: HashMap<i32, i32> = HashMap::with_capacity(5);

    for row in &sub_rows {
        sub_total += 1;
        if row.verdict == "Accepted" || row.verdict == "OK" { sub_accepted += 1; }
        *diff_map.entry(row.difficulty.clone().unwrap_or_else(|| "Unknown".into())).or_insert(0) += 1;
        *plat_map.entry(row.platform.clone()).or_insert(0) += 1;
        *verdict_map.entry(row.verdict.clone()).or_insert(0) += 1;
        let day = row.submitted_time.day();
        let wk = week_of_month(day);
        *sub_week_map.entry(wk).or_insert(0) += 1;
    }

    let mut by_week: Vec<(i32, i32)> = sub_week_map.into_iter().collect();
    by_week.sort_by_key(|(w, _)| *w);

    let submission_stats = SubmissionMonthStats {
        total: sub_total,
        accepted: sub_accepted,
        by_difficulty: diff_map.into_iter().collect(),
        by_platform: plat_map.into_iter().collect(),
        by_verdict: verdict_map.into_iter().collect(),
        by_week,
    };

    // ── Aggregate KB ─────────────────────────────────────────────────────────
    let mut src_map: HashMap<String, i32> = HashMap::new();
    let mut tag_map: HashMap<String, i32> = HashMap::new();
    let mut kb_reviewed = 0i32;
    let mut kb_completed = 0i32;

    for row in &kb_rows {
        *src_map.entry(row.source.clone()).or_insert(0) += 1;
        for tag in &row.tags { *tag_map.entry(tag.clone()).or_insert(0) += 1; }
        if row.status != "Inbox" { kb_reviewed += 1; }
        if row.status == "Completed" { kb_completed += 1; }
    }

    let mut top_tags: Vec<(String, i32)> = tag_map.into_iter().collect();
    top_tags.sort_by(|a, b| b.1.cmp(&a.1));
    top_tags.truncate(10);

    let kb_added = kb_rows.len() as i32;
    let kb_stats = KbMonthStats {
        items_added: kb_added,
        items_reviewed: kb_reviewed,
        items_completed: kb_completed,
        by_source: src_map.into_iter().collect(),
        top_tags,
        inbox_delta: kb_added - kb_reviewed,
    };

    // ── Aggregate reading ────────────────────────────────────────────────────
    let reading_rows: Vec<&ActRow> = act_rows.iter().filter(|r| r.book_id.is_some()).collect();
    let mut pages_per_day: HashMap<String, i32> = HashMap::new();
    let mut total_pages = 0i32;
    let mut total_read_minutes = 0i64;
    let mut book_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    for row in &reading_rows {
        let pages = row.pages_read.unwrap_or(0);
        *pages_per_day.entry(row.date.clone()).or_insert(0) += pages;
        total_pages += pages;
        total_read_minutes += (row.end_time - row.start_time).num_minutes();
        if let Some(bid) = &row.book_id { book_ids.insert(bid.clone()); }
    }

    let mut ppd_vec: Vec<(String, i32)> = pages_per_day.into_iter().collect();
    ppd_vec.sort_by(|a, b| a.0.cmp(&b.0));

    let reading_stats = ReadingMonthStats {
        total_pages,
        total_minutes: total_read_minutes,
        sessions: reading_rows.len() as i32,
        books_active: book_ids.len() as i32,
        pages_per_day: ppd_vec,
    };

    // ── Milestone progress curves ────────────────────────────────────────────
    let mut milestone_progress: Vec<MilestoneMonthlyProgress> =
        Vec::with_capacity(milestone_rows.len());

    // Fetch all daily progress rows for all milestones in one query
    let milestone_ids: Vec<String> = milestone_rows.iter().map(|m| m.id.clone()).collect();
    let mut grouped_progress: HashMap<String, Vec<(String, i32)>> = HashMap::new();

    if !milestone_ids.is_empty() {
        // Build a parameterised IN clause dynamically
        let placeholders: String = milestone_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 3))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT milestone_id, date, amount FROM milestone_daily_progress \
             WHERE date >= $1 AND date <= $2 AND milestone_id IN ({}) ORDER BY date",
            placeholders
        );
        let mut q = sqlx::query_as::<_, (String, String, i32)>(&sql)
            .bind(&month_start)
            .bind(&month_end);
        for id in &milestone_ids {
            q = q.bind(id);
        }
        let all_rows: Vec<(String, String, i32)> = q
            .fetch_all(pool)
            .await
            .map_err(|e| db_context("milestone_daily_progress_batch", e))?;

        for (milestone_id, date, amount) in all_rows {
            grouped_progress.entry(milestone_id).or_default().push((date, amount));
        }
    }

    for ms in &milestone_rows {
        let daily_values: Vec<(String, i32)> = grouped_progress
            .get(&ms.id)
            .cloned()
            .unwrap_or_default();

        let total_days = last_day as i32;
        let mut cum_actual: Vec<(String, i32)> = Vec::with_capacity(total_days as usize);
        let mut cum_expected: Vec<(String, i32)> = Vec::with_capacity(total_days as usize);
        let val_map: HashMap<&str, i32> = daily_values.iter()
            .map(|(d, v)| (d.as_str(), *v)).collect();

        let mut running = 0i32;
        for d in 1..=total_days {
            let date_str = format!("{}-{:02}-{:02}", year, month, d);
            running += val_map.get(date_str.as_str()).copied().unwrap_or(0);
            cum_actual.push((date_str.clone(), running));
            cum_expected.push((date_str, ms.daily_amount * d));
        }

        milestone_progress.push(MilestoneMonthlyProgress {
            milestone_id: ms.id.clone(),
            target_metric: ms.target_metric.clone(),
            unit: ms.unit.clone(),
            daily_amount: ms.daily_amount,
            target_value: ms.target_value,
            current_value: ms.current_value,
            daily_values,
            cumulative_actual: cum_actual,
            cumulative_expected: cum_expected,
        });
    }

    // ── Retrospective ────────────────────────────────────────────────────────
    let retrospective = retro_row.map(|r| {
        let qd = &r.questions_data;

        let energy = qd["energy"].as_f64().unwrap_or_else(|| {
            log::warn!("[BRIEFING] retro missing/invalid key 'energy' for {}-{:02}", year, month);
            0.0
        });
        let satisfaction = qd["satisfaction"].as_f64().unwrap_or_else(|| {
            log::warn!("[BRIEFING] retro missing/invalid key 'satisfaction' for {}-{:02}", year, month);
            0.0
        });
        let deep_work_hours = qd["deep_work_hours"].as_f64().unwrap_or_else(|| {
            log::warn!("[BRIEFING] retro missing/invalid key 'deep_work_hours' for {}-{:02}", year, month);
            0.0
        });
        let accomplishments = qd["accomplishments"].as_str().map(String::from);
        let challenges = qd["challenges"].as_str().map(String::from);

        RetroData { energy, satisfaction, deep_work_hours, accomplishments, challenges }
    });

    log::info!("[BRIEFING] Monthly {}-{:02}: {} activities, {} goals, {} submissions",
        year, month, act_rows.len(), goal_rows.len(), sub_rows.len());

    Ok(MonthlyBriefingResponse {
        year,
        month,
        daily_activity_stats,
        category_totals,
        hourly_density,
        total_productive_minutes: total_productive,
        total_logged_minutes: total_logged,
        total_goal_directed_minutes: total_goal_directed,
        days_with_activity,
        longest_streak,
        weekly_goal_stats,
        goal_priority_breakdown,
        total_goals_created,
        total_goals_completed,
        total_goals_verified,
        total_debt_created,
        milestone_progress,
        submission_stats,
        kb_stats,
        reading_stats,
        retrospective,
    })
}
