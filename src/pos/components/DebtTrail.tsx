import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Calendar, ArrowRight, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { UnifiedGoal } from '../lib/types';
import { getLocalDateString } from '../lib/time';
import { GoalCard } from './GoalCard';

interface DebtTrailItem {
    month: string;
    debtCount: number;
    goals: UnifiedGoal[];
}

interface DebtTrailProps {
    /**
     * End date for trail (defaults to today)
     */
    endDate?: string;
    /**
     * Callback when debt is resolved
     */
    onDebtResolved?: () => void;
    /**
     * Callback when goal is edited
     */
    onEdit?: (goal: UnifiedGoal) => void;
    /**
     * Callback when goal is deleted
     */
    onDelete?: (id: string) => void;
}

export function DebtTrail({ endDate, onDebtResolved, onEdit, onDelete }: DebtTrailProps) {
    const [trailItems, setTrailItems] = useState<DebtTrailItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadDebtTrail();
    }, [endDate]);

    const loadDebtTrail = async () => {
        setLoading(true);
        try {
            const end = endDate || getLocalDateString();
            const result = await invoke<DebtTrailItem[]>('get_debt_trail', {
                endDate: end,
            });

            // Filter out months with no debt
            const filtered = result.filter(item => item.debtCount > 0);
            setTrailItems(filtered);
        } catch (err) {
            toast.error('Failed to load debt trail', { description: String(err) });
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (month: string) => {
        setExpandedMonths(prev => {
            const next = new Set(prev);
            if (next.has(month)) {
                next.delete(month);
            } else {
                next.add(month);
            }
            return next;
        });
    };

    const handleEdit = (goal: UnifiedGoal) => {
        onEdit?.(goal);
    };

    const handleDelete = (id: string) => {
        onDelete?.(id);
        loadDebtTrail();
        onDebtResolved?.();
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
                    All goals completed on time!
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
                    {trailItems.reduce((sum, item) => sum + item.debtCount, 0)} incomplete goals from previous months
                </span>
            </div>

            {/* Trail Items */}
            <div className="space-y-2">
                {trailItems.map((item) => (
                    <div key={item.month}>
                        {/* Month Row */}
                        <button
                            onClick={() => toggleExpand(item.month)}
                            className="w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-200 hover:scale-[1.01]"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: expandedMonths.has(item.month) ? 'var(--color-error)' : 'var(--border-primary)',
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <Calendar className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {new Date(item.month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
                                </span>
                                <span
                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                    style={{
                                        backgroundColor: 'var(--color-error)',
                                        color: 'white',
                                    }}
                                >
                                    {item.debtCount} debt
                                </span>
                            </div>
                            <ArrowRight
                                className="w-4 h-4 transition-transform"
                                style={{
                                    color: 'var(--text-tertiary)',
                                    transform: expandedMonths.has(item.month) ? 'rotate(90deg)' : 'rotate(0deg)',
                                }}
                            />
                        </button>

                        {/* Expanded Goals */}
                        {expandedMonths.has(item.month) && (
                            <div className="mt-2 ml-6 space-y-2">
                                {item.goals.filter(g => !g.recurringPattern).map((goal) => (
                                    <GoalCard
                                        key={goal.id}
                                        goal={goal}
                                        onEdit={handleEdit}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
