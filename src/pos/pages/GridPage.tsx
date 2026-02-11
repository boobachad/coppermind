import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SlotPopup } from '../components/SlotPopup';
import { Navbar } from '../components/Navbar';
import type { Activity } from '../lib/types';
import { getActivityColor } from '../lib/config';
import { formatDateDDMMYYYY, formatSlotTime, getDayName, getLocalDateString } from '../lib/time';
import { toast } from 'sonner';
import { getDb } from '../../lib/db';

interface GridSlot {
    slotIndex: number;
    activities: Activity[];
    totalCoverage: number;
    color: string;
    segments?: { width: number; color: string }[];
}

function getMonthDates(year: number, month: number): string[] {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates: string[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        const offset = d.getTimezoneOffset() * 60000;
        const localDate = new Date(d.getTime() - offset);
        dates.push(localDate.toISOString().split('T')[0]);
    }
    return dates;
}

export function GridPage() {
    const todayRef = useRef<HTMLTableRowElement>(null);
    const currentSlotRef = useRef<HTMLTableCellElement>(null);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });

    const [dates, setDates] = useState<string[]>([]);
    const [gridData, setGridData] = useState<Map<string, GridSlot[]>>(new Map());
    const [loading, setLoading] = useState(true);
    const [selectedSlot, setSelectedSlot] = useState<{ date: string; slot: number } | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const [todayStr, setTodayStr] = useState('');
    const [currentSlotIndex, setCurrentSlotIndex] = useState(-1);
    const [availableMonths, setAvailableMonths] = useState<{ year: number; month: number; label: string }[]>([]);
    const [journalEntries, setJournalEntries] = useState<Set<string>>(new Set());

    useEffect(() => {
        setTodayStr(getLocalDateString());
        const now = new Date();
        const currentMinute = now.getHours() * 60 + now.getMinutes();
        setCurrentSlotIndex(Math.floor(currentMinute / 30));
    }, []);

    useEffect(() => {
        if (!loading && todayRef.current && currentSlotRef.current) {
            // Scroll to center both row and column
            todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            currentSlotRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [loading]);

    useEffect(() => {
        const months = Array.from({ length: 12 }, (_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            return {
                year: d.getFullYear(),
                month: d.getMonth(),
                label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
            };
        });
        setAvailableMonths(months);
    }, []);

    useEffect(() => {
        const newDates = getMonthDates(currentMonth.year, currentMonth.month);
        setDates(newDates);
    }, [currentMonth]);

    useEffect(() => {
        if (dates.length > 0) {
            fetchAllData();
        }
    }, [dates]);

    const fetchAllData = async () => {
        setLoading(true);
        const dataMap = new Map<string, GridSlot[]>();

        try {
            // Batch fetch journal entries (O(1) query)
            // Entry counts only if it has: (expected OR actual schedule) AND reflection text
            const db = await getDb();
            const journalRows = await db.select<any[]>(
                `SELECT date FROM journal_entries 
                 WHERE date IN (${dates.map(() => '?').join(',')})
                 AND reflection_text != ''
                 AND (
                     (expected_schedule_image != '' OR expected_schedule_data IS NOT NULL)
                     OR (actual_schedule_image != '' OR actual_schedule_data IS NOT NULL)
                 )`,
                dates
            );
            const journalDates = new Set(journalRows.map(r => r.date));
            setJournalEntries(journalDates);

            // Batch fetch all activities in one query (O(1) round trips instead of O(n))
            const batchResponse = await invoke<Record<string, { activities: Activity[] }>>('get_activities_batch', { dates });

            dates.forEach((date) => {
                const response = batchResponse[date];
                const activities = response?.activities || [];

                const slots: GridSlot[] = Array.from({ length: 48 }, (_, i) => {
                    const [year, month, day] = date.split('-').map(Number);
                    const slotStart = new Date(year, month - 1, day);
                    slotStart.setMinutes(i * 30);
                    const slotEnd = new Date(slotStart);
                    slotEnd.setMinutes(slotEnd.getMinutes() + 30);

                    const overlapping = activities.filter((activity: Activity) => {
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

                    return {
                        slotIndex: i,
                        activities: overlapping,
                        totalCoverage: overlapping.length > 0 ? 100 : 0,
                        color: slotBackground,
                        segments
                    };
                });

                dataMap.set(date, slots);
            });

            setGridData(dataMap);
        } catch (err) {
            toast.error('Failed to fetch grid data', { description: String(err) });
        } finally {
            setLoading(false);
        }
    };

    const handleMonthChange = (value: string) => {
        const [year, month] = value.split('-').map(Number);
        setCurrentMonth({ year, month });
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'grid' }]} />
                <div className="flex-1 flex items-center justify-center">
                    <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                        <CardContent className="pt-6">
                            <div className="text-center py-12 text-muted-foreground">Loading grid...</div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'grid' }]} />
            <div className="flex-1 overflow-auto">
                <div className="max-w-[1800px] mx-auto space-y-6 p-8">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold tracking-tight">Life Grid</h1>
                        <Select
                            value={`${currentMonth.year}-${currentMonth.month}`}
                            onValueChange={handleMonthChange}
                        >
                            <SelectTrigger className="w-[180px] h-8 text-xs border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border">
                                {availableMonths.map((m) => (
                                <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`} className="text-xs">
                                    {m.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <div className="overflow-auto max-h-[calc(100vh-140px)]">
                        <table className="w-full border-separate border-spacing-1 text-xs">
                            <thead className="sticky top-0 z-20 shadow-md" style={{ backgroundColor: 'var(--bg-primary)' }}>
                                <tr>
                                    <th className="sticky left-0 p-2 text-left min-w-[120px] z-30 text-muted-foreground border-b border-border" style={{ backgroundColor: 'var(--bg-primary)' }}>
                                        Date
                                    </th>
                                    {Array.from({ length: 48 }, (_, i) => {
                                        const isCurrentSlot = i === currentSlotIndex;
                                        return (
                                            <th
                                                key={i}
                                                className="p-1 text-center min-w-[32px] text-[10px] font-mono border-b border-border"
                                                style={{
                                                    color: isCurrentSlot ? 'var(--pos-today-text)' : 'var(--text-secondary)',
                                                    fontWeight: isCurrentSlot ? 'bold' : 'medium',
                                                    backgroundColor: isCurrentSlot ? 'var(--pos-today-bg)' : 'transparent'
                                                }}
                                                title={formatSlotTime(i)}
                                            >
                                                {formatSlotTime(i)}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {dates.map((date) => {
                                    const daySlots = gridData.get(date) || [];
                                    const isToday = date === todayStr;

                                    return (
                                        <tr
                                            key={date}
                                            ref={isToday ? todayRef : null}
                                            className="group"
                                            style={{ backgroundColor: isToday ? 'var(--pos-today-bg)' : 'transparent' }}
                                        >
                                            <td className="sticky left-0 p-0 z-10" style={{
                                                backgroundColor: isToday ? 'var(--pos-today-bg)' : 'var(--bg-primary)',
                                                borderRightWidth: isToday ? '2px' : '0',
                                                borderRightColor: isToday ? 'var(--pos-today-border)' : 'transparent'
                                            }}>
                                                <Link
                                                    to={`/pos/grid/${date}`}
                                                    className="block p-2 font-mono text-xs hover:opacity-80 transition-colors rounded-md mr-2"
                                                    style={{ color: isToday ? 'var(--pos-today-text)' : 'inherit', fontWeight: isToday ? 'bold' : 'normal' }}
                                                    title="Click to view day details"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div>
                                                            <div className="font-medium">{formatDateDDMMYYYY(new Date(date))}</div>
                                                            <div className="text-[10px]" style={{ color: isToday ? 'var(--pos-today-text)' : 'var(--text-secondary)' }}>
                                                                {getDayName(date)}
                                                            </div>
                                                        </div>
                                                        {journalEntries.has(date) && (
                                                            <div 
                                                                className="w-2 h-2 rounded-full shrink-0" 
                                                                style={{ backgroundColor: 'var(--pos-success-text)' }}
                                                                title="Journal entry exists"
                                                            />
                                                        )}
                                                    </div>
                                                </Link>
                                            </td>
                                            {daySlots.map((slot) => {
                                                const isCurrentTimeSlot = isToday && slot.slotIndex === currentSlotIndex;

                                                return (
                                                    <td
                                                        key={slot.slotIndex}
                                                        ref={isCurrentTimeSlot ? currentSlotRef : null}
                                                        className="w-8 h-8 cursor-pointer transition-all relative group/cell rounded-[4px]"
                                                        style={{
                                                            background: slot.segments 
                                                                ? 'transparent' 
                                                                : (isCurrentTimeSlot && slot.activities.length === 0 ? 'transparent' : slot.color),
                                                            boxShadow: isCurrentTimeSlot ? '0 0 0 2px var(--bg-primary), 0 0 0 4px var(--pos-today-border)' : undefined
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!isCurrentTimeSlot) {
                                                                e.currentTarget.style.boxShadow = '0 0 0 2px var(--pos-today-border)';
                                                            }
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isCurrentTimeSlot) {
                                                                e.currentTarget.style.boxShadow = '';
                                                            }
                                                        }}
                                                        onClick={() => {
                                                            setSelectedSlot({ date, slot: slot.slotIndex });
                                                            setShowPopup(true);
                                                        }}
                                                    >
                                                        {slot.segments && (
                                                            <div className="absolute inset-0 flex overflow-hidden rounded-[4px]">
                                                                {slot.segments.map((seg, idx) => (
                                                                    <div key={idx} style={{ width: `${seg.width}%`, background: seg.color }} className="h-full" />
                                                                ))}
                                                            </div>
                                                        )}
                                                        {slot.activities.length > 0 && (
                                                            <div className="hidden group-hover/cell:block absolute z-20 -top-8 left-1/2 -translate-x-1/2 backdrop-blur border text-foreground text-[10px] px-2 py-1 rounded-md whitespace-nowrap pointer-events-none shadow-xl" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                                                                {slot.activities.length} activity{slot.activities.length > 1 ? 'ies' : ''}
                                                            </div>
                                                        )}
                                                        {isCurrentTimeSlot && (
                                                            <div className="absolute inset-0 rounded-[4px] pointer-events-none" style={{ backgroundColor: 'var(--pos-today-bg)' }} />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                </div>
            </div>

            {selectedSlot && (
                <SlotPopup
                    open={showPopup}
                    onClose={() => setShowPopup(false)}
                    date={selectedSlot.date}
                    slotIndex={selectedSlot.slot}
                />
            )}
        </div>
    );
}
