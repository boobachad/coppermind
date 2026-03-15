import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link, useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Star, BookOpen, ExternalLink, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Loader } from '@/components/Loader';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ACTIVITY_COLORS } from '../lib/config';
import { formatSlotTime, activityOverlapsSlot, formatActivityTime, getSlotBoundaries } from '../lib/time';
import type { Activity, Book, KnowledgeItem } from '../lib/types';

interface SlotPopupProps {
    open: boolean;
    onClose: () => void;
    date: string;
    slotIndex: number;
}

export function SlotPopup({ open, onClose, date, slotIndex }: SlotPopupProps) {
    const navigate = useNavigate();
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(false);
    const [booksMap, setBooksMap] = useState<Map<string, Book>>(new Map());
    const [kbItemsMap, setKbItemsMap] = useState<Map<string, KnowledgeItem[]>>(new Map());

    const handleKbItemClick = (itemId: string) => {
        onClose();
        navigate('/knowledge', { state: { highlightItemId: itemId } });
    };

    useEffect(() => {
        if (open && slotIndex !== null) {
            setLoading(true);
            invoke<{ activities: Activity[] }>('get_activities', { date })
                .then(response => {
                    const allActivities = response.activities;
                    const { start: slotStart, end: slotEnd } = getSlotBoundaries(date, slotIndex);

                    const overlapping = allActivities.filter((activity) =>
                        activityOverlapsSlot(activity.startTime, activity.endTime, slotStart, slotEnd)
                    );

                    setActivities(overlapping);

                    // Fetch books for activities that have book_id
                    const bookIds = [...new Set(overlapping.filter(a => a.bookId).map(a => a.bookId!))];
                    if (bookIds.length > 0) {
                        invoke<Book[]>('get_all_books')
                            .then(allBooks => {
                                const bookMap = new Map<string, Book>();
                                allBooks.forEach(book => {
                                    if (bookIds.includes(book.id)) {
                                        bookMap.set(book.id, book);
                                    }
                                });
                                setBooksMap(bookMap);
                            })
                            .catch(err => console.error('Failed to fetch books:', err));
                    }

                    // Fetch KB items for each activity
                    const kbMap = new Map<string, KnowledgeItem[]>();
                    Promise.all(
                        overlapping.map(activity =>
                            invoke<KnowledgeItem[]>('get_kb_items_for_activity', { activityId: activity.id })
                                .then(items => {
                                    if (items.length > 0) {
                                        kbMap.set(activity.id, items);
                                    }
                                })
                                .catch(err => console.error(`Failed to fetch KB items for activity ${activity.id}:`, err))
                        )
                    ).then(() => {
                        setKbItemsMap(kbMap);
                    });

                    setLoading(false);
                })
                .catch(() => {
                    setLoading(false);
                });
        }
    }, [open, date, slotIndex]);

    const slotStartTime = formatSlotTime(slotIndex);
    const slotEndTime = formatSlotTime(slotIndex + 1);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="material-glass border-border sm:max-w-[700px] max-h-[85vh] shadow-xl">
                <DialogHeader>
                    <DialogTitle className="text-foreground">
                        Slot {slotIndex} ({slotStartTime} - {slotEndTime})
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Activities logged during this time slot
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-8 flex justify-center">
                        <Loader className="text-primary" />
                    </div>
                ) : activities && activities.length > 0 ? (
                    <div className="space-y-3 max-h-[calc(85vh-180px)] overflow-y-auto custom-scrollbar pr-2">{activities.map((activity) => {
                            const book = activity.bookId ? booksMap.get(activity.bookId) : null;
                            const kbItems = kbItemsMap.get(activity.id) || [];
                            
                            return (
                                <div
                                    key={activity.id}
                                    className="p-3 rounded-lg space-y-2 bg-secondary/50 border border-border/50 shadow-sm transition-all hover:bg-secondary"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="font-medium text-foreground">{activity.title}</div>
                                            {activity.description && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    <MarkdownRenderer content={activity.description} />
                                                </div>
                                            )}
                                            {book && (
                                                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                    <BookOpen className="w-3 h-3" />
                                                    <span>
                                                        {book.title}
                                                        {book.authors.length > 0 && ` by ${book.authors.join(', ')}`}
                                                        {activity.pagesRead && ` • ${activity.pagesRead} pages`}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="text-sm text-muted-foreground/80 mt-1">
                                                {formatActivityTime(activity.startTime)} - {formatActivityTime(activity.endTime)}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            <div
                                                className="w-3 h-3 rounded shadow-sm"
                                                style={{ backgroundColor: ACTIVITY_COLORS[activity.category] }}
                                            />
                                            {activity.isProductive && (
                                                <span className="text-xs px-2 py-1 rounded border" style={{
                                                    backgroundColor: 'var(--pos-productive-bg)',
                                                    color: 'var(--pos-productive-text)',
                                                    borderColor: 'var(--pos-success-border)'
                                                }}>
                                                    Productive
                                                </span>
                                            )}
                                            {activity.isShadow && (
                                                <span className="text-xs px-2 py-1 rounded border" style={{
                                                    backgroundColor: 'var(--pos-shadow-bg)',
                                                    color: 'var(--pos-shadow-text)',
                                                    borderColor: 'var(--pos-info-border)'
                                                }}>
                                                    Shadow
                                                </span>
                                            )}
                                            {activity.goalIds && activity.goalIds.length > 0 && (
                                                <span className="text-xs px-2 py-1 rounded flex items-center gap-1 border" style={{
                                                    backgroundColor: 'var(--pos-goal-link-bg)',
                                                    color: 'var(--pos-goal-link-text)',
                                                    borderColor: 'var(--pos-goal-link-border)'
                                                }}>
                                                    {activity.goalIds.length} Goal{activity.goalIds.length > 1 ? 's' : ''} <Star className="w-3 h-3" />
                                                </span>
                                            )}
                                            {activity.milestoneId && (
                                                <span className="text-xs px-2 py-1 rounded flex items-center gap-1 border" style={{
                                                    backgroundColor: 'var(--pos-info-bg)',
                                                    color: 'var(--pos-info-text)',
                                                    borderColor: 'var(--pos-info-border)'
                                                }}>
                                                    Milestone <Star className="w-3 h-3" />
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* KB Items Section */}
                                    {kbItems.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-border/30">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Lightbulb className="w-4 h-4" style={{ color: 'var(--color-accent-primary)' }} />
                                                <span className="text-sm font-medium text-foreground">
                                                    Knowledge Items ({kbItems.length})
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {kbItems.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => handleKbItemClick(item.id)}
                                                        className="w-full text-left p-3 rounded-lg border transition-all cursor-pointer group"
                                                        style={{
                                                            backgroundColor: 'var(--pos-info-bg)',
                                                            borderColor: 'var(--pos-info-border)'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'var(--color-accent-subtle)';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'var(--pos-info-bg)';
                                                        }}
                                                        onFocus={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'var(--color-accent-subtle)';
                                                        }}
                                                        onBlur={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'var(--pos-info-bg)';
                                                        }}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-sm text-foreground line-clamp-2 transition-colors" style={{ color: 'var(--text-primary)' }}>
                                                                    {item.content}
                                                                </div>
                                                                {item.tags.length > 0 && (
                                                                    <div className="flex gap-1.5 mt-2 flex-wrap">
                                                                        {item.tags.slice(0, 4).map((tag) => (
                                                                            <span
                                                                                key={tag}
                                                                                className="text-xs px-2 py-0.5 rounded-full border"
                                                                                style={{
                                                                                    backgroundColor: 'var(--pos-info-bg)',
                                                                                    color: 'var(--pos-info-text)',
                                                                                    borderColor: 'var(--pos-info-border)'
                                                                                }}
                                                                            >
                                                                                {tag}
                                                                            </span>
                                                                        ))}
                                                                        {item.tags.length > 4 && (
                                                                            <span className="text-xs text-muted-foreground self-center">
                                                                                +{item.tags.length - 4} more
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <span className="text-xs px-2 py-1 rounded bg-secondary/80 text-muted-foreground border border-border/50">
                                                                    {item.status}
                                                                </span>
                                                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground transition-colors" style={{ color: 'var(--color-accent-primary)' }} />
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-muted-foreground">
                                            Category: <span className="font-medium uppercase text-foreground/80">{activity.category}</span>
                                        </div>
                                        {book && (
                                            <Link to={`/books/${activity.bookId}`} onClick={onClose}>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs flex items-center gap-1"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    View Book
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-8 text-center text-muted-foreground">
                        No activities logged in this slot
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
