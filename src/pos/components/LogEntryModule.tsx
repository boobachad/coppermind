import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimePickerInput } from '@/components/ui/time-picker-input';
import { Flame, Link2, Calendar, AlertCircle } from 'lucide-react';
import { ACTIVITY_CATEGORIES } from '../lib/config';
import type { UnifiedGoal, Activity, DuplicateCheckResult, Book, Milestone } from '../lib/types';
import { formatLocalAsUTC, formatDateDDMMYYYY } from '../lib/time';
import { extractUrls, detectUrlType, parseTemporalKeywords } from '@/lib/kb-utils';
import { toast } from 'sonner';
import { BookSelector } from './BookSelector';

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
    const [availableMilestones, setAvailableMilestones] = useState<Milestone[]>([]);
    const [selectedGoalId, setSelectedGoalId] = useState<string>('none');
    const [metricValues, setMetricValues] = useState<Record<string, string>>({});

    // NEW: Smart Input Enhancement State
    const [detectedUrls, setDetectedUrls] = useState<string[]>([]);
    const [urlDuplicates, setUrlDuplicates] = useState<DuplicateCheckResult | null>(null);
    const [showUrlPrompt, setShowUrlPrompt] = useState(false);
    const [temporalInfo, setTemporalInfo] = useState<{ date?: Date; keyword?: string } | null>(null);

    // NEW: Book Tracking State
    const [selectedBookId, setSelectedBookId] = useState<string | null>(editingActivity?.bookId || null);
    const [pagesRead, setPagesRead] = useState<string>(editingActivity?.pagesRead?.toString() || '');
    const [showBookSelector, setShowBookSelector] = useState(false);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [totalPages, setTotalPages] = useState<string>('');

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
        const fetchGoalsAndMilestones = async () => {
            try {
                const [goals, milestones] = await Promise.all([
                    invoke<UnifiedGoal[]>('get_unified_goals', {
                        filters: { completed: false }
                    }),
                    invoke<Milestone[]>('get_milestones', {
                        activeOnly: true
                    })
                ]);
                setAvailableGoals(goals);
                setAvailableMilestones(milestones);
            } catch (error) {
                console.error('Failed to fetch goals/milestones:', error);
            }
        };
        fetchGoalsAndMilestones();
    }, [date]);

    // Existing handlers (PRESERVED)
    const handleGoalChange = (value: string) => {
        setSelectedGoalId(value);
        setMetricValues({});

        if (value !== 'none') {
            // Check if it's a milestone
            if (value.startsWith('milestone-')) {
                const milestoneId = value.replace('milestone-', '');
                const milestone = availableMilestones.find(m => m.id === milestoneId);
                if (milestone) {
                    setTitle(prev => prev || `Worked on: ${milestone.targetMetric}`);
                }
            } else {
                // Regular goal
                const goal = availableGoals.find(g => g.id === value);
                if (goal) {
                    setTitle(prev => prev || `Worked on: ${goal.text}`);
                }
            }
        }
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
                description: `Will create goal for ${formatDateDDMMYYYY(temporal.date)}`,
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
                // Create activity (ENHANCED WITH BOOK TRACKING)
                const activityResult = await invoke<{ id: string }>('create_activity', {
                    req: {
                        startTime: startTimeISO,
                        endTime: endTimeISO,
                        category,
                        title,
                        description,
                        isProductive,
                        goalId: null,
                        bookId: selectedBookId,
                        pagesRead: pagesRead ? parseInt(pagesRead) : null,
                        date,
                    }
                });

                // Link to goal/milestone if selected
                if (selectedGoalId !== 'none') {
                    // Check if it's a milestone (prefixed with "milestone-")
                    if (selectedGoalId.startsWith('milestone-')) {
                        const milestoneId = selectedGoalId.replace('milestone-', '');
                        
                        // Increment milestone progress with metric values
                        if (Object.keys(metricValues).length > 0) {
                            const totalIncrement = Object.values(metricValues).reduce((sum, val) => sum + parseInt(val || '0'), 0);
                            try {
                                await invoke('increment_milestone_progress', {
                                    milestoneId,
                                    amount: totalIncrement
                                });
                            } catch (err) {
                                console.error('Failed to update milestone progress:', err);
                                toast.error('Failed to update milestone progress');
                            }
                        }
                    } else {
                        // Regular goal linking
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

                            // Auto-increment parent milestone if goal is linked to one
                            if (selectedGoal.parentGoalId) {
                                try {
                                    const totalIncrement = Object.values(metricValues).reduce((sum, val) => sum + parseInt(val || '0'), 0);
                                    await invoke('increment_milestone_progress', {
                                        milestoneId: selectedGoal.parentGoalId,
                                        amount: totalIncrement
                                    });
                                } catch (err) {
                                    console.error('Failed to update milestone progress:', err);
                                }
                            }
                        }
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
                        const d = temporalInfo.date;
                        const goalDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        await invoke('create_unified_goal', {
                            req: {
                                text: title,
                                dueDate: `${goalDate}T00:00:00Z`,
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

            // Reset form (ENHANCED)
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
            setSelectedBookId(null);
            setPagesRead('');
            setShowBookSelector(false);
            setSelectedBook(null);
            setTotalPages('');
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
                        Will create goal for <strong>{formatDateDDMMYYYY(temporalInfo.date)}</strong> ({temporalInfo.keyword})
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

            {/* EXISTING: Category (UPDATED) */}
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
                    <label className="block text-sm font-medium" style={{ color: 'var(--pos-goal-link-text)' }}>Link to Goal/Milestone (Optional)</label>
                    <Select value={selectedGoalId} onValueChange={handleGoalChange}>
                        <SelectTrigger className="material-glass-subtle border-none w-full">
                            <SelectValue placeholder="Select a goal or milestone" />
                        </SelectTrigger>
                        <SelectContent className="material-glass max-h-60 overflow-y-auto">
                            <SelectItem value="none">-- No Goal --</SelectItem>
                            
                            {/* Regular Goals Section */}
                            {availableGoals.length > 0 && (
                                <>
                                    <div className="px-2 py-1.5 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                                        GOALS
                                    </div>
                                    {availableGoals.map(goal => (
                                        <SelectItem key={goal.id} value={goal.id}>
                                            <span className="flex items-center gap-1 max-w-[200px] truncate">
                                                {goal.dueDate ? <span className="text-xs text-muted-foreground mr-1 font-mono">[{formatDateDDMMYYYY(new Date(goal.dueDate))}]</span> : null}
                                                <span className="truncate">{goal.text}</span>
                                                {goal.urgent && <Flame className="w-3 h-3 text-orange-500 shrink-0" />}
                                                {goal.isDebt && <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0" />}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </>
                            )}
                            
                            {/* Milestones Section */}
                            {availableMilestones.length > 0 && (
                                <>
                                    <div className="px-2 py-1.5 text-xs font-semibold mt-2" style={{ color: 'var(--text-tertiary)' }}>
                                        MILESTONES
                                    </div>
                                    {availableMilestones.map(milestone => (
                                        <SelectItem key={`milestone-${milestone.id}`} value={`milestone-${milestone.id}`}>
                                            <span className="flex items-center gap-1 max-w-[200px] truncate">
                                                <span className="text-xs text-muted-foreground mr-1">📊</span>
                                                <span className="truncate">{milestone.targetMetric}</span>
                                                <span className="text-xs text-muted-foreground">({milestone.currentValue}/{milestone.targetValue})</span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Row 2: Title */}
            <div>
                <label className="block text-sm font-medium mb-2 items-center gap-2">
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

            {/* EXISTING: Metrics (UNCHANGED) */}
            {/* EXISTING: Metrics (UPDATED FOR MILESTONES) */}
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
            
            {/* NEW: Milestone Metrics */}
            {selectedGoalId.startsWith('milestone-') && (() => {
                const milestoneId = selectedGoalId.replace('milestone-', '');
                const milestone = availableMilestones.find(m => m.id === milestoneId);
                return milestone && (
                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Progress on Milestone</label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm flex-1">{milestone.label || milestone.targetMetric}</span>
                            <Input
                                type="number"
                                min="0"
                                value={metricValues['milestone'] || ''}
                                onChange={(e) => setMetricValues({ milestone: e.target.value })}
                                placeholder="0"
                                className="w-24"
                            />
                            <span className="text-sm text-muted-foreground">
                                ({milestone.currentValue}/{milestone.targetValue} {milestone.unit || ''})
                            </span>
                        </div>
                    </div>
                );
            })()}

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
