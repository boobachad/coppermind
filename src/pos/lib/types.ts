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
    metrics: UnifiedGoalMetric[] | null;
    problemId: string | null;
    linkedActivityIds: string[] | null;
    labels: string[] | null;
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

export interface KnowledgeItem {
    id: string;
    itemType: 'Link' | 'Problem' | 'NoteRef' | 'StickyRef' | 'Collection';
    source: 'ActivityLog' | 'Manual' | 'BrowserExtension' | 'Journal';
    content: string;              // URL or Text or JSON array for Collections
    metadata: Record<string, unknown> | null;  // Title, Tags, Difficulty, RelatedItemIds
    status: 'Inbox' | 'Planned' | 'Completed' | 'Archived';
    nextReviewDate: string | null;  // ISO 8601 UTC
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
