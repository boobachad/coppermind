// Codeforces ladder, category, and recommendation types.
// Mirror of src-tauri/src/cf_ladder_system/cf_ladder_types.rs

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
    status?: string;
}

export interface CFLadderProgress {
    id: string;
    ladderId: string;
    problemId: string;
    solvedAt: string | null;
    attempts: number;
    createdAt: string;
}

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

export interface CFCategory {
    id: string;
    name: string;
    description: string | null;
    problemCount: number;
    createdAt: string;
}

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

export interface DailyRecommendation {
    problemId: string;
    problemName: string;
    problemUrl: string;
    onlineJudge: string;
    difficulty: number | null;
    reason: string;
    strategy: string;
}

export interface FriendsLadderProblem {
    problemId: string;
    problemName: string;
    problemUrl: string;
    difficulty: number | null;
    solveCount: number;
    solvedBy: string[];
    mostRecentSolve: string | null;
}
