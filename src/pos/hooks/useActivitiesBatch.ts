import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { Activity } from '../lib/types';

interface ActivityResponse {
    activities: Activity[];
    totalMinutes: number;
    productiveMinutes: number;
    goalDirectedMinutes: number;
}

export interface UseActivitiesBatchReturn {
    activitiesMap: Map<string, ActivityResponse>;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

/**
 * Custom hook for batch fetching activities for multiple dates.
 * Optimized for grid views - single query instead of N queries.
 * 
 * @param dates - Array of date strings in YYYY-MM-DD format
 * @param autoFetch - Whether to fetch on mount (default: true)
 * @returns Map of date -> activities with loading state and refetch function
 */
export function useActivitiesBatch(dates: string[], autoFetch = true): UseActivitiesBatchReturn {
    const [activitiesMap, setActivitiesMap] = useState<Map<string, ActivityResponse>>(new Map());
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);

    const fetchActivitiesBatch = useCallback(async () => {
        if (!dates || dates.length === 0) {
            setActivitiesMap(new Map());
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await invoke<Record<string, ActivityResponse>>('get_activities_batch', { dates });
            
            // Convert Record to Map for O(1) lookups
            const map = new Map<string, ActivityResponse>();
            Object.entries(response).forEach(([date, data]) => {
                map.set(date, data);
            });
            
            setActivitiesMap(map);
        } catch (err) {
            const errorMsg = String(err);
            setError(errorMsg);
            toast.error('Failed to fetch activities', { description: errorMsg });
        } finally {
            setLoading(false);
        }
    }, [dates.join(',')]); // Stable dependency on dates array content

    useEffect(() => {
        if (autoFetch) {
            fetchActivitiesBatch();
        }
    }, [fetchActivitiesBatch, autoFetch]);

    return {
        activitiesMap,
        loading,
        error,
        refetch: fetchActivitiesBatch,
    };
}
