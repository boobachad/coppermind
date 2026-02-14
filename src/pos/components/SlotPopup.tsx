import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Star } from 'lucide-react';
import { Loader } from '@/components/Loader';
import { ACTIVITY_COLORS } from '../lib/config';
import { formatSlotTime, activityOverlapsSlot, formatActivityTime } from '../lib/time';
import type { Activity } from '../lib/types';

interface SlotPopupProps {
    open: boolean;
    onClose: () => void;
    date: string;
    slotIndex: number;
}

export function SlotPopup({ open, onClose, date, slotIndex }: SlotPopupProps) {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(false);

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
            <DialogContent className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
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
                        <Loader />
                    </div>
                ) : activities && activities.length > 0 ? (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                        {activities.map((activity) => (
                            <div
                                key={activity.id}
                                className="p-3 border rounded-lg space-y-2"
                                style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                            >
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="font-medium text-foreground">{activity.title}</div>
                                        {activity.description && (
                                            <div className="text-xs text-muted-foreground mt-1">{activity.description}</div>
                                        )}
                                        <div className="text-sm text-muted-foreground mt-1">
                                            {formatActivityTime(activity.startTime)} - {formatActivityTime(activity.endTime)}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div
                                            className="w-3 h-3 rounded"
                                            style={{ backgroundColor: ACTIVITY_COLORS[activity.category] }}
                                        />
                                        {activity.isProductive && (
                                            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--pos-productive-bg)', color: 'var(--pos-productive-text)' }}>
                                                Productive
                                            </span>
                                        )}
                                        {activity.isShadow && (
                                            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--pos-shadow-bg)', color: 'var(--pos-shadow-text)' }}>
                                                Shadow
                                            </span>
                                        )}
                                        {activity.goalId && (
                                            <span className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ backgroundColor: 'var(--pos-goal-link-bg)', color: 'var(--pos-goal-link-text)' }}>
                                                Goal <Star className="w-3 h-3" />
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                    Category: <span className="text-foreground uppercase">{activity.category}</span>
                                </div>
                            </div>
                        ))}
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
