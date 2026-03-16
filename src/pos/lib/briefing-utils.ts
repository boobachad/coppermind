import type { MonthlyRollup } from './types';

// Group a sorted array of [date, value] pairs into weekly buckets (week 1 = days 1-7)
export function groupByWeek(
    pairs: [string, number][],
): { weekNum: number; total: number }[] {
    const result: Record<number, number> = {};
    for (const [date, value] of pairs) {
        const day = parseInt(date.split('-')[2], 10);
        const wk = Math.floor((day - 1) / 7) + 1;
        result[wk] = (result[wk] ?? 0) + value;
    }
    return Object.entries(result)
        .map(([wk, total]) => ({ weekNum: parseInt(wk, 10), total }))
        .sort((a, b) => a.weekNum - b.weekNum);
}

// Rolling average over a window of N values
export function rollingAverage(values: number[], window: number): number[] {
    return values.map((_, i) => {
        const slice = values.slice(Math.max(0, i - window + 1), i + 1);
        return slice.reduce((s, v) => s + v, 0) / slice.length;
    });
}

// Linear regression — returns slope and intercept for a series of [x, y] points
export function linearRegression(points: [number, number][]): { slope: number; intercept: number } {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: points[0]?.[1] ?? 0 };
    const sumX = points.reduce((s, [x]) => s + x, 0);
    const sumY = points.reduce((s, [, y]) => s + y, 0);
    const sumXY = points.reduce((s, [x, y]) => s + x * y, 0);
    const sumX2 = points.reduce((s, [x]) => s + x * x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return { slope: 0, intercept: sumY / n };
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

// Pearson correlation between two equal-length arrays
export function pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;
    const mx = x.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;
    const num = x.reduce((s, xi, i) => s + (xi - mx) * (y[i]! - my), 0);
    const den = Math.sqrt(
        x.reduce((s, xi) => s + (xi - mx) ** 2, 0) *
        y.reduce((s, yi) => s + (yi - my) ** 2, 0),
    );
    return den === 0 ? 0 : num / den;
}

// Build cumulative sum series from daily [date, value] pairs
export function buildCumulative(dailyValues: [string, number][]): [string, number][] {
    let running = 0;
    return dailyValues.map(([date, val]) => {
        running += val;
        return [date, running];
    });
}

// Format minutes as "Xh Ym" — e.g. 125 → "2h 5m"
export function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

// Week number within a month for a YYYY-MM-DD date string
export function getWeekOfMonth(dateStr: string): number {
    const day = parseInt(dateStr.split('-')[2], 10);
    return Math.floor((day - 1) / 7) + 1;
}

// Extract month label "Jan", "Feb", etc. from YYYY-MM string
export function shortMonthLabel(yyyyMm: string): string {
    const month = parseInt(yyyyMm.split('-')[1], 10);
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month - 1] ?? yyyyMm;
}

// Map 12 monthly rollups to chart-ready data with short month labels
export function rollupToChartData(
    rollups: MonthlyRollup[],
    key: keyof MonthlyRollup,
): { month: string; value: number }[] {
    return rollups.map(r => ({
        month: shortMonthLabel(r.month),
        value: (r[key] as number) ?? 0,
    }));
}
