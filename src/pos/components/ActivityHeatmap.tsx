import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import type { Activity } from '../lib/types';

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
          name: monthDate.toLocaleString('default', { month: 'short' }),
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

  const getColorClass = (level: number): string => {
    const colors = [
      'bg-gray-100 dark:bg-gray-800',
      'bg-green-200 dark:bg-yellow-900',
      'bg-green-400 dark:bg-yellow-700',
      'bg-green-600 dark:bg-yellow-500',
      'bg-green-800 dark:bg-yellow-300',
    ];
    return colors[level] || colors[0];
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
      <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
        <CardContent className="pt-6">
          <div className="text-center py-12 text-muted-foreground">Loading heatmap...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Activity Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--pos-success-text)' }}>{streakData.current}</div>
              <div className="text-xs text-muted-foreground">Current Streak</div>
            </div>
            <div className="text-center p-3 rounded border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--pos-warning-text)' }}>{streakData.longest}</div>
              <div className="text-xs text-muted-foreground">Longest Streak</div>
            </div>
            <div className="text-center p-3 rounded border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--pos-info-text)' }}>{streakData.total}</div>
              <div className="text-xs text-muted-foreground">Total Days</div>
            </div>
          </div>

          {/* Heatmap Grid */}
          <div className="w-full overflow-x-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-w-fit mx-auto">
              {monthsData.map((month, monthIndex) => {
                const columns = chunkedDays(month.days, 7);
                return (
                  <div key={`${month.name}-${monthIndex}`} className="flex flex-col">
                    <div className="text-sm font-medium mb-2">{month.name}</div>
                    <div className="flex gap-1">
                      {columns.map((column, colIndex) => (
                        <div key={`col-${monthIndex}-${colIndex}`} className="flex flex-col gap-1">
                          {column.map((day, dayIndex) => (
                            <div
                              key={`${day.date}-${dayIndex}`}
                              className={`w-3 h-3 rounded transition-colors hover:ring-1 hover:ring-gray-400 dark:hover:ring-gray-500 ${getColorClass(day.level)}`}
                              title={`${day.date}: ${day.count} ${day.count === 1 ? 'activity' : 'activities'}`}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map(level => (
              <div key={level} className={`w-3 h-3 rounded ${getColorClass(level)}`} />
            ))}
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
