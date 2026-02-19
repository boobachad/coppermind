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
        category          TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "ALTER TABLE pos_goals ADD COLUMN IF NOT EXISTS category TEXT",
    "CREATE INDEX IF NOT EXISTS idx_pos_goals_date       ON pos_goals (date)",
    "CREATE INDEX IF NOT EXISTS idx_pos_goals_problem_id ON pos_goals (problem_id)",
    "CREATE INDEX IF NOT EXISTS idx_pos_goals_category   ON pos_goals (category) WHERE category IS NOT NULL",

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
        goal_id         TEXT NOT NULL REFERENCES pos_goals(id) ON DELETE CASCADE,
        original_date   TEXT NOT NULL,
        description     TEXT NOT NULL,
        problem_id      TEXT,
        transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ
    )",
    // Migration: Add goal_id column if it doesn't exist (for existing tables)
    "ALTER TABLE pos_debt_goals ADD COLUMN IF NOT EXISTS goal_id TEXT",
    "CREATE INDEX IF NOT EXISTS idx_pos_dg_goal     ON pos_debt_goals (goal_id)",
    "CREATE INDEX IF NOT EXISTS idx_pos_dg_date     ON pos_debt_goals (original_date)",
    "CREATE INDEX IF NOT EXISTS idx_pos_dg_resolved ON pos_debt_goals (resolved_at)",

    // ─── Unified Goals ──────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS unified_goals (
        id                     TEXT PRIMARY KEY,
        text                   TEXT NOT NULL,
        description            TEXT,
        completed              BOOLEAN DEFAULT FALSE,
        completed_at           TIMESTAMPTZ,
        verified               BOOLEAN DEFAULT FALSE,
        due_date               TIMESTAMPTZ,
        due_date_local         TEXT,
        recurring_pattern      TEXT,
        recurring_template_id  TEXT,
        priority               TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
        urgent                 BOOLEAN DEFAULT FALSE,
        metrics                JSONB,
        problem_id             TEXT,
        linked_activity_ids    JSONB,
        labels                 JSONB,
        parent_goal_id         TEXT,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        original_date          TEXT,
        is_debt                BOOLEAN DEFAULT FALSE
    )",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_completed ON unified_goals(completed)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_urgent ON unified_goals(urgent)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_is_debt ON unified_goals(is_debt)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_due_date ON unified_goals(due_date)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_recurring_pattern ON unified_goals(recurring_pattern) WHERE recurring_pattern IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_created_at ON unified_goals(created_at DESC)",
    "ALTER TABLE unified_goals ADD COLUMN IF NOT EXISTS parent_goal_id TEXT",
    "ALTER TABLE unified_goals ADD COLUMN IF NOT EXISTS metrics JSONB",
    "ALTER TABLE unified_goals ADD COLUMN IF NOT EXISTS linked_activity_ids JSONB",
    "ALTER TABLE unified_goals ADD COLUMN IF NOT EXISTS labels JSONB",
    "ALTER TABLE unified_goals ADD COLUMN IF NOT EXISTS original_date TEXT",
    "ALTER TABLE unified_goals ADD COLUMN IF NOT EXISTS is_debt BOOLEAN DEFAULT FALSE",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_parent ON unified_goals(parent_goal_id) WHERE parent_goal_id IS NOT NULL",
    // Unique constraint: one recurring instance per template per local date
    // Uses DO block because ADD CONSTRAINT IF NOT EXISTS is only available in PG 17+
    r#"DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_recurring_instance') THEN
            ALTER TABLE unified_goals ADD CONSTRAINT uq_recurring_instance UNIQUE (recurring_template_id, due_date_local);
        END IF;
    END $$"#,

    // ─── GitHub Repositories (aggregated stats per repo) ────────────
    "CREATE TABLE IF NOT EXISTS github_repositories (
        id                  TEXT PRIMARY KEY,
        username            TEXT NOT NULL,
        repo_name           TEXT NOT NULL,
        repo_owner          TEXT NOT NULL,
        full_name           TEXT NOT NULL,
        description         TEXT,
        languages           JSONB,
        primary_language    TEXT,
        total_commits       INTEGER NOT NULL DEFAULT 0,
        total_prs           INTEGER NOT NULL DEFAULT 0,
        total_issues        INTEGER NOT NULL DEFAULT 0,
        total_reviews       INTEGER NOT NULL DEFAULT 0,
        stars               INTEGER DEFAULT 0,
        forks               INTEGER DEFAULT 0,
        watchers            INTEGER DEFAULT 0,
        size_kb             INTEGER DEFAULT 0,
        is_private          BOOLEAN DEFAULT FALSE,
        is_fork             BOOLEAN DEFAULT FALSE,
        first_commit_date   TIMESTAMPTZ,
        last_commit_date    TIMESTAMPTZ,
        repo_created_at     TIMESTAMPTZ,
        repo_updated_at     TIMESTAMPTZ,
        repo_url            TEXT,
        homepage_url        TEXT,
        topics              JSONB,
        synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_github_repo UNIQUE (username, full_name)
    )",
    "CREATE INDEX IF NOT EXISTS idx_github_repos_username ON github_repositories(username)",
    "CREATE INDEX IF NOT EXISTS idx_github_repos_language ON github_repositories(primary_language)",
    "CREATE INDEX IF NOT EXISTS idx_github_repos_commits ON github_repositories(total_commits DESC)",
    
    // ─── GitHub User Stats (cached aggregations) ────────────────────
    "CREATE TABLE IF NOT EXISTS github_user_stats (
        username                TEXT PRIMARY KEY,
        total_repos             INTEGER DEFAULT 0,
        total_commits           INTEGER DEFAULT 0,
        total_prs               INTEGER DEFAULT 0,
        total_issues            INTEGER DEFAULT 0,
        total_reviews           INTEGER DEFAULT 0,
        total_stars_received    INTEGER DEFAULT 0,
        languages_breakdown     JSONB,
        current_streak_days     INTEGER DEFAULT 0,
        longest_streak_days     INTEGER DEFAULT 0,
        contributions_by_year   JSONB,
        top_repos               JSONB,
        synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",

    // ─── Knowledge Base - Items ─────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS knowledge_items (
        id                  TEXT PRIMARY KEY,
        item_type           TEXT NOT NULL CHECK (item_type IN ('Link', 'Problem', 'NoteRef', 'StickyRef', 'Quest')),
        source              TEXT NOT NULL CHECK (source IN ('ActivityLog', 'Manual', 'BrowserExtension', 'Journal')),
        content             TEXT NOT NULL,
        metadata            JSONB,
        status              TEXT NOT NULL DEFAULT 'Inbox' CHECK (status IN ('Inbox', 'Planned', 'Completed', 'Archived')),
        next_review_date    TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_kb_items_status ON knowledge_items(status)",
    "CREATE INDEX IF NOT EXISTS idx_kb_items_type ON knowledge_items(item_type)",
    "CREATE INDEX IF NOT EXISTS idx_kb_items_review ON knowledge_items(next_review_date) WHERE next_review_date IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_kb_items_content ON knowledge_items USING gin(to_tsvector('english', content))",

    // ─── Knowledge Base - Links (Networked Knowledge) ───────────────
    "CREATE TABLE IF NOT EXISTS knowledge_links (
        id          TEXT PRIMARY KEY,
        source_id   TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
        target_id   TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
        link_type   TEXT NOT NULL CHECK (link_type IN ('related', 'blocks', 'requires')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_kb_link UNIQUE (source_id, target_id, link_type)
    )",
    "CREATE INDEX IF NOT EXISTS idx_kb_links_source ON knowledge_links(source_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_links_target ON knowledge_links(target_id)",

    // ─── Monthly Goals (Goal Periods) ───────────────────────────────
    "CREATE TABLE IF NOT EXISTS goal_periods (
        id              TEXT PRIMARY KEY,
        target_metric   TEXT NOT NULL,
        target_value    INTEGER NOT NULL,
        period_start    TIMESTAMPTZ NOT NULL,
        period_end      TIMESTAMPTZ NOT NULL,
        strategy        TEXT NOT NULL DEFAULT 'EvenDistribution' CHECK (strategy IN ('EvenDistribution', 'FrontLoad', 'Manual')),
        current_value   INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_goal_periods_dates ON goal_periods(period_start, period_end)",
    "CREATE INDEX IF NOT EXISTS idx_goal_periods_metric ON goal_periods(target_metric)",

    // ─── Debt Archive (Monthly Reset) ───────────────────────────────
    "CREATE TABLE IF NOT EXISTS debt_archive (
        id              TEXT PRIMARY KEY,
        goal_id         TEXT NOT NULL,
        original_month  TEXT NOT NULL,
        archived_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason          TEXT,
        goal_text       TEXT NOT NULL,
        goal_data       JSONB
    )",
    "CREATE INDEX IF NOT EXISTS idx_debt_archive_month ON debt_archive(original_month)",
    "CREATE INDEX IF NOT EXISTS idx_debt_archive_goal ON debt_archive(goal_id)",

    // ─── Goal Reflections (Learning System) ─────────────────────────
    "CREATE TABLE IF NOT EXISTS goal_reflections (
        id              TEXT PRIMARY KEY,
        goal_id         TEXT NOT NULL REFERENCES unified_goals(id) ON DELETE CASCADE,
        learning_text   TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        kb_item_id      TEXT
    )",
    "CREATE INDEX IF NOT EXISTS idx_reflections_goal_id ON goal_reflections(goal_id)",

    // ─── Retrospectives (SPACE Framework Surveys) ───────────────────
    "CREATE TABLE IF NOT EXISTS retrospectives (
        id              TEXT PRIMARY KEY,
        period_type     TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
        period_start    TIMESTAMPTZ NOT NULL,
        period_end      TIMESTAMPTZ NOT NULL,
        questions_data  JSONB NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_retrospectives_period_type ON retrospectives(period_type)",
    "CREATE INDEX IF NOT EXISTS idx_retrospectives_period_start ON retrospectives(period_start)",

    // ─── Codeforces Ladders ─────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_ladders (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT,
        rating_min      INTEGER,
        rating_max      INTEGER,
        difficulty      INTEGER,
        source          TEXT NOT NULL CHECK (source IN ('A2OJ', 'Custom', 'FriendsGenerated')),
        problem_count   INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_cf_ladders_rating ON cf_ladders(rating_min, rating_max)",

    "CREATE TABLE IF NOT EXISTS cf_ladder_problems (
        id              TEXT PRIMARY KEY,
        ladder_id       TEXT NOT NULL REFERENCES cf_ladders(id) ON DELETE CASCADE,
        problem_id      TEXT NOT NULL,
        problem_name    TEXT NOT NULL,
        problem_url     TEXT NOT NULL,
        position        INTEGER NOT NULL,
        difficulty      INTEGER,
        online_judge    TEXT NOT NULL DEFAULT 'Codeforces',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_cf_ladder_problems_ladder_id ON cf_ladder_problems(ladder_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_ladder_problems_problem_id ON cf_ladder_problems(problem_id)",

    // ─── Codeforces Categories ──────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_categories (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL UNIQUE,
        description     TEXT,
        problem_count   INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",

    "CREATE TABLE IF NOT EXISTS cf_category_problems (
        id              TEXT PRIMARY KEY,
        category_id     TEXT NOT NULL REFERENCES cf_categories(id) ON DELETE CASCADE,
        problem_id      TEXT NOT NULL,
        problem_name    TEXT NOT NULL,
        problem_url     TEXT NOT NULL,
        position        INTEGER NOT NULL,
        difficulty      INTEGER,
        online_judge    TEXT NOT NULL DEFAULT 'Codeforces',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_cf_category_problems_category_id ON cf_category_problems(category_id)",

    // ─── Codeforces Friends ─────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_friends (
        id              TEXT PRIMARY KEY,
        cf_handle       TEXT NOT NULL UNIQUE,
        display_name    TEXT,
        current_rating  INTEGER,
        max_rating      INTEGER,
        last_synced     TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_cf_friends_handle ON cf_friends(cf_handle)",

    "CREATE TABLE IF NOT EXISTS cf_friend_submissions (
        id              TEXT PRIMARY KEY,
        friend_id       TEXT NOT NULL REFERENCES cf_friends(id) ON DELETE CASCADE,
        problem_id      TEXT NOT NULL,
        verdict         TEXT NOT NULL,
        submission_time TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_cf_friend_submissions_friend_id ON cf_friend_submissions(friend_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_friend_submissions_problem_id ON cf_friend_submissions(problem_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_friend_submissions_time ON cf_friend_submissions(submission_time DESC)",

    // ─── User Progress Tracking ─────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_ladder_progress (
        id              TEXT PRIMARY KEY,
        ladder_id       TEXT NOT NULL REFERENCES cf_ladders(id) ON DELETE CASCADE,
        problem_id      TEXT NOT NULL,
        solved_at       TIMESTAMPTZ,
        attempts        INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_ladder_problem UNIQUE (ladder_id, problem_id)
    )",
    "CREATE INDEX IF NOT EXISTS idx_cf_ladder_progress_ladder_id ON cf_ladder_progress(ladder_id)",

    // ─── Daily Recommendations ──────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_daily_recommendations (
        id              TEXT PRIMARY KEY,
        date            DATE NOT NULL UNIQUE,
        problem_ids     TEXT[] NOT NULL,
        sources         TEXT[] NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_cf_daily_recommendations_date ON cf_daily_recommendations(date DESC)",
];
