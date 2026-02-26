import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Navbar } from '../components/Navbar';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { Loader } from '../../components/Loader';
import { TrendingUp, TrendingDown, Activity as ActivityIcon, Target, Code2, Zap } from 'lucide-react';
import type { Activity, Submission, Milestone } from '../lib/types';

interface WeeklyTrend {
  week: string;
  totalMinutes: number;
  productiveMinutes: number;
  activities: number;
  change: number;
}

interface CategoryBreakdown {
  category: string;
  minutes: number;
  percentage: number;
  color: string;
}

export function HomePage() {
  const [loading, setLoading] = useState(true);
  const [weeklyTrends, setWeeklyTrends] = useState<WeeklyTrend[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [activeMilestones, setActiveMilestones] = useState<Milestone[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);
  const [totalStats, setTotalStats] = useState({ totalTime: 0, productiveTime: 0, activitiesCount: 0 });

  useEffect(() => {
    loadDashboardAnalytics();
  }, []);

  const loadDashboardAnalytics = async () => {
    setLoading(true);
    try {
      const dates = getLast30Days();
      const batchResponse = await invoke<Record<string, { activities: Activity[] }>>('get_activities_batch', { dates });
      
      const trends = calculateWeeklyTrends(batchResponse, dates);
      setWeeklyTrends(trends);

      const breakdown = calculateCategoryBreakdown(batchResponse);
      setCategoryBreakdown(breakdown);

      const stats = calculateTotalStats(batchResponse);
      setTotalStats(stats);

      const milestonesData = await invoke<Milestone[]>('get_milestones', { activeOnly: true }).catch(() => []);
      setActiveMilestones(milestonesData);

      const submissionsData = await invoke<Submission[]>('get_recent_submissions', { limit: 10 }).catch(() => []);
      setRecentSubmissions(submissionsData);

    } catch (err) {
      console.error('Dashboard analytics error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getLast30Days = (): string[] => {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const offset = date.getTimezoneOffset() * 60000;
      const localDate = new Date(date.getTime() - offset);
      dates.push(localDate.toISOString().split('T')[0]);
    }
    return dates;
  };

  const calculateWeeklyTrends = (batchData: Record<string, { activities: Activity[] }>, dates: string[]): WeeklyTrend[] => {
    const weeks: WeeklyTrend[] = [];
    const weeksCount = 4;
    const daysPerWeek = 7;

    // Build weeks in chronological order (oldest to newest)
    for (let w = 0; w < weeksCount; w++) {
      const weekDates = dates.slice(w * daysPerWeek, (w + 1) * daysPerWeek);
      let totalMinutes = 0;
      let productiveMinutes = 0;
      let activitiesCount = 0;

      weekDates.forEach(date => {
        const activities = batchData[date]?.activities || [];
        activitiesCount += activities.length;
        activities.forEach(act => {
          const duration = (new Date(act.endTime).getTime() - new Date(act.startTime).getTime()) / 60000;
          totalMinutes += duration;
          if (act.isProductive) productiveMinutes += duration;
        });
      });

      weeks.push({
        week: `Week ${w + 1}`,
        totalMinutes: Math.round(totalMinutes),
        productiveMinutes: Math.round(productiveMinutes),
        activities: activitiesCount,
        change: 0
      });
    }

    // Calculate change percentage in chronological order (compare to previous week)
    for (let i = 1; i < weeks.length; i++) {
      const current = weeks[i].totalMinutes;
      const previous = weeks[i - 1].totalMinutes;
      weeks[i].change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
    }

    // Reverse to show most recent first and fix labels
    const reversed = weeks.reverse();
    reversed.forEach((week, idx) => {
      week.week = `Week ${reversed.length - idx}`;
    });

    return reversed;
  };

  const calculateCategoryBreakdown = (batchData: Record<string, { activities: Activity[] }>): CategoryBreakdown[] => {
    const categoryMap = new Map<string, number>();
    let totalMinutes = 0;

    Object.values(batchData).forEach(({ activities }) => {
      activities.forEach(act => {
        const duration = (new Date(act.endTime).getTime() - new Date(act.startTime).getTime()) / 60000;
        categoryMap.set(act.category, (categoryMap.get(act.category) || 0) + duration);
        totalMinutes += duration;
      });
    });

    const breakdown: CategoryBreakdown[] = [];
    categoryMap.forEach((minutes, category) => {
      breakdown.push({
        category,
        minutes: Math.round(minutes),
        percentage: totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0,
        color: `var(--pos-${category.toLowerCase()})`
      });
    });

    return breakdown.sort((a, b) => b.minutes - a.minutes).slice(0, 5);
  };

  const calculateTotalStats = (batchData: Record<string, { activities: Activity[] }>) => {
    let totalTime = 0;
    let productiveTime = 0;
    let activitiesCount = 0;

    Object.values(batchData).forEach(({ activities }) => {
      activitiesCount += activities.length;
      activities.forEach(act => {
        const duration = (new Date(act.endTime).getTime() - new Date(act.startTime).getTime()) / 60000;
        totalTime += duration;
        if (act.isProductive) productiveTime += duration;
      });
    });

    return {
      totalTime: Math.round(totalTime),
      productiveTime: Math.round(productiveTime),
      activitiesCount
    };
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div className="px-6 py-4">
          <Navbar breadcrumbItems={[{ label: 'Analytics' }]} />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader />
        </div>
      </div>
    );
  }

  const productivityRate = totalStats.totalTime > 0 ? Math.round((totalStats.productiveTime / totalStats.totalTime) * 100) : 0;

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
        <Navbar breadcrumbItems={[{ label: 'Analytics' }]} />
      </div>

      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-[1800px] mx-auto p-6 space-y-6">

          {/* Hero Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="relative overflow-hidden rounded-2xl p-8"
              style={{ backgroundColor: 'var(--surface-secondary)' }}
            >
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-info)', opacity: 0.2 }}>
                    <ActivityIcon className="w-6 h-6" style={{ color: 'var(--color-info)' }} />
                  </div>
                  <span className="text-sm uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Total Time
                  </span>
                </div>
                <div className="text-5xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {Math.floor(totalStats.totalTime / 60)}h
                </div>
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {totalStats.activitiesCount} activities logged
                </div>
              </div>
              <div 
                className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full blur-3xl opacity-10"
                style={{ backgroundColor: 'var(--color-info)' }}
              />
            </div>

            <div 
              className="relative overflow-hidden rounded-2xl p-8"
              style={{ backgroundColor: 'var(--surface-secondary)' }}
            >
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-success)', opacity: 0.2 }}>
                    <Zap className="w-6 h-6" style={{ color: 'var(--color-success)' }} />
                  </div>
                  <span className="text-sm uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Productive
                  </span>
                </div>
                <div className="text-5xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {productivityRate}%
                </div>
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {Math.floor(totalStats.productiveTime / 60)}h productive time
                </div>
              </div>
              <div 
                className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full blur-3xl opacity-10"
                style={{ backgroundColor: 'var(--color-success)' }}
              />
            </div>

            <div 
              className="relative overflow-hidden rounded-2xl p-8"
              style={{ backgroundColor: 'var(--surface-secondary)' }}
            >
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--color-warning)', opacity: 0.2 }}>
                    <Target className="w-6 h-6" style={{ color: 'var(--color-warning)' }} />
                  </div>
                  <span className="text-sm uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                    Milestones
                  </span>
                </div>
                <div className="text-5xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {activeMilestones.length}
                </div>
                <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Active tracking goals
                </div>
              </div>
              <div 
                className="absolute -bottom-8 -right-8 w-40 h-40 rounded-full blur-3xl opacity-10"
                style={{ backgroundColor: 'var(--color-warning)' }}
              />
            </div>
          </div>

          {/* Activity Heatmap */}
          <div 
            className="rounded-2xl p-8 border"
            style={{ 
              backgroundColor: 'var(--surface-secondary)',
              borderColor: 'var(--border-primary)'
            }}
          >
            <ActivityHeatmap />
          </div>

          {/* Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Weekly Trends */}
            <div 
              className="rounded-2xl p-6 border"
              style={{ 
                backgroundColor: 'var(--surface-secondary)',
                borderColor: 'var(--border-primary)'
              }}
            >
              <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Weekly Performance
              </h2>
              <div className="space-y-4">
                {weeklyTrends.map((week, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {week.week}
                        </span>
                        {week.change !== 0 && (
                          <div 
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                            style={{ 
                              backgroundColor: week.change > 0 ? 'var(--color-success)' : 'var(--color-error)',
                              color: 'white',
                              opacity: 0.9
                            }}
                          >
                            {week.change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(week.change)}%
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        {week.totalMinutes}m
                      </span>
                    </div>
                    <div className="relative h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-tertiary)' }}>
                      <div 
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${week.totalMinutes > 0 ? (week.productiveMinutes / week.totalMinutes) * 100 : 0}%`,
                          backgroundColor: 'var(--color-success)'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Category Breakdown */}
            <div 
              className="rounded-2xl p-6 border"
              style={{ 
                backgroundColor: 'var(--surface-secondary)',
                borderColor: 'var(--border-primary)'
              }}
            >
              <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Time Distribution
              </h2>
              <div className="space-y-4">
                {categoryBreakdown.map((cat, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium capitalize" style={{ color: 'var(--text-secondary)' }}>
                        {cat.category.replace('_', ' ')}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {cat.minutes}m
                        </span>
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                          {cat.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-tertiary)' }}>
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${cat.percentage}%`,
                          backgroundColor: cat.color
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Milestones & Submissions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Milestones */}
            {activeMilestones.length > 0 && (
              <div 
                className="rounded-2xl p-6 border"
                style={{ 
                  backgroundColor: 'var(--surface-secondary)',
                  borderColor: 'var(--border-primary)'
                }}
              >
                <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                  Milestone Tracker
                </h2>
                <div className="space-y-4">
                  {activeMilestones.slice(0, 4).map(milestone => {
                    const progress = (milestone.currentValue / milestone.targetValue) * 100;
                    const daysElapsed = Math.floor((Date.now() - new Date(milestone.periodStart).getTime()) / 86400000);
                    const expectedProgress = (milestone.dailyAmount * daysElapsed / milestone.targetValue) * 100;
                    const isOnTrack = progress >= expectedProgress;

                    return (
                      <div key={milestone.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {milestone.targetMetric}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                              {milestone.currentValue}/{milestone.targetValue}
                            </span>
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: isOnTrack ? 'var(--color-success)' : 'var(--color-warning)' }}
                            />
                          </div>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-tertiary)' }}>
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${Math.min(progress, 100)}%`,
                              backgroundColor: isOnTrack ? 'var(--color-success)' : 'var(--color-warning)'
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Submissions */}
            {recentSubmissions.length > 0 && (
              <div 
                className="rounded-2xl p-6 border"
                style={{ 
                  backgroundColor: 'var(--surface-secondary)',
                  borderColor: 'var(--border-primary)'
                }}
              >
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Code2 className="w-5 h-5" />
                  Recent Submissions
                </h2>
                <div className="space-y-2">
                  {recentSubmissions.slice(0, 5).map(sub => (
                    <div 
                      key={sub.id}
                      className="flex items-center justify-between p-3 rounded-lg transition-colors hover:opacity-80"
                      style={{ backgroundColor: 'var(--surface-tertiary)' }}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {sub.problemTitle}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {sub.platform} • {sub.language}
                        </p>
                      </div>
                      <div 
                        className="px-3 py-1 rounded-full text-xs font-medium"
                        style={{ 
                          backgroundColor: sub.verdict === 'OK' ? 'var(--color-success)' : 'var(--color-error)',
                          color: 'white'
                        }}
                      >
                        {sub.verdict}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
