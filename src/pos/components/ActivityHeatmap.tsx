import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader } from '@/components/Loader';
import { Tooltip } from '@/components/ui/Tooltip';
import { toast } from 'sonner';
import type { Activity } from '../lib/types';
import { getLocalDateString, getMonthShort } from '../lib/time';

interface HeatmapData {
  date: string;
  count: number;
  level: number;
}

interface StreakData {
  current: number;
  longest: number;
  total: number;
}

interface MonthData {
  name: string;
  days: HeatmapData[];
}

interface TooltipPosition {
  x: number;
  y: number;
}

interface ActivityHeatmapProps {
  year?: number;
}

export function ActivityHeatmap({ year }: ActivityHeatmapProps = {}) {
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);
  const [streakData, setStreakData] = useState<StreakData>({ current: 0, longest: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<HeatmapData | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ x: 0, y: 0 });
  const heatmapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHeatmapData();
  }, [year]);

  const fetchHeatmapData = async () => {
    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      if (year !== undefined) {
        // Scope to the full calendar year
        startDate = new Date(year, 0, 1, 0, 0, 0, 0);
        endDate = new Date(year, 11, 31, 23, 59, 59, 999);
      } else {
        // Rolling 12-month window
        const now = new Date();
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 11);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
      }

      const allDates: string[] = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const offset = currentDate.getTimezoneOffset() * 60000;
        const localDate = new Date(currentDate.getTime() - offset);
        allDates.push(localDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const batchResponse = await invoke<Record<string, { activities: Activity[] }>>('get_activities_batch', { dates: allDates });

      const activityMap = new Map<string, number>();
      allDates.forEach(date => {
        const activities = batchResponse[date]?.activities || [];
        activityMap.set(date, activities.length);
      });

      const months: MonthData[] = [];
      const monthDate = new Date(startDate);

      while (monthDate <= endDate) {
        const year = monthDate.getFullYear();
        const month = monthDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const monthDays: HeatmapData[] = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dayDate = new Date(year, month, day);
          const offset = dayDate.getTimezoneOffset() * 60000;
          const localDate = new Date(dayDate.getTime() - offset);
          const dateStr = localDate.toISOString().split('T')[0];

          const count = activityMap.get(dateStr) || 0;
          let level = 0;
          if (count > 0) level = 1;
          if (count >= 4) level = 2;
          if (count >= 7) level = 3;
          if (count >= 11) level = 4;

          monthDays.push({ date: dateStr, count, level });
        }

        months.push({
          name: getMonthShort(monthDate),
          days: monthDays,
        });

        monthDate.setMonth(monthDate.getMonth() + 1);
      }

      setMonthsData(months);

      const flatData = months.flatMap(m => m.days);
      const streaks = calculateStreaks(flatData);
      setStreakData(streaks);
    } catch (error) {
      toast.error('Failed to load heatmap', { description: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const calculateStreaks = (data: HeatmapData[]): StreakData => {
    // Filter to only dates with activities, sorted chronologically
    const activeDates = data
      .filter(d => d.count > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (activeDates.length === 0) {
      return { current: 0, longest: 0, total: 0 };
    }

    let currentStreak = 1; // Start at 1 if we have at least one active day
    let longestStreak = 1;
    let tempStreak = 1;

    // Calculate longest streak by checking consecutive dates
    for (let i = 1; i < activeDates.length; i++) {
      const prevDate = new Date(activeDates[i - 1].date);
      const currDate = new Date(activeDates[i].date);
      const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / 86400000);

      if (daysDiff === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }

    // Calculate current streak by checking backwards from most recent date
    currentStreak = 1;
    for (let i = activeDates.length - 2; i >= 0; i--) {
      const currDate = new Date(activeDates[i].date);
      const nextDate = new Date(activeDates[i + 1].date);
      const daysDiff = Math.round((nextDate.getTime() - currDate.getTime()) / 86400000);

      if (daysDiff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }

    return { current: currentStreak, longest: longestStreak, total: activeDates.length };
  };

  const getHeatmapStyle = (level: number): React.CSSProperties => {
    if (level === 0) {
      return {
        backgroundColor: 'var(--glass-bg-subtle)',
        border: '1px solid var(--glass-border)',
      };
    }
    return {
      backgroundColor: `var(--pos-heatmap-level-${level})`,
    };
  };

  const chunkedDays = (days: HeatmapData[], size: number): HeatmapData[][] => {
    const chunks: HeatmapData[][] = [];
    for (let i = 0; i < days.length; i += size) {
      chunks.push(days.slice(i, i + size));
    }
    return chunks;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16 w-full h-full items-center">
        <Loader />
      </div>
    );
  }

  const todayStr = getLocalDateString();

  return (
    <div className="w-full space-y-6">
      {/* Streak Stats - Redesigned */}
      <div className="grid grid-cols-3 gap-4">
        <div className="relative overflow-hidden rounded-xl p-6" style={{ backgroundColor: 'var(--surface-secondary)' }}>
          <div className="relative z-10">
            <div className="text-4xl font-bold mb-1" style={{ color: 'var(--color-success)' }}>
              {streakData.current}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Current Streak
            </div>
          </div>
          <div 
            className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20"
            style={{ backgroundColor: 'var(--color-success)' }}
          />
        </div>

        <div className="relative overflow-hidden rounded-xl p-6" style={{ backgroundColor: 'var(--surface-secondary)' }}>
          <div className="relative z-10">
            <div className="text-4xl font-bold mb-1" style={{ color: 'var(--color-warning)' }}>
              {streakData.longest}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Longest Streak
            </div>
          </div>
          <div 
            className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20"
            style={{ backgroundColor: 'var(--color-warning)' }}
          />
        </div>

        <div className="relative overflow-hidden rounded-xl p-6" style={{ backgroundColor: 'var(--surface-secondary)' }}>
          <div className="relative z-10">
            <div className="text-4xl font-bold mb-1" style={{ color: 'var(--color-info)' }}>
              {streakData.total}
            </div>
            <div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Active Days
            </div>
          </div>
          <div 
            className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20"
            style={{ backgroundColor: 'var(--color-info)' }}
          />
        </div>
      </div>

      {/* Heatmap - Redesigned with larger cells */}
      <div className="relative" ref={heatmapRef}>
        <div className="overflow-x-auto custom-scrollbar pb-4">
          <div className="inline-flex gap-2 min-w-full justify-center px-4">
            {monthsData.map((month, monthIndex) => {
              const columns = chunkedDays(month.days, 7);
              return (
                <div key={`${month.name}-${monthIndex}`} className="flex flex-col gap-2">
                  <div 
                    className="text-xs font-bold uppercase tracking-wider text-center mb-1"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {month.name}
                  </div>
                  <div className="flex gap-1.5">
                    {columns.map((column, colIndex) => (
                      <div key={`col-${monthIndex}-${colIndex}`} className="flex flex-col gap-1.5">
                        {column.map((day, dayIndex) => {
                          const isToday = day.date === todayStr;
                          const isHovered = hoveredDay?.date === day.date;
                          return (
                            <div
                              key={`${day.date}-${dayIndex}`}
                              className="w-4 h-4 rounded transition-all duration-200 cursor-pointer"
                              style={{
                                ...getHeatmapStyle(day.level),
                                transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                                boxShadow: isToday 
                                  ? '0 0 0 2px var(--text-primary)' 
                                  : 'none',
                                filter: isHovered ? 'brightness(1.2)' : 'none',
                                zIndex: isHovered ? 10 : isToday ? 5 : 1
                              }}
                              onMouseEnter={(e) => {
                                setHoveredDay(day);
                                const rect = e.currentTarget.getBoundingClientRect();
                                const containerRect = heatmapRef.current?.getBoundingClientRect();
                                if (containerRect) {
                                  setTooltipPos({
                                    x: rect.left - containerRect.left + rect.width / 2,
                                    y: rect.top - containerRect.top
                                  });
                                }
                              }}
                              onMouseLeave={() => setHoveredDay(null)}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hover Tooltip */}
        <Tooltip 
          x={tooltipPos.x} 
          y={tooltipPos.y - 60} 
          visible={!!hoveredDay}
        >
          {hoveredDay && (
            <>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {hoveredDay.date}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {hoveredDay.count} {hoveredDay.count === 1 ? 'activity' : 'activities'}
              </div>
            </>
          )}
        </Tooltip>
      </div>

      {/* Legend - Redesigned */}
      <div className="flex items-center justify-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span className="uppercase tracking-wider">Less</span>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map(level => (
            <div 
              key={level} 
              className="w-4 h-4 rounded" 
              style={getHeatmapStyle(level)} 
            />
          ))}
        </div>
        <span className="uppercase tracking-wider">More</span>
      </div>
    </div>
  );
}
