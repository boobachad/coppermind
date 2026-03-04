import { Calendar, TrendingUp, TrendingDown, Minus, Edit2, Trash2 } from 'lucide-react';
import { Milestone } from '../lib/types';
import { calculateProgress, calculateScheduleStatus, calculateTodayRequired } from '../lib/balancer-utils';
import { parseGoalDate } from '../lib/time';


interface MonthlyGoalCardProps {
  goal: Milestone;
  onEdit: () => void;
  onDelete: () => void;
  isArchived?: boolean;
}

export function MonthlyGoalCard({ goal, onEdit, onDelete, isArchived = false }: MonthlyGoalCardProps) {
  // Calculate progress percentage
  const progressPercent = calculateProgress(goal.currentValue, goal.targetValue);

  // Calculate schedule status (expects string dates)
  const status = calculateScheduleStatus(
    goal.currentValue,
    goal.targetValue,
    goal.periodStart,
    goal.periodEnd
  );

  // Calculate today's required amount (base + debt)
  const todayRequired = calculateTodayRequired(
    goal.currentValue,
    goal.targetValue,
    goal.dailyAmount,
    goal.periodStart,
    goal.periodEnd
  );
  
  // Calculate remaining days and target using time utils
  // periodEnd is ISO string like "2026-03-31T23:59:59Z"
  const periodEndDate = parseGoalDate(goal.periodEnd); // Parse to Date in local timezone
  const todayDate = parseGoalDate(new Date().toISOString().split('T')[0]); // Today as YYYY-MM-DD
  
  // Calculate days remaining (inclusive of today)
  const msPerDay = 1000 * 60 * 60 * 24;
  const remainingDays = Math.max(0, Math.ceil((periodEndDate.getTime() - todayDate.getTime()) / msPerDay) + 1);
  const remainingTarget = Math.max(0, goal.targetValue - goal.currentValue);

  // Get status colors based on ahead/behind
  const getStatusColor = () => {
    if (status === 'ahead') return 'var(--color-success)';
    if (status === 'behind') return 'var(--color-error)';
    return 'var(--text-secondary)';
  };

  const getStatusIcon = () => {
    if (status === 'ahead') return <TrendingUp className="w-4 h-4" />;
    if (status === 'behind') return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  return (
    <div
      className="rounded-xl p-6 border transition-all duration-200 hover:scale-[1.02]"
      style={{
        backgroundColor: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
        opacity: isArchived ? 0.85 : 1,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {goal.targetMetric}
            </h3>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {goal.periodStart.split('T')[0].split('-').reverse().join('/')} - {goal.periodEnd.split('T')[0].split('-').reverse().join('/')}
            </span>
          </div>
        </div>

        {/* Actions */}
        {!isArchived && (
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="p-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--glass-bg-subtle)',
                color: 'var(--text-secondary)',
              }}
              title="Edit goal"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--glass-bg-subtle)',
                color: 'var(--color-error)',
              }}
              title="Delete goal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {goal.currentValue} <span className="text-sm font-normal" style={{ color: 'var(--text-tertiary)' }}>/ {goal.targetValue}</span>
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {progressPercent}%
          </span>
        </div>

        {/* Progress bar with heatmap colors */}
        <div
          className="h-3 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--glass-bg-subtle)' }}
        >
          <div
            className="h-full transition-all duration-500 rounded-full"
            style={{
              width: `${Math.min(progressPercent, 100)}%`,
              backgroundColor:
                progressPercent >= 100
                  ? 'var(--pos-heatmap-level-5)'
                  : progressPercent >= 75
                  ? 'var(--pos-heatmap-level-4)'
                  : progressPercent >= 50
                  ? 'var(--pos-heatmap-level-3)'
                  : progressPercent >= 25
                  ? 'var(--pos-heatmap-level-2)'
                  : 'var(--pos-heatmap-level-1)',
            }}
          />
        </div>
      </div>

      {/* Today's Target Display */}
      <div
        className="mb-4 p-3 rounded-lg"
        style={{
          backgroundColor: 'var(--glass-bg-subtle)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Today's Target
          </span>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {todayRequired.todayBase}
            </span>
            {todayRequired.debt > 0 && (
              <>
                <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>+</span>
                <span
                  className="text-lg font-bold border-b-2 border-dotted cursor-help"
                  style={{ 
                    color: 'var(--color-error)',
                    borderColor: 'var(--color-error)'
                  }}
                  title={`Debt: ${todayRequired.debt} ${goal.unit || ''}`}
                >
                  {todayRequired.debt}
                </span>
              </>
            )}
            {goal.unit && (
              <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>
                {goal.unit}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {remainingDays} days remaining
          </span>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {remainingTarget} to go
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between">
        {/* Schedule Status */}
        <div className="flex items-center gap-2">
          <div style={{ color: getStatusColor() }}>
            {getStatusIcon()}
          </div>
          <span className="text-sm font-medium capitalize" style={{ color: getStatusColor() }}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
