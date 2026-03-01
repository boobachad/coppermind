// ─── POS TypeScript Interfaces ──────────────────────────────────
// Mirror of src-tauri/src/pos/models.rs
// Used by all POS frontend pages and components.

export interface Activity {
    id: string;
    date: string;              // YYYY-MM-DD
    startTime: string;         // ISO 8601 UTC (camelCase for TS convention, mapped from snake_case in Rust)
    endTime: string;
    category: string;
    title: string;
    description: string;
    isProductive: boolean;
    isShadow: boolean;
    goalId: string | null;
    bookId: string | null;     // NEW: Link to books table
    pagesRead: number | null;  // NEW: Pages read in this activity
    createdAt: string;
}

export interface ActivityMetric {
    id: string;
    activityId: string;
    goalMetricId: string;
    value: number;
}

export interface Submission {
    id: string;
    platform: string;
    problemId: string;
    problemTitle: string;
    submittedTime: string;     // ISO 8601 UTC (camelCase from Rust serde rename_all)
    verdict: string;
    language: string;
    rating: number | null;
    difficulty: string | null;
    tags: string[];
    createdAt: string;
}

export interface Goal {
    id: string;
    date: string;              // YYYY-MM-DD
    description: string;
    problemId: string | null;
    isVerified: boolean;
    recurringGoalId: string | null;
    createdAt: string;
}

export interface GoalMetric {
    id: string;
    goalId: string;
    label: string;
    targetValue: number;
    currentValue: number;
    unit: string;
}

