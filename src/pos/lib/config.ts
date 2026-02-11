// Activity categories
export const ACTIVITY_CATEGORIES = {
    CODING: 'coding',
    CODING_LEETCODE: 'coding_leetcode',
    CODING_CODEFORCES: 'coding_codeforces',
    SLEEP: 'sleep',
    BOOK: 'book',
    REAL_PROJECTS: 'real_projects',
    CPP: 'cpp',
    EXERCISE: 'exercise',
    COLLEGE: 'college',
    FOOD: 'food',
    FAMILY: 'family',
    ENTERTAINMENT: 'entertainment',
    COMMUTE: 'commute',
    MISC: 'misc',
    NCC: 'ncc',
    SIDE_PROJECTS: 'side_projects',
    SURFING: 'surfing',
} as const;

export type ActivityCategory = typeof ACTIVITY_CATEGORIES[keyof typeof ACTIVITY_CATEGORIES];

// Activity colors - CSS variables for theme-aware rendering
export const ACTIVITY_COLORS: Record<string, string> = {
    coding: 'var(--pos-activity-coding)',
    coding_leetcode: 'var(--pos-activity-coding-leetcode)',
    coding_codeforces: 'var(--pos-activity-coding-codeforces)',
    cpp: 'var(--pos-activity-cpp)',
    sleep: 'var(--pos-activity-sleep)',
    book: 'var(--pos-activity-book)',
    real_projects: 'var(--pos-activity-real-projects)',
    exercise: 'var(--pos-activity-exercise)',
    college: 'var(--pos-activity-college)',
    food: 'var(--pos-activity-food)',
    family: 'var(--pos-activity-family)',
    entertainment: 'var(--pos-activity-entertainment)',
    commute: 'var(--pos-activity-commute)',
    misc: 'var(--pos-activity-misc)',
    ncc: 'var(--pos-activity-ncc)',
    side_projects: 'var(--pos-activity-side-projects)',
    surfing: 'var(--pos-activity-surfing)',
};

// Helper to get activity color with fallback
export const getActivityColor = (category: string): string => {
    const color = ACTIVITY_COLORS[category] || 'var(--pos-activity-fallback)';
    // Debug: log missing categories
    if (!ACTIVITY_COLORS[category]) {
        console.warn(`[POS] Unknown activity category: "${category}", using fallback`);
    }
    return color;
};

export const PLATFORMS = {
    LEETCODE: 'leetcode',
    CODEFORCES: 'codeforces',
} as const;

export type Platform = typeof PLATFORMS[keyof typeof PLATFORMS];
