import { useState, useEffect } from 'react';
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

export function ActivityHeatmap() {
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);
  const [streakData, setStreakData] = useState<StreakData>({ current: 0, longest: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHeatmapData();
  }, []);

  const fetchHeatmapData = async () => {
    setLoading(true);
    try {
      // Get last 12 months
      const now = new Date();
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 11);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      // Generate all dates
      const allDates: string[] = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const offset = currentDate.getTimezoneOffset() * 60000;
        const localDate = new Date(currentDate.getTime() - offset);
        allDates.push(localDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Batch fetch activities
      const batchResponse = await invoke<Record<string, { activities: Activity[] }>>('get_activities_batch', { dates: allDates });

      // Build activity map
      const activityMap = new Map<string, number>();
      allDates.forEach(date => {
        const activities = batchResponse[date]?.activities || [];
        activityMap.set(date, activities.length);
      });

      // Build months structure
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

      // Calculate streaks
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

    // Calculate longest streak
    for (let i = 0; i < data.length; i++) {
      if (data[i].count > 0) {
        tempStreak++;
        totalDays++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    // Calculate current streak from today backwards
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
        backgroundColor: 'var(--glass-border)', // Use glass border as "empty" state
        opacity: 0.3
      };
    }
    return {
      backgroundColor: `var(--pos-heatmap-level-${level})`,
      boxShadow: '0 0 4px 0 var(--color-shadow-subtle)'
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
      <div className="flex justify-center py-12 w-full h-full items-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Stats Cards - Integrated into Glass Theme */}
      <div className="grid grid-cols-3 gap-3 w-full">
        <div className="flex flex-col items-center justify-center py-3 px-2 rounded-lg material-glass-subtle border-(--glass-border) shadow-sm">
          <span className="text-2xl font-bold text-(--pos-success-text) tabular-nums leading-none mb-1">{streakData.current}</span>
          <span className="text-[10px] font-medium text-(--text-secondary) uppercase tracking-widest">Current Streak</span>
        </div>
        <div className="flex flex-col items-center justify-center py-3 px-2 rounded-lg material-glass-subtle border-(--glass-border) shadow-sm">
          <span className="text-2xl font-bold text-(--pos-warning-text) tabular-nums leading-none mb-1">{streakData.longest}</span>
          <span className="text-[10px] font-medium text-(--text-secondary) uppercase tracking-widest">Longest Streak</span>
        </div>
        <div className="flex flex-col items-center justify-center py-3 px-2 rounded-lg material-glass-subtle border-(--glass-border) shadow-sm">
          <span className="text-2xl font-bold text-(--pos-info-text) tabular-nums leading-none mb-1">{streakData.total}</span>
          <span className="text-[10px] font-medium text-(--text-secondary) uppercase tracking-widest">Total Days</span>
        </div>
      </div>

      {/* Heatmap Visualization */}
      <div className="w-full flex justify-center py-2">
        <div className="grid grid-flow-col gap-6 auto-cols-max overflow-x-auto custom-scrollbar pb-4 px-2">
          {monthsData.map((month, monthIndex) => {
            const columns = chunkedDays(month.days, 7);
            const todayStr = getLocalDateString();
            return (
              <div key={`${month.name}-${monthIndex}`} className="flex flex-col gap-1">
                <div className="text-[10px] uppercase font-bold text-(--text-tertiary) mb-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">{month.name}</div>
                <div className="flex gap-1">
                  {columns.map((column, colIndex) => (
                    <div key={`col-${monthIndex}-${colIndex}`} className="flex flex-col gap-1">
                      {column.map((day, dayIndex) => {
                        const isToday = day.date === todayStr;
                        return (
                          <div
                            key={`${day.date}-${dayIndex}`}
                            className={`w-3 h-3 transition-opacity duration-200 ${day.level > 0 ? 'hover:opacity-80' : 'hover:bg-(--glass-border)'} ${isToday ? 'ring-1 ring-(--glass-text) z-10' : ''}`}
                            style={{
                              ...getHeatmapStyle(day.level),
                              borderRadius: '1px', // Slightly rounded but mostly square
                            }}
                            title={`${day.date}: ${day.count} ${day.count === 1 ? 'activity' : 'activities'}`}
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

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 text-[10px] text-(--text-tertiary) mt-1 px-4">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-3 h-3" style={{ ...getHeatmapStyle(0), borderRadius: '1px' }} />
          {[1, 2, 3, 4].map(level => (
            <div key={level} className="w-3 h-3" style={{ ...getHeatmapStyle(level), borderRadius: '1px' }} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
