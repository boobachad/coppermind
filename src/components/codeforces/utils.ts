export const getRatingColor = (rating: number | null | undefined): string => {
    if (!rating) return 'var(--text-primary)';
    if (rating < 1200) return '#808080'; // Newbie - Gray
    if (rating < 1400) return '#008000'; // Pupil - Green
    if (rating < 1600) return '#03a89e'; // Specialist - Cyan
    if (rating < 1900) return '#0000ff'; // Expert - Blue
    if (rating < 2100) return '#aa00aa'; // Candidate Master - Violet
    if (rating < 2300) return '#ff8c00'; // Master - Orange
    if (rating < 2400) return '#ff8c00'; // International Master - Orange
    if (rating < 2600) return '#ff0000'; // Grandmaster - Red
    if (rating < 3000) return '#ff0000'; // International Grandmaster - Red
    return 'legendary'; // Legendary Grandmaster - Special (first letter black, rest red)
};

export const isLegendaryGrandmaster = (rating: number | null | undefined): boolean => {
    return !!rating && rating >= 3000;
};

export const getDifficultyLevel = (difficulty: number | null | undefined): number => {
    if (!difficulty) return 1;
    if (difficulty < 1200) return 1;
    if (difficulty < 1600) return 2;
    if (difficulty < 2000) return 3;
    if (difficulty < 2400) return 4;
    return 5;
};

export const getDifficultyColorByLevel = (level: number): string => {
    return `var(--pos-heatmap-level-${Math.min(level, 5)})`;
};
