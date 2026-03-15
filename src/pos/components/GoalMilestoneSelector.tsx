import { Check, Flame, AlertCircle, BarChart3 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UnifiedGoal, Milestone } from '../lib/types';
import { formatDateDDMMYYYY, parseGoalDate } from '../lib/time';

interface GoalMilestoneSelectorProps {
  availableGoals: UnifiedGoal[];
  availableMilestones: Milestone[];
  selectedGoalIds: string[];
  selectedMilestoneId: string | null;
  onGoalToggle: (goalId: string) => void;
  onMilestoneSelect: (milestoneId: string) => void;
}

export function GoalMilestoneSelector({
  availableGoals,
  availableMilestones,
  selectedGoalIds,
  selectedMilestoneId,
  onGoalToggle,
  onMilestoneSelect,
}: GoalMilestoneSelectorProps) {
  const triggerValue =
    selectedGoalIds.length > 0
      ? `goals-${selectedGoalIds.length}`
      : selectedMilestoneId
      ? `milestone-${selectedMilestoneId}`
      : '';

  const handleValueChange = (value: string) => {
    if (value.startsWith('goal:')) {
      onGoalToggle(value.slice(5));
    } else if (value.startsWith('milestone:')) {
      onMilestoneSelect(value.slice(10));
    }
  };

  return (
    <Select value={triggerValue} onValueChange={handleValueChange}>
      <SelectTrigger className="material-glass-subtle border-none">
        <SelectValue placeholder="Select Goal(s) or Milestone" />
      </SelectTrigger>
      <SelectContent className="material-glass max-h-80 overflow-y-auto">
        {/* Hidden items for trigger display */}
        {selectedGoalIds.length > 0 && (
          <SelectItem value={`goals-${selectedGoalIds.length}`} className="hidden">
            {selectedGoalIds.length} Goal{selectedGoalIds.length > 1 ? 's' : ''} Selected
          </SelectItem>
        )}
        {selectedMilestoneId && (
          <SelectItem value={`milestone-${selectedMilestoneId}`} className="hidden">
            1 Milestone Selected
          </SelectItem>
        )}

        {/* Goals section */}
        {availableGoals.length > 0 && (
          <>
            <div className="px-2 py-1 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              GOALS
            </div>
            {availableGoals.map(goal => {
              const isSelected = selectedGoalIds.includes(goal.id);
              const isDisabled = selectedMilestoneId !== null;
              return (
                <SelectItem
                  key={goal.id}
                  value={`goal:${goal.id}`}
                  disabled={isDisabled}
                  className={`${isSelected ? 'bg-secondary' : ''} ${isDisabled ? 'opacity-40' : ''}`}
                >
                  <span className="flex items-center gap-2 w-full">
                    <div className="flex items-center justify-center w-4 h-4 rounded border border-input shrink-0">
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                    <span className="flex items-center gap-1 flex-1 min-w-0 text-sm">
                      {goal.date && (
                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                          [{formatDateDDMMYYYY(parseGoalDate(goal.date))}]
                        </span>
                      )}
                      <span className="truncate">{goal.text}</span>
                      {goal.urgent && <Flame className="w-3 h-3 shrink-0" style={{ color: 'var(--color-warning)' }} />}
                      {goal.isDebt && <AlertCircle className="w-3 h-3 shrink-0" style={{ color: 'var(--color-warning)' }} />}
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </>
        )}

        {/* Separator */}
        {availableGoals.length > 0 && availableMilestones.length > 0 && (
          <div className="border-t my-2" style={{ borderColor: 'var(--border-primary)' }} />
        )}

        {/* Milestones section */}
        {availableMilestones.length > 0 && (
          <>
            <div className="px-2 py-1 text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
              MILESTONES
            </div>
            {availableMilestones.map(milestone => {
              const isSelected = selectedMilestoneId === milestone.id;
              const isDisabled =
                selectedGoalIds.length > 0 ||
                (selectedMilestoneId !== null && selectedMilestoneId !== milestone.id);
              return (
                <SelectItem
                  key={milestone.id}
                  value={`milestone:${milestone.id}`}
                  disabled={isDisabled}
                  className={`${isSelected ? 'bg-secondary' : ''} ${isDisabled ? 'opacity-40' : ''}`}
                >
                  <span className="flex items-center gap-2 w-full">
                    <div className="flex items-center justify-center w-4 h-4 rounded border border-input shrink-0">
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                    <span className="flex items-center gap-1 flex-1 min-w-0 text-sm">
                      <BarChart3 className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate">{milestone.targetMetric}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({milestone.currentValue}/{milestone.targetValue})
                      </span>
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </>
        )}

        {availableGoals.length === 0 && availableMilestones.length === 0 && (
          <div className="px-2 py-1 text-xs text-muted-foreground">No goals or milestones available</div>
        )}
      </SelectContent>
    </Select>
  );
}
