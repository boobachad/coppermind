import { invoke } from '@tauri-apps/api/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { getLocalDateString } from '../lib/time';
import type { UnifiedGoal } from '../lib/types';
import { toast } from 'sonner';

interface Props {
    goals: UnifiedGoal[];
    onRefresh: () => void;
}

export function DailyGoalsTab({ goals, onRefresh }: Props) {
    const today = getLocalDateString();

    return (
        <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Goals</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
                {goals.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No goals for this date</p>
                ) : (
                    <div className="space-y-2">
                        {goals.map((goal) => {
                            const isDebt = goal.isDebt || (goal.date && goal.date < today && !goal.completed);
                            const statusLabel = goal.verified ? 'Verified' : isDebt ? 'Debt' : 'Pending';
                            const statusBg = goal.verified ? 'var(--pos-success-bg)' : isDebt ? 'var(--pos-debt-bg)' : 'var(--muted)';
                            const statusColor = goal.verified ? 'var(--pos-success-text)' : isDebt ? 'var(--pos-debt-text)' : 'var(--muted-foreground)';
                            const borderColor = goal.verified ? 'var(--pos-success-border)' : isDebt ? 'var(--pos-error-border)' : 'var(--border-color)';

                            return (
                                <div
                                    key={goal.id}
                                    className="border rounded p-3 transition-colors"
                                    style={{
                                        borderColor,
                                        backgroundColor: goal.verified ? 'var(--pos-success-bg)' : isDebt ? 'var(--pos-error-bg)' : 'var(--bg-secondary)',
                                    }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-sm font-medium">{goal.text}</p>
                                            {goal.description && (
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    <MarkdownRenderer content={goal.description} />
                                                </div>
                                            )}
                                            {goal.problemId && (
                                                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                                    Target: {goal.problemId}
                                                </p>
                                            )}
                                        </div>
                                        <span
                                            className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase cursor-pointer hover:opacity-80 select-none border"
                                            onClick={async () => {
                                                try {
                                                    await invoke('update_unified_goal', { id: goal.id, req: { verified: !goal.verified } });
                                                    onRefresh();
                                                } catch {
                                                    toast.error('Failed to update goal');
                                                }
                                            }}
                                            style={{ backgroundColor: statusBg, color: statusColor, borderColor }}
                                        >
                                            {statusLabel}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
