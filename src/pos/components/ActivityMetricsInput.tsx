import { Input } from '@/components/ui/input';
import type { UnifiedGoal, Milestone } from '../lib/types';

interface ActivityMetricsInputProps {
  selectedGoals: UnifiedGoal[];
  selectedMilestone: Milestone | null | undefined;
  metricValues: Record<string, string>;
  onMetricChange: (metricId: string, value: string) => void;
  onMilestoneMetricChange: (value: string) => void;
}

export function ActivityMetricsInput({
  selectedGoals,
  selectedMilestone,
  metricValues,
  onMetricChange,
  onMilestoneMetricChange,
}: ActivityMetricsInputProps) {
  const hasGoalMetrics = selectedGoals.length > 0 && selectedGoals.some(g => g.metrics && g.metrics.length > 0);

  return (
    <>
      {hasGoalMetrics && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Progress on Goal Metrics</label>
          {selectedGoals.map(goal =>
            goal.metrics && goal.metrics.length > 0 ? (
              <div key={goal.id} className="space-y-2 p-3 rounded border" style={{ borderColor: 'var(--border-color)' }}>
                <div className="text-xs font-medium text-muted-foreground">{goal.text}</div>
                {goal.metrics.map(metric => (
                  <div key={metric.id} className="flex items-center gap-2">
                    <span className="text-sm flex-1">{metric.label}</span>
                    <Input
                      type="number"
                      min="0"
                      value={metricValues[metric.id] || ''}
                      onChange={(e) => onMetricChange(metric.id, e.target.value)}
                      placeholder="0"
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">
                      ({metric.current}/{metric.target})
                    </span>
                  </div>
                ))}
              </div>
            ) : null
          )}
        </div>
      )}

      {selectedMilestone && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">Progress on Milestone</label>
          <div className="flex items-center gap-2">
            <span className="text-sm flex-1">{selectedMilestone.targetMetric}</span>
            <Input
              type="number"
              min="0"
              value={metricValues['milestone'] || ''}
              onChange={(e) => onMilestoneMetricChange(e.target.value)}
              placeholder="0"
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">
              ({selectedMilestone.currentValue}/{selectedMilestone.targetValue} {selectedMilestone.unit || ''})
            </span>
          </div>
        </div>
      )}
    </>
  );
}
