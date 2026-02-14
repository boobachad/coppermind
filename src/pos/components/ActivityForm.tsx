import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimePickerInput } from '@/components/ui/time-picker-input';
import { Flame, AlertTriangle } from 'lucide-react';
import { ACTIVITY_CATEGORIES } from '../lib/config';
import type { UnifiedGoal } from '@/lib/types';
import type { Activity } from '../lib/types';
import { formatLocalAsUTC } from '../lib/time';
import { toast } from 'sonner';

interface ActivityFormProps {
    date: string;
    onSuccess?: () => void;
    editingActivity?: Activity | null;
    onCancelEdit?: () => void;
}

export function ActivityForm({ date, onSuccess, editingActivity, onCancelEdit }: ActivityFormProps) {
    const [startDate, setStartDate] = useState<Date | undefined>(() => {
        if (editingActivity) {
            return new Date(editingActivity.startTime);
        }
        const [year, month, day] = date.split('-').map(Number);
        return new Date(year, month - 1, day, 9, 0);
    });
    const [endDate, setEndDate] = useState<Date | undefined>(() => {
        if (editingActivity) {
            return new Date(editingActivity.endTime);
        }
        const now = new Date();
        const [year, month, day] = date.split('-').map(Number);
        return new Date(year, month - 1, day, now.getHours(), now.getMinutes());
    });
    const [category, setCategory] = useState<string>(editingActivity?.category || ACTIVITY_CATEGORIES.REAL_PROJECTS);
    const [title, setTitle] = useState(editingActivity?.title || '');
    const [description, setDescription] = useState(editingActivity?.description || '');
    const [isProductive, setIsProductive] = useState(editingActivity?.isProductive ?? true);
    const [loading, setLoading] = useState(false);
    const [availableGoals, setAvailableGoals] = useState<UnifiedGoal[]>([]);
    const [selectedGoalId, setSelectedGoalId] = useState<string>('none');
    const [metricValues, setMetricValues] = useState<Record<string, string>>({});

    useEffect(() => {
        if (editingActivity) {
            setStartDate(new Date(editingActivity.startTime));
            setEndDate(new Date(editingActivity.endTime));
            setCategory(editingActivity.category);
            setTitle(editingActivity.title);
            setDescription(editingActivity.description);
            setIsProductive(editingActivity.isProductive);
        } else {
            const [year, month, day] = date.split('-').map(Number);
            setStartDate(new Date(year, month - 1, day, 9, 0));
            const now = new Date();
            setEndDate(new Date(year, month - 1, day, now.getHours(), now.getMinutes()));
        }
    }, [editingActivity, date]);

    useEffect(() => {
        const fetchGoals = async () => {
            try {
                const goals = await invoke<UnifiedGoal[]>('get_unified_goals', {
                    filters: { completed: false }
                });
                setAvailableGoals(goals);
            } catch (error) {
                console.error('Failed to fetch goals:', error);
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
                setTitle(prev => prev || `Worked on: ${goal.text}`);
            }
        }
    };

    const selectedGoal = availableGoals.find(g => g.id === selectedGoalId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!startDate || !endDate || !title) {
            toast.error('Please fill all required fields');
            return;
        }

        if (startDate >= endDate) {
            toast.error('End time must be after start time');
            return;
        }

        const startTimeISO = formatLocalAsUTC(startDate);
        const endTimeISO = formatLocalAsUTC(endDate);

        setLoading(true);
        try {
            if (editingActivity) {
                await invoke('update_activity', {
                    id: editingActivity.id,
                    req: {
                        startTime: startTimeISO,
                        endTime: endTimeISO,
                        category,
                        title,
                        description,
                        isProductive,
                        date, // Pass the local date for correct filtering
                    }
                });
                toast.success('Activity updated successfully');
                onCancelEdit?.();
            } else {
                const activityResult = await invoke<{ id: string }>('create_activity', {
                    req: {
                        startTime: startTimeISO,
                        endTime: endTimeISO,
                        category,
                        title,
                        description,
                        isProductive,
                        goalId: null,
                        date, // Pass the local date for correct filtering
                    }
                });

                if (selectedGoalId !== 'none') {
                    await invoke('link_activity_to_unified_goal', {
                        goalId: selectedGoalId,
                        activityId: activityResult.id,
                    });

                    if (selectedGoal && selectedGoal.metrics && Object.keys(metricValues).length > 0) {
                        const updatedMetrics = selectedGoal.metrics.map(m => {
                            const increment = parseInt(metricValues[m.id] || '0');
                            return {
                                ...m,
                                current: m.current + increment
                            };
                        });

                        await invoke('update_unified_goal', {
                            id: selectedGoalId,
                            req: { metrics: updatedMetrics }
                        });
                    }
                }

                toast.success('Activity logged successfully');
            }
            
            const [year, month, day] = date.split('-').map(Number);
            setStartDate(new Date(year, month - 1, day, 9, 0));
            const now = new Date();
            setEndDate(new Date(year, month - 1, day, now.getHours(), now.getMinutes()));
            setTitle('');
            setDescription('');
            setSelectedGoalId('none');
            setMetricValues({});
            onSuccess?.();
        } catch (error) {
            const errorMsg = error && typeof error === 'object' && 'message' in error 
                ? String(error.message) 
                : String(error);
            toast.error(editingActivity ? 'Failed to update activity' : 'Failed to create activity', { description: errorMsg });
            console.error('Activity error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium mb-2">Start Time</label>
                    <div className="flex items-center gap-2">
                        <TimePickerInput date={startDate} setDate={setStartDate} type="hours" />
                        <span>:</span>
                        <TimePickerInput date={startDate} setDate={setStartDate} type="minutes" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-2">End Time</label>
                    <div className="flex items-center gap-2">
                        <TimePickerInput date={endDate} setDate={setEndDate} type="hours" />
                        <span>:</span>
                        <TimePickerInput date={endDate} setDate={setEndDate} type="minutes" />
                    </div>
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

                {!editingActivity && (
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
                                        <span className="flex items-center gap-1">
                                            {g.text.substring(0, 40)}{g.text.length > 40 ? '...' : ''}
                                            {g.urgent && <Flame className="w-3 h-3 text-orange-500" />}
                                            {g.isDebt && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            {!editingActivity && selectedGoal && selectedGoal.metrics && selectedGoal.metrics.length > 0 && (
                <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--pos-goal-link-bg)', borderColor: 'var(--pos-goal-link-border)', borderWidth: '1px' }}>
                    <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--pos-goal-link-text)' }}>Log Progress</p>
                    <div className="grid grid-cols-2 gap-3">
                        {selectedGoal.metrics.map((m) => (
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
                <label className="block text-sm font-medium mb-2">Title</label>
                <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border-input"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                    placeholder="Brief summary of activity"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="border-input"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                    placeholder="Additional details..."
                    rows={3}
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

            <div className="flex gap-2">
                {editingActivity && (
                    <Button 
                        type="button"
                        onClick={onCancelEdit}
                        variant="outline"
                        className="flex-1"
                    >
                        Cancel
                    </Button>
                )}
                <Button 
                    type="submit" 
                    disabled={loading} 
                    className="flex-1 hover:opacity-90"
                    style={{
                        backgroundColor: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)'
                    }}
                >
                    {loading ? (editingActivity ? 'Saving...' : 'Creating...') : (editingActivity ? 'Save Edits' : 'Log Activity')}
                </Button>
            </div>
        </form>
    );
}
