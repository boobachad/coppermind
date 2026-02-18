import { UnifiedGoal } from '../lib/types';
import { GoalCard } from './GoalCard';
import { Target } from 'lucide-react';

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

                {regularGoals.length === 0 && debtGoals.length === 0 && (
                    <div className="text-center py-20 opacity-50">
                        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-white/5">
                            <Target className="w-10 h-10 text-(--text-tertiary)" />
                        </div>
                        <h3 className="text-lg font-medium text-muted-foreground">No goals found</h3>
                        <p className="text-sm text-(--text-tertiary) mt-1">Create a new goal to get started</p>
                    </div>
                )}
            </div>

            {/* Divider if both lists have content */}
            {debtGoals.length > 0 && regularGoals.length > 0 && (
                <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-dashed" style={{ borderColor: 'var(--border-color)' }} />
                    </div>
                </div>
            )}

            {/* Debt Goals */}
            {debtGoals.length > 0 && (
                <div className="space-y-3">
                    {debtGoals.map((goal) => (
                        <GoalCard key={goal.id} goal={goal} onEdit={onEdit} onDelete={onDelete} />
                    ))}
                </div>
            )}
        </div>
    );
}