export interface RecurringGoal {
    id: string;
    description: string;
    frequency: string;         // "Mon,Tue,Wed" or "Daily"
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface RecurringGoalMetric {
    id: string;
    recurringGoalId: string;
    label: string;
    targetValue: number;
    unit: string;
}

export interface DebtGoal {
    id: string;
    goalId: string;            // FK to pos_goals
    originalDate: string;      // YYYY-MM-DD
    description: string;
    problemId: string | null;
    transitionedAt: string;
    resolvedAt: string | null;
}

// ─── Composite response types ───────────────────────────────────

export interface GoalWithDetails {
    id: string;
    date: string;
    description: string;
    problemId: string | null;
    isVerified: boolean;
    recurringGoalId: string | null;
    createdAt: string;
    metrics: GoalMetric[];
    activities: Activity[];
    recurringGoal: RecurringGoal | null;
}

export interface ActivityDateMetrics {
    totalMinutes: number;
    productiveMinutes: number;
}

export interface DateRange {
    minDate: string;
    maxDate: string;
}

export interface ScraperResponse {
    platform: string;
    newSubmissions: number;
    totalSubmissions: number;
}

// ─── Unified Goals ──────────────────────────────────────────────

export interface UnifiedGoalMetric {
    id: string;
    label: string;
    target: number;
    current: number;
    unit: string;
}

export interface UnifiedGoal {
    id: string;
    text: string;
    description: string | null;
    completed: boolean;
    completedAt: string | null;  // ISO 8601 UTC
    verified: boolean;
    dueDate: string | null;      // ISO 8601 UTC
    recurringPattern: string | null;
    recurringTemplateId: string | null;
    priority: 'low' | 'medium' | 'high';
    urgent: boolean;
    metrics: UnifiedGoalMetric[] | null;  // Only for milestone-generated goals
    problemId: string | null;             // Only for milestone-generated goals
    linkedActivityIds: string[] | null;
    labels: string[] | null;
    parentGoalId: string | null;  // Link to Milestone (goal_periods)
    createdAt: string;
    updatedAt: string;
    originalDate: string | null;
    isDebt: boolean;
}

export interface GoalFilters {
    is_completed?: boolean;
    is_verified?: boolean;
    priority?: string;
    urgent?: boolean;
    due_date?: string; // ISO String
    is_debt?: boolean;
    has_recurring?: boolean;
    search?: string;
    date_range?: [string, string]; // [start, end] ISO strings
    timezone_offset?: number; // Minutes
}

// ─── Scraper API types (for Rust command responses) ─────────────

export interface LeetCodeSubmission {
    title: string;
    titleSlug: string;
    timestamp: string;
    statusDisplay: string;
    lang: string;
}

export interface LeetCodeResponse {
    data: {
        recentSubmissionList: LeetCodeSubmission[];
    };
}

export interface CodeforcesSubmission {
    id: number;
    contestId: number;
    creationTimeSeconds: number;
    problem: {
        contestId: number;
        index: string;
        name: string;
        rating?: number;
        tags: string[];
    };
    verdict: string;
    programmingLanguage: string;
}

export interface CodeforcesResponse {
    status: string;
    result: CodeforcesSubmission[];
}

// ─── GitHub Types ───────────────────────────────────────────────

export interface GitHubRepository {
    id: string;
    username: string;
    repoName: string;
    repoOwner: string;
    fullName: string;
    description: string | null;
    languages: Record<string, unknown> | null;
    primaryLanguage: string | null;
    totalCommits: number;
    totalPrs: number;
    totalIssues: number;
    totalReviews: number;
    stars: number;
    forks: number;
    watchers: number;
    sizeKb: number;
    isPrivate: boolean;
    isFork: boolean;
    firstCommitDate: string | null;
    lastCommitDate: string | null;
    repoCreatedAt: string | null;
    repoUpdatedAt: string | null;
    repoUrl: string | null;
    homepageUrl: string | null;
    topics: Record<string, unknown> | null;
    syncedAt: string;
}

export interface GitHubUserStats {
    username: string;
    totalRepos: number;
    totalCommits: number;
    totalPrs: number;
    totalIssues: number;
    totalReviews: number;
    totalStarsReceived: number;
    languagesBreakdown: Record<string, unknown> | null;
    currentStreakDays: number;
    longestStreakDays: number;
    contributionsByYear: Record<string, unknown> | null;
    topRepos: Record<string, unknown> | null;
    syncedAt: string;
}

// ─── Knowledge Base ─────────────────────────────────────────────

export interface KnowledgeMetadata {
    title?: string;
    tags?: string[];
    difficulty?: string;
    relatedItemIds?: string[];
}

export interface KnowledgeItem {
    id: string;
    itemType: string;  // Free-text: "website", "book", "video", "inspiration", etc.
    source: 'ActivityLog' | 'Manual' | 'BrowserExtension' | 'Journal';
    content: string;              // Multi-line text, can contain URLs, notes, anything
    metadata: KnowledgeMetadata | null;  // Title, Tags, Difficulty, RelatedItemIds
    status: 'Inbox' | 'Planned' | 'Completed' | 'Archived';
    nextReviewDate: string | null;  // ISO 8601 UTC
    linkedNoteId: string | null;      // Link to local SQLite notes
    linkedJournalDate: string | null; // Link to journal entry (YYYY-MM-DD)
    createdAt: string;
    updatedAt: string;
}

export interface KnowledgeLink {
    id: string;
    sourceId: string;
    targetId: string;
    linkType: 'related' | 'blocks' | 'requires';
    createdAt: string;
}

export interface KnowledgeItemFilters {
    status?: string;
    item_type?: string;
    search?: string;
    due_for_review?: boolean;
}

export interface DuplicateCheckResult {
    isDuplicate: boolean;
    existingItems: KnowledgeItem[];
}

// ─── Milestones (Goal Periods) ──────────────────────────────────────

export interface Milestone {
    id: string;
    targetMetric: string;
    targetValue: number;
    dailyAmount: number;
    periodType: string;
    periodStart: string;
    periodEnd: string;
    currentValue: number;
    problemId: string | null;
    unit: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface BalancerResult {
    milestoneId: string;
    targetMetric: string;
    updatedGoals: number;
    dailyRequired: number;
    isRealMilestone: boolean;
    message: string;
}

// Legacy alias for backwards compatibility
export type MonthlyGoal = Milestone;

// ─── Daily Briefing ─────────────────────────────────────────────

export interface DailyBriefingResponse {
    date: string;                      // YYYY-MM-DD
    goals: UnifiedGoal[];              // Today's goals
    debtGoals: UnifiedGoal[];          // Overdue goals
    milestones: BalancerResult[];      // Active milestones
    kbItemsDue: KnowledgeItem[];       // KB items for review
    stats: BriefingStats;
}

export interface BriefingStats {
    totalGoals: number;
    completedGoals: number;
    debtCount: number;
    kbItemsDueCount: number;
    milestonesOnTrack: number;
    milestonesBehind: number;
}

// ─── Debt System ────────────────────────────────────────────────

export interface ContextItem {
    id: string;
    itemType: string;
    content: string;
    title: string | null;
    relevanceScore: number;
}

export interface DebtArchive {
    id: string;
    goalId: string;
    originalMonth: string;         // YYYY-MM
    archivedAt: string;            // ISO 8601 UTC
    reason: string | null;
    goalText: string;
    goalData: Record<string, unknown> | null;
}

export interface DebtTrailItem {
    date: string;                  // YYYY-MM-DD
    debtCount: number;
    goals: UnifiedGoal[];
}

// ─── Reflection System ──────────────────────────────────────────

export interface GoalReflection {
    id: string;
    goalId: string;
    learningText: string;
    createdAt: string;             // ISO 8601 UTC
    kbItemId: string | null;
}

export interface CreateReflectionInput {
    goalId: string;
    learningText: string;
    createKbItem: boolean;
}

// ─── Retrospectives (SPACE Framework) ───────────────────────────

export interface Retrospective {
    id: string;
    periodType: 'weekly' | 'monthly';
    periodStart: string;           // ISO 8601 UTC
    periodEnd: string;             // ISO 8601 UTC
    questionsData: RetrospectiveQuestions;
    createdAt: string;             // ISO 8601 UTC
}

export interface RetrospectiveQuestions {
    energy: number;                // 1-10
    satisfaction: number;          // 1-10
    deep_work_hours: number;       // Hours
    accomplishments?: string;
    challenges?: string;
    improvements?: string;
    goals_next_period?: string;
}

export interface CreateRetrospectiveInput {
    periodType: 'weekly' | 'monthly';
    periodStart: string;
    periodEnd: string;
    questionsData: RetrospectiveQuestions;
}

export interface RetrospectiveStats {
    avgEnergy: number;
    avgSatisfaction: number;
    totalDeepWorkHours: number;
    correlation: number;           // -1 to 1
}

// ─── Codeforces Ladder System ────────────────────────────────────

/** Matches Rust CFLadderRow (serde camelCase) */
export interface CFLadder {
    id: string;
    name: string;
    description: string | null;
    ratingMin: number | null;
    ratingMax: number | null;
    difficulty: number | null;
    source: string;
    problemCount: number;
    createdAt: string;
}

/** Matches Rust CFLadderProblemRow (serde camelCase) */
export interface CFLadderProblem {
    id: string;
    ladderId: string;
    position: number;
    problemId: string;
    problemName: string;
    problemUrl: string;
    difficulty: number | null;
    onlineJudge: string;
    createdAt: string;
    solvedByFriends?: string[];
    status?: string; // Actual verdict from pos_submissions (OK, WRONG_ANSWER, COMPILATION_ERROR, etc.)
}

export interface CFLadderProgress {
    id: string;
    ladderId: string;
    problemId: string;
    solvedAt: string | null;
    attempts: number;
    createdAt: string;
}

/** Matches Rust LadderStats (serde camelCase) */
export interface LadderStats {
    totalProblems: number;
    solved: number;
    attempted: number;
    unsolved: number;
    progressPercentage: number;
}

export interface ImportLadderRequest {
    htmlContent: string;
    source: string;
}

/** Matches Rust CFFriendRow (serde camelCase) */
export interface CFFriend {
    id: string;
    cfHandle: string;
    displayName: string | null;
    currentRating: number | null;
    maxRating: number | null;
    lastSynced: string | null;
    createdAt: string;
    submissionCount: number | null;
    totalSubmissions: number | null;
}

/** Matches Rust CFCategoryRow (serde camelCase) */
export interface CFCategory {
    id: string;
    name: string;
    description: string | null;
    problemCount: number;
    createdAt: string;
}

/** Matches Rust CFCategoryProblemRow (serde camelCase) */
export interface CFCategoryProblem {
    id: string;
    categoryId: string;
    problemId: string;
    problemName: string;
    problemUrl: string;
    position: number;
    difficulty: number | null;
    onlineJudge: string;
    year: string | null;
    contest: string | null;
    createdAt: string;
    solvedByFriends?: string[];
    status?: string;
}

/** Matches Rust DailyRecommendation (serde camelCase) */
export interface DailyRecommendation {
    problemId: string;
    problemName: string;
    problemUrl: string;
    onlineJudge: string;
    difficulty: number | null;
    reason: string;
    strategy: string;
}

/** Matches Rust FriendsLadderProblem (serde camelCase) */
export interface FriendsLadderProblem {
    problemId: string;
    problemName: string;
    problemUrl: string;
    difficulty: number | null;
    solveCount: number;
    solvedBy: string[];
    mostRecentSolve: string | null;
}

// ─── Yearly Graph Data (from get_yearly_graph_data backend command) ───────
// Pre-flight O: all field names match Rust #[serde(rename_all = "camelCase")]

export interface ActivitySummary {
    id: string;
    date: string;           // YYYY-MM-DD
    title: string;
    category: string;
    startTime: string;      // ISO UTC
    endTime: string;        // ISO UTC
    isProductive: boolean;
}

export interface GoalSummary {
    id: string;
    date: string;           // YYYY-MM-DD (from due_date in UTC)
    text: string;
    completed: boolean;
    priority: string;
    dueDate: string;        // ISO UTC timestamp for frontend timezone conversion
}

export interface SubmissionSummary {
    id: string;
    date: string;           // YYYY-MM-DD
    platform: string;
    problemTitle: string;
    verdict: string;
    submittedTime: string;  // ISO UTC
    difficulty: string | null;
}

export interface KbGraphItem {
    id: string;
    date: string;           // YYYY-MM-DD
    itemType: string;
    content: string;
    status: string;
    createdAt: string;      // ISO UTC
    metadataTitle: string | null;
}

export interface KbGraphLink {
    id: string;
    sourceId: string;
    targetId: string;
    linkType: string;
}

export interface RetroSummary {
    id: string;
    date: string;           // YYYY-MM-DD
    periodType: string;
    periodStart: string;    // ISO UTC
    periodEnd: string;      // ISO UTC
}

export interface JournalSummary {
    id: string;
    date: string;           // YYYY-MM-DD
    reflectionText: string;
}

export interface NoteSummary {
    id: string;
    date: string;           // YYYY-MM-DD
    title: string | null;
    createdAtMs: number;    // BIGINT Unix ms
}

export interface YearlyGraphData {
    activities: ActivitySummary[];
    goals: GoalSummary[];
    submissions: SubmissionSummary[];
    kbItems: KbGraphItem[];
    kbLinks: KbGraphLink[];
    retrospectives: RetroSummary[];
    journalEntries: JournalSummary[];
    notes: NoteSummary[];
}

export interface LeetCodeUserStats {
    username: string;
    ranking: number | null;
    totalSolved: number;
    easySolved: number;
    mediumSolved: number;
    hardSolved: number;
    acceptanceRate: number;
}

export interface CodeforcesUserStats {
    handle: string;
    rating: number | null;
    maxRating: number | null;
    rank: string | null;
    maxRank: string | null;
    avatar: string | null;
    totalSolved: number;
    totalSubmissions: number;
}

// ─── Book Tracking ──────────────────────────────────────────────

export interface BookMetadata {
    isbn: string;
    title: string;
    authors: string[];
    numberOfPages: number | null;
    publisher: string | null;
    publishDate: string | null;
    coverUrl: string | null;
}

export interface Book {
    id: string;
    isbn: string | null;
    title: string;
    authors: string[];  // Parsed from JSONB
    numberOfPages: number | null;
    publisher: string | null;
    publishDate: string | null;
    coverUrl: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
}

export interface BookReadingHistory {
    book: Book;
    activities: BookActivitySummary[];
    totalPagesRead: number;
    totalReadingTimeMinutes: number;
    firstReadDate: string | null;
    lastReadDate: string | null;
}

export interface BookActivitySummary {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    pagesRead: number | null;
}
