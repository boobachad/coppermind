import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getTimezoneOffsetMinutes, getActivityDuration } from '../../lib/time';
import type { DailyBriefingResponse, UnifiedGoal, Milestone, KnowledgeItem, Activity } from '../../lib/types';
import { Loader } from '../../../components/Loader';
import { MarkdownRenderer } from '../../../components/MarkdownRenderer';
import { calculateTodayRequired } from '../../lib/balancer-utils';
import { DailyMetricsTab } from '../DailyMetricsTab';
import { StatCard } from './BriefingCharts';

interface Props {
    selectedDate: string;
    onReload?: () => void;
}

export function DailyBriefingView({ selectedDate, onReload }: Props) {
    const [briefing, setBriefing] = useState<DailyBriefingResponse | null>(null);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const [completedGoals, setCompletedGoals] = useState<UnifiedGoal[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [metrics, setMetrics] = useState({ totalMinutes: 0, productiveMinutes: 0, goalDirectedMinutes: 0 });
    const [loading, setLoading] = useState(true);
    const [newGoalText, setNewGoalText] = useState('');
    const [addingGoal, setAddingGoal] = useState(false);

    useEffect(() => { load(); }, [selectedDate]);

    const load = async () => {
        setLoading(true);
        try {
            const [briefingResult, allMilestones, doneToday, actResult] = await Promise.all([
                invoke<DailyBriefingResponse>('get_daily_briefing', { localDate: selectedDate }),
                invoke<Milestone[]>('get_milestones', { activeOnly: false }),
                invoke<UnifiedGoal[]>('get_completed_goals_for_date', {
                    localDate: selectedDate,
                    timezoneOffsetMinutes: getTimezoneOffsetMinutes(),
                }),
                invoke<{ activities: Activity[] }>('get_activities', { date: selectedDate }),
            ]);
            const filtered = allMilestones.filter((m: Milestone) => {
                const s = m.periodStart.split('T')[0];
                const e = m.periodEnd.split('T')[0];
                return selectedDate >= s && selectedDate <= e;
            });

            // Fetch today's progress for each active milestone
            const milestonesWithProgress = await Promise.all(
                filtered.map(async (m: Milestone) => {
                    try {
                        const todayProgress = await invoke<number | null>('get_milestone_today_progress', {
                            milestoneId: m.id,
                            todayDate: selectedDate,
                        });
                        return { ...m, todayProgress: todayProgress ?? 0 };
                    } catch {
                        return { ...m, todayProgress: 0 };
                    }
                })
            );

            // Compute metrics from activities client-side
            let totalMinutes = 0;
            let productiveMinutes = 0;
            let goalDirectedMinutes = 0;
            for (const act of actResult.activities) {
                const dur = getActivityDuration(act.startTime, act.endTime);
                totalMinutes += dur;
                if (act.isProductive) productiveMinutes += dur;
                if (act.goalIds?.length || act.milestoneId) goalDirectedMinutes += dur;
            }

            setBriefing(briefingResult);
            setMilestones(milestonesWithProgress);
            setCompletedGoals(doneToday);
            setActivities(actResult.activities);
            setMetrics({ totalMinutes, productiveMinutes, goalDirectedMinutes });
        } catch (err) {
            toast.error('Failed to load daily briefing', { description: String(err) });
        } finally {
            setLoading(false);
        }
    };

    const updateKbStatus = async (itemId: string, newStatus: string) => {
        try {
            await invoke('update_knowledge_item', { id: itemId, req: { status: newStatus } });
            toast.success('KB item updated');
            load();
        } catch (err) {
            toast.error('Failed to update KB item', { description: String(err) });
        }
    };

    const handleAddGoal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newGoalText.trim()) return;
        setAddingGoal(true);
        try {
            await invoke('create_unified_goal', {
                req: { text: newGoalText, dueDateLocal: selectedDate, priority: 'medium', urgent: false },
            });
            setNewGoalText('');
            toast.success('Goal added');
            load();
            onReload?.();
        } catch (err) {
            toast.error('Failed to add goal', { description: String(err) });
        } finally {
            setAddingGoal(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader /></div>;
    if (!briefing) return <p style={{ color: 'var(--text-secondary)' }}>No briefing data</p>;

    const debtTime = Math.max(0, 1440 - metrics.totalMinutes);

    return (
        <div className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Total Goals" value={briefing.stats.totalGoals} />
                <StatCard label="Completed" value={briefing.stats.completedGoals} color="var(--pos-success-text)" />
                <StatCard label="Debt" value={briefing.stats.debtCount} color="var(--pos-error-text)" />
                <StatCard label="KB Due" value={briefing.stats.kbItemsDueCount} />
                <StatCard label="On Track" value={briefing.stats.milestonesOnTrack} color="var(--pos-success-text)" />
                <StatCard label="Behind" value={briefing.stats.milestonesBehind} color="var(--pos-error-text)" />
            </div>

            {/* Quick add goal */}
            <form onSubmit={handleAddGoal} className="flex gap-2">
                <input
                    type="text"
                    value={newGoalText}
                    onChange={e => setNewGoalText(e.target.value)}
                    placeholder="Add a goal for today..."
                    className="flex-1 px-4 py-2 rounded-lg border text-sm"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
                <button
                    type="submit"
                    disabled={addingGoal || !newGoalText.trim()}
                    className="px-4 py-2 rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
                >
                    <Plus className="w-4 h-4" /> Add
                </button>
            </form>

            {/* Activity metrics charts */}
            {activities.length > 0 && (
                <DailyMetricsTab activities={activities} metrics={metrics} debtTime={debtTime} />
            )}

            {/* Goal sections */}
            <div className="columns-1 lg:columns-2 gap-4">
                {completedGoals.length > 0 && (
                    <div className="break-inside-avoid mb-4 inline-block w-full">
                        <GoalSection title="Completed Today" goals={completedGoals} />
                    </div>
                )}
                <div className="break-inside-avoid mb-4 inline-block w-full">
                    <GoalSection title="Today's Goals" goals={briefing.goals} emptyMsg="No goals for today" />
                </div>
                {briefing.debtGoals.length > 0 && (
                    <div className="break-inside-avoid mb-4 inline-block w-full">
                        <GoalSection title="Debt Goals" goals={briefing.debtGoals} alert />
                    </div>
                )}
                <div className="break-inside-avoid mb-4 inline-block w-full">
                    <MilestoneSection milestones={milestones} />
                </div>
                <div className="break-inside-avoid mb-4 inline-block w-full">
                    <KbSection items={briefing.kbItemsDue} onUpdateStatus={updateKbStatus} />
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function GoalSection({ title, goals, alert, emptyMsg }: { title: string; goals: UnifiedGoal[]; alert?: boolean; emptyMsg?: string }) {
    return (
        <div className="p-4 rounded-lg border" style={{
            backgroundColor: alert ? 'var(--surface-error)' : 'var(--glass-bg)',
            borderColor: alert ? 'var(--pos-error-text)' : 'var(--glass-border)',
        }}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{goals.length}</span>
            </div>
            {goals.length === 0 && emptyMsg
                ? <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{emptyMsg}</p>
                : <div className="space-y-2">{goals.map(g => <GoalItem key={g.id} goal={g} />)}</div>
            }
        </div>
    );
}

function GoalItem({ goal }: { goal: UnifiedGoal }) {
    return (
        <div className="flex items-start gap-2 p-2 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="mt-0.5" style={{ color: goal.completed ? 'var(--pos-success-text)' : 'var(--text-tertiary)' }}>
                {goal.completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-sm ${goal.completed ? 'line-through' : ''}`} style={{ color: 'var(--text-primary)' }}>{goal.text}</p>
                {goal.description && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        <MarkdownRenderer content={goal.description} />
                    </div>
                )}
                <div className="flex gap-1 mt-1 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{goal.priority}</span>
                    {goal.urgent && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--pos-error-bg)', color: 'var(--pos-error-text)', border: '1px solid var(--pos-error-border)' }}>Urgent</span>}
                    {goal.verified && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--pos-success-bg)', color: 'var(--pos-success-text)', border: '1px solid var(--pos-success-border)' }}>Verified</span>}
                </div>
            </div>
        </div>
    );
}

function MilestoneSection({ milestones }: { milestones: Milestone[] }) {
    return (
        <div className="p-4 rounded-lg border" style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Active Milestones</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{milestones.length}</span>
            </div>
            {milestones.length === 0
                ? <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No active milestones</p>
                : <div className="space-y-2">{milestones.map(m => <MilestoneItem key={m.id} milestone={m} />)}</div>
            }
        </div>
    );
}

function MilestoneItem({ milestone }: { milestone: Milestone }) {
    const req = calculateTodayRequired(milestone.currentValue, milestone.targetValue, milestone.dailyAmount, milestone.periodStart, milestone.periodEnd, milestone.todayProgress ?? 0);
    return (
        <div className="flex items-center justify-between p-2 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{milestone.targetMetric}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{milestone.currentValue}/{milestone.targetValue}{milestone.unit ? ` ${milestone.unit}` : ''}</p>
            </div>
            <div className="text-right">
                <p className="text-sm font-bold" style={{ color: req.debt > 0 ? 'var(--pos-error-text)' : 'var(--text-primary)' }}>
                    {req.todayRemaining}{req.debt > 0 ? `+${req.debt}` : ''}{milestone.unit ? ` ${milestone.unit}` : ''}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>today</p>
            </div>
        </div>
    );
}

function KbSection({ items, onUpdateStatus }: { items: KnowledgeItem[]; onUpdateStatus: (id: string, status: string) => void }) {
    return (
        <div className="p-4 rounded-lg border" style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>KB Items Due</h3>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{items.length}</span>
            </div>
            {items.length === 0
                ? <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No items due for review</p>
                : <div className="space-y-2">{items.map(item => (
                    <div key={item.id} className="p-2 rounded" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{item.metadata?.title ?? item.content}</p>
                        <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{item.source} · {item.status}</p>
                        <div className="flex gap-2">
                            <button onClick={() => onUpdateStatus(item.id, 'Planned')} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>Plan</button>
                            <button onClick={() => onUpdateStatus(item.id, 'Completed')} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--pos-success-bg)', color: 'var(--pos-success-text)', border: '1px solid var(--pos-success-border)' }}>Done</button>
                        </div>
                    </div>
                ))}</div>
            }
        </div>
    );
}
