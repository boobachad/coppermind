import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import type { Submission } from '../lib/types';

interface GroupedSubmission extends Submission {
    allTimestamps: string[];
}

export interface UseSubmissionsReturn {
    submissions: GroupedSubmission[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

/**
 * Custom hook for fetching and grouping submissions.
 * Groups multiple submissions of same problem, keeping latest metadata.
 * 
 * @param autoFetch - Whether to fetch on mount (default: true)
 * @returns Grouped submissions with loading state and refetch function
 */
export function useSubmissions(autoFetch = true): UseSubmissionsReturn {
    const [submissions, setSubmissions] = useState<GroupedSubmission[]>([]);
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);

    const fetchSubmissions = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const rawData = await invoke<Submission[]>('get_submissions');

            // Group by platform-problemId key
            const groupedMap = new Map<string, GroupedSubmission>();

            rawData.forEach((sub) => {
                const key = `${sub.platform}-${sub.problemId}`;
                const existing = groupedMap.get(key);

                if (!existing) {
                    groupedMap.set(key, {
                        ...sub,
                        allTimestamps: [sub.submittedTime]
                    });
                } else {
                    existing.allTimestamps.push(sub.submittedTime);

                    // Keep latest submission metadata
                    if (new Date(sub.submittedTime).getTime() > new Date(existing.submittedTime).getTime()) {
                        existing.submittedTime = sub.submittedTime;
                        existing.verdict = sub.verdict;
                        existing.language = sub.language;
                        existing.rating = sub.rating;
                        existing.difficulty = sub.difficulty;
                        existing.tags = sub.tags;
                    }
                }
            });

            // Convert to array and sort timestamps
            const groupedSubmissions = Array.from(groupedMap.values()).map(sub => ({
                ...sub,
                allTimestamps: sub.allTimestamps.sort((a: string, b: string) =>
                    new Date(b).getTime() - new Date(a).getTime()
                )
            }));

            // Sort by latest submission time (descending)
            groupedSubmissions.sort((a, b) => 
                new Date(b.submittedTime).getTime() - new Date(a.submittedTime).getTime()
            );

            setSubmissions(groupedSubmissions);
        } catch (err) {
            const errorMsg = String(err);
            setError(errorMsg);
            toast.error('Failed to fetch submissions', { description: errorMsg });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (autoFetch) {
            fetchSubmissions();
        }
    }, [fetchSubmissions, autoFetch]);

    return {
        submissions,
        loading,
        error,
        refetch: fetchSubmissions,
    };
}
