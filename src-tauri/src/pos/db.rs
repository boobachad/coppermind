use sqlx::PgPool;

/// Initialize all POS tables in PostgreSQL.
/// Safe to call on every startup — uses IF NOT EXISTS.
/// Each statement is executed individually (sqlx limitation: no multi-statement queries).
pub async fn init_pos_tables(pool: &PgPool) -> Result<(), sqlx::Error> {
    for ddl in POS_DDL_STATEMENTS {
        sqlx::query(ddl).execute(pool).await?;
    }
    log::info!("[POS] All PostgreSQL tables initialized");
    Ok(())
}

const POS_DDL_STATEMENTS: &[&str] = &[
    // ─── Activities ─────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_activities (
        id            TEXT PRIMARY KEY,
        date          TEXT NOT NULL,
        start_time    TIMESTAMPTZ NOT NULL,
        end_time      TIMESTAMPTZ NOT NULL,
        category      TEXT NOT NULL,
        description   TEXT NOT NULL,
        is_productive BOOLEAN NOT NULL DEFAULT TRUE,
        is_shadow     BOOLEAN NOT NULL DEFAULT FALSE,
        goal_id       TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_pos_activities_date       ON pos_activities (date)",
    "CREATE INDEX IF NOT EXISTS idx_pos_activities_start_time ON pos_activities (start_time)",
    "CREATE INDEX IF NOT EXISTS idx_pos_activities_goal_id    ON pos_activities (goal_id)",

    // ─── Activity Metrics ───────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_activity_metrics (
        id              TEXT PRIMARY KEY,
        activity_id     TEXT NOT NULL REFERENCES pos_activities(id) ON DELETE CASCADE,
        goal_metric_id  TEXT NOT NULL,
        value           INTEGER NOT NULL
    )",
    "CREATE INDEX IF NOT EXISTS idx_pos_am_activity ON pos_activity_metrics (activity_id)",
    "CREATE INDEX IF NOT EXISTS idx_pos_am_gm       ON pos_activity_metrics (goal_metric_id)",

    // ─── Submissions ────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_submissions (
        id              TEXT PRIMARY KEY,
        platform        TEXT NOT NULL,
        problem_id      TEXT NOT NULL,
        problem_title   TEXT NOT NULL,
        submitted_time  TIMESTAMPTZ NOT NULL UNIQUE,
        verdict         TEXT NOT NULL,
        language        TEXT NOT NULL,
        rating          INTEGER,
        difficulty      TEXT,
        tags            TEXT[] DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_pos_sub_time     ON pos_submissions (submitted_time)",
    "CREATE INDEX IF NOT EXISTS idx_pos_sub_problem  ON pos_submissions (problem_id)",
    "CREATE INDEX IF NOT EXISTS idx_pos_sub_platform ON pos_submissions (platform)",

    // ─── Goals ──────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_goals (
        id                TEXT PRIMARY KEY,
        date              TEXT NOT NULL,
        description       TEXT NOT NULL,
        problem_id        TEXT,
        is_verified       BOOLEAN NOT NULL DEFAULT FALSE,
        recurring_goal_id TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_pos_goals_date       ON pos_goals (date)",
    "CREATE INDEX IF NOT EXISTS idx_pos_goals_problem_id ON pos_goals (problem_id)",

    // ─── Goal Metrics ───────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_goal_metrics (
        id            TEXT PRIMARY KEY,
        goal_id       TEXT NOT NULL REFERENCES pos_goals(id) ON DELETE CASCADE,
        label         TEXT NOT NULL,
        target_value  INTEGER NOT NULL,
        current_value INTEGER NOT NULL DEFAULT 0,
        unit          TEXT NOT NULL
    )",
    "CREATE INDEX IF NOT EXISTS idx_pos_gm_goal ON pos_goal_metrics (goal_id)",

    // ─── Recurring Goals ────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_recurring_goals (
        id          TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        frequency   TEXT NOT NULL,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",

    // ─── Recurring Goal Metrics ─────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_recurring_goal_metrics (
        id                TEXT PRIMARY KEY,
        recurring_goal_id TEXT NOT NULL REFERENCES pos_recurring_goals(id) ON DELETE CASCADE,
        label             TEXT NOT NULL,
        target_value      INTEGER NOT NULL,
        unit              TEXT NOT NULL
    )",
    "CREATE INDEX IF NOT EXISTS idx_pos_rgm_rg ON pos_recurring_goal_metrics (recurring_goal_id)",

    // ─── Debt Goals ─────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_debt_goals (
        id              TEXT PRIMARY KEY,
        original_date   TEXT NOT NULL,
        description     TEXT NOT NULL,
        problem_id      TEXT,
        transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ
    )",
    "CREATE INDEX IF NOT EXISTS idx_pos_dg_date     ON pos_debt_goals (original_date)",
    "CREATE INDEX IF NOT EXISTS idx_pos_dg_resolved ON pos_debt_goals (resolved_at)",
];
