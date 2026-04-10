import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { UnifiedGoal } from '@/pos/lib/types';
import { getLocalDateString } from '@/pos/lib/time';
import clsx from 'clsx';

interface DailyProgressEntry {
  date: string;
  milestoneId: string;
  targetMetric: string;
  unit: string | null;
  amount: number;
  dailyAmount: number;
}

interface DayData {
  date: string;
  goals: UnifiedGoal[];
  milestoneProgress: DailyProgressEntry[];
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDow = (first.getDay() + 6) % 7;
  for (let i = startDow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) days.push(new Date(year, month + 1, d));
  }
  return days;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarPage() {
  const navigate = useNavigate();
  const today = getLocalDateString();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [dayData, setDayData] = useState<Map<string, DayData>>(new Map());
  const [loading, setLoading] = useState(false);

  const days = getDaysInMonth(year, month);

  // First and last date of the displayed grid (includes padding days)
  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  const loadMonthData = async () => {
    setLoading(true);
    try {
      const startDate = formatDate(firstDay);
      const endDate = formatDate(lastDay);

      const [allGoals, milestoneProgress] = await Promise.all([
        invoke<UnifiedGoal[]>('get_unified_goals', { filters: { todayLocal: today } }),
        invoke<DailyProgressEntry[]>('get_milestone_progress_for_range', { startDate, endDate }),
      ]);

      const map = new Map<string, DayData>();

      for (const goal of allGoals) {
        if (!goal.date) continue;
        const d = goal.date.split('T')[0];
        if (!map.has(d)) map.set(d, { date: d, goals: [], milestoneProgress: [] });
        map.get(d)!.goals.push(goal);
      }

      for (const entry of milestoneProgress) {
        const d = entry.date;
        if (!map.has(d)) map.set(d, { date: d, goals: [], milestoneProgress: [] });
        map.get(d)!.milestoneProgress.push(entry);
      }

      setDayData(map);
    } catch (err) {
      toast.error('Failed to load calendar data', { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMonthData(); }, [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  const isCurrentMonth =
    year === new Date().getFullYear() && month === new Date().getMonth();

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-8 py-5 border-b flex-shrink-0"
        style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--bg-primary)' }}
      >
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Calendar</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
            style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-primary)' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-semibold w-40 text-center" style={{ color: 'var(--text-primary)' }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg transition-all duration-200 hover:scale-110"
            style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-primary)' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={goToday}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 border"
              style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-primary)', borderColor: 'var(--glass-border)' }}
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b flex-shrink-0" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--bg-primary)' }}>
        {DAY_NAMES.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        className={clsx('flex-1 grid grid-cols-7 overflow-y-auto', loading && 'opacity-50 pointer-events-none')}
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {days.map((day, i) => {
          const dateStr = formatDate(day);
          const isCurrentMonthDay = day.getMonth() === month;
          const isToday = dateStr === today;
          const data = dayData.get(dateStr);
          const goals = data?.goals ?? [];
          const milestoneProgress = data?.milestoneProgress ?? [];
          const hasDebt = goals.some(g => g.isDebt);
          const hasContent = goals.length > 0 || milestoneProgress.length > 0;

          return (
            <div
              key={i}
              onClick={() => isCurrentMonthDay && navigate(`/pos/grid/${dateStr}`)}
              className={clsx(
                'border-b border-r p-2 flex flex-col transition-colors duration-100',
                isCurrentMonthDay ? 'cursor-pointer' : 'opacity-25 cursor-default',
                hasContent ? 'min-h-[110px]' : 'min-h-[80px]',
              )}
              style={{
                borderColor: 'var(--glass-border)',
                backgroundColor: isToday ? 'var(--pos-today-bg)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (!isCurrentMonthDay) return;
                (e.currentTarget as HTMLDivElement).style.backgroundColor = isToday ? 'var(--pos-today-bg)' : 'var(--glass-bg-subtle)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = isToday ? 'var(--pos-today-bg)' : 'transparent';
              }}
            >
              {/* Day number row */}
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="text-sm font-medium w-6 h-6 flex items-center justify-center rounded-full"
                  style={{
                    color: isToday ? 'var(--pos-today-text)' : 'var(--text-primary)',
                    backgroundColor: isToday ? 'var(--pos-today-border)' : 'transparent',
                    fontWeight: isToday ? 700 : 500,
                  }}
                >
                  {day.getDate()}
                </span>
                {hasDebt && (
                  <span
                    className="text-[9px] px-1 rounded font-semibold"
                    style={{ backgroundColor: 'var(--pos-debt-bg)', color: 'var(--pos-debt-text)', border: '1px solid var(--pos-debt-border)' }}
                  >
                    debt
                  </span>
                )}
              </div>

              {/* Goals */}
              {goals.length > 0 && (
                <div className="space-y-0.5 mb-1">
                  {goals.map(g => {
                    const state = g.completed ? 'done' : g.isDebt ? 'debt' : 'pending';
                    const chipColor =
                      state === 'done'  ? 'var(--color-success)' :
                      state === 'debt'  ? 'var(--pos-debt-border)' :
                      g.urgent         ? 'var(--color-error)' :
                                         'var(--color-accent-primary)';
                    const chipBg =
                      state === 'done'  ? 'var(--pos-success-bg)' :
                      state === 'debt'  ? 'var(--pos-debt-bg)' :
                      g.urgent         ? 'var(--color-error-subtle)' :
                                         'var(--pos-info-bg)';
                    return (
                      <div key={g.id} className="flex items-center gap-1 min-w-0">
                        <span
                          className="text-[9px] font-semibold px-1 rounded flex-shrink-0 uppercase tracking-wide"
                          style={{ backgroundColor: chipBg, color: chipColor }}
                        >
                          {state}
                        </span>
                        <span
                          className={`text-[10px] truncate leading-tight ${g.completed ? 'line-through opacity-50' : ''}`}
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {g.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Milestone progress */}
              {milestoneProgress.length > 0 && (
                <div className="space-y-1 mt-auto pt-1 border-t" style={{ borderColor: 'var(--glass-border)' }}>
                  {milestoneProgress.map(mp => {
                    const pct = Math.min(100, Math.round((mp.amount / mp.dailyAmount) * 100));
                    const met = mp.amount >= mp.dailyAmount;
                    return (
                      <div key={mp.milestoneId}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px] truncate font-medium" style={{ color: 'var(--text-tertiary)' }}>
                            {mp.targetMetric}
                          </span>
                          <span
                            className="text-[9px] font-semibold flex-shrink-0 ml-1"
                            style={{ color: met ? 'var(--color-success)' : 'var(--color-accent-primary)' }}
                          >
                            {mp.amount}{mp.unit ? ` ${mp.unit}` : ''}
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--glass-border)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: met ? 'var(--color-success)' : 'var(--color-accent-primary)',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
