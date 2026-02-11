/**
 * POS Custom Hooks
 * 
 * Centralized data fetching hooks for POS features.
 * All hooks follow consistent patterns:
 * - Loading state management
 * - Error handling with toast notifications
 * - Refetch capability
 * - Optional auto-fetch on mount
 */

export { useActivities } from './useActivities';
export { useActivitiesBatch } from './useActivitiesBatch';
export { useGoals } from './useGoals';
export { useDebtGoals } from './useDebtGoals';
export { useSubmissions } from './useSubmissions';

export type { UseActivitiesReturn } from './useActivities';
export type { UseActivitiesBatchReturn } from './useActivitiesBatch';
export type { UseGoalsReturn } from './useGoals';
export type { UseDebtGoalsReturn } from './useDebtGoals';
export type { UseSubmissionsReturn } from './useSubmissions';
