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
    languages: any | null;
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
    topics: any | null;
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
    languagesBreakdown: any | null;
    currentStreakDays: number;
    longestStreakDays: number;
    contributionsByYear: any | null;
    topRepos: any | null;
    syncedAt: string;
}
