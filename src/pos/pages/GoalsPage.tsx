import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Navbar } from '../components/Navbar';
import { formatDateDDMMYYYY, getLocalDateString } from '../lib/time';
import type { GoalWithDetails, DebtGoal } from '../lib/types';
import { PartyPopper, Repeat } from 'lucide-react';
import { toast } from 'sonner';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function GoalsPage() {
    const [date, setDate] = useState(getLocalDateString());
    const [description, setDescription] = useState('');
    const [problemId, setProblemId] = useState('');
    const [metrics, setMetrics] = useState<{ label: string; targetValue: string; unit: string }[]>([]);
    const [newMetric, setNewMetric] = useState({ label: '', targetValue: '', unit: '' });
    const [selectedDays, setSelectedDays] = useState<string[]>([]);
    const [goals, setGoals] = useState<GoalWithDetails[]>([]);
    const [debtGoals, setDebtGoals] = useState<DebtGoal[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchGoals = async () => {
        try {
            const data = await invoke<GoalWithDetails[]>('get_goals', { date });
            setGoals(data);
        } catch (error) {
            toast.error('Failed to fetch goals', { description: String(error) });
        }
    };

    const fetchDebtGoals = async () => {
        try {
            const data = await invoke<DebtGoal[]>('get_debt_goals');
            setDebtGoals(data);
        } catch (error) {
            toast.error('Failed to fetch debt goals', { description: String(error) });
        }
    };

    useEffect(() => {
        fetchGoals();
        fetchDebtGoals();
    }, [date]);

    const toggleDay = (day: string) => {
        if (selectedDays.includes(day)) {
            setSelectedDays(selectedDays.filter(d => d !== day));
        } else {
            setSelectedDays([...selectedDays, day]);
        }
    };

    const addMetric = () => {
        if (newMetric.targetValue && newMetric.unit) {
            setMetrics([...metrics, { ...newMetric, label: newMetric.label || 'Target' }]);
            setNewMetric({ label: '', targetValue: '', unit: '' });
        }
    };

    const removeMetric = (index: number) => {
        setMetrics(metrics.filter((_, i) => i !== index));
    };

    const createGoal = async () => {
        if (!description) return;

        setLoading(true);
        try {
            const frequency = selectedDays.length > 0 ? selectedDays.join(',') : undefined;

            await invoke('create_goal', {
                date,
                description,
                problemId: problemId || undefined,
                frequency,
            });

            setDescription('');
            setProblemId('');
            setMetrics([]);
            setNewMetric({ label: '', targetValue: '', unit: '' });
            setSelectedDays([]);
            toast.success('Goal created successfully');
            await fetchGoals();
        } catch (error) {
            toast.error('Failed to create goal', { description: String(error) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-background text-foreground">
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'goals' }]} />
            <div className="max-w-4xl mx-auto p-4 md:p-8 flex-1 overflow-auto">
                <div className="mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-foreground">Goals Hub</h1>
                </div>

                <div className="border border-border rounded-lg p-6 bg-card mb-8">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--pos-goal-link-text)' }}>
                        Create Goal <span className="text-xs font-normal text-muted-foreground bg-secondary px-2 py-1 rounded-full uppercase tracking-wider">{selectedDays.length > 0 ? 'Recurring Template' : 'Single Day'}</span>
                    </h2>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium mb-1.5 text-muted-foreground uppercase">Date</label>
                                <Input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="bg-background border-input text-foreground font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1.5 text-muted-foreground uppercase">Problem ID / URL (Opt.)</label>
                                <Input
                                    placeholder="LeetCode/Codeforces URL or ID"
                                    value={problemId}
                                    onChange={(e) => setProblemId(e.target.value)}
                                    className="bg-background border-input text-foreground text-sm font-mono"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium mb-1.5 text-muted-foreground uppercase">Description</label>
                            <Textarea
                                placeholder="What do you want to accomplish?"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="bg-background border-input text-foreground"
                                rows={2}
                            />
                        </div>

                        <div className="bg-secondary/30 rounded-md p-4 space-y-4">
                            <div>
                                <label className="block text-xs font-medium mb-2 text-muted-foreground uppercase">Quantitative Tracking (Optional)</label>

                                <div className="space-y-2 mb-2">
                                    {metrics.map((m, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-sm bg-background/50 p-2 rounded border border-border">
                                            <span className="font-semibold" style={{ color: 'var(--pos-goal-link-text)' }}>{m.label}:</span>
                                            <span>{m.targetValue} {m.unit}</span>
                                            <button onClick={() => removeMetric(idx)} className="ml-auto hover:opacity-80" style={{ color: 'var(--pos-error-text)' }}>×</button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Label (e.g. Pushups)"
                                        className="w-1/3 bg-background border-input"
                                        value={newMetric.label}
                                        onChange={(e) => setNewMetric({ ...newMetric, label: e.target.value })}
                                    />
                                    <Input
                                        type="number"
                                        placeholder="Target"
                                        className="w-1/4 bg-background border-input"
                                        value={newMetric.targetValue}
                                        onChange={(e) => setNewMetric({ ...newMetric, targetValue: e.target.value })}
                                    />
                                    <Input
                                        placeholder="Unit (e.g. reps)"
                                        className="w-1/4 bg-background border-input"
                                        value={newMetric.unit}
                                        onChange={(e) => setNewMetric({ ...newMetric, unit: e.target.value })}
                                        onKeyDown={(e) => e.key === 'Enter' && addMetric()}
                                    />
                                    <Button onClick={addMetric} variant="secondary" className="w-[10%]">+</Button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium mb-2 text-muted-foreground uppercase flex items-center gap-2">
                                    <Repeat className="w-3 h-3" /> Repeat On
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {WEEKDAYS.map(day => (
                                        <button
                                            key={day}
                                            onClick={() => toggleDay(day)}
                                            className="w-9 h-9 rounded-full text-xs font-bold transition-all border"
                                            style={{
                                                backgroundColor: selectedDays.includes(day) ? 'var(--pos-goal-link-border)' : 'var(--bg-primary)',
                                                borderColor: selectedDays.includes(day) ? 'var(--pos-goal-link-border)' : 'var(--border-color)',
                                                color: selectedDays.includes(day) ? 'white' : 'var(--text-secondary)'
                                            }}
                                        >
                                            {day.charAt(0)}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setSelectedDays(selectedDays.length === 7 ? [] : [...WEEKDAYS])}
                                        className="text-[10px] uppercase text-muted-foreground hover:opacity-80 ml-2"
                                        style={{ color: 'var(--text-secondary)' }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--pos-goal-link-text)'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                                    >
                                        {selectedDays.length === 7 ? 'Clear' : 'All'}
                                    </button>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-2">
                                    {selectedDays.length === 0
                                        ? "This goal will only appear on the selected date above."
                                        : `Repeating goal: Will appear every ${selectedDays.join(', ')}.`}
                                </p>
                            </div>
                        </div>

                        <Button
                            onClick={createGoal}
                            disabled={loading || !description}
                            className="w-full"
                            style={{
                                backgroundColor: 'var(--pos-goal-link-border)',
                                color: 'white'
                            }}
                        >
                            {selectedDays.length > 0 ? 'Create Recurring Goal' : 'Create Daily Goal'}
                        </Button>
                    </div>
                </div>

                <div className="border border-border rounded-lg p-6 bg-card mb-8">
                    <h2 className="text-xl font-semibold mb-4 text-foreground">
                        Goals for {formatDateDDMMYYYY(new Date(date))}
                    </h2>

                    {goals.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No goals for this date</p>
                    ) : (
                        <div className="space-y-3">
                            {goals.map((goal) => (
                                <div
                                    key={goal.id}
                                    className="border rounded-lg p-4 relative overflow-hidden"
                                    style={{
                                        borderColor: goal.isVerified ? 'var(--pos-success-border)' : 'var(--border-color)',
                                        backgroundColor: goal.isVerified ? 'var(--pos-success-bg)' : 'var(--bg-secondary)'
                                    }}
                                >
                                    <div className="flex items-start justify-between relative z-10">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-foreground">{goal.description}</p>
                                                {goal.recurringGoalId && (
                                                    <div title="Recurring Goal">
                                                        <Repeat className="w-3 h-3 text-muted-foreground" />
                                                    </div>
                                                )}
                                            </div>

                                            {goal.metrics && goal.metrics.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {goal.metrics.map((metric) => (
                                                        <div key={metric.id} className="text-xs">
                                                            <div className="flex justify-between items-end mb-1">
                                                                <span className="text-muted-foreground">{metric.label}</span>
                                                                <span className="font-mono" style={{ color: 'var(--pos-goal-link-text)' }}>
                                                                    {metric.currentValue}/{metric.targetValue} {metric.unit}
                                                                </span>
                                                            </div>
                                                            <div className="h-1 bg-secondary w-full rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full transition-all duration-500"
                                                                    style={{
                                                                        width: `${Math.min((metric.currentValue / metric.targetValue) * 100, 100)}%`,
                                                                        backgroundColor: 'var(--pos-goal-link-border)'
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {goal.problemId && (
                                                <p className="text-xs text-muted-foreground font-mono bg-background/50 px-1 rounded border border-border/50 mt-2 inline-block">
                                                    {goal.problemId}
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            {goal.isVerified ? (
                                                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-medium" style={{
                                                    backgroundColor: 'var(--pos-success-bg)',
                                                    color: 'var(--pos-success-text)',
                                                    borderColor: 'var(--pos-success-border)',
                                                    borderWidth: '1px'
                                                }}>
                                                    Verified
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground border border-border uppercase font-medium">
                                                    Pending
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-lg p-6" style={{
                    borderColor: 'var(--pos-debt-border)',
                    borderWidth: '1px',
                    backgroundColor: 'var(--pos-debt-bg)'
                }}>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--pos-debt-text)' }}>
                        Debt Locker <span className="text-xs font-normal text-muted-foreground">{debtGoals.length} items</span>
                    </h2>

                    {debtGoals.length === 0 ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            No debt! Clean slate. <PartyPopper className="w-4 h-4" style={{ color: 'var(--pos-goal-link-text)' }} />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {debtGoals.map((debtGoal) => (
                                <div
                                    key={debtGoal.id}
                                    className="rounded-lg p-4 transition-colors"
                                    style={{
                                        borderColor: 'var(--pos-debt-border)',
                                        borderWidth: '1px',
                                        backgroundColor: 'var(--pos-debt-bg)'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                                    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-foreground">{debtGoal.description}</p>
                                            <p className="text-xs mt-1" style={{ color: 'var(--pos-debt-text)' }}>
                                                From {formatDateDDMMYYYY(new Date(debtGoal.originalDate))}
                                            </p>
                                        </div>
                                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{
                                            backgroundColor: 'var(--pos-debt-bg)',
                                            color: 'var(--pos-debt-text)',
                                            borderColor: 'var(--pos-debt-border)',
                                            borderWidth: '1px'
                                        }}>
                                            Overdue
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
