import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogEntryModule } from '../components/LogEntryModule';
import { SlotPopup } from '../components/SlotPopup';
import { Navbar } from '../components/Navbar';
import { MonthSelector } from '../components/MonthSelector';
import { Loader } from '@/components/Loader';
import { parseActivityTime, getActivityDuration, activityOverlapsSlot, formatActivityTime, getLocalDateString, getSlotBoundaries, getDayBoundariesUTC, formatISODateDDMMYYYY, parseGoalDate, formatGoalDate } from '../lib/time';
import { getActivityColor } from '../lib/config';
import type { Activity, UnifiedGoal, Book } from '../lib/types';
import { BookOpen, Pencil, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface GridSlot {
    slotIndex: number;
    activities: Activity[];
    color: string;
    segments?: { width: number; color: string }[];
}

export function DailyPage() {
    const { date } = useParams<{ date: string }>();
    const navigate = useNavigate();
    const [activities, setActivities] = useState<Activity[]>([]);
    const [goals, setGoals] = useState<UnifiedGoal[]>([]);
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
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const [hasDebt, setHasDebt] = useState(false);
    const [debtCount, setDebtCount] = useState(0);
    const [booksMap, setBooksMap] = useState<Map<string, Book>>(new Map());

    const fetchData = async () => {
        if (!date) return;

        setLoading(true);
        try {
            const localDateStr = getLocalDateString();
            setIsToday(date === localDateStr);

            const now = new Date();
            const currentMinute = now.getHours() * 60 + now.getMinutes();
            setCurrentSlotIndex(Math.floor(currentMinute / 30));

            // Fetch debt for this date - match GridPage logic exactly
            try {
                // GridPage adds 1 day to query date because backend uses < not <=
                const currentDateParsed = parseGoalDate(date);
                currentDateParsed.setDate(currentDateParsed.getDate() + 1);
                const queryDate = formatGoalDate(currentDateParsed);
                
                console.log('[DAILY PAGE DEBT] Query date (date + 1):', queryDate);
                const debtGoals = await invoke<UnifiedGoal[]>('get_accumulated_debt', { date: queryDate });
                console.log('[DAILY PAGE DEBT] All debt goals:', debtGoals);
                
                // Filter: Only flag this date if debt goal has this date as original_date
                // AND exclude recurring templates (they shouldn't be debt, only instances)
                const debtForThisDate = debtGoals.filter(goal => {
                    const originalDate = goal.originalDate?.split('T')[0];
                    const isRecurringTemplate = goal.recurringPattern !== null && goal.recurringPattern !== undefined;
                    console.log('[DAILY PAGE DEBT] Comparing:', originalDate, 'with', date, 'isTemplate:', isRecurringTemplate);
                    return originalDate === date && !isRecurringTemplate;
                });
                console.log('[DAILY PAGE DEBT] Debt for this date:', debtForThisDate);
                console.log('[DAILY PAGE DEBT] Setting hasDebt:', debtForThisDate.length > 0, 'count:', debtForThisDate.length);
                setHasDebt(debtForThisDate.length > 0);
                setDebtCount(debtForThisDate.length);
            } catch (err) {
                console.error('[DAILY PAGE DEBT] Failed to fetch debt:', err);
            }

            const response = await invoke<{ activities: Activity[] }>('get_activities', { date });
            const actData = response.activities;
            setActivities(actData);

            // Fetch books for activities that have book_id
            const bookIds = [...new Set(actData.filter(a => a.bookId).map(a => a.bookId!))];
            if (bookIds.length > 0) {
                try {
                    const allBooks = await invoke<Book[]>('get_all_books');
                    const bookMap = new Map<string, Book>();
                    allBooks.forEach(book => {
                        if (bookIds.includes(book.id)) {
                            bookMap.set(book.id, book);
                        }
                    });
                    setBooksMap(bookMap);
                } catch (err) {
                    console.error('Failed to fetch books:', err);
                }
            }

            const sortedActivities = [...actData].sort((a, b) =>
                parseActivityTime(a.startTime).getTime() - parseActivityTime(b.startTime).getTime()
            );

            // Calculate metrics directly from activities without merging
            // This ensures productive/goal-directed time is calculated per activity, not per merged interval
            let total = 0;
            let productive = 0;
            let goalDirected = 0;

            const processedIntervals: Array<{ start: number; end: number }> = [];

            for (const act of sortedActivities) {
                const start = parseActivityTime(act.startTime).getTime();
                const end = parseActivityTime(act.endTime).getTime();
                const duration = (end - start) / 60000;

                // Check if this activity overlaps with any already processed interval
                let overlapDuration = 0;
                for (const processed of processedIntervals) {
                    const overlapStart = Math.max(start, processed.start);
                    const overlapEnd = Math.min(end, processed.end);
                    if (overlapStart < overlapEnd) {
                        overlapDuration += (overlapEnd - overlapStart) / 60000;
                    }
                }

                // Only count non-overlapping time
                const uniqueDuration = duration - overlapDuration;
                
                if (uniqueDuration > 0) {
                    total += uniqueDuration;
                    if (act.isProductive) productive += uniqueDuration;
                    if (act.goalIds || act.milestoneId) goalDirected += uniqueDuration;
                }

                // Add this activity to processed intervals
                processedIntervals.push({ start, end });
            }

            setMetrics({
                totalMinutes: Math.round(total),
                productiveMinutes: Math.round(productive),
                goalDirectedMinutes: Math.round(goalDirected)
            });

            const slots: GridSlot[] = Array.from({ length: 48 }, (_, i) => {
                const { start: slotStart, end: slotEnd } = getSlotBoundaries(date, i);

                const overlapping = actData.filter((activity) =>
                    activityOverlapsSlot(activity.startTime, activity.endTime, slotStart, slotEnd)
                );

                let slotBackground = 'var(--pos-slot-empty)';
                let segments: { width: number; color: string }[] | undefined;

                if (overlapping.length === 1) {
                    slotBackground = getActivityColor(overlapping[0].category);
                } else if (overlapping.length > 1) {
                    const sorted = [...overlapping].sort((a, b) =>
                        parseActivityTime(a.startTime).getTime() - parseActivityTime(b.startTime).getTime()
                    );
                    const localSegments: { width: number; color: string }[] = [];
                    let lastPct = 0;
                    const slotMs = slotStart.getTime();
                    const slotDuration = 30 * 60 * 1000;

                    sorted.forEach((act) => {
                        const startMs = Math.max(parseActivityTime(act.startTime).getTime(), slotMs);
                        const endMs = Math.min(parseActivityTime(act.endTime).getTime(), slotMs + slotDuration);
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

            // ─── UNIFIED GOALS INTEGRATION ───
            // Goals tab logic:
            // - For past dates: Show only goals CREATED on that date (by created_at), with current status
            // - For today: Show all accumulated debt + today's goals (by due_date)
            
            const today = getLocalDateString();
            const isViewingToday = date === today;
            
            let goalData: UnifiedGoal[];
            
            if (isViewingToday) {
                // Today: Show all debt + today's goals
                const { start: startOfDay, end: endOfDay } = getDayBoundariesUTC(date);
                const filters = {
                    date_range: [startOfDay, endOfDay],
                    timezone_offset: 0
                };
                const todaysGoals = await invoke<UnifiedGoal[]>('get_unified_goals', { filters });
                
                // Get all accumulated debt
                const currentDateParsed = parseGoalDate(date);
                currentDateParsed.setDate(currentDateParsed.getDate() + 1);
                const queryDate = formatGoalDate(currentDateParsed);
                const debtGoals = await invoke<UnifiedGoal[]>('get_accumulated_debt', { date: queryDate });
                
                // Combine and deduplicate, exclude recurring templates
                const allGoals = [...debtGoals, ...todaysGoals];
                const uniqueGoals = Array.from(new Map(allGoals.map(g => [g.id, g])).values());
                goalData = uniqueGoals.filter(goal => !goal.recurringPattern);
            } else {
                // Past date: Show only goals created on this date
                // createdAt is UTC timestamp, need to convert to local date for comparison
                const allGoals = await invoke<UnifiedGoal[]>('get_unified_goals', { filters: {} });
                goalData = allGoals.filter(goal => {
                    if (!goal.createdAt) return false;
                    // Exclude recurring templates
                    if (goal.recurringPattern) return false;
                    // Parse UTC timestamp and convert to local date string
                    const createdAtUTC = new Date(goal.createdAt);
                    const offset = createdAtUTC.getTimezoneOffset() * 60000;
                    const createdAtLocal = new Date(createdAtUTC.getTime() - offset);
                    const createdDate = createdAtLocal.toISOString().split('T')[0];
                    return createdDate === date;
                });
            }
            
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
                    <Loader />
                </div>
            </div>
        );
    }

    const fullyLoggedSlots = daySlots.filter((s) => s.activities.length > 0).length;
    const debtTime = 1440 - metrics.totalMinutes;

    return (
        <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'grid', href: '/pos/grid' }, { label: date ? formatISODateDDMMYYYY(date) : 'loading' }]} />
            
            {/* Day Navigation */}
            <div className="max-w-[1400px] mx-auto w-full px-4 pt-4 pb-2">
                <MonthSelector
                    mode="day"
                    value={date || getLocalDateString()}
                    onChange={(newDate) => navigate(`/pos/grid/${newDate}`)}
                />
            </div>
            
            {/* Debt Banner */}
            {hasDebt && (
                <div className="max-w-[1400px] mx-auto w-full px-4 pb-4">
                    <div 
                        className="flex items-center gap-3 px-5 py-4 rounded-lg text-base font-semibold shadow-lg"
                        style={{
                            backgroundColor: 'var(--pos-error-bg)',
                            border: '3px solid var(--pos-error-border)',
                            color: 'var(--pos-error-text)',
                        }}
                    >
                        <AlertCircle className="w-6 h-6 shrink-0" />
                        <span>⚠️ {debtCount} incomplete goal{debtCount > 1 ? 's' : ''} from this date (debt)</span>
                    </div>
                </div>
            )}

            <div className="max-w-[1400px] mx-auto space-y-4 p-4 flex-1 overflow-auto">
                {/* Stats Cards (Unchanged) */}
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
                                <CardTitle className="text-sm font-medium">
                                    {editingActivity ? 'Edit Activity' : 'Log Activity'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pb-4 px-4">
                                <LogEntryModule
                                    date={date!}
                                    onSuccess={() => {
                                        fetchData();
                                        setEditingActivity(null);
                                    }}
                                    editingActivity={editingActivity}
                                    onCancelEdit={() => setEditingActivity(null)}
                                />
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
                                        {activities.map((activity) => {
                                            const book = activity.bookId ? booksMap.get(activity.bookId) : null;
                                            
                                            return (
                                                <div
                                                    key={activity.id}
                                                    className="flex items-center gap-3 p-2 border rounded"
                                                    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                                                >
                                                    <div
                                                        className="w-2.5 h-2.5 rounded shrink-0"
                                                        style={{
                                                            backgroundColor: getActivityColor(activity.category),
                                                            border: (activity.goalIds && activity.goalIds.length > 0) || activity.milestoneId ? '2px solid var(--pos-goal-accent)' : 'none',
                                                        }}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium leading-none truncate">{activity.title}</p>
                                                        {book && (
                                                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                                                <BookOpen className="w-3 h-3" />
                                                                <span className="truncate">
                                                                    {book.title}
                                                                    {book.authors.length > 0 && ` by ${book.authors.join(', ')}`}
                                                                    {activity.pagesRead && ` • ${activity.pagesRead} pages`}
                                                                </span>
                                                            </p>
                                                        )}
                                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                                            {formatActivityTime(activity.startTime)} - {formatActivityTime(activity.endTime)}
                                                            {activity.isShadow && <span className="ml-2 font-bold" style={{ color: 'var(--pos-shadow-text)' }}>(Shadow)</span>}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {book && (
                                                            <Link to={`/books/${activity.bookId}`}>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-7 w-7 p-0"
                                                                    title="View Book History"
                                                                >
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </Button>
                                                            </Link>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 w-7 p-0"
                                                            onClick={() => setEditingActivity(activity)}
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
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
                                        {goals.map((goal) => {
                                            // Determine status: verified / pending / debt
                                            const today = getLocalDateString();
                                            const dueDate = goal.dueDate?.split('T')[0];
                                            const isDebt = goal.isDebt || (dueDate && dueDate < today && !goal.completed);
                                            
                                            let statusLabel = 'Pending';
                                            let statusBg = 'var(--muted)';
                                            let statusColor = 'var(--muted-foreground)';
                                            
                                            if (goal.verified) {
                                                statusLabel = 'Verified';
                                                statusBg = 'var(--pos-success-border)';
                                                statusColor = 'var(--pos-success-text)';
                                            } else if (isDebt) {
                                                statusLabel = 'Debt';
                                                statusBg = 'var(--pos-error-border)';
                                                statusColor = 'var(--pos-error-text)';
                                            }
                                            
                                            return (
                                            <div
                                                key={goal.id}
                                                className="border rounded p-3 transition-colors"
                                                style={{
                                                    borderColor: goal.verified ? 'var(--pos-success-border)' : isDebt ? 'var(--pos-error-border)' : 'var(--border-color)',
                                                    backgroundColor: goal.verified ? 'var(--pos-success-bg)' : isDebt ? 'var(--pos-error-bg)' : 'var(--bg-secondary)'
                                                }}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <p className="text-sm font-medium">{goal.text}</p>
                                                        {goal.description && <p className="text-xs text-muted-foreground mt-0.5">{goal.description}</p>}
                                                        {goal.problemId && (
                                                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                                                Target: {goal.problemId}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase cursor-pointer hover:opacity-80 select-none"
                                                        onClick={async () => {
                                                            try {
                                                                await invoke('update_unified_goal', {
                                                                    id: goal.id,
                                                                    req: { verified: !goal.verified }
                                                                });
                                                                fetchData();
                                                            } catch (e) {
                                                                toast.error("Failed to update goal");
                                                            }
                                                        }}
                                                        style={{
                                                            backgroundColor: statusBg,
                                                            color: statusColor
                                                        }}
                                                    >
                                                        {statusLabel}
                                                    </span>
                                                </div>
                                            </div>
                                        )})}
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
                                            const duration = getActivityDuration(activity.startTime, activity.endTime);
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
