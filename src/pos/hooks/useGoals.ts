import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { GoalWithDetails } from '../lib/types';

export interface UseGoalsReturn {
    goals: GoalWithDetails[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

/**
 * Custom hook for fetching goals for a specific date.
 * Handles loading state, error handling, and provides refetch capability.
 * 
 * @param date - Date string in YYYY-MM-DD format
 * @param autoFetch - Whether to fetch on mount (default: true)
 * @returns Goals data with loading state and refetch function
 */
export function useGoals(date: string, autoFetch = true): UseGoalsReturn {
    const [goals, setGoals] = useState<GoalWithDetails[]>([]);
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);

    const fetchGoals = useCallback(async () => {
        if (!date) return;

        setLoading(true);
        setError(null);

        try {
            const data = await invoke<GoalWithDetails[]>('get_goals', { date });
            setGoals(data);
        } catch (err) {
            const errorMsg = String(err);
            setError(errorMsg);
            toast.error('Failed to fetch goals', { description: errorMsg });
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        if (autoFetch) {
            fetchGoals();
        }
    }, [fetchGoals, autoFetch]);

    return {
        goals,
        loading,
        error,
        refetch: fetchGoals,
    };
}
