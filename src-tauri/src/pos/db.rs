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
    // ─── Enable Extensions ──────────────────────────────────────────
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    
    // ─── Books ──────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS books (
        id              TEXT PRIMARY KEY,
        isbn            TEXT,
        title           TEXT NOT NULL,
        authors         JSONB,
        number_of_pages INTEGER,
        publisher       TEXT,
        publish_date    TEXT,
        cover_url       TEXT,
        metadata        JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS books_isbn_key ON books(isbn)",
    "CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn)",
    "CREATE INDEX IF NOT EXISTS idx_books_title ON books USING gin(to_tsvector('english', title))",
    
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
        goal_ids      TEXT[],
        milestone_id  TEXT REFERENCES goal_periods(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        title         TEXT NOT NULL,
        book_id       TEXT,
        pages_read    INTEGER,
        CONSTRAINT check_goal_or_milestone CHECK (
            (goal_ids IS NOT NULL AND milestone_id IS NULL) OR
            (goal_ids IS NULL AND milestone_id IS NOT NULL) OR
            (goal_ids IS NULL AND milestone_id IS NULL)
        )
    )",
    "CREATE INDEX IF NOT EXISTS idx_pos_activities_date       ON pos_activities (date)",
    "CREATE INDEX IF NOT EXISTS idx_pos_activities_start_time ON pos_activities (start_time)",
    "CREATE INDEX IF NOT EXISTS idx_activities_goal_ids       ON pos_activities USING GIN(goal_ids)",
    "CREATE INDEX IF NOT EXISTS idx_activities_milestone_id   ON pos_activities (milestone_id) WHERE milestone_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_activities_book_id        ON pos_activities (book_id)",

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
        submitted_time  TIMESTAMPTZ NOT NULL,
        verdict         TEXT NOT NULL,
        language        TEXT NOT NULL,
        rating          INTEGER,
        difficulty      TEXT,
        tags            TEXT[] DEFAULT '{}',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS pos_submissions_submitted_time_key ON pos_submissions(submitted_time)",
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
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        category          TEXT
    )",
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
        original_date   TEXT NOT NULL,
        description     TEXT NOT NULL,
        problem_id      TEXT,
        transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ,
        goal_id         TEXT
    )",
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
        date                   TEXT,
        recurring_pattern      TEXT,
        recurring_template_id  TEXT,
        priority               TEXT DEFAULT 'medium',
        urgent                 BOOLEAN DEFAULT FALSE,
        metrics                JSONB,
        problem_id             TEXT,
        linked_activity_ids    JSONB,
        labels                 JSONB,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        original_date          TEXT,
        is_debt                BOOLEAN DEFAULT FALSE,
        parent_goal_id         TEXT,
        CONSTRAINT unified_goals_priority_check CHECK (priority IN ('low', 'medium', 'high'))
    )",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_completed ON unified_goals(completed)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_urgent ON unified_goals(urgent)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_is_debt ON unified_goals(is_debt)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_date ON unified_goals(date)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_recurring_pattern ON unified_goals(recurring_pattern) WHERE recurring_pattern IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_created_at ON unified_goals(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_unified_goals_parent ON unified_goals(parent_goal_id) WHERE parent_goal_id IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_goals_recurring_instance ON unified_goals(recurring_template_id, date) WHERE recurring_template_id IS NOT NULL",

    // ─── GitHub Repositories ────────────────────────────────────────
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
    
    // ─── GitHub User Stats ──────────────────────────────────────────
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
        source              TEXT NOT NULL,
        content             TEXT NOT NULL,
        metadata            JSONB,
        status              TEXT NOT NULL DEFAULT 'Inbox',
        next_review_date    TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        linked_note_id      TEXT,
        linked_journal_date TEXT,
        tags                TEXT[] DEFAULT '{}',
        CONSTRAINT knowledge_items_source_check CHECK (source IN ('ActivityLog', 'Manual', 'BrowserExtension', 'Journal', 'DailyCapture')),
        CONSTRAINT knowledge_items_status_check CHECK (status IN ('Inbox', 'Planned', 'Completed', 'Archived'))
    )",
    // Widen source constraint to include DailyCapture — safe idempotent migration
    "ALTER TABLE knowledge_items DROP CONSTRAINT IF EXISTS knowledge_items_source_check",
    "ALTER TABLE knowledge_items ADD CONSTRAINT knowledge_items_source_check CHECK (source IN ('ActivityLog', 'Manual', 'BrowserExtension', 'Journal', 'DailyCapture'))",
    "CREATE INDEX IF NOT EXISTS idx_kb_items_status ON knowledge_items(status)",
    "CREATE INDEX IF NOT EXISTS idx_kb_items_tags ON knowledge_items USING gin(tags)",
    "CREATE INDEX IF NOT EXISTS idx_kb_items_review ON knowledge_items(next_review_date) WHERE next_review_date IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_kb_items_content ON knowledge_items USING gin(to_tsvector('english', content))",
    "CREATE INDEX IF NOT EXISTS idx_kb_content_trgm ON knowledge_items USING gin(content gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS idx_kb_linked_note ON knowledge_items(linked_note_id) WHERE linked_note_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_kb_linked_journal ON knowledge_items(linked_journal_date) WHERE linked_journal_date IS NOT NULL",

    // ─── Knowledge Base - Links ─────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS knowledge_links (
        id          TEXT PRIMARY KEY,
        source_id   TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
        target_id   TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
        link_type   TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT knowledge_links_link_type_check CHECK (link_type IN ('related', 'blocks', 'requires'))
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS unique_kb_link ON knowledge_links(source_id, target_id, link_type)",
    "CREATE INDEX IF NOT EXISTS idx_kb_links_source ON knowledge_links(source_id)",
    "CREATE INDEX IF NOT EXISTS idx_kb_links_target ON knowledge_links(target_id)",

    // ─── Activity Knowledge Links ───────────────────────────────────
    "CREATE TABLE IF NOT EXISTS activity_knowledge_links (
        id          TEXT PRIMARY KEY,
        activity_id TEXT NOT NULL REFERENCES pos_activities(id) ON DELETE CASCADE,
        kb_item_id  TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
        link_type   TEXT NOT NULL DEFAULT 'temporal',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT activity_kb_link_type_check CHECK (link_type IN ('temporal', 'manual'))
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS unique_activity_kb_link ON activity_knowledge_links(activity_id, kb_item_id)",
    "CREATE INDEX IF NOT EXISTS idx_activity_kb_links_activity ON activity_knowledge_links(activity_id)",
    "CREATE INDEX IF NOT EXISTS idx_activity_kb_links_kb_item ON activity_knowledge_links(kb_item_id)",
    "CREATE INDEX IF NOT EXISTS idx_activity_kb_links_created ON activity_knowledge_links(created_at)",

    // ─── Goal Periods ───────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS goal_periods (
        id                TEXT PRIMARY KEY,
        target_metric     TEXT NOT NULL,
        target_value      INTEGER NOT NULL,
        period_start      TIMESTAMPTZ NOT NULL,
        period_end        TIMESTAMPTZ NOT NULL,
        strategy          TEXT NOT NULL DEFAULT 'EvenDistribution',
        current_value     INTEGER DEFAULT 0,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        problem_id        TEXT,
        recurring_pattern TEXT,
        label             TEXT,
        unit              TEXT,
        daily_amount      INTEGER NOT NULL,
        period_type       TEXT NOT NULL DEFAULT 'monthly',
        CONSTRAINT goal_periods_strategy_check CHECK (strategy IN ('EvenDistribution', 'FrontLoad', 'Manual')),
        CONSTRAINT check_period_type CHECK (period_type IN ('monthly', 'weekly', 'daily'))
    )",
    "CREATE INDEX IF NOT EXISTS idx_goal_periods_dates ON goal_periods(period_start, period_end)",
    "CREATE INDEX IF NOT EXISTS idx_goal_periods_metric ON goal_periods(target_metric)",

    // ─── Debt Archive ───────────────────────────────────────────────
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

    // ─── Unified Reflections ────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS reflections (
        id              TEXT PRIMARY KEY,
        entity_type     TEXT NOT NULL CHECK (entity_type IN ('goal', 'milestone')),
        entity_id       TEXT NOT NULL,
        learning_text   TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        kb_item_id      TEXT
    )",
    "CREATE INDEX IF NOT EXISTS idx_reflections_entity ON reflections(entity_type, entity_id)",

    // ─── Retrospectives ─────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS retrospectives (
        id              TEXT PRIMARY KEY,
        period_type     TEXT NOT NULL,
        period_start    TIMESTAMPTZ NOT NULL,
        period_end      TIMESTAMPTZ NOT NULL,
        questions_data  JSONB NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT retrospectives_period_type_check CHECK (period_type IN ('weekly', 'monthly'))
    )",
    "CREATE INDEX IF NOT EXISTS idx_retrospectives_period_type ON retrospectives(period_type)",
    "CREATE INDEX IF NOT EXISTS idx_retrospectives_period_start ON retrospectives(period_start)",

    // ─── Journal Entries ────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS journal_entries (
        id                      TEXT PRIMARY KEY,
        date                    TEXT NOT NULL,
        expected_schedule_image TEXT NOT NULL DEFAULT '',
        actual_schedule_image   TEXT NOT NULL DEFAULT '',
        reflection_text         TEXT NOT NULL DEFAULT '',
        created_at              BIGINT NOT NULL,
        updated_at              BIGINT NOT NULL,
        expected_schedule_data  TEXT,
        actual_schedule_data    TEXT
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_date_key ON journal_entries(date)",

    // ─── Notes ──────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS notes (
        id          TEXT PRIMARY KEY,
        title       TEXT,
        content     TEXT,
        created_at  BIGINT,
        updated_at  BIGINT,
        parent_id   TEXT,
        position    INTEGER,
        source_urls TEXT
    )",

    // ─── Sticky Notes ───────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS sticky_notes (
        id         TEXT PRIMARY KEY,
        note_id    TEXT,
        content    TEXT,
        color      TEXT,
        x          DOUBLE PRECISION,
        y          DOUBLE PRECISION,
        created_at BIGINT,
        type       TEXT,
        rotation   DOUBLE PRECISION,
        scale      DOUBLE PRECISION
    )",

    // ─── Deleted Items ──────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS deleted_items (
        id         TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        deleted_at BIGINT NOT NULL
    )",

    // ─── Milestones ─────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS milestones (
        id                TEXT PRIMARY KEY,
        text              TEXT NOT NULL,
        description       TEXT,
        period_start      TIMESTAMPTZ NOT NULL,
        period_end        TIMESTAMPTZ NOT NULL,
        recurring_pattern TEXT,
        problem_id        TEXT,
        metrics           JSONB NOT NULL,
        current_value     INTEGER DEFAULT 0,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE INDEX IF NOT EXISTS idx_milestones_dates ON milestones(period_start, period_end)",
    "CREATE INDEX IF NOT EXISTS idx_milestones_problem ON milestones(problem_id) WHERE problem_id IS NOT NULL",

    // ─── Todos ──────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS todos (
        id          TEXT PRIMARY KEY,
        text        TEXT,
        completed   INTEGER,
        description TEXT,
        priority    TEXT,
        labels      TEXT,
        urgent      INTEGER,
        due_date    BIGINT,
        created_at  BIGINT,
        updated_at  BIGINT
    )",

    // ─── Nodes ──────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS nodes (
        id         TEXT PRIMARY KEY,
        type       TEXT,
        data       TEXT,
        position_x DOUBLE PRECISION,
        position_y DOUBLE PRECISION,
        created_at BIGINT
    )",

    // ─── Edges ──────────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS edges (
        id         TEXT PRIMARY KEY,
        source     TEXT,
        target     TEXT,
        type       TEXT,
        created_at BIGINT
    )",

    // ─── Codeforces Ladders ─────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_ladders (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT,
        rating_min      INTEGER,
        rating_max      INTEGER,
        difficulty      INTEGER,
        source          TEXT NOT NULL,
        problem_count   INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT cf_ladders_source_check CHECK (source IN ('A2OJ', 'Custom', 'FriendsGenerated'))
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

        // ─── CF ladder Progress Tracking ─────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_ladder_progress (
        id              TEXT PRIMARY KEY,
        ladder_id       TEXT NOT NULL REFERENCES cf_ladders(id) ON DELETE CASCADE,
        problem_id      TEXT NOT NULL,
        solved_at       TIMESTAMPTZ,
        attempts        INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS unique_ladder_problem ON cf_ladder_progress(ladder_id, problem_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_ladder_progress_ladder_id ON cf_ladder_progress(ladder_id)",

    // ─── Codeforces Categories ──────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_categories (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        description     TEXT,
        problem_count   INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS cf_categories_name_key ON cf_categories(name)",

    "CREATE TABLE IF NOT EXISTS cf_category_problems (
        id              TEXT PRIMARY KEY,
        category_id     TEXT NOT NULL REFERENCES cf_categories(id) ON DELETE CASCADE,
        problem_id      TEXT NOT NULL,
        problem_name    TEXT NOT NULL,
        problem_url     TEXT NOT NULL,
        position        INTEGER NOT NULL,
        difficulty      INTEGER,
        online_judge    TEXT NOT NULL DEFAULT 'Codeforces',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        year            TEXT,
        contest         TEXT
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_category_problem ON cf_category_problems(category_id, problem_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_category_problems_category_id ON cf_category_problems(category_id)",

    // ─── Codeforces Friends ─────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_friends (
        id                TEXT PRIMARY KEY,
        cf_handle         TEXT NOT NULL,
        display_name      TEXT,
        current_rating    INTEGER,
        max_rating        INTEGER,
        last_synced       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        total_submissions BIGINT DEFAULT 0,
        max_rank          VARCHAR(50)
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS cf_friends_cf_handle_key ON cf_friends(cf_handle)",
    "CREATE INDEX IF NOT EXISTS idx_cf_friends_handle ON cf_friends(cf_handle)",

    "CREATE TABLE IF NOT EXISTS cf_friend_submissions (
        id              TEXT PRIMARY KEY,
        friend_id       TEXT NOT NULL REFERENCES cf_friends(id) ON DELETE CASCADE,
        problem_id      TEXT NOT NULL,
        problem_name    TEXT NOT NULL DEFAULT '',
        problem_url     TEXT NOT NULL DEFAULT '',
        contest_id      INTEGER,
        problem_index   TEXT NOT NULL DEFAULT '',
        difficulty      INTEGER,
        verdict         TEXT NOT NULL DEFAULT 'OK',
        submission_time TIMESTAMPTZ NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_problem ON cf_friend_submissions(friend_id, problem_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_friend_submissions_friend_id ON cf_friend_submissions(friend_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_friend_submissions_problem_id ON cf_friend_submissions(problem_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_friend_submissions_time ON cf_friend_submissions(submission_time DESC)",

    // ─── Daily Recommendations ──────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_daily_recommendations (
        id              TEXT PRIMARY KEY,
        date            DATE NOT NULL,
        problem_ids     TEXT[] NOT NULL,
        sources         TEXT[] NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS cf_daily_recommendations_date_key ON cf_daily_recommendations(date)",
    "CREATE INDEX IF NOT EXISTS idx_cf_daily_recommendations_date ON cf_daily_recommendations(date DESC)",

    // ─── Category Progress Tracking ─────────────────────────────────
    "CREATE TABLE IF NOT EXISTS cf_category_progress (
        id              TEXT PRIMARY KEY,
        category_id     TEXT NOT NULL REFERENCES cf_categories(id) ON DELETE CASCADE,
        problem_id      TEXT NOT NULL,
        solved_at       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",
    "CREATE UNIQUE INDEX IF NOT EXISTS unique_category_problem ON cf_category_progress(category_id, problem_id)",
    "CREATE INDEX IF NOT EXISTS idx_cf_category_progress_category_id ON cf_category_progress(category_id)",

    // ─── User Stats ─────────────────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS pos_user_stats (
        platform        TEXT PRIMARY KEY,
        username        TEXT NOT NULL,
        data            JSONB NOT NULL,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )",

    // ─── Milestone Daily Progress ────────────────────────────────────
    "CREATE TABLE IF NOT EXISTS milestone_daily_progress (
        id           TEXT PRIMARY KEY,
        milestone_id TEXT NOT NULL REFERENCES goal_periods(id) ON DELETE CASCADE,
        date         TEXT NOT NULL,
        amount       INT NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(milestone_id, date)
    )",
    "CREATE INDEX IF NOT EXISTS idx_mdp_milestone_date ON milestone_daily_progress(milestone_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_mdp_date ON milestone_daily_progress(date)",

];
