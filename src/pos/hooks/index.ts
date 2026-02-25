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
export { useSubmissions } from './useSubmissions';

export type { UseActivitiesReturn } from './useActivities';
export type { UseActivitiesBatchReturn } from './useActivitiesBatch';
export type { UseSubmissionsReturn } from './useSubmissions';
