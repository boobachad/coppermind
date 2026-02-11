import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ACTIVITY_CATEGORIES } from '../lib/config';
import type { GoalWithDetails, GoalMetric, DebtGoal } from '../lib/types';
import { toast } from 'sonner';
import { formatDateDDMMYYYY } from '../lib/time';

interface ActivityFormProps {
    date: string;
    onSuccess?: () => void;
}

export function ActivityForm({ date, onSuccess }: ActivityFormProps) {
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState(() => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    });
    const [category, setCategory] = useState<string>(ACTIVITY_CATEGORIES.REAL_PROJECTS);
    const [description, setDescription] = useState('');
    const [isProductive, setIsProductive] = useState(true);
    const [loading, setLoading] = useState(false);
    const [availableGoals, setAvailableGoals] = useState<GoalWithDetails[]>([]);
    const [debtGoals, setDebtGoals] = useState<DebtGoal[]>([]);
    const [selectedGoalId, setSelectedGoalId] = useState<string>('none');
    const [metricValues, setMetricValues] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchGoals = async () => {
            try {
                const goals = await invoke<GoalWithDetails[]>('get_goals', { date });
                setAvailableGoals(goals);
                
                const debts = await invoke<DebtGoal[]>('get_debt_goals');
                setDebtGoals(debts);
            } catch (error) {
                toast.error('Failed to fetch goals', { description: String(error) });
            }
        };
        fetchGoals();
    }, [date]);

    const handleGoalChange = (value: string) => {
        setSelectedGoalId(value);
        setMetricValues({});
        if (value !== 'none') {
            const goal = availableGoals.find(g => g.id === value);
            if (goal) {
                setDescription(prev => prev || `Worked on: ${goal.description}`);
            }
        }
    };

    const selectedGoal = availableGoals.find(g => g.id === selectedGoalId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!startTime || !endTime || !description) {
            toast.error('Please fill all required fields');
            return;
        }

        setLoading(true);
        try {
            const start = new Date(`${date}T${startTime}:00`);
            const end = new Date(`${date}T${endTime}:00`);

            await invoke('create_activity', {
                req: {
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                    category,
                    description,
                    isProductive,
                    goalId: selectedGoalId === 'none' ? null : selectedGoalId,
                }
            });

            // Update metrics if any
            if (selectedGoalId !== 'none' && Object.keys(metricValues).length > 0) {
                for (const [metricId, value] of Object.entries(metricValues)) {
                    const numValue = parseInt(value);
                    if (numValue > 0) {
                        await invoke('update_goal_metric', {
                            metricId,
                            increment: numValue,
                        });
                    }
                }
            }

            toast.success('Activity logged successfully');
            setStartTime('');
            setEndTime('');
            setDescription('');
            setSelectedGoalId('none');
            setMetricValues({});
            onSuccess?.();
        } catch (error) {
            toast.error('Failed to create activity', { description: String(error) });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-2">Start Time</label>
                    <Input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="border-input"
                        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2">End Time</label>
                    <Input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="border-input"
                        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        required
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-2">Category</label>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="border-input" style={{ backgroundColor: 'var(--bg-primary)' }}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border max-h-[300px] overflow-y-auto" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                            {Object.entries(ACTIVITY_CATEGORIES)
                                .sort(([, a], [, b]) => a.localeCompare(b))
                                .map(([key, value]) => (
                                    <SelectItem key={key} value={value} className="capitalize">
                                        {value.replace('_', ' ')}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--pos-goal-link-text)' }}>Link to Goal (Optional)</label>
                    <Select value={selectedGoalId} onValueChange={handleGoalChange}>
                        <SelectTrigger style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--pos-goal-link-border)' }}>
                            <SelectValue placeholder="Select a goal..." />
                        </SelectTrigger>
                        <SelectContent className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                            <SelectItem value="none">-- No Goal --</SelectItem>
                            {availableGoals.map((g) => (
                                <SelectItem key={g.id} value={g.id}>
                                    {g.description.substring(0, 30)}{g.description.length > 30 ? '...' : ''}
                                </SelectItem>
                            ))}
                            {debtGoals.length > 0 && (
                                <>
                                    <div className="px-2 py-1.5 text-xs font-semibold uppercase" style={{ color: 'var(--pos-debt-text)' }}>Debt Goals</div>
                                    {debtGoals.map((d) => (
                                        <SelectItem key={d.goalId} value={d.goalId} style={{ color: 'var(--pos-debt-text)' }}>
                                            {d.description.substring(0, 25)}{d.description.length > 25 ? '...' : ''} (from {formatDateDDMMYYYY(new Date(d.originalDate))})
                                        </SelectItem>
                                    ))}
                                </>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {selectedGoal && selectedGoal.metrics && selectedGoal.metrics.length > 0 && (
                <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--pos-goal-link-bg)', borderColor: 'var(--pos-goal-link-border)', borderWidth: '1px' }}>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--pos-goal-link-text)' }}>Log Progress</p>
                    <div className="grid grid-cols-2 gap-3">
                        {selectedGoal.metrics.map((m: GoalMetric) => (
                            <div key={m.id}>
                                <label className="block text-xs text-muted-foreground mb-1">
                                    {m.label} ({m.unit})
                                </label>
                                <Input
                                    type="number"
                                    placeholder="+ Value"
                                    className="border-input h-8 text-sm"
                                    style={{ backgroundColor: 'var(--bg-primary)' }}
                                    value={metricValues[m.id] || ''}
                                    onChange={(e) => setMetricValues({
                                        ...metricValues,
                                        [m.id]: e.target.value
                                    })}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="border-input"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                    placeholder="What did you work on?"
                    rows={3}
                    required
                />
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isProductive"
                    checked={isProductive}
                    onChange={(e) => setIsProductive(e.target.checked)}
                    className="w-4 h-4 rounded border-input"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                />
                <label htmlFor="isProductive" className="text-sm">
                    Mark as productive
                </label>
            </div>

            <Button 
                type="submit" 
                disabled={loading} 
                className="w-full hover:opacity-90"
                style={{
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)'
                }}
            >
                {loading ? 'Creating...' : 'Log Activity'}
            </Button>
        </form>
    );
}
