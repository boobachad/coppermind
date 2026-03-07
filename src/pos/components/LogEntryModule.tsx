import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimePickerInput } from '@/components/ui/time-picker-input';
import { Flame, AlertCircle, BarChart3, Check } from 'lucide-react';
import { ACTIVITY_CATEGORIES } from '../lib/config';
import type { UnifiedGoal, Activity, Book, Milestone } from '../lib/types';
import { formatLocalAsUTC, formatDateDDMMYYYY, parseGoalDate } from '../lib/time';
import { extractUrls, detectUrlType } from '@/lib/kb-utils';
import { toast } from 'sonner';
import { BookSelector } from './BookSelector';
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
    // Existing ActivityForm state (PRESERVED)
    const [startDate, setStartDate] = useState<Date | undefined>(() => {
        if (editingActivity) {
            return new Date(editingActivity.startTime);
        }
        // Will be set by useEffect after fetching last activity
        return undefined;
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
    const [isProductive, setIsProductive] = useState(editingActivity?.isProductive ?? false);
    const [loading, setLoading] = useState(false);
    const [availableGoals, setAvailableGoals] = useState<UnifiedGoal[]>([]);
    const [availableMilestones, setAvailableMilestones] = useState<Milestone[]>([]);
    const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
    const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
    const [metricValues, setMetricValues] = useState<Record<string, string>>({});

    // NEW: Book Tracking State
    const [selectedBookId, setSelectedBookId] = useState<string | null>(editingActivity?.bookId || null);
    const [pagesRead, setPagesRead] = useState<string>(editingActivity?.pagesRead?.toString() || '');
    const [showBookSelector, setShowBookSelector] = useState(false);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [totalPages, setTotalPages] = useState<string>('');

    // NEW: Reflection State
    const [showReflectionPrompt, setShowReflectionPrompt] = useState(false);
    const [reflectionEntityType, setReflectionEntityType] = useState<'goal' | 'milestone'>('goal');
    const [reflectionEntityId, setReflectionEntityId] = useState<string>('');
    const [reflectionEntityText, setReflectionEntityText] = useState<string>('');

    // Fetch last activity's end time to set as default start time
    useEffect(() => {
        const fetchLastActivityEndTime = async () => {
            if (editingActivity) return; // Don't fetch if editing
            
            try {
                const response = await invoke<{ activities: Activity[] }>('get_activities', { date });
                const activities = response.activities;
                
                if (activities.length > 0) {
                    // Sort by end time descending to get the last activity
                    const sortedActivities = [...activities].sort((a, b) =>
                        new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
                    );
                    const lastActivity = sortedActivities[0];
                    const lastEndTime = new Date(lastActivity.endTime);
                    
                    // Set start time to last activity's end time
                    setStartDate(lastEndTime);
                } else {
                    // No activities logged yet, default to 09:00
                    const [year, month, day] = date.split('-').map(Number);
                    setStartDate(new Date(year, month - 1, day, 9, 0));
                }
            } catch (error) {
                console.error('Failed to fetch last activity:', error);
                // Fallback to 09:00 on error
                const [year, month, day] = date.split('-').map(Number);
                setStartDate(new Date(year, month - 1, day, 9, 0));
            }
        };
        
        fetchLastActivityEndTime();
    }, [date, editingActivity]);

    // Existing useEffect hooks (PRESERVED)
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
            // Reset to defaults when editingActivity is null
            // Start time will be set by fetchLastActivityEndTime useEffect
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

    useEffect(() => {
        const fetchGoalsAndMilestones = async () => {
            try {
                const [allGoals, milestones] = await Promise.all([
                    invoke<UnifiedGoal[]>('get_unified_goals', {
                        filters: { completed: false }
                    }),
                    invoke<Milestone[]>('get_milestones', {
                        activeOnly: true
                    })
                ]);
                // Filter out recurring templates
                const goals = allGoals.filter(g => !g.recurringPattern);
                setAvailableGoals(goals);
                setAvailableMilestones(milestones);
            } catch (error) {
                console.error('Failed to fetch goals/milestones:', error);
            }
        };
        fetchGoalsAndMilestones();
    }, [date]);

    // Handle goal/milestone selection with mutual exclusivity
    const handleGoalToggle = (goalId: string) => {
        if (selectedGoalIds.includes(goalId)) {
            // Deselect goal
            setSelectedGoalIds(prev => prev.filter(id => id !== goalId));
        } else {
            // Select goal - clear milestone if any
            setSelectedMilestoneId(null);
            setSelectedGoalIds(prev => [...prev, goalId]);
            
            // Auto-fill title if empty
            const goal = availableGoals.find(g => g.id === goalId);
            if (goal && !title) {
                setTitle(`Worked on: ${goal.text}`);
            }
        }
        setMetricValues({});
    };

    const handleMilestoneSelect = (milestoneId: string) => {
        if (selectedMilestoneId === milestoneId) {
            // Deselect milestone
            setSelectedMilestoneId(null);
        } else {
            // Select milestone - clear all goals
            setSelectedGoalIds([]);
            setSelectedMilestoneId(milestoneId);
            
            // Auto-fill title if empty
            const milestone = availableMilestones.find(m => m.id === milestoneId);
            if (milestone && !title) {
                setTitle(`Worked on: ${milestone.targetMetric}`);
            }
        }
        setMetricValues({});
    };

    // NEW: Category change handler - show book selector for book category
    const handleCategoryChange = (value: string) => {
        setCategory(value);
        const isBookCategory = value === 'book';
        setShowBookSelector(isBookCategory);
        
        if (!isBookCategory) {
            setSelectedBookId(null);
            setPagesRead('');
            setSelectedBook(null);
            setTotalPages('');
        }
    };

    // NEW: Fetch book details when book is selected
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

    // NEW: Update book's total pages
    const handleTotalPagesUpdate = async () => {
        if (!selectedBook || !totalPages) return;

        const newTotal = parseInt(totalPages);
        if (isNaN(newTotal) || newTotal <= 0) {
            toast.error('Invalid page count');
            return;
        }

        try {
            await invoke('update_book', {
                bookId: selectedBook.id,
                req: {
                    numberOfPages: newTotal
                }
            });
            
            setSelectedBook({ ...selectedBook, numberOfPages: newTotal });
            toast.success('Book pages updated');
        } catch (error) {
            toast.error('Failed to update book', { description: String(error) });
        }
    };

    // Compute selected goals/milestone for metric display
    const selectedGoals = availableGoals.filter(g => selectedGoalIds.includes(g.id));
    const selectedMilestone = selectedMilestoneId 
        ? availableMilestones.find(m => m.id === selectedMilestoneId) 
        : null;

    const handleTitleChange = (value: string) => {
        setTitle(value);
    };

    const handleDescriptionChange = (value: string) => {
        setDescription(value);
    };

    // Existing submit handler
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
            let activityId: string;
            
            if (editingActivity) {
                // Update activity with multiple goals or milestone
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
                        goalIds: selectedGoalIds.length > 0 ? selectedGoalIds : null,
                        milestoneId: selectedMilestoneId,
                        bookId: selectedBookId,
                        pagesRead: pagesRead ? parseInt(pagesRead) : null,
                    }
                });

                // If goals were linked, mark them as verified
                if (selectedGoalIds.length > 0) {
                    for (const goalId of selectedGoalIds) {
                        await invoke('link_activity_to_unified_goal', {
                            goalId,
                            activityId: editingActivity.id,
                        });
                    }
                }

                toast.success('Activity updated successfully');
                activityId = editingActivity.id;
                onSuccess?.(); // Trigger parent refetch to update timeline colors
                onCancelEdit?.();
            } else {
                // Create activity with multiple goals or milestone
                const activityResult = await invoke<{ id: string }>('create_activity', {
                    req: {
                        startTime: startTimeISO,
                        endTime: endTimeISO,
                        category,
                        title,
                        description,
                        isProductive,
                        goalIds: selectedGoalIds.length > 0 ? selectedGoalIds : null,
                        milestoneId: selectedMilestoneId,
                        bookId: selectedBookId,
                        pagesRead: pagesRead ? parseInt(pagesRead) : null,
                        date,
                    }
                });
                
                activityId = activityResult.id;

                // Link to goals if selected
                if (selectedGoalIds.length > 0) {
                    for (const goalId of selectedGoalIds) {
                        await invoke('link_activity_to_unified_goal', {
                            goalId,
                            activityId,
                        });

                        // Handle goal metrics
                        const goal = availableGoals.find(g => g.id === goalId);
                        if (goal && goal.metrics && Object.keys(metricValues).length > 0) {
                            const updatedMetrics = goal.metrics.map(m => {
                                const increment = parseInt(metricValues[m.id] || '0');
                                return {
                                    ...m,
                                    current: m.current + increment
                                };
                            });

                            await invoke('update_unified_goal', {
                                id: goalId,
                                req: { metrics: updatedMetrics }
                            });

                            // Auto-increment parent milestone if goal is linked to one
                            if (goal.parentGoalId) {
                                try {
                                    const totalIncrement = Object.values(metricValues).reduce((sum, val) => sum + parseInt(val || '0'), 0);
                                    await invoke('increment_milestone_progress', {
                                        milestoneId: goal.parentGoalId,
                                        amount: totalIncrement
                                    });
                                } catch (err) {
                                    console.error('Failed to update milestone progress:', err);
                                }
                            }
                        }
                    }

                }

                // Handle milestone if selected
                if (selectedMilestoneId && Object.keys(metricValues).length > 0) {
                    const totalIncrement = Object.values(metricValues).reduce((sum, val) => sum + parseInt(val || '0'), 0);
                    try {
                        await invoke('increment_milestone_progress', {
                            milestoneId: selectedMilestoneId,
                            amount: totalIncrement
                        });
                    } catch (err) {
                        console.error('Failed to update milestone progress:', err);
                        toast.error('Failed to update milestone progress');
                    }
                }

                toast.success('Activity logged successfully');

                // Trigger reflection prompt for first goal OR milestone BEFORE form reset
                if (selectedGoalIds.length > 0) {
                    const firstGoal = availableGoals.find(g => g.id === selectedGoalIds[0]);
                    if (firstGoal) {
                        setReflectionEntityType('goal');
                        setReflectionEntityId(firstGoal.id);
                        setReflectionEntityText(firstGoal.text);
                        setShowReflectionPrompt(true);
                    }
                } else if (selectedMilestoneId) {
                    const milestone = availableMilestones.find(m => m.id === selectedMilestoneId);
                    if (milestone) {
                        setReflectionEntityType('milestone');
                        setReflectionEntityId(milestone.id);
                        setReflectionEntityText(milestone.targetMetric);
                        setShowReflectionPrompt(true);
                    }
                }

                // Reset form after create (but keep reflection state)
                // Set start time to the end time of the activity we just created
                setStartDate(endDate);
                const now = new Date();
                const [year, month, day] = date.split('-').map(Number);
                setEndDate(new Date(year, month - 1, day, now.getHours(), now.getMinutes()));
                setTitle('');
                setDescription('');
                setSelectedGoalIds([]);
                setSelectedMilestoneId(null);
                setMetricValues({});
                setSelectedBookId(null);
                setPagesRead('');
                setShowBookSelector(false);
                setSelectedBook(null);
                setTotalPages('');
                onSuccess?.();
            }

            // Auto-capture URLs to KB (moved outside create block to work for both create and edit)
            const allText = `${title} ${description}`;
            const detectedUrls = extractUrls(allText);
            
            if (detectedUrls.length > 0) {
                try {
                    const urlCaptures = detectedUrls.map(url => ({
                        url,
                        activityId,
                        activityTitle: title,
                        activityCategory: category,
                        detectedIn: title.includes(url) ? 'title' : 'description',
                        urlType: detectUrlType(url)
                    }));
                    
                    await invoke('capture_daily_urls', {
                        date,
                        urls: urlCaptures
                    });
                } catch (err) {
                    console.error('Failed to capture URLs to KB:', err);
                    // Non-blocking - activity still succeeds
                }
            }

            // Parse cross-references from description and update registry
            const parsedRefs = parseReferences(description);
            if (parsedRefs.length > 0) {
                try {
                    await invoke('update_reference_registry', {
                        sourceEntityType: 'activity',
                        sourceEntityId: activityId,
                        sourceField: 'description',
                        textContent: description.trim(),
                    });
                } catch (err) {
                    console.error('Failed to update cross-references:', err);
                    // Non-fatal: continue even if cross-reference update fails
                }
            }
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


            {/* Row 1: Category & Goal Link */}
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
                    <Select 
                        value={
                            selectedGoalIds.length > 0 
                                ? `goals-${selectedGoalIds.length}` 
                                : selectedMilestoneId 
                                ? `milestone-${selectedMilestoneId}` 
                                : ''
                        } 
                        onValueChange={() => {}}
                    >
                        <SelectTrigger className="material-glass-subtle border-none">
                            <SelectValue placeholder="Select Goal(s) or Milestone" />
                        </SelectTrigger>
                        <SelectContent className="material-glass max-h-80 overflow-y-auto">
                            {/* Hidden items for value display */}
                            {selectedGoalIds.length > 0 && (
                                <SelectItem value={`goals-${selectedGoalIds.length}`} className="hidden">
                                    {selectedGoalIds.length} Goal{selectedGoalIds.length > 1 ? 's' : ''} Selected
                                </SelectItem>
                            )}
                            {selectedMilestoneId && (
                                <SelectItem value={`milestone-${selectedMilestoneId}`} className="hidden">
                                    1 Milestone Selected
                                </SelectItem>
                            )}
                            
                            {/* Regular Goals Section */}
                            {availableGoals.length > 0 && (
                                <>
                                    <div className="px-2 py-1 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                                        GOALS
                                    </div>
                                    {availableGoals.map(goal => {
                                        const isSelected = selectedGoalIds.includes(goal.id);
                                        const isDisabled = selectedMilestoneId !== null;
                                        
                                        return (
                                            <div
                                                key={goal.id}
                                                onClick={() => !isDisabled && handleGoalToggle(goal.id)}
                                                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                                    isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary/50'
                                                } ${isSelected ? 'bg-secondary' : ''}`}
                                            >
                                                <div className="flex items-center justify-center w-4 h-4 rounded border border-input">
                                                    {isSelected && <Check className="w-3 h-3" />}
                                                </div>
                                                <span className="flex items-center gap-1 flex-1 min-w-0 text-sm">
                                                    {goal.date && (
                                                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                                                            [{formatDateDDMMYYYY(parseGoalDate(goal.date))}]
                                                        </span>
                                                    )}
                                                    <span className="truncate">{goal.text}</span>
                                                    {goal.urgent && <Flame className="w-3 h-3 shrink-0" style={{ color: 'var(--color-warning)' }} />}
                                                    {goal.isDebt && <AlertCircle className="w-3 h-3 shrink-0" style={{ color: 'var(--color-warning)' }} />}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                            
                            {/* Separator between Goals and Milestones */}
                            {availableGoals.length > 0 && availableMilestones.length > 0 && (
                                <div className="border-t my-2" style={{ borderColor: 'var(--border-primary)' }} />
                            )}
                            
                            {/* Milestones Section */}
                            {availableMilestones.length > 0 && (
                                <>
                                    <div className="px-2 py-1 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                                        MILESTONES
                                    </div>
                                    {availableMilestones.map(milestone => {
                                        const isSelected = selectedMilestoneId === milestone.id;
                                        const isDisabled = selectedGoalIds.length > 0 || (selectedMilestoneId !== null && selectedMilestoneId !== milestone.id);
                                        
                                        return (
                                            <div
                                                key={milestone.id}
                                                onClick={() => !isDisabled && handleMilestoneSelect(milestone.id)}
                                                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                                                    isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary/50'
                                                } ${isSelected ? 'bg-secondary' : ''}`}
                                            >
                                                <div className="flex items-center justify-center w-4 h-4 rounded border border-input">
                                                    {isSelected && <Check className="w-3 h-3" />}
                                                </div>
                                                <span className="flex items-center gap-1 flex-1 min-w-0 text-sm">
                                                    <BarChart3 className="w-3 h-3 text-muted-foreground shrink-0" />
                                                    <span className="truncate">{milestone.targetMetric}</span>
                                                    <span className="text-xs text-muted-foreground shrink-0">
                                                        ({milestone.currentValue}/{milestone.targetValue})
                                                    </span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                            
                            {availableGoals.length === 0 && availableMilestones.length === 0 && (
                                <div className="px-2 py-1 text-xs text-muted-foreground">No goals or milestones available</div>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Row 2: Title */}
            <div>
                <label className="block text-sm font-medium mb-2">
                    Title
                </label>
                <Input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="What did you do?"
                    required
                />
            </div>

            {/* Row 3: Description */}
            <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <EntityLinkTextarea
                    value={description}
                    onChange={handleDescriptionChange}
                    placeholder="Additional details about this activity... Type [[note:my-note]] to link"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl resize-none focus:ring-2 bg-secondary border placeholder:text-muted-foreground"
                    style={{ 
                        color: 'var(--text-primary)',
                        borderColor: 'var(--border-primary)'
                    }}
                />
                <p className="text-xs italic text-muted-foreground mt-1">
                    Use [[entity:identifier]] syntax to link (e.g., [[note:my-note]], [[kb:item-id]], [[goal:name]])
                </p>
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

            {/* NEW: Book Tracking Section */}
            {showBookSelector && (
                <div className="space-y-3 p-4 rounded-lg border" style={{ 
                    backgroundColor: 'var(--surface-secondary)',
                    borderColor: 'var(--border-primary)'
                }}>
                    <BookSelector 
                        onBookSelected={handleBookSelected}
                        selectedBookId={selectedBookId}
                    />
                    
                    {selectedBookId && selectedBook && (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium">Reading Progress</label>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Input
                                        type="number"
                                        min="0"
                                        placeholder="Pages read"
                                        value={pagesRead}
                                        onChange={(e) => setPagesRead(e.target.value)}
                                    />
                                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        Pages read
                                    </span>
                                </div>
                                <div>
                                    <div className="flex gap-1">
                                        <Input
                                            type="number"
                                            min="0"
                                            placeholder="Total pages"
                                            value={totalPages}
                                            onChange={(e) => setTotalPages(e.target.value)}
                                            onBlur={handleTotalPagesUpdate}
                                        />
                                    </div>
                                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        Total pages
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}


            {/* Metrics for selected goals */}
            {selectedGoals.length > 0 && selectedGoals.some(g => g.metrics && g.metrics.length > 0) && (
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Progress on Goal Metrics</label>
                    {selectedGoals.map(goal => 
                        goal.metrics && goal.metrics.length > 0 ? (
                            <div key={goal.id} className="space-y-2 p-3 rounded border" style={{ borderColor: 'var(--border-color)' }}>
                                <div className="text-xs font-medium text-muted-foreground">{goal.text}</div>
                                {goal.metrics.map(metric => (
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
                        ) : null
                    )}
                </div>
            )}
            
            {/* Metrics for selected milestone */}
            {selectedMilestone && (
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Progress on Milestone</label>
                    <div className="flex items-center gap-2">
                        <span className="text-sm flex-1">{selectedMilestone.targetMetric}</span>
                        <Input
                            type="number"
                            min="0"
                            value={metricValues['milestone'] || ''}
                            onChange={(e) => setMetricValues({ milestone: e.target.value })}
                            placeholder="0"
                            className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">
                            ({selectedMilestone.currentValue}/{selectedMilestone.targetValue} {selectedMilestone.unit || ''})
                        </span>
                    </div>
                </div>
            )}

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

        {/* Reflection Prompt Modal */}
        {showReflectionPrompt && reflectionEntityId && (
            <ReflectionPrompt
                entityType={reflectionEntityType}
                entityId={reflectionEntityId}
                entityText={reflectionEntityText}
                onClose={() => {
                    setShowReflectionPrompt(false);
                    setReflectionEntityId('');
                    setReflectionEntityText('');
                }}
                onSaved={() => {
                    setShowReflectionPrompt(false);
                    setReflectionEntityId('');
                    setReflectionEntityText('');
                    toast.success('Reflection saved');
                }}
            />
        )}
        </>
    );
}
