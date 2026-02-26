import { useState } from 'react';
import { Calendar, TrendingUp, TrendingDown, Minus, Edit2, Trash2 } from 'lucide-react';
import { Milestone } from '../lib/types';
import { calculateProgress, calculateScheduleStatus } from '../lib/balancer-utils';
import { formatDateDDMMYYYY } from '../lib/time';

interface MonthlyGoalCardProps {
  goal: Milestone;
  onEdit: () => void;
  onDelete: () => void;
}

export function MonthlyGoalCard({ goal, onEdit, onDelete }: MonthlyGoalCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Calculate progress percentage
  const progressPercent = calculateProgress(goal.currentValue, goal.targetValue);

  // Calculate schedule status (expects string dates)
  const status = calculateScheduleStatus(
    goal.currentValue,
    goal.targetValue,
    goal.periodStart,
    goal.periodEnd
  );

  // Daily target is the user-defined daily amount
  const dailyTarget = goal.dailyAmount;
  
  // Calculate remaining days and target
  const now = new Date();
  const periodEnd = new Date(goal.periodEnd);
  const remainingDays = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
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
              {formatDateDDMMYYYY(new Date(goal.periodStart))} - {formatDateDDMMYYYY(new Date(goal.periodEnd))}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg transition-colors"
            style={{
              backgroundColor: 'var(--surface-secondary)',
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
              backgroundColor: 'var(--surface-secondary)',
              color: 'var(--color-error)',
            }}
            title="Delete goal"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
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
          style={{ backgroundColor: 'var(--surface-secondary)' }}
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

      {/* Daily Target Display */}
      <div
        className="mb-4 p-3 rounded-lg"
        style={{
          backgroundColor: 'var(--surface-secondary)',
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Daily Target
          </span>
          <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            {dailyTarget}
            {goal.unit && <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>{goal.unit}</span>}
          </span>
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
      <div className="flex items-center justify-between mb-4">
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

      {/* Details Toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full mt-2 text-xs underline"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {showDetails ? 'Hide' : 'Show'} Details
      </button>

      {showDetails && (
        <div
          className="mt-3 p-3 rounded-lg text-sm space-y-1"
          style={{
            backgroundColor: 'var(--surface-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="flex justify-between">
            <span>Target Metric:</span>
            <span style={{ color: 'var(--text-primary)' }}>{goal.targetMetric}</span>
          </div>
          <div className="flex justify-between">
            <span>Current Progress:</span>
            <span style={{ color: 'var(--text-primary)' }}>{goal.currentValue}</span>
          </div>
          <div className="flex justify-between">
            <span>Target Value:</span>
            <span style={{ color: 'var(--text-primary)' }}>{goal.targetValue}</span>
          </div>
          <div className="flex justify-between">
            <span>Remaining:</span>
            <span style={{ color: 'var(--text-primary)' }}>{remainingTarget}</span>
          </div>
          <div className="flex justify-between">
            <span>Remaining Days:</span>
            <span style={{ color: 'var(--text-primary)' }}>{remainingDays}</span>
          </div>
        </div>
      )}
    </div>
  );
}
