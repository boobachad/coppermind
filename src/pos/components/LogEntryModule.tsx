import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimePickerInput } from '@/components/ui/time-picker-input';
import { Flame, Link2, Calendar, AlertCircle } from 'lucide-react';
import { ACTIVITY_CATEGORIES } from '../lib/config';
import type { UnifiedGoal, Activity, DuplicateCheckResult } from '../lib/types';
import { formatLocalAsUTC } from '../lib/time';
import { extractUrls, detectUrlType, parseTemporalKeywords } from '@/lib/kb-utils';
import { toast } from 'sonner';

interface LogEntryModuleProps {
    date: string;
    onSuccess?: () => void;
    editingActivity?: Activity | null;
    onCancelEdit?: () => void;
}

export function LogEntryModule({ date, onSuccess, editingActivity, onCancelEdit }: LogEntryModuleProps) {
    // Existing ActivityForm state (PRESERVED)
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

    // NEW: Smart Input Enhancement State
    const [detectedUrls, setDetectedUrls] = useState<string[]>([]);
    const [urlDuplicates, setUrlDuplicates] = useState<DuplicateCheckResult | null>(null);
    const [showUrlPrompt, setShowUrlPrompt] = useState(false);
    const [temporalInfo, setTemporalInfo] = useState<{ date?: Date; keyword?: string } | null>(null);

    // Existing useEffect hooks (PRESERVED)
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

    // Existing handlers (PRESERVED)
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

    // NEW: URL Detection Handler
    const handleTitleChange = async (value: string) => {
        setTitle(value);

        // Extract URLs from title
        const urls = extractUrls(value);
        if (urls.length > 0) {
            setDetectedUrls(urls);

            // Check for duplicates
            try {
                const result = await invoke<DuplicateCheckResult>('check_knowledge_duplicates', {
                    urls,
                });

                if (result.isDuplicate) {
                    setUrlDuplicates(result);
                    setShowUrlPrompt(true);
                }
            } catch (err) {
                console.error('Failed to check duplicates:', err);
            }
        } else {
            setDetectedUrls([]);
            setUrlDuplicates(null);
            setShowUrlPrompt(false);
        }
    };

    // NEW: Description Change with Temporal Keywords
    const handleDescriptionChange = (value: string) => {
        setDescription(value);

        // Parse temporal keywords
        const temporal = parseTemporalKeywords(value);
        if (temporal) {
            setTemporalInfo(temporal);
            toast.info(`Detected temporal keyword: "${temporal.keyword}"`, {
                description: `Will create goal for ${temporal.date.toLocaleDateString()}`,
            });
        } else {
            setTemporalInfo(null);
        }
    };

    // NEW: Create Knowledge Item
    const handleCreateKnowledgeItem = async (url: string) => {
        try {
            const urlType = detectUrlType(url);
            // Map lowercase types to proper case
            const itemType = (urlType === 'leetcode' || urlType === 'codeforces') ? 'Problem' : 'Link';

            await invoke('create_knowledge_item', {
                itemType,
                source: 'ActivityLog',
                content: url,
                metadata: {
                    title: title || 'Activity Link',
                    tags: [category],
                },
                status: 'Inbox',
            });

            toast.success('Added to Knowledge Base');
            setShowUrlPrompt(false);
        } catch (err) {
            toast.error('Failed to create knowledge item', { description: String(err) });
        }
    };

    // Existing submit handler (ENHANCED)
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
                // Existing update logic (UNCHANGED)
                await invoke('update_activity', {
                    id: editingActivity.id,
                    req: {
                        startTime: startTimeISO,
                        endTime: endTimeISO,
                        category,
                        title,
                        description,
                        isProductive,
                        date,
                    }
                });
                toast.success('Activity updated successfully');
                onCancelEdit?.();
            } else {
                // Create activity (EXISTING LOGIC PRESERVED)
                const activityResult = await invoke<{ id: string }>('create_activity', {
                    req: {
                        startTime: startTimeISO,
                        endTime: endTimeISO,
                        category,
                        title,
                        description,
                        isProductive,
                        goalId: null,
                        date,
                    }
                });

                // Link to goal if selected (EXISTING)
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

                // NEW: Create KB item if URL detected and not duplicate
                if (detectedUrls.length > 0 && !urlDuplicates?.isDuplicate) {
                    for (const url of detectedUrls) {
                        await handleCreateKnowledgeItem(url);
                    }
                }

                // NEW: Create goal from temporal keyword
                if (temporalInfo?.date) {
                    try {
                        const goalDate = temporalInfo.date.toISOString().split('T')[0];
                        await invoke('create_unified_goal', {
                            req: {
                                text: title,
                                date: goalDate,
                                urgent: false,
                                priority: 'medium',
                            }
                        });
                        toast.success(`Created goal for ${goalDate}`);
                    } catch (err) {
                        console.error('Failed to create temporal goal:', err);
                    }
                }

                toast.success('Activity logged successfully');
            }

            // Reset form (EXISTING)
            const [year, month, day] = date.split('-').map(Number);
            setStartDate(new Date(year, month - 1, day, 9, 0));
            const now = new Date();
            setEndDate(new Date(year, month - 1, day, now.getHours(), now.getMinutes()));
            setTitle('');
            setDescription('');
            setSelectedGoalId('none');
            setMetricValues({});
            setDetectedUrls([]);
            setUrlDuplicates(null);
            setShowUrlPrompt(false);
            setTemporalInfo(null);
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
            {/* NEW: URL Detection Alert */}
            {showUrlPrompt && urlDuplicates && (
                <div
                    className="p-4 rounded-lg border flex items-start gap-3"
                    style={{
                        backgroundColor: 'var(--surface-secondary)',
                        borderColor: 'var(--color-warning)',
                    }}
                >
                    <AlertCircle className="w-5 h-5 mt-0.5" style={{ color: 'var(--color-warning)' }} />
                    <div className="flex-1">
                        <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                            URL Already in Knowledge Base
                        </p>
                        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                            This URL already exists. You can still log the activity without creating a duplicate.
                        </p>
                        {urlDuplicates.existingItems.map((item, idx) => (
                            <div key={idx} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                • {item.itemType} - {item.content.substring(0, 50)}...
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowUrlPrompt(false)}
                        className="text-sm underline"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* NEW: Temporal Keyword Detection */}
            {temporalInfo?.date && (
                <div
                    className="p-3 rounded-lg border flex items-center gap-2"
                    style={{
                        backgroundColor: 'var(--surface-secondary)',
                        borderColor: 'var(--color-accent-primary)',
                    }}
                >
                    <Calendar className="w-4 h-4" style={{ color: 'var(--color-accent-primary)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        Will create goal for <strong>{temporalInfo.date.toLocaleDateString()}</strong> ({temporalInfo.keyword})
                    </p>
                </div>
            )}

            {/* EXISTING: Time Pickers (UNCHANGED) */}
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

            {/* EXISTING: Category (UNCHANGED) */}
            {/* Row 1: Category & Goal Link */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Category</label>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="material-glass-subtle border-none">
                            <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="material-glass max-h-60 overflow-y-auto">
                            {Object.entries(ACTIVITY_CATEGORIES)
                                .sort(([, a], [, b]) => a.localeCompare(b))
                                .map(([key, value]) => (
                                    <SelectItem key={value} value={value} className="capitalize">
                                        {value.replace('_', ' ')}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium" style={{ color: 'var(--pos-goal-link-text)' }}>Link to Goal (Optional)</label>
                    <Select value={selectedGoalId} onValueChange={handleGoalChange}>
                        <SelectTrigger className="material-glass-subtle border-none w-full">
                            <SelectValue placeholder="Select a goal" />
                        </SelectTrigger>
                        <SelectContent className="material-glass max-h-60 overflow-y-auto">
                            <SelectItem value="none">-- No Goal --</SelectItem>
                            {availableGoals.map(goal => (
                                <SelectItem key={goal.id} value={goal.id}>
                                    <span className="flex items-center gap-1 max-w-[200px] truncate">
                                        {goal.dueDate ? <span className="text-xs text-muted-foreground mr-1 font-mono">[{new Date(goal.dueDate).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}]</span> : null}
                                        <span className="truncate">{goal.text}</span>
                                        {goal.urgent && <Flame className="w-3 h-3 text-orange-500 shrink-0" />}
                                        {goal.isDebt && <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0" />}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Row 2: Title */}
            <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    Title
                    {detectedUrls.length > 0 && (
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-accent-primary)' }}>
                            <Link2 className="w-3 h-3" />
                            {detectedUrls.length} URL{detectedUrls.length > 1 ? 's' : ''} detected
                        </span>
                    )}
                </label>
                <Input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="What did you do? (Paste URLs to auto-detect)"
                    required
                />
            </div>

            {/* Row 3: Description */}
            <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <Textarea
                    value={description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                    placeholder="Try: 'Read this tomorrow' or 'Review next week'"
                    rows={3}
                />
            </div>

            {/* Row 4: Productive Checkbox */}
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="isProductive"
                    checked={isProductive}
                    onChange={(e) => setIsProductive(e.target.checked)}
                    className="w-4 h-4 rounded border-input"
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                />
                <label htmlFor="isProductive" className="text-sm cursor-pointer select-none">
                    Mark as productive
                </label>
            </div>

            {/* EXISTING: Metrics (UNCHANGED) */}
            {selectedGoal && selectedGoal.metrics && selectedGoal.metrics.length > 0 && (
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Progress on Metrics</label>
                    {selectedGoal.metrics.map(metric => (
                        <div key={metric.id} className="flex items-center gap-2">
                            <span className="text-sm flex-1">{metric.label}</span>
                            <Input
                                type="number"
                                min="0"
                                value={metricValues[metric.id] || ''}
                                onChange={(e) => setMetricValues(prev => ({ ...prev, [metric.id]: e.target.value }))}
                                placeholder="0"
                                className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">
                                ({metric.current}/{metric.target})
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* EXISTING: Submit Buttons (UNCHANGED) */}
            <div className="flex gap-2">
                {editingActivity && (
                    <Button type="button" variant="outline" onClick={onCancelEdit}>
                        Cancel Edit
                    </Button>
                )}
                <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? 'Saving...' : editingActivity ? 'Update Activity' : 'Log Activity'}
                </Button>
            </div>
        </form>
    );
}
