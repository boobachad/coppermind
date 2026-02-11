import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { Activity } from '../lib/types';

export interface UseActivitiesReturn {
    activities: Activity[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    totalMinutes: number;
    productiveMinutes: number;
    goalDirectedMinutes: number;
}

/**
 * Custom hook for fetching activities for a specific date.
 * Handles loading state, error handling, and computed metrics.
 * 
 * @param date - Date string in YYYY-MM-DD format
 * @param autoFetch - Whether to fetch on mount (default: true)
 * @returns Activities data with loading state and refetch function
 */
export function useActivities(date: string, autoFetch = true): UseActivitiesReturn {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);
    const [metrics, setMetrics] = useState({
        totalMinutes: 0,
        productiveMinutes: 0,
        goalDirectedMinutes: 0,
    });

    const fetchActivities = useCallback(async () => {
        if (!date) return;

        setLoading(true);
        setError(null);

        try {
            const response = await invoke<{ 
                activities: Activity[];
                totalMinutes: number;
                productiveMinutes: number;
                goalDirectedMinutes: number;
            }>('get_activities', { date });

            setActivities(response.activities);
            setMetrics({
                totalMinutes: response.totalMinutes,
                productiveMinutes: response.productiveMinutes,
                goalDirectedMinutes: response.goalDirectedMinutes,
            });
        } catch (err) {
            const errorMsg = String(err);
            setError(errorMsg);
            toast.error('Failed to fetch activities', { description: errorMsg });
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        if (autoFetch) {
            fetchActivities();
        }
    }, [fetchActivities, autoFetch]);

    return {
        activities,
        loading,
        error,
        refetch: fetchActivities,
        ...metrics,
    };
}
