// ─── Milestone Progress Utilities ──────────────────────────────────
// Minimal utilities for milestone progress calculation and status tracking.

import { getLocalDateString } from './time';

/**
 * Calculate remaining days in a period (days AFTER today)
 */
export function calculateRemainingDays(periodEnd: string): number {
    const today = getLocalDateString();
    const endDate = periodEnd.split('T')[0];
    
    const todayTime = new Date(`${today}T00:00:00Z`).getTime();
    const endTime = new Date(`${endDate}T00:00:00Z`).getTime();
    
    const diffMs = endTime - todayTime;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // Remaining = days after today (not including today)
    return Math.max(0, diffDays);
}

/**
 * Calculate total days in a period
 */
export function calculateTotalDays(periodStart: string, periodEnd: string): number {
    const startDate = periodStart.split('T')[0];
    const endDate = periodEnd.split('T')[0];
    
    const startTime = new Date(`${startDate}T00:00:00Z`).getTime();
    const endTime = new Date(`${endDate}T00:00:00Z`).getTime();
    
    const diffMs = endTime - startTime;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1; // +1 to include start day
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
 * Any debt = behind, ahead of expected = ahead, otherwise on-track
 */
export function calculateScheduleStatus(
    current: number,
    target: number,
    periodStart: string,
    periodEnd: string
): 'ahead' | 'on-track' | 'behind' {
    const totalDays = calculateTotalDays(periodStart, periodEnd);
    const today = getLocalDateString();
    const startDate = periodStart.split('T')[0];
    
    // Days passed (not including today)
    const startTime = new Date(`${startDate}T00:00:00Z`).getTime();
    const todayTime = new Date(`${today}T00:00:00Z`).getTime();
    const daysPassed = Math.floor((todayTime - startTime) / (1000 * 60 * 60 * 24));
    
    // Expected progress for days passed
    const expectedCurrent = (target / totalDays) * daysPassed;
    
    // If behind expected, return behind
    if (current < expectedCurrent) return 'behind';
    
    // If ahead by more than 10% of target, return ahead
    const deviation = ((current - expectedCurrent) / target) * 100;
    if (deviation > 10) return 'ahead';
    
    return 'on-track';
}

/**
 * Calculate debt (accumulated from past incomplete days ONLY)
 * Debt = shortfall from completed days (before today)
 */
export function calculateDebt(
    current: number,
    _target: number,
    dailyAmount: number,
    periodStart: string,
    _periodEnd: string,
    todayProgress: number = 0
): number {
    const today = getLocalDateString();
    const startDate = periodStart.split('T')[0];
    
    // Days that have COMPLETED (before today)
    const startTime = new Date(`${startDate}T00:00:00Z`).getTime();
    const todayTime = new Date(`${today}T00:00:00Z`).getTime();
    const daysCompleted = Math.floor((todayTime - startTime) / (1000 * 60 * 60 * 24));
    
    if (daysCompleted <= 0) {
        // No completed days yet, no debt
        return 0;
    }
    
    // Expected from completed days
    const expectedFromPast = dailyAmount * daysCompleted;
    
    // Actual from completed days = total - today's progress
    const actualFromPast = current - todayProgress;
    
    // Debt = shortfall from past only
    return Math.max(0, expectedFromPast - actualFromPast);
}

/**
 * Calculate today's required amount (daily target + accumulated debt)
 * This shows what's remaining for today, not the original daily amount
 */
export function calculateTodayRequired(
    current: number,
    _target: number,
    dailyAmount: number,
    periodStart: string,
    _periodEnd: string,
    todayProgress: number = 0  // How much was logged today specifically
): { todayBase: number; debt: number; total: number; todayRemaining: number } {
    const debt = calculateDebt(current, _target, dailyAmount, periodStart, _periodEnd, todayProgress);
    const todayRemaining = Math.max(0, dailyAmount - todayProgress);
    
    return {
        todayBase: dailyAmount,
        debt: debt,
        total: todayRemaining + debt,
        todayRemaining: todayRemaining
    };
}
