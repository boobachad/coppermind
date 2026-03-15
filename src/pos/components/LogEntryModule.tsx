import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimePickerInput } from '@/components/ui/time-picker-input';
import { ACTIVITY_CATEGORIES } from '../lib/config';
import type { UnifiedGoal, Activity, Book, Milestone } from '../lib/types';
import { formatLocalAsUTC } from '../lib/time';
import { extractUrls, detectUrlType } from '@/lib/kb-utils';
import { toast } from 'sonner';
import { BookTrackingSection } from './BookTrackingSection';
import { GoalMilestoneSelector } from './GoalMilestoneSelector';
import { ActivityMetricsInput } from './ActivityMetricsInput';
import { ReflectionPrompt } from '@/components/goal/ReflectionPrompt';
import { EntityLinkTextarea } from '@/lib/entity-linking/components/EntityLinkTextarea';
import { parseReferences } from '@/lib/entity-linking/core/parser';

interface LogEntryModuleProps {
    date: string;
    onSuccess?: () => void;
    editingActivity?: Activity | null;
    onCancelEdit?: () => void;
}

export function LogEntryModule({ date, onSuccess, editingActivity, onCancelEdit }: LogEntryModuleProps) {
    const [startDate, setStartDate] = useState<Date | undefined>(() =>
        editingActivity ? new Date(editingActivity.startTime) : undefined
    );
    const [endDate, setEndDate] = useState<Date | undefined>(() => {
        if (editingActivity) return new Date(editingActivity.endTime);
        const now = new Date();
        const [year, month, day] = date.split('-').map(Number);
        return new Date(year, month - 1, day, now.getHours(), now.getMinutes());
    });
    const [category, setCategory] = useState<string>(editingActivity?.category || ACTIVITY_CATEGORIES.REAL_PROJECTS);
    const [title, setTitle] = useState(editingActivity?.title || '');
    const [description, setDescription] = useState(editingActivity?.description || '');
    const [isProductive, setIsProductive] = useState(editingActivity?.isProductive ?? false);
    const [loading, setLoading] = useState(false);
    const [availableGoals, setAvailableGoals] = useState<UnifiedGoal[]>([]);
    const [availableMilestones, setAvailableMilestones] = useState<Milestone[]>([]);
    const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
    const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
    const [metricValues, setMetricValues] = useState<Record<string, string>>({});
    const [selectedBookId, setSelectedBookId] = useState<string | null>(editingActivity?.bookId || null);
    const [pagesRead, setPagesRead] = useState<string>(editingActivity?.pagesRead?.toString() || '');
    const [showBookSelector, setShowBookSelector] = useState(false);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [totalPages, setTotalPages] = useState<string>('');
    const [showReflectionPrompt, setShowReflectionPrompt] = useState(false);
    const [reflectionEntityType, setReflectionEntityType] = useState<'goal' | 'milestone'>('goal');
    const [reflectionEntityId, setReflectionEntityId] = useState<string>('');
    const [reflectionEntityText, setReflectionEntityText] = useState<string>('');

    // Set default start time to last activity's end time
    useEffect(() => {
        if (editingActivity) return;
        const fetchLastEnd = async () => {
            try {
                const response = await invoke<{ activities: Activity[] }>('get_activities', { date });
                const sorted = [...response.activities].sort((a, b) =>
                    new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
                );
                if (sorted.length > 0) {
                    setStartDate(new Date(sorted[0].endTime));
                } else {
                    const [year, month, day] = date.split('-').map(Number);
                    setStartDate(new Date(year, month - 1, day, 9, 0));
                }
            } catch {
                const [year, month, day] = date.split('-').map(Number);
                setStartDate(new Date(year, month - 1, day, 9, 0));
            }
        };
        fetchLastEnd();
    }, [date, editingActivity]);

    // Sync form fields when editing activity changes
    useEffect(() => {
        if (editingActivity) {
            setStartDate(new Date(editingActivity.startTime));
            setEndDate(new Date(editingActivity.endTime));
            setCategory(editingActivity.category);
            setTitle(editingActivity.title);
            setDescription(editingActivity.description);
            setIsProductive(editingActivity.isProductive);
            setSelectedGoalIds(editingActivity.goalIds || []);
            setSelectedMilestoneId(editingActivity.milestoneId || null);
            setSelectedBookId(editingActivity.bookId || null);
            setPagesRead(editingActivity.pagesRead?.toString() || '');
            setShowBookSelector(editingActivity.category === 'book');
        } else {
            const now = new Date();
            const [year, month, day] = date.split('-').map(Number);
            setEndDate(new Date(year, month - 1, day, now.getHours(), now.getMinutes()));
            setCategory(ACTIVITY_CATEGORIES.REAL_PROJECTS);
            setTitle('');
            setDescription('');
            setIsProductive(false);
            setSelectedGoalIds([]);
            setSelectedMilestoneId(null);
            setMetricValues({});
            setSelectedBookId(null);
            setPagesRead('');
            setShowBookSelector(false);
            setSelectedBook(null);
            setTotalPages('');
        }
    }, [editingActivity, date]);

    // Fetch active goals and milestones
    useEffect(() => {
        const fetch = async () => {
            try {
                const [allGoals, milestones] = await Promise.all([
                    invoke<UnifiedGoal[]>('get_unified_goals', { filters: { completed: false } }),
                    invoke<Milestone[]>('get_milestones', { activeOnly: true }),
                ]);
                setAvailableGoals(allGoals.filter(g => !g.recurringPattern));
                setAvailableMilestones(milestones);
            } catch (error) {
                console.error('Failed to fetch goals/milestones:', error);
            }
        };
        fetch();
    }, [date]);

    const handleGoalToggle = (goalId: string) => {
        if (selectedGoalIds.includes(goalId)) {
            setSelectedGoalIds(prev => prev.filter(id => id !== goalId));
        } else {
            setSelectedMilestoneId(null);
            setSelectedGoalIds(prev => [...prev, goalId]);
            const goal = availableGoals.find(g => g.id === goalId);
            if (goal && !title) setTitle(`Worked on: ${goal.text}`);
        }
        setMetricValues({});
    };

    const handleMilestoneSelect = (milestoneId: string) => {
        if (selectedMilestoneId === milestoneId) {
            setSelectedMilestoneId(null);
        } else {
            setSelectedGoalIds([]);
            setSelectedMilestoneId(milestoneId);
            const milestone = availableMilestones.find(m => m.id === milestoneId);
            if (milestone && !title) setTitle(`Worked on: ${milestone.targetMetric}`);
        }
        setMetricValues({});
    };

    const handleCategoryChange = (value: string) => {
        setCategory(value);
        const isBook = value === 'book';
        setShowBookSelector(isBook);
        if (!isBook) {
            setSelectedBookId(null);
            setPagesRead('');
            setSelectedBook(null);
            setTotalPages('');
        }
    };

    const handleBookSelected = async (bookId: string) => {
        setSelectedBookId(bookId);
        try {
            const books = await invoke<Book[]>('get_all_books');
            const book = books.find(b => b.id === bookId);
            if (book) {
                setSelectedBook(book);
                setTotalPages(book.numberOfPages?.toString() || '');
            }
        } catch (error) {
            console.error('Failed to fetch book:', error);
            toast.error('Failed to load book details');
        }
    };

    const handleTotalPagesUpdate = async () => {
        if (!selectedBook || !totalPages) return;
        const newTotal = parseInt(totalPages);
        if (isNaN(newTotal) || newTotal <= 0) { toast.error('Invalid page count'); return; }
        try {
            await invoke('update_book', { bookId: selectedBook.id, req: { numberOfPages: newTotal } });
            setSelectedBook({ ...selectedBook, numberOfPages: newTotal });
            toast.success('Book pages updated');
        } catch (error) {
            toast.error('Failed to update book', { description: String(error) });
        }
    };

    const selectedGoals = availableGoals.filter(g => selectedGoalIds.includes(g.id));
    const selectedMilestone = selectedMilestoneId ? availableMilestones.find(m => m.id === selectedMilestoneId) : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!startDate || !endDate || !title) { toast.error('Please fill all required fields'); return; }
        if (startDate >= endDate) { toast.error('End time must be after start time'); return; }

        const startTimeISO = formatLocalAsUTC(startDate);
        const endTimeISO = formatLocalAsUTC(endDate);
        setLoading(true);

        try {
            let activityId: string;

            if (editingActivity) {
                const milestoneAmount = selectedMilestoneId ? (parseInt(metricValues['milestone'] || '0') || 0) : 0;
                await invoke('update_activity', {
                    id: editingActivity.id,
                    req: {
                        startTime: startTimeISO, endTime: endTimeISO, category, title, description,
                        isProductive, date,
                        goalIds: selectedGoalIds.length > 0 ? selectedGoalIds : null,
                        milestoneId: selectedMilestoneId, bookId: selectedBookId,
                        pagesRead: pagesRead ? parseInt(pagesRead) : null,
                        updates: milestoneAmount > 0 ? [{ metricId: 'milestone_direct', value: milestoneAmount }] : undefined,
                    }
                });
                for (const goalId of selectedGoalIds) {
                    await invoke('link_activity_to_unified_goal', { goalId, activityId: editingActivity.id });
                }
                window.dispatchEvent(new CustomEvent('milestone-updated'));
                toast.success('Activity updated successfully');
                activityId = editingActivity.id;
                onSuccess?.();
                onCancelEdit?.();
            } else {
                const activityResult = await invoke<{ id: string }>('create_activity', {
                    req: {
                        startTime: startTimeISO, endTime: endTimeISO, category, title, description,
                        isProductive, date,
                        goalIds: selectedGoalIds.length > 0 ? selectedGoalIds : null,
                        milestoneId: selectedMilestoneId, bookId: selectedBookId,
                        pagesRead: pagesRead ? parseInt(pagesRead) : null,
                    }
                });
                activityId = activityResult.id;

                for (const goalId of selectedGoalIds) {
                    await invoke('link_activity_to_unified_goal', { goalId, activityId });
                    const goal = availableGoals.find(g => g.id === goalId);
                    if (goal?.metrics && Object.keys(metricValues).length > 0) {
                        const updatedMetrics = goal.metrics.map(m => ({
                            ...m, current: m.current + parseInt(metricValues[m.id] || '0')
                        }));
                        await invoke('update_unified_goal', { id: goalId, req: { metrics: updatedMetrics } });
                        if (goal.parentGoalId) {
                            const total = Object.values(metricValues).reduce((s, v) => s + parseInt(v || '0'), 0);
                            try { await invoke('increment_milestone_progress', { milestoneId: goal.parentGoalId, amount: total }); }
                            catch (err) { console.error('Failed to update milestone progress:', err); }
                        }
                    }
                }

                if (selectedMilestoneId && Object.keys(metricValues).length > 0) {
                    const total = Object.values(metricValues).reduce((s, v) => s + parseInt(v || '0'), 0);
                    try { await invoke('increment_milestone_progress', { milestoneId: selectedMilestoneId, amount: total }); }
                    catch (err) { console.error('Failed to update milestone progress:', err); toast.error('Failed to update milestone progress'); }
                }

                toast.success('Activity logged successfully');
                window.dispatchEvent(new CustomEvent('milestone-updated'));

                // Trigger reflection prompt before form reset
                if (selectedGoalIds.length > 0) {
                    const firstGoal = availableGoals.find(g => g.id === selectedGoalIds[0]);
                    if (firstGoal) { setReflectionEntityType('goal'); setReflectionEntityId(firstGoal.id); setReflectionEntityText(firstGoal.text); setShowReflectionPrompt(true); }
                } else if (selectedMilestoneId) {
                    const ms = availableMilestones.find(m => m.id === selectedMilestoneId);
                    if (ms) { setReflectionEntityType('milestone'); setReflectionEntityId(ms.id); setReflectionEntityText(ms.targetMetric); setShowReflectionPrompt(true); }
                }

                setStartDate(endDate);
                const now = new Date();
                const [year, month, day] = date.split('-').map(Number);
                setEndDate(new Date(year, month - 1, day, now.getHours(), now.getMinutes()));
                setTitle(''); setDescription(''); setSelectedGoalIds([]); setSelectedMilestoneId(null);
                setMetricValues({}); setSelectedBookId(null); setPagesRead('');
                setShowBookSelector(false); setSelectedBook(null); setTotalPages('');
                onSuccess?.();
            }

            // Capture URLs to KB
            const detectedUrls = extractUrls(`${title} ${description}`);
            if (detectedUrls.length > 0) {
                try {
                    await invoke('capture_daily_urls', {
                        date,
                        urls: detectedUrls.map(url => ({
                            url, urlType: detectUrlType(url), sourceType: 'activity',
                            sourceId: activityId, sourceTitle: title,
                            sourceContext: title.includes(url) ? 'title' : 'description',
                        })),
                    });
                } catch (err) { console.error('Failed to capture URLs to KB:', err); }
            }

            // Update cross-reference registry
            const parsedRefs = parseReferences(description);
            if (parsedRefs.length > 0) {
                try {
                    await invoke('update_reference_registry', {
                        sourceEntityType: 'activity', sourceEntityId: activityId,
                        sourceField: 'description', textContent: description.trim(),
                    });
                } catch (err) { console.error('Failed to update cross-references:', err); }
            }
        } catch (error) {
            const errorMsg = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error);
            toast.error(editingActivity ? 'Failed to update activity' : 'Failed to create activity', { description: errorMsg });
            console.error('Activity error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
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
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Category</label>
                    <Select value={category} onValueChange={handleCategoryChange}>
                        <SelectTrigger className="material-glass-subtle border-none">
                            <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="material-glass max-h-60 overflow-y-auto">
                            {Object.entries(ACTIVITY_CATEGORIES)
                                .sort(([, a], [, b]) => a.localeCompare(b))
                                .map(([_key, value]) => (
                                    <SelectItem key={value} value={value} className="capitalize">
                                        {value.replace('_', ' ')}
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <label className="block text-sm font-medium" style={{ color: 'var(--pos-goal-link-text)' }}>
                        Link to Goals/Milestone (Optional)
                    </label>
                    <GoalMilestoneSelector
                        availableGoals={availableGoals}
                        availableMilestones={availableMilestones}
                        selectedGoalIds={selectedGoalIds}
                        selectedMilestoneId={selectedMilestoneId}
                        onGoalToggle={handleGoalToggle}
                        onMilestoneSelect={handleMilestoneSelect}
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What did you do?" required />
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <EntityLinkTextarea
                    value={description}
                    onChange={setDescription}
                    placeholder="Additional details about this activity... Type [[note:my-note]] to link"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl resize-none focus:ring-2 bg-secondary border placeholder:text-muted-foreground"
                    style={{ color: 'var(--text-primary)', borderColor: 'var(--border-primary)' }}
                />
                <p className="text-xs italic text-muted-foreground mt-1">
                    Use [[entity:identifier]] syntax to link (e.g., [[note:my-note]], [[kb:item-id]], [[goal:name]])
                </p>
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
                <label htmlFor="isProductive" className="text-sm cursor-pointer select-none">Mark as productive</label>
            </div>

            {showBookSelector && (
                <BookTrackingSection
                    selectedBookId={selectedBookId}
                    selectedBook={selectedBook}
                    pagesRead={pagesRead}
                    totalPages={totalPages}
                    onBookSelected={handleBookSelected}
                    onPagesReadChange={setPagesRead}
                    onTotalPagesChange={setTotalPages}
                    onTotalPagesBlur={handleTotalPagesUpdate}
                />
            )}

            <ActivityMetricsInput
                selectedGoals={selectedGoals}
                selectedMilestone={selectedMilestone}
                metricValues={metricValues}
                onMetricChange={(metricId, value) => setMetricValues(prev => ({ ...prev, [metricId]: value }))}
                onMilestoneMetricChange={(value) => setMetricValues({ milestone: value })}
            />

            <div className="flex gap-2">
                {editingActivity && (
                    <Button type="button" variant="outline" onClick={onCancelEdit}>Cancel Edit</Button>
                )}
                <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? 'Saving...' : editingActivity ? 'Update Activity' : 'Log Activity'}
                </Button>
            </div>
        </form>

        {showReflectionPrompt && reflectionEntityId && (
            <ReflectionPrompt
                entityType={reflectionEntityType}
                entityId={reflectionEntityId}
                entityText={reflectionEntityText}
                onClose={() => { setShowReflectionPrompt(false); setReflectionEntityId(''); setReflectionEntityText(''); }}
                onSaved={() => { setShowReflectionPrompt(false); setReflectionEntityId(''); setReflectionEntityText(''); toast.success('Reflection saved'); }}
            />
        )}
        </>
    );
}
