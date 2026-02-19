import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Calendar, ArrowRight, CheckCircle, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { UnifiedGoal } from '../lib/types';
import { formatDateDDMMYYYY, getLocalDateString } from '../lib/time';

interface DebtTrailItem {
    date: string;
    count: number;
    goals: UnifiedGoal[];
}

interface DebtTrailProps {
    /**
     * End date for trail (defaults to today)
     */
    endDate?: string;
    /**
     * Number of days to look back (defaults to 30)
     */
    daysBack?: number;
    /**
     * Callback when debt is resolved
     */
    onDebtResolved?: () => void;
}

export function DebtTrail({ endDate, daysBack = 30, onDebtResolved }: DebtTrailProps) {
    const [trailItems, setTrailItems] = useState<DebtTrailItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadDebtTrail();
    }, [endDate, daysBack]);

    const loadDebtTrail = async () => {
        setLoading(true);
        try {
            const end = endDate || getLocalDateString();
            const result = await invoke<DebtTrailItem[]>('get_debt_trail', {
                endDate: end,
                daysBack,
            });

            // Filter out dates with no debt
            const filtered = result.filter(item => item.count > 0);
            setTrailItems(filtered);
        } catch (err) {
            toast.error('Failed to load debt trail', { description: String(err) });
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (date: string) => {
        setExpandedDates(prev => {
            const next = new Set(prev);
            if (next.has(date)) {
                next.delete(date);
            } else {
                next.add(date);
            }
            return next;
        });
    };

    const handleCompleteGoal = async (goalId: string) => {
        try {
            await invoke('update_unified_goal', {
                id: goalId,
                req: { completed: true }
            });
            toast.success('Goal completed!');
            loadDebtTrail();
            onDebtResolved?.();
        } catch (err) {
            toast.error('Failed to complete goal', { description: String(err) });
        }
    };

    const handleArchiveGoal = async (goalId: string) => {
        try {
            await invoke('delete_unified_goal', { id: goalId });
            toast.success('Goal archived');
            loadDebtTrail();
            onDebtResolved?.();
        } catch (err) {
            toast.error('Failed to archive goal', { description: String(err) });
        }
    };

    if (loading) {
        return (
            <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                Loading debt trail...
            </div>
        );
    }

    if (trailItems.length === 0) {
        return (
            <div
                className="rounded-xl p-8 text-center border"
                style={{
                    backgroundColor: 'var(--surface-secondary)',
                    borderColor: 'var(--border-primary)',
                }}
            >
                <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--color-success)' }} />
                <p className="text-lg font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    No Debt Trail
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    All goals completed on time for the past {daysBack} days!
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Debt Trail
                    </h3>
                </div>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {trailItems.reduce((sum, item) => sum + item.count, 0)} incomplete goals from past {daysBack} days
                </span>
            </div>

            {/* Trail Items */}
            <div className="space-y-2">
                {trailItems.map((item) => (
                    <div key={item.date}>
                        {/* Date Row */}
                        <button
                            onClick={() => toggleExpand(item.date)}
                            className="w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-200 hover:scale-[1.01]"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: expandedDates.has(item.date) ? 'var(--color-error)' : 'var(--border-primary)',
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <Calendar className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {formatDateDDMMYYYY(new Date(item.date))}
                                </span>
                                <span
                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                    style={{
                                        backgroundColor: 'var(--color-error)',
                                        color: 'white',
                                    }}
                                >
                                    {item.count} debt
                                </span>
                            </div>
                            <ArrowRight
                                className="w-4 h-4 transition-transform"
                                style={{
                                    color: 'var(--text-tertiary)',
                                    transform: expandedDates.has(item.date) ? 'rotate(90deg)' : 'rotate(0deg)',
                                }}
                            />
                        </button>

                        {/* Expanded Goals */}
                        {expandedDates.has(item.date) && (
                            <div className="mt-2 ml-6 space-y-2">
                                {item.goals.map((goal) => (
                                    <div
                                        key={goal.id}
                                        className="p-3 rounded-lg border flex items-start justify-between"
                                        style={{
                                            backgroundColor: 'var(--glass-bg)',
                                            borderColor: 'var(--border-primary)',
                                        }}
                                    >
                                        <div className="flex-1">
                                            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                                {goal.text}
                                            </p>
                                            {goal.metrics && goal.metrics.length > 0 && (
                                                <div className="flex gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                    {goal.metrics.map((metric, idx) => (
                                                        <span key={idx}>
                                                            {metric.label}: {metric.current}/{metric.target}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="flex gap-2 ml-4">
                                            <button
                                                onClick={() => handleCompleteGoal(goal.id)}
                                                className="p-2 rounded-lg transition-colors"
                                                style={{
                                                    backgroundColor: 'var(--surface-secondary)',
                                                    color: 'var(--color-success)',
                                                }}
                                                title="Complete"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleArchiveGoal(goal.id)}
                                                className="p-2 rounded-lg transition-colors"
                                                style={{
                                                    backgroundColor: 'var(--surface-secondary)',
                                                    color: 'var(--text-tertiary)',
                                                }}
                                                title="Archive"
                                            >
                                                <Archive className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
