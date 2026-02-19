import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Star, AlertCircle } from 'lucide-react';
import { Loader } from '@/components/Loader';
import { ACTIVITY_COLORS } from '../lib/config';
import { formatSlotTime, activityOverlapsSlot, formatActivityTime } from '../lib/time';
import type { Activity, UnifiedGoal } from '../lib/types';

interface SlotPopupProps {
    open: boolean;
    onClose: () => void;
    date: string;
    slotIndex: number;
}

export function SlotPopup({ open, onClose, date, slotIndex }: SlotPopupProps) {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(false);
    const [debtGoals, setDebtGoals] = useState<UnifiedGoal[]>([]);

    useEffect(() => {
        if (open && slotIndex !== null) {
            setLoading(true);
            invoke<{ activities: Activity[] }>('get_activities', { date })
                .then(response => {
                    const allActivities = response.activities;
                    const [year, month, day] = date.split('-').map(Number);
                    const slotStart = new Date(year, month - 1, day);
                    slotStart.setMinutes(slotIndex * 30);
                    const slotEnd = new Date(slotStart);
                    slotEnd.setMinutes(slotEnd.getMinutes() + 30);

                    const overlapping = allActivities.filter((activity) =>
                        activityOverlapsSlot(activity.startTime, activity.endTime, slotStart, slotEnd)
                    );

                    setActivities(overlapping);
                    setLoading(false);

                    // Fetch debt goals for this date
                    invoke<UnifiedGoal[]>('get_accumulated_debt', { date })
                        .then(goals => setDebtGoals(goals))
                        .catch(err => console.error('Failed to fetch debt:', err));
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
            <DialogContent className="material-glass border-border sm:max-w-[425px] shadow-xl">
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
                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {activities.map((activity) => (
                            <div
                                key={activity.id}
                                className="p-3 rounded-lg space-y-2 bg-secondary/50 border border-border/50 shadow-sm transition-all hover:bg-secondary"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="font-medium text-foreground">{activity.title}</div>
                                        {activity.description && (
                                            <div className="text-xs text-muted-foreground mt-1">{activity.description}</div>
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
                                            <span className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                                                Productive
                                            </span>
                                        )}
                                        {activity.isShadow && (
                                            <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                Shadow
                                            </span>
                                        )}
                                        {activity.goalId && (
                                            <span className="text-xs px-2 py-1 rounded flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                Goal <Star className="w-3 h-3" />
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Category: <span className="font-medium uppercase text-foreground/80">{activity.category}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 text-center text-muted-foreground">
                        No activities logged in this slot
                    </div>
                )}

                {/* Debt Section */}
                {debtGoals.length > 0 && (
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                        <div className="flex items-center gap-2 mb-3">
                            <AlertCircle className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                            <h4 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                                Incomplete Goals ({debtGoals.length})
                            </h4>
                        </div>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {debtGoals.map((goal) => (
                                <div
                                    key={goal.id}
                                    className="p-2 rounded text-xs"
                                    style={{
                                        backgroundColor: 'var(--color-error-subtle-faint)',
                                        border: '1px solid var(--color-error)',
                                    }}
                                >
                                    <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                        {goal.text}
                                    </div>
                                    {goal.priority && (
                                        <div className="mt-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                            Priority: {goal.priority}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
