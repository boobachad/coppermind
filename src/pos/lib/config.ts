// Activity categories
export const ACTIVITY_CATEGORIES = {
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
    ENTERTAINMENT: 'entertainment', // Movies/Shows/Social Media
    COMMUTE: 'commute',
    MISC: 'misc',
    NCC: 'ncc',
    SIDE_PROJECTS: 'side_projects',
    SURFING: 'surfing', // Unclassified web browsing
} as const;

export type ActivityCategory = typeof ACTIVITY_CATEGORIES[keyof typeof ACTIVITY_CATEGORIES];

// Color palette for activities (Dark Toned / Muted for Dark Mode)
export const ACTIVITY_COLORS: Record<string, string> = {
    coding_leetcode: '#0369a1', // Sky-700
    coding_codeforces: '#0f766e', // Teal-700
    cpp: '#155e75',            // Cyan-800
    sleep: '#52525b',          // Zinc-600
    book: '#92400e',           // Amber-800
    real_projects: '#1e40af',  // Blue-800
    exercise: '#991b1b',       // Red-800
    college: '#3730a3',        // Indigo-800
    food: '#065f46',           // Emerald-800
    family: '#9d174d',         // Pink-800
    entertainment: '#5b21b6',  // Violet-800
    commute: '#115e59',        // Teal-800
    misc: '#64748b',           // Slate-500
    ncc: '#854d0e',            // Yellow-800
    side_projects: '#86198f',  // Fuchsia-800
    surfing: '#475569',        // Slate-600

    // Legacy Categories (for backward compatibility)
    coding: '#1e40af',
    maintenance: '#334155',
    learning: '#92400e',
    browsing: '#475569',
};

// Accent color for goal-linked activities
export const GOAL_ACCENT_COLOR = '#f59e0b'; // Amber-500

// Platforms
export const PLATFORMS = {
    LEETCODE: 'leetcode',
    CODEFORCES: 'codeforces',
} as const;

export type Platform = typeof PLATFORMS[keyof typeof PLATFORMS];
