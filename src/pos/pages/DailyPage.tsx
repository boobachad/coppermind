import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActivityForm } from '../components/ActivityForm';
import { SlotPopup } from '../components/SlotPopup';
import { Navbar } from '../components/Navbar';
import { formatDateDDMMYYYY, formatTime } from '../lib/time';
import { getActivityColor } from '../lib/config';
import type { Activity, GoalWithDetails } from '../lib/types';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getDb } from '../../lib/db';

interface GridSlot {
    slotIndex: number;
    activities: Activity[];
    color: string;
    segments?: { width: number; color: string }[];
}

export function DailyPage() {
    const { date } = useParams<{ date: string }>();
    const [activities, setActivities] = useState<Activity[]>([]);
    const [goals, setGoals] = useState<GoalWithDetails[]>([]);
    const [daySlots, setDaySlots] = useState<GridSlot[]>([]);
    const [metrics, setMetrics] = useState({
        totalMinutes: 0,
        productiveMinutes: 0,
        goalDirectedMinutes: 0,
    });
    const [loading, setLoading] = useState(true);
    const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const [currentSlotIndex, setCurrentSlotIndex] = useState(-1);
    const [isToday, setIsToday] = useState(false);
    const [hasJournalEntry, setHasJournalEntry] = useState(false);

    const fetchData = async () => {
        if (!date) return;
        
        setLoading(true);
        try {
            // Check if viewing today
            const now = new Date();
            const localDateStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
            setIsToday(date === localDateStr);
            
            // Calculate current slot index
            const currentMinute = now.getHours() * 60 + now.getMinutes();
            setCurrentSlotIndex(Math.floor(currentMinute / 30));

            // Check if journal entry exists (counts only if has schedule + reflection)
            try {
                const db = await getDb();
                const journalRows = await db.select<any[]>(
                    `SELECT id FROM journal_entries 
                     WHERE date = $1
                     AND reflection_text != ''
                     AND (
                         (expected_schedule_image != '' OR expected_schedule_data IS NOT NULL)
                         OR (actual_schedule_image != '' OR actual_schedule_data IS NOT NULL)
                     )`,
                    [date]
                );
                setHasJournalEntry(journalRows.length > 0);
            } catch (err) {
                console.error('Failed to check journal entry:', err);
            }

            const response = await invoke<{ activities: Activity[] }>('get_activities', { date });
            const actData = response.activities;
            setActivities(actData);

            // Calculate metrics
            let total = 0;
            let productive = 0;
            let goalDirected = 0;

            actData.forEach(act => {
                const duration = (new Date(act.endTime).getTime() - new Date(act.startTime).getTime()) / 60000;
                total += duration;
                if (act.isProductive) productive += duration;
                if (act.goalId) goalDirected += duration;
            });

            setMetrics({ totalMinutes: total, productiveMinutes: productive, goalDirectedMinutes: goalDirected });

            // Generate slots
            const [year, month, day] = date.split('-').map(Number);
            const slots: GridSlot[] = Array.from({ length: 48 }, (_, i) => {
                const slotStart = new Date(year, month - 1, day);
                slotStart.setMinutes(i * 30);
                const slotEnd = new Date(slotStart);
                slotEnd.setMinutes(slotEnd.getMinutes() + 30);

                const overlapping = actData.filter((activity) => {
                    const actStart = new Date(activity.startTime);
                    const actEnd = new Date(activity.endTime);
                    return actStart < slotEnd && actEnd > slotStart;
                });

                let slotBackground = 'var(--pos-slot-empty)';
                let segments: { width: number; color: string }[] | undefined;

                if (overlapping.length === 1) {
                    slotBackground = getActivityColor(overlapping[0].category);
                } else if (overlapping.length > 1) {
                    const sorted = [...overlapping].sort((a, b) => 
                        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
                    );
                    const localSegments: { width: number; color: string }[] = [];
                    let lastPct = 0;
                    const slotMs = slotStart.getTime();
                    const slotDuration = 30 * 60 * 1000;

                    sorted.forEach((act) => {
                        const startMs = Math.max(new Date(act.startTime).getTime(), slotMs);
                        const endMs = Math.min(new Date(act.endTime).getTime(), slotMs + slotDuration);
                        const startPct = ((startMs - slotMs) / slotDuration) * 100;
                        const endPct = ((endMs - slotMs) / slotDuration) * 100;

                        if (startPct > lastPct + 0.1) {
                            localSegments.push({ width: startPct - lastPct, color: 'var(--pos-segment-empty)' });
                        }

                        const color = getActivityColor(act.category);
                        localSegments.push({ width: endPct - startPct, color });
                        lastPct = endPct;
                    });

                    if (lastPct < 99.9) {
                        localSegments.push({ width: 100 - lastPct, color: 'var(--pos-segment-empty)' });
                    }
                    segments = localSegments;
                }

                return { slotIndex: i, activities: overlapping, color: slotBackground, segments };
            });
            setDaySlots(slots);

            const goalData = await invoke<GoalWithDetails[]>('get_goals', { date });
            setGoals(goalData);
        } catch (error) {
            toast.error('Failed to fetch data', { description: String(error) });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [date]);

    if (loading) {
        return (
            <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'grid', href: '/pos/grid' }, { label: date || 'loading' }]} />
                <div className="flex-1 flex items-center justify-center">
                    <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                        <CardContent className="pt-6">
                            <div className="text-center py-12 text-muted-foreground">Loading...</div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    const fullyLoggedSlots = daySlots.filter((s) => s.activities.length > 0).length;
    const debtTime = 1440 - metrics.totalMinutes;

    return (
        <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'grid', href: '/pos/grid' }, { label: date ? formatDateDDMMYYYY(new Date(date)) : 'loading' }]} />
            <div className="max-w-[1400px] mx-auto space-y-4 p-4 flex-1 overflow-auto">
                <div className="flex items-center gap-4">
                    <Link to="/pos/grid" className="text-muted-foreground hover:text-foreground">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight">{formatDateDDMMYYYY(new Date(date!))}</h1>
                    {hasJournalEntry && (
                        <Link to={`/journal/${date}`}>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex items-center gap-2 hover:opacity-90"
                              style={{
                                backgroundColor: 'var(--btn-primary-bg)',
                                color: 'var(--btn-primary-text)'
                              }}
                            >
                                <BookOpen className="h-4 w-4" />
                                View Journal
                            </Button>
                        </Link>
                    )}
                </div>

                <div className="grid grid-cols-4 gap-2">
                    <Card className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                        <CardContent className="pt-4 pb-2 px-4">
                            <div className="text-xl font-bold" style={{ color: 'var(--pos-success-text)' }}>{fullyLoggedSlots}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Logged Slots</div>
                        </CardContent>
                    </Card>
                    <Card className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                        <CardContent className="pt-4 pb-2 px-4">
                            <div className="text-xl font-bold" style={{ color: 'var(--pos-info-text)' }}>{metrics.totalMinutes}m</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Total Time</div>
                        </CardContent>
                    </Card>
                    <Card className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                        <CardContent className="pt-4 pb-2 px-4">
                            <div className="text-xl font-bold" style={{ color: 'var(--pos-warning-text)' }}>{metrics.productiveMinutes}m</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Productive</div>
                        </CardContent>
                    </Card>
                    <Card className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                        <CardContent className="pt-4 pb-2 px-4">
                            <div className="text-xl font-bold" style={{ color: 'var(--pos-error-text)' }}>{debtTime}m</div>
                            <div className="text-[10px] text-muted-foreground uppercase">DebtTime</div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border overflow-hidden" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">Timeline Overview</CardTitle>
                    </CardHeader>
                    <div className="overflow-x-auto pb-4 px-4">
                        <div className="flex gap-0.5 h-14">
                            {daySlots.map((slot) => {
                                const isCurrentTimeSlot = isToday && slot.slotIndex === currentSlotIndex;
                                
                                return (
                                    <div
                                        key={slot.slotIndex}
                                        className="w-8 h-full rounded-[2px] cursor-pointer hover:opacity-80 transition-opacity border shrink-0 relative group"
                                        style={{ 
                                            background: slot.segments ? 'transparent' : slot.color,
                                            borderColor: isCurrentTimeSlot ? 'var(--pos-today-border)' : 'var(--border-color)',
                                            borderWidth: isCurrentTimeSlot ? '2px' : '1px',
                                            boxShadow: isCurrentTimeSlot ? '0 0 0 2px var(--pos-today-bg)' : undefined
                                        }}
                                        onClick={() => {
                                            setSelectedSlot(slot.slotIndex);
                                            setShowPopup(true);
                                        }}
                                    >
                                        {slot.segments && (
                                            <div className="absolute inset-0 flex h-full w-full overflow-hidden rounded-[2px]">
                                                {slot.segments.map((seg, idx) => (
                                                    <div key={idx} style={{ width: `${seg.width}%`, background: seg.color }} className="h-full" />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>

                <Tabs defaultValue="timeline" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 border h-8" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                        <TabsTrigger value="timeline" className="text-xs">TIMELINE</TabsTrigger>
                        <TabsTrigger value="goals" className="text-xs">GOALS</TabsTrigger>
                        <TabsTrigger value="metrics" className="text-xs">METRICS</TabsTrigger>
                    </TabsList>

                    <TabsContent value="timeline" className="space-y-4 mt-4">
                        <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                            <CardHeader className="py-3 px-4">
                                <CardTitle className="text-sm font-medium">Log Activity</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <ActivityForm date={date!} onSuccess={fetchData} />
                            </CardContent>
                        </Card>

                        <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                            <CardHeader className="py-3 px-4">
                                <CardTitle className="text-sm font-medium">Activities</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                {activities.length === 0 ? (
                                    <p className="text-muted-foreground text-xs">No activities logged</p>
                                ) : (
                                    <div className="space-y-1">
                                        {activities.map((activity) => (
                                            <div
                                                key={activity.id}
                                                className="flex items-center gap-3 p-2 border rounded"
                                                style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                                            >
                                                <div
                                                    className="w-2.5 h-2.5 rounded"
                                                    style={{
                                                        backgroundColor: getActivityColor(activity.category),
                                                        border: activity.goalId ? '2px solid var(--pos-goal-accent)' : 'none',
                                                    }}
                                                />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium leading-none">{activity.description}</p>
                                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                                        {formatTime(new Date(activity.startTime))} - {formatTime(new Date(activity.endTime))}
                                                        {activity.isShadow && <span className="ml-2 font-bold" style={{ color: 'var(--pos-shadow-text)' }}>(Shadow)</span>}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="goals" className="mt-4">
                        <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                            <CardHeader className="py-3 px-4">
                                <CardTitle className="text-sm font-medium">Goals</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                {goals.length === 0 ? (
                                    <p className="text-muted-foreground text-xs">No goals for this date</p>
                                ) : (
                                    <div className="space-y-2">
                                        {goals.map((goal) => (
                                            <div
                                                key={goal.id}
                                                className="border rounded p-3"
                                                style={{
                                                    borderColor: goal.isVerified ? 'var(--pos-success-border)' : 'var(--border-color)',
                                                    backgroundColor: goal.isVerified ? 'var(--pos-success-bg)' : 'var(--bg-secondary)'
                                                }}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium">{goal.description}</p>
                                                        {goal.problemId && (
                                                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                                                Target: {goal.problemId}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase"
                                                        style={{
                                                            backgroundColor: goal.isVerified ? 'var(--pos-success-border)' : 'var(--muted)',
                                                            color: goal.isVerified ? 'var(--pos-success-text)' : 'var(--muted-foreground)'
                                                        }}
                                                    >
                                                        {goal.isVerified ? 'Verified' : 'Pending'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="metrics" className="space-y-4 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                                <CardContent className="pt-4 pb-2 px-4">
                                    <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Total Logged</p>
                                    <p className="text-xl font-bold" style={{ color: 'var(--pos-info-text)' }}>{metrics.totalMinutes} min</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{Math.round((metrics.totalMinutes / 1440) * 100)}% of day</p>
                                </CardContent>
                            </Card>
                            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                                <CardContent className="pt-4 pb-2 px-4">
                                    <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Productive</p>
                                    <p className="text-xl font-bold" style={{ color: 'var(--pos-success-text)' }}>{metrics.productiveMinutes} min</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{metrics.totalMinutes > 0 ? Math.round((metrics.productiveMinutes / metrics.totalMinutes) * 100) : 0}% of logged</p>
                                </CardContent>
                            </Card>
                            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                                <CardContent className="pt-4 pb-2 px-4">
                                    <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Goal-Directed</p>
                                    <p className="text-xl font-bold" style={{ color: 'var(--pos-warning-text)' }}>{metrics.goalDirectedMinutes} min</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{metrics.productiveMinutes > 0 ? Math.round((metrics.goalDirectedMinutes / metrics.productiveMinutes) * 100) : 0}% of productive</p>
                                </CardContent>
                            </Card>
                            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                                <CardContent className="pt-4 pb-2 px-4">
                                    <p className="text-[10px] text-muted-foreground uppercase mb-0.5">DebtTime</p>
                                    <p className="text-xl font-bold" style={{ color: 'var(--pos-error-text)' }}>{debtTime} min</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{Math.round((debtTime / 1440) * 100)}% unaccounted</p>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                            <CardHeader className="py-3 px-4">
                                <CardTitle className="text-sm font-medium">Activity Breakdown</CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <div className="space-y-2">
                                    {Object.entries(
                                        activities.reduce((acc, activity) => {
                                            const duration = Math.round((new Date(activity.endTime).getTime() - new Date(activity.startTime).getTime()) / 60000);
                                            acc[activity.category] = (acc[activity.category] || 0) + duration;
                                            return acc;
                                        }, {} as Record<string, number>)
                                    ).map(([category, minutes]) => (
                                        <div key={category} className="flex items-center gap-3">
                                            <div
                                                className="w-2.5 h-2.5 rounded"
                                                style={{ backgroundColor: getActivityColor(category) }}
                                            />
                                            <span className="flex-1 text-xs uppercase font-medium">{category.replace('_', ' ')}</span>
                                            <span className="text-xs font-mono text-muted-foreground">{minutes}m</span>
                                            <span className="text-[10px] text-muted-foreground w-8 text-right">
                                                {metrics.totalMinutes > 0 ? Math.round((minutes / metrics.totalMinutes) * 100) : 0}%
                                            </span>
                                        </div>
                                    ))}
                                    {Object.keys(activities.reduce((acc, a) => ({ ...acc, [a.category]: 1 }), {})).length === 0 && (
                                        <p className="text-muted-foreground text-xs">No activities logged</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {selectedSlot !== null && (
                    <SlotPopup
                        open={showPopup}
                        onClose={() => setShowPopup(false)}
                        date={date!}
                        slotIndex={selectedSlot}
                    />
                )}
            </div>
        </div>
    );
}
