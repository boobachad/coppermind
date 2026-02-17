import { UnifiedGoal } from '../../lib/types';
import { format } from 'date-fns';
import clsx from 'clsx';
import { CheckCircle2, Repeat, Flame, AlertTriangle, Calendar, Pencil, Trash2 } from 'lucide-react';

interface GoalCardProps {
    goal: UnifiedGoal;
    onEdit: (goal: UnifiedGoal) => void;
    onDelete: (id: string) => void;
}

export function GoalCard({ goal, onEdit, onDelete }: GoalCardProps) {
    return (
        <div
            className="group relative overflow-hidden transition-all duration-300 hover:shadow-md hover:scale-[1.002] bg-card text-card-foreground"
            style={{
                borderRadius: '16px',
                border: '1px solid var(--border-color)',
            }}
        >
            <div className="flex items-start gap-5 p-5">
                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Title and badges */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <h3
                            className={clsx(
                                'text-lg font-semibold leading-tight tracking-tight transition-colors',
                                goal.completed ? 'opacity-60 line-through decoration-current' : ''
                            )}
                            style={{ color: 'var(--text-primary)' }}
                        >
                            {goal.text}
                        </h3>
                        <div className="flex items-center gap-2 shrink-0">
                            {goal.verified && (
                                <div
                                    className="px-2 py-0.5 rounded-full flex items-center justify-center gap-1 bg-linear-to-r from-emerald-500/10 to-emerald-500/5"
                                    style={{ border: '1px solid var(--pos-success-border)' }}
                                    title="Verified"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--pos-success-text)' }} />
                                    <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--pos-success-text)' }}>Verified</span>
                                </div>
                            )}
                            {goal.recurringPattern && (
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center bg-blue-500/10"
                                    title={`Repeats: ${goal.recurringPattern}`}
                                >
                                    <Repeat className="w-3.5 h-3.5 text-blue-500" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Status badges row */}
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                        {goal.urgent && (
                            <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                                style={{ backgroundColor: 'var(--pos-error-bg)', color: 'var(--pos-error-text)', border: '1px solid var(--pos-error-border)' }}
                            >
                                <Flame className="w-3 h-3" />
                                Urgent
                            </span>
                        )}
                        {goal.priority === 'high' && !goal.urgent && (
                            <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                                style={{ backgroundColor: 'var(--pos-warning-bg)', color: 'var(--pos-warning-text)', border: '1px solid var(--pos-warning-border)' }}
                            >
                                High Priority
                            </span>
                        )}
                        {goal.isDebt && (
                            <span
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                                style={{ backgroundColor: 'var(--pos-debt-bg)', color: 'var(--pos-debt-text)', border: '1px solid var(--pos-debt-border)' }}
                            >
                                <AlertTriangle className="w-3 h-3" />
                                Overdue
                            </span>
                        )}
                        {goal.dueDate && (
                            <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/10" style={{ color: 'var(--text-secondary)' }}>
                                <Calendar className="w-3.5 h-3.5" />
                                {format(new Date(goal.dueDate), 'MMM d, HH:mm')}
                            </span>
                        )}
                    </div>

                    {/* Description */}
                    {goal.description && (
                        <p className="text-sm leading-relaxed mb-4 text-muted-foreground">
                            {goal.description}
                        </p>
                    )}

                    {/* Problem ID */}
                    {goal.problemId && (
                        <div className="mb-4">
                            <code
                                className="text-xs px-2 py-1 rounded bg-black/20 border border-white/5 text-(--text-tertiary) font-mono"
                            >
                                {goal.problemId}
                            </code>
                        </div>
                    )}

                    {/* Metrics */}
                    {goal.metrics && goal.metrics.length > 0 && (
                        <div className="space-y-3 mb-4 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-white/10">
                            {goal.metrics.map((metric) => {
                                const progress = Math.min((metric.current / metric.target) * 100, 100);
                                return (
                                    <div key={metric.id} className="space-y-1.5 lead-none">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-semibold text-(--text-primary)">
                                                {metric.label}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className={clsx(
                                                    "font-mono text-xs font-bold",
                                                    progress >= 100 ? "text-(--pos-success-text)" : "text-(--text-primary)"
                                                )}>
                                                    {metric.current}
                                                </span>
                                                <span className="font-mono text-xs text-(--text-tertiary)">
                                                    / {metric.target} {metric.unit}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
                                            <div
                                                className="h-full transition-all duration-500 rounded-full"
                                                style={{
                                                    width: `${progress}%`,
                                                    backgroundColor:
                                                        progress >= 100
                                                            ? 'var(--pos-success-text)'
                                                            : progress >= 75
                                                                ? 'var(--pos-info-text)'
                                                                : 'var(--pos-warning-text)',
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Footer metadata */}
                    <div className="flex items-center gap-3 text-[11px] font-medium text-(--text-tertiary) border-t border-white/5 pt-3 mt-2">
                        <span>Created {format(new Date(goal.createdAt), 'MMMM d, yyyy')}</span>
                        {goal.originalDate && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                <span style={{ color: 'var(--pos-debt-text)' }}>Originally scheduled for {goal.originalDate}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Edit button (hover only) */}
                <button
                    onClick={() => onEdit(goal)}
                    className="opacity-0 group-hover:opacity-100 p-2.5 rounded-xl transition-all hover:bg-blue-500/10 hover:scale-105 shrink-0"
                    style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--pos-info-text)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    title="Edit goal"
                >
                    <Pencil className="w-4 h-4" />
                </button>

                {/* Delete button (hover only) */}
                <button
                    onClick={() => onDelete(goal.id)}
                    className="opacity-0 group-hover:opacity-100 p-2.5 rounded-xl transition-all hover:bg-red-500/10 hover:scale-105 shrink-0"
                    style={{ color: 'var(--text-tertiary)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--pos-error-text)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                    title="Delete goal"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
