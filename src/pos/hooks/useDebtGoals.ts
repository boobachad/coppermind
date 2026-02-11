import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { DebtGoal } from '../lib/types';

export interface UseDebtGoalsReturn {
    debtGoals: DebtGoal[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

/**
 * Custom hook for fetching debt goals (unverified goals moved to debt locker).
 * Handles loading state, error handling, and provides refetch capability.
 * 
 * @param autoFetch - Whether to fetch on mount (default: true)
 * @returns Debt goals data with loading state and refetch function
 */
export function useDebtGoals(autoFetch = true): UseDebtGoalsReturn {
    const [debtGoals, setDebtGoals] = useState<DebtGoal[]>([]);
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);

    const fetchDebtGoals = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await invoke<DebtGoal[]>('get_debt_goals');
            setDebtGoals(data);
        } catch (err) {
            const errorMsg = String(err);
            setError(errorMsg);
            toast.error('Failed to fetch debt goals', { description: errorMsg });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (autoFetch) {
            fetchDebtGoals();
        }
    }, [fetchDebtGoals, autoFetch]);

    return {
        debtGoals,
        loading,
        error,
        refetch: fetchDebtGoals,
    };
}
