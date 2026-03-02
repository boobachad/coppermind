// ─── Milestone Progress Utilities ──────────────────────────────────
// Minimal utilities for milestone progress calculation and status tracking.

import { getLocalDateString } from './time';

/**
 * Calculate remaining days in a period
 */
export function calculateRemainingDays(periodEnd: string): number {
    const today = getLocalDateString();
    const endDate = periodEnd.split('T')[0];
    
    const todayTime = new Date(`${today}T00:00:00Z`).getTime();
    const endTime = new Date(`${endDate}T00:00:00Z`).getTime();
    
    const diffMs = endTime - todayTime;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    return Math.max(0, diffDays + 1); // +1 to include today
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
