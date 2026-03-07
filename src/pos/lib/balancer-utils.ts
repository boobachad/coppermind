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
 * Calculate debt (accumulated from past incomplete days)
 */
export function calculateDebt(
    current: number,
    _target: number,
    dailyAmount: number,
    periodStart: string,
    _periodEnd: string
): number {
    const today = getLocalDateString();
    const startDate = periodStart.split('T')[0];
    
    // Calculate how many days have passed (not including today)
    const startTime = new Date(`${startDate}T00:00:00Z`).getTime();
    const todayTime = new Date(`${today}T00:00:00Z`).getTime();
    const daysPassed = Math.floor((todayTime - startTime) / (1000 * 60 * 60 * 24));
    
    // Expected progress for days that have passed (not including today)
    const expectedByNow = dailyAmount * daysPassed;
    
    // Debt = what we should have done by now - what we actually did
    const debt = Math.max(0, expectedByNow - current);
    
    return debt;
}

/**
 * Calculate today's required amount (daily target + accumulated debt)
 */
export function calculateTodayRequired(
    current: number,
    _target: number,
    dailyAmount: number,
    periodStart: string,
    _periodEnd: string
): { todayBase: number; debt: number; total: number } {
    const debt = calculateDebt(current, _target, dailyAmount, periodStart, _periodEnd);
    
    return {
        todayBase: dailyAmount,
        debt: debt,
        total: dailyAmount + debt
    };
}
