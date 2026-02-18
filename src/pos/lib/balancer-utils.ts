// ─── Balancer Engine Utilities ─────────────────────────────────────
// Helper functions for monthly goal distribution and progress calculation.

import { MonthlyGoal, UnifiedGoal } from '@/pos/lib/types';

/**
 * Calculate daily target based on strategy
 */
export function calculateDailyTarget(
    strategy: 'EvenDistribution' | 'FrontLoad' | 'Manual',
    remainingTarget: number,
    remainingDays: number,
    dayIndex: number = 0
): number {
    if (remainingDays <= 0 || remainingTarget <= 0) return 0;
    
    switch (strategy) {
        case 'EvenDistribution':
            return Math.ceil(remainingTarget / remainingDays);
            
        case 'FrontLoad': {
            // Higher targets earlier in the period
            // Uses exponential decay: earlier days get more
            const totalWeight = Array.from({ length: remainingDays }, (_, i) => 
                Math.pow(2, remainingDays - i - 1)
            ).reduce((a, b) => a + b, 0);
            
            const dayWeight = Math.pow(2, remainingDays - dayIndex - 1);
            return Math.ceil((remainingTarget * dayWeight) / totalWeight);
        }
            
        case 'Manual':
            // No auto-calculation for manual strategy
            return 0;
            
        default:
            return Math.ceil(remainingTarget / remainingDays);
    }
}

/**
 * Calculate remaining days in a period
 */
export function calculateRemainingDays(periodEnd: string): number {
    const today = new Date(); // For calculating days remaining
    today.setHours(0, 0, 0, 0);
    
    const endDate = new Date(periodEnd);
    endDate.setHours(0, 0, 0, 0);
    
    const diffMs = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays + 1); // +1 to include today
}

/**
 * Calculate total completed value from linked goals
 */
export function calculateCompletedValue(
    linkedGoals: UnifiedGoal[],
    metricName?: string
): number {
    let total = 0;
    
    for (const goal of linkedGoals) {
        if (!goal.completed) continue;
        
        if (goal.metrics && goal.metrics.length > 0) {
            // If metric name specified, sum only that metric
            if (metricName) {
                const metric = goal.metrics.find(m => m.label === metricName);
                if (metric) {
                    total += metric.current;
                }
            } else {
                // Otherwise sum all metrics' current values
                total += goal.metrics.reduce((sum, m) => sum + m.current, 0);
            }
        } else {
            // No metrics: count as 1 if completed
            total += 1;
        }
    }
    
    return total;
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(current: number, target: number): number {
    if (target === 0) return 0;
    return Math.min(100, Math.round((current / target) * 100));
}

/**
 * Determine if ahead or behind schedule
 */
export function calculateScheduleStatus(
    current: number,
    target: number,
    periodStart: string,
    periodEnd: string
): 'ahead' | 'on-track' | 'behind' {
    const totalDays = calculateTotalDays(periodStart, periodEnd);
    const remainingDays = calculateRemainingDays(periodEnd);
    const elapsedDays = totalDays - remainingDays;
    
    if (elapsedDays === 0) return 'on-track';
    
    // Expected progress at this point
    const expectedCurrent = (target / totalDays) * elapsedDays;
    
    const deviation = ((current - expectedCurrent) / target) * 100;
    
    if (deviation > 10) return 'ahead';
    if (deviation < -10) return 'behind';
    return 'on-track';
}

/**
 * Calculate total days in a period
 */
export function calculateTotalDays(periodStart: string, periodEnd: string): number {
    const start = new Date(periodStart);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(periodEnd);
    end.setHours(0, 0, 0, 0);
    
    const diffMs = end.getTime() - start.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
}

/**
 * Generate date range for a period
 */
export function generateDateRange(periodStart: string, periodEnd: string): string[] {
    const dates: string[] = [];
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    
    const current = new Date(start);
    while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

/**
 * Check if a date is within a period
 */
export function isDateInPeriod(date: string, periodStart: string, periodEnd: string): boolean {
    const d = new Date(date);
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    
    return d >= start && d <= end;
}

/**
 * Get the current month period (start and end dates)
 */
export function getCurrentMonthPeriod(): { start: string; end: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0); // Last day of month
    
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

/**
 * Format month for display (e.g., "February 2026")
 */
export function formatMonth(monthString: string): string {
    // Input: YYYY-MM
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Calculate velocity (average per day)
 */
export function calculateVelocity(current: number, elapsedDays: number): number {
    if (elapsedDays === 0) return 0;
    return current / elapsedDays;
}

/**
 * Estimate completion date based on current velocity
 */
export function estimateCompletionDate(
    current: number,
    target: number,
    periodStart: string
): string | null {
    if (current === 0) return null;
    
    const start = new Date(periodStart);
    const today = new Date(); // For calculating elapsed time
    today.setHours(0, 0, 0, 0);
    
    const elapsedMs = today.getTime() - start.getTime();
    const elapsedDays = Math.ceil(elapsedMs / (1000 * 60 * 60 * 24));
    
    if (elapsedDays === 0) return null;
    
    const velocity = current / elapsedDays;
    const remainingTarget = target - current;
    const daysToComplete = Math.ceil(remainingTarget / velocity);
    
    const completionDate = new Date(today);
    completionDate.setDate(completionDate.getDate() + daysToComplete);
    
    return completionDate.toISOString().split('T')[0];
}

/**
 * Get distribution preview for a monthly goal
 */
export interface DailyDistribution {
    date: string;
    target: number;
    actual: number;
}

export function getDistributionPreview(
    monthlyGoal: MonthlyGoal,
    linkedGoals: UnifiedGoal[]
): DailyDistribution[] {
    const dates = generateDateRange(
        monthlyGoal.periodStart.split('T')[0],
        monthlyGoal.periodEnd.split('T')[0]
    );
    
    const distribution: DailyDistribution[] = [];
    let remainingTarget = monthlyGoal.targetValue - monthlyGoal.currentValue;
    let remainingDays = calculateRemainingDays(monthlyGoal.periodEnd);
    
    const today = new Date(); // For comparing past vs future dates
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const dateObj = new Date(date);
        dateObj.setHours(0, 0, 0, 0);
        const isPast = dateObj < today;
        
        // Find actual value for this date
        const dayGoal = linkedGoals.find(g => g.dueDate?.split('T')[0] === date);
        const actual = dayGoal?.completed 
            ? (dayGoal.metrics?.[0]?.current || 1) 
            : 0;
        
        // Calculate target for this date
        let target = 0;
        if (!isPast && remainingDays > 0) {
            target = calculateDailyTarget(
                monthlyGoal.strategy,
                remainingTarget,
                remainingDays,
                i
            );
        }
        
        distribution.push({ date, target, actual });
        
        // Update remaining for next iteration
        if (isPast) {
            remainingTarget -= actual;
            remainingDays--;
        }
    }
    
    return distribution;
}

/**
 * Check if redistribution is needed
 */
export function needsRedistribution(
    monthlyGoal: MonthlyGoal,
    linkedGoals: UnifiedGoal[]
): boolean {
    if (monthlyGoal.strategy === 'Manual') return false;
    
    const actualProgress = calculateCompletedValue(linkedGoals);
    const expectedProgress = monthlyGoal.currentValue;
    
    // If actual differs from expected by more than 10%, redistribution may help
    const deviation = Math.abs(actualProgress - expectedProgress);
    return deviation > monthlyGoal.targetValue * 0.1;
}
