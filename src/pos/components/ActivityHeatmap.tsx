import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader } from '@/components/Loader';
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

export function ActivityHeatmap() {
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);
  const [streakData, setStreakData] = useState<StreakData>({ current: 0, longest: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<HeatmapData | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPosition>({ x: 0, y: 0 });
  const heatmapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHeatmapData();
  }, []);

  const fetchHeatmapData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 11);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

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
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let totalDays = 0;

    for (let i = 0; i < data.length; i++) {
      if (data[i].count > 0) {
        tempStreak++;
        totalDays++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].count > 0) {
        currentStreak++;
      } else {
        break;
      }
    }

    return { current: currentStreak, longest: longestStreak, total: totalDays };
  };

  const getHeatmapStyle = (level: number): React.CSSProperties => {
    if (level === 0) {
      return {
        backgroundColor: 'var(--surface-tertiary)',
        opacity: 0.4
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
                                  : isHovered 
                                    ? '0 4px 12px rgba(0,0,0,0.3)' 
                                    : 'none',
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
        {hoveredDay && (
          <div 
            className="absolute px-4 py-2 rounded-lg shadow-2xl whitespace-nowrap z-20 pointer-events-none backdrop-blur-sm"
            style={{ 
              backgroundColor: 'var(--surface-secondary)',
              border: '2px solid var(--border-primary)',
              left: `${tooltipPos.x}px`,
              top: `${tooltipPos.y - 60}px`,
              transform: 'translateX(-50%)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
          >
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {hoveredDay.date}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {hoveredDay.count} {hoveredDay.count === 1 ? 'activity' : 'activities'}
            </div>
          </div>
        )}
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
