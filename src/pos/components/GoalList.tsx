import { UnifiedGoal } from '../../lib/types';
import { GoalCard } from './GoalCard';
import { Target, AlertTriangle, Trash2, Pencil } from 'lucide-react';

interface GoalListProps {
    regularGoals: UnifiedGoal[];
    debtGoals: UnifiedGoal[];
    onEdit: (goal: UnifiedGoal) => void;
    onDelete: (id: string) => void;
}

export function GoalList({ regularGoals, debtGoals, onEdit, onDelete }: GoalListProps) {
    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* Regular Goals */}
            <div className="space-y-3">
                {regularGoals.map((goal) => (
                    <GoalCard key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} />
                ))}

                {regularGoals.length === 0 && (
                    <div className="text-center py-20 opacity-50">
                        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-white/5">
                            <Target className="w-10 h-10 text-(--text-tertiary)" />
                        </div>
                        <h3 className="text-lg font-medium text-muted-foreground">No goals found</h3>
                        <p className="text-sm text-(--text-tertiary) mt-1">Create a new goal to get started</p>
                    </div>
                )}
            </div>

            {/* Debt Locker Section */}
            {debtGoals.length > 0 && (
                <div className="rounded-2xl p-6 border-2 border-dashed transition-all hover:opacity-100 opacity-90" style={{
                    borderColor: 'var(--pos-debt-border)',
                    backgroundColor: 'var(--pos-debt-bg)'
                }}>
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-3" style={{ color: 'var(--pos-debt-text)' }}>
                        <div className="p-2 rounded-lg bg-red-500/10">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        Debt Locker
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/20 text-red-700 dark:text-red-300">
                            {debtGoals.length} items
                        </span>
                    </h2>

                    <div className="space-y-4">
                        {debtGoals.map((goal) => (
                            <div
                                key={goal.id}
                                className="group rounded-xl p-4 transition-all hover:translate-x-1 border flex items-start gap-4 bg-white/50 dark:bg-black/20"
                                style={{
                                    borderColor: 'var(--pos-debt-border)',
                                }}
                            >
                                <div className="flex-1">
                                    <p className="text-base font-semibold leading-tight">{goal.text}</p>
                                    {goal.description && (
                                        <p className="text-sm mt-1 opacity-80" style={{ color: 'var(--text-secondary)' }}>
                                            {goal.description}
                                        </p>
                                    )}
                                    <p className="text-xs mt-2 font-mono opacity-70" style={{ color: 'var(--pos-debt-text)' }}>
                                        Original Deadline: {goal.originalDate}
                                    </p>
                                </div>

                                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider" style={{
                                    backgroundColor: 'var(--pos-debt-bg)',
                                    color: 'var(--pos-debt-text)',
                                    borderColor: 'var(--pos-debt-border)',
                                    borderWidth: '1px'
                                }}>
                                    Overdue
                                </span>

                                <div className="flex gap-1">
                                    <button
                                        onClick={() => onEdit(goal)}
                                        className="opacity-0 group-hover:opacity-100 p-2 rounded-lg transition-all hover:bg-blue-500/10"
                                        style={{ color: 'var(--pos-info-text)' }}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => onDelete(goal.id)}
                                        className="opacity-0 group-hover:opacity-100 p-2 rounded-lg transition-all hover:bg-red-500/10"
                                        style={{ color: 'var(--pos-error-text)' }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
