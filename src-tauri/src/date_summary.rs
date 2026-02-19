// Pre-flight: C(db.0) E(no SELECT*) H(PosResult) K(explicit cols) L(Option<T>) M(#[tauri::command]) N(registered)
use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::State;
use crate::PosDb;
use crate::pos::error::{PosResult, db_context};

// ─── Output types ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySummary {
    pub id: String,
    pub date: String,           // YYYY-MM-DD from pos_activities.date
    pub title: String,
    pub category: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub is_productive: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalSummary {
    pub id: String,
    pub date: String,           // due_date cast to YYYY-MM-DD
    pub text: String,
    pub completed: bool,
    pub priority: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionSummary {
    pub id: String,
    pub date: String,           // submitted_time cast to YYYY-MM-DD
    pub platform: String,
    pub problem_title: String,
    pub verdict: String,
    pub submitted_time: DateTime<Utc>,
    pub difficulty: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbGraphItem {
    pub id: String,
    pub date: String,           // created_at cast to YYYY-MM-DD
    pub item_type: String,
    pub content: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub metadata_title: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbGraphLink {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub link_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetroSummary {
    pub id: String,
    pub date: String,           // period_start cast to YYYY-MM-DD
    pub period_type: String,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
}

// Synced from SQLite via pgSync — journal_entries.date is TEXT YYYY-MM-DD
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSummary {
    pub id: String,
    pub date: String,
    pub reflection_text: String,
}

// Synced from SQLite via pgSync — notes.created_at is BIGINT (Unix ms)
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub date: String,           // derived via to_timestamp(created_at/1000)::date
    pub title: Option<String>,
    pub created_at_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YearlyGraphData {
    pub activities:      Vec<ActivitySummary>,
    pub goals:           Vec<GoalSummary>,
    pub submissions:     Vec<SubmissionSummary>,
    pub kb_items:        Vec<KbGraphItem>,
    pub kb_links:        Vec<KbGraphLink>,
    pub retrospectives:  Vec<RetroSummary>,
    pub journal_entries: Vec<JournalSummary>,
    pub notes:           Vec<NoteSummary>,
}

// ─── Internal sqlx row types ──────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ActivityRow {
    id: String, date: String, title: String, category: String,
    start_time: DateTime<Utc>, end_time: DateTime<Utc>, is_productive: bool,
}

#[derive(sqlx::FromRow)]
struct GoalRow {
    id: String, date_str: String, text: String, completed: bool, priority: String,
}

#[derive(sqlx::FromRow)]
struct SubmissionRow {
    id: String, date_str: String, platform: String, problem_title: String,
    verdict: String, submitted_time: DateTime<Utc>, difficulty: Option<String>,
}

#[derive(sqlx::FromRow)]
struct KbItemRow {
    id: String, date_str: String, item_type: String, content: String,
    status: String, created_at: DateTime<Utc>, metadata_title: Option<String>,
}

#[derive(sqlx::FromRow)]
struct KbLinkRow {
    id: String, source_id: String, target_id: String, link_type: String,
}

#[derive(sqlx::FromRow)]
struct RetroRow {
    id: String, date_str: String, period_type: String,
    period_start: DateTime<Utc>, period_end: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct JournalRow {
    id: String, date: String, reflection_text: String,
}

#[derive(sqlx::FromRow)]
struct NoteRow {
    id: String, date_str: String, title: Option<String>, created_at: i64,
}

// ─── Command ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_yearly_graph_data(
    db: State<'_, PosDb>,
    year: i32,
) -> PosResult<YearlyGraphData> {
    let pool = &db.0;
    let year_start = format!("{}-01-01", year);
    let year_end   = format!("{}-12-31", year);

    // ── Activities (pos_activities.date is TEXT YYYY-MM-DD) ──────────────
    let act_rows = sqlx::query_as::<_, ActivityRow>(
        r#"SELECT id, date, title, category, start_time, end_time, is_productive
           FROM pos_activities
           WHERE date >= $1 AND date <= $2
           ORDER BY date ASC, start_time ASC"#,
    )
    .bind(&year_start).bind(&year_end)
    .fetch_all(pool).await
    .map_err(|e| db_context("get_yearly_graph_data:activities", e))?;

    let activities = act_rows.into_iter().map(|r| ActivitySummary {
        id: r.id, date: r.date, title: r.title, category: r.category,
        start_time: r.start_time, end_time: r.end_time, is_productive: r.is_productive,
    }).collect();

    // ── Unified Goals (due_date is TIMESTAMPTZ, cast to date) ───────────
    let goal_rows = sqlx::query_as::<_, GoalRow>(
        r#"SELECT id, due_date::date::text AS date_str, text, completed, priority
           FROM unified_goals
           WHERE due_date IS NOT NULL
             AND EXTRACT(YEAR FROM due_date) = $1
           ORDER BY due_date ASC"#,
    )
    .bind(year).fetch_all(pool).await
    .map_err(|e| db_context("get_yearly_graph_data:goals", e))?;

    let goals = goal_rows.into_iter().map(|r| GoalSummary {
        id: r.id, date: r.date_str, text: r.text,
        completed: r.completed, priority: r.priority,
    }).collect();

    // ── Submissions (submitted_time is TIMESTAMPTZ) ──────────────────────
    let sub_rows = sqlx::query_as::<_, SubmissionRow>(
        r#"SELECT id, submitted_time::date::text AS date_str,
                  platform, problem_title, verdict, submitted_time, difficulty
           FROM pos_submissions
           WHERE EXTRACT(YEAR FROM submitted_time) = $1
           ORDER BY submitted_time ASC"#,
    )
    .bind(year).fetch_all(pool).await
    .map_err(|e| db_context("get_yearly_graph_data:submissions", e))?;

    let submissions = sub_rows.into_iter().map(|r| SubmissionSummary {
        id: r.id, date: r.date_str, platform: r.platform,
        problem_title: r.problem_title, verdict: r.verdict,
        submitted_time: r.submitted_time, difficulty: r.difficulty,
    }).collect();

    // ── KB items (created_at TIMESTAMPTZ; JSONB title extracted in SQL) ──
    let kb_rows = sqlx::query_as::<_, KbItemRow>(
        r#"SELECT id, created_at::date::text AS date_str,
                  item_type, content, status, created_at,
                  metadata->>'title' AS metadata_title
           FROM knowledge_items
           WHERE EXTRACT(YEAR FROM created_at) = $1
           ORDER BY created_at ASC"#,
    )
    .bind(year).fetch_all(pool).await
    .map_err(|e| db_context("get_yearly_graph_data:kb_items", e))?;

    let kb_ids: std::collections::HashSet<String> =
        kb_rows.iter().map(|r| r.id.clone()).collect();

    let kb_items = kb_rows.into_iter().map(|r| KbGraphItem {
        id: r.id, date: r.date_str, item_type: r.item_type,
        content: r.content, status: r.status, created_at: r.created_at,
        metadata_title: r.metadata_title,
    }).collect();

    // ── KB links — filter in Rust (avoids array-bind complexity) ────────
    let all_links = sqlx::query_as::<_, KbLinkRow>(
        "SELECT id, source_id, target_id, link_type FROM knowledge_links",
    )
    .fetch_all(pool).await
    .map_err(|e| db_context("get_yearly_graph_data:kb_links", e))?;

    let kb_links = all_links.into_iter()
        .filter(|r| kb_ids.contains(&r.source_id) || kb_ids.contains(&r.target_id))
        .map(|r| KbGraphLink {
            id: r.id, source_id: r.source_id,
            target_id: r.target_id, link_type: r.link_type,
        })
        .collect();

    // ── Retrospectives (period_start TIMESTAMPTZ) ────────────────────────
    let retro_rows = sqlx::query_as::<_, RetroRow>(
        r#"SELECT id, period_start::date::text AS date_str,
                  period_type, period_start, period_end
           FROM retrospectives
           WHERE EXTRACT(YEAR FROM period_start) = $1
           ORDER BY period_start ASC"#,
    )
    .bind(year).fetch_all(pool).await
    .map_err(|e| db_context("get_yearly_graph_data:retrospectives", e))?;

    let retrospectives = retro_rows.into_iter().map(|r| RetroSummary {
        id: r.id, date: r.date_str, period_type: r.period_type,
        period_start: r.period_start, period_end: r.period_end,
    }).collect();

    // ── Journal entries (synced via pgSync; date is TEXT YYYY-MM-DD) ─────
    let journal_rows = sqlx::query_as::<_, JournalRow>(
        r#"SELECT id, date, COALESCE(reflection_text, '') AS reflection_text
           FROM journal_entries
           WHERE date >= $1 AND date <= $2
           ORDER BY date ASC"#,
    )
    .bind(&year_start).bind(&year_end)
    .fetch_all(pool).await
    .map_err(|e| db_context("get_yearly_graph_data:journal", e))?;

    let journal_entries = journal_rows.into_iter().map(|r| JournalSummary {
        id: r.id, date: r.date, reflection_text: r.reflection_text,
    }).collect();

    // ── Notes (synced via pgSync; created_at is BIGINT Unix ms) ─────────
    let note_rows = sqlx::query_as::<_, NoteRow>(
        r#"SELECT id, to_timestamp(created_at / 1000.0)::date::text AS date_str,
                  title, created_at
           FROM notes
           WHERE created_at IS NOT NULL
             AND EXTRACT(YEAR FROM to_timestamp(created_at / 1000.0)) = $1
           ORDER BY created_at ASC"#,
    )
    .bind(year).fetch_all(pool).await
    .map_err(|e| db_context("get_yearly_graph_data:notes", e))?;

    let notes = note_rows.into_iter().map(|r| NoteSummary {
        id: r.id, date: r.date_str, title: r.title, created_at_ms: r.created_at,
    }).collect();

    Ok(YearlyGraphData {
        activities, goals, submissions, kb_items, kb_links,
        retrospectives, journal_entries, notes,
    })
}
