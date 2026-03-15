import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Calendar, CheckCircle2, Circle, TrendingUp, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getLocalDateString } from '../lib/time';
import { DailyBriefingResponse, UnifiedGoal, Milestone, KnowledgeItem } from '../lib/types';
import { Loader } from '../../components/Loader';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { calculateTodayRequired } from '../lib/balancer-utils';
import { MonthSelector } from '../components/MonthSelector';

export function DailyBriefingPage() {
  const [briefing, setBriefing] = useState<DailyBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [newGoalText, setNewGoalText] = useState('');
  const [addingGoal, setAddingGoal] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());

  useEffect(() => {
    loadBriefing();
  }, [selectedDate]);

  const loadBriefing = async () => {
    setLoading(true);
    try {
      const [briefingResult, allMilestones] = await Promise.all([
        invoke<DailyBriefingResponse>('get_daily_briefing', { localDate: selectedDate }),
        invoke<Milestone[]>('get_milestones', { activeOnly: false })
      ]);
      
      // Filter milestones that are active on selectedDate
      const filteredMilestones = allMilestones.filter(milestone => {
        const milestoneStart = milestone.periodStart.split('T')[0];
        const milestoneEnd = milestone.periodEnd.split('T')[0];
        // Milestone is active if selectedDate is within its period
        return selectedDate >= milestoneStart && selectedDate <= milestoneEnd;
      });
      
      setBriefing(briefingResult);
      setMilestones(filteredMilestones);
    } catch (err) {
      const errorMsg = err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : String(err);
      console.error('Failed to load daily briefing:', err);
      toast.error('Failed to load daily briefing', { description: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const updateKbStatus = async (itemId: string, newStatus: string) => {
    try {
      await invoke('update_knowledge_item', {
        id: itemId,
        req: { status: newStatus },
      });
      toast.success('KB item updated');
      loadBriefing();
    } catch (err) {
      toast.error('Failed to update KB item', { description: String(err) });
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalText.trim()) return;

    setAddingGoal(true);
    try {
      await invoke('create_unified_goal', {
        req: {
          text: newGoalText,
          dueDateLocal: selectedDate,
          priority: 'medium',
          urgent: false,
        },
      });
      setNewGoalText('');
      toast.success('Goal added');
      loadBriefing();
    } catch (err) {
      toast.error('Failed to add goal', { description: String(err) });
    } finally {
      setAddingGoal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader />
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p style={{ color: 'var(--text-secondary)' }}>No briefing data available</p>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8" style={{ color: 'var(--text-primary)' }} />
            <div>
              <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Daily Briefing
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {new Date(briefing.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Day Navigation */}
        <MonthSelector
          mode="day"
          value={selectedDate}
          onChange={setSelectedDate}
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard
            label="Total Goals"
            value={briefing.stats.totalGoals}
            icon={<Circle className="w-5 h-5" />}
          />
          <StatCard
            label="Completed"
            value={briefing.stats.completedGoals}
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="var(--color-success)"
          />
          <StatCard
            label="Debt"
            value={briefing.stats.debtCount}
            icon={<AlertCircle className="w-5 h-5" />}
            color="var(--color-error)"
          />
          <StatCard
            label="KB Items"
            value={briefing.stats.kbItemsDueCount}
            icon={<TrendingUp className="w-5 h-5" />}
          />
          <StatCard
            label="On Track"
            value={briefing.stats.milestonesOnTrack}
            icon={<TrendingUp className="w-5 h-5" />}
            color="var(--color-success)"
          />
          <StatCard
            label="Behind"
            value={briefing.stats.milestonesBehind}
            icon={<AlertCircle className="w-5 h-5" />}
            color="var(--color-error)"
          />
        </div>

        {/* Quick Add Goal */}
        <form onSubmit={handleAddGoal} className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={newGoalText}
              onChange={e => setNewGoalText(e.target.value)}
              placeholder="Add a new goal for today..."
              className="flex-1 px-4 py-3 rounded-lg border transition-colors"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="submit"
              disabled={addingGoal || !newGoalText.trim()}
              className="px-6 py-3 rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              <Plus className="w-5 h-5" />
              <span>Add Goal</span>
            </button>
          </div>
        </form>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Goals */}
        <Section title="Today's Goals" count={briefing.goals.length}>
          {briefing.goals.length === 0 ? (
            <EmptyState message="No goals for today" />
          ) : (
            <div className="space-y-2">
              {briefing.goals.map(goal => (
                <GoalItem key={goal.id} goal={goal} />
              ))}
            </div>
          )}
        </Section>

        {/* Debt Goals */}
        {briefing.debtGoals.length > 0 && (
          <Section
            title="Debt Goals"
            count={briefing.debtGoals.length}
            alert
          >
            <div className="space-y-2">
              {briefing.debtGoals.map(goal => (
                <GoalItem key={goal.id} goal={goal} isDebt />
              ))}
            </div>
          </Section>
        )}

        {/* Active Milestones */}
        <Section title="Active Milestones" count={milestones.length}>
          {milestones.length === 0 ? (
            <EmptyState message="No active milestones" />
          ) : (
            <div className="space-y-2">
              {milestones.map(milestone => (
                <MilestoneItem key={milestone.id} milestone={milestone} />
              ))}
            </div>
          )}
        </Section>

        {/* KB Items Due */}
        <Section title="Knowledge Items Due" count={briefing.kbItemsDue.length}>
          {briefing.kbItemsDue.length === 0 ? (
            <EmptyState message="No KB items due for review" />
          ) : (
            <div className="space-y-2">
              {briefing.kbItemsDue.map(item => (
                <KbItem
                  key={item.id}
                  item={item}
                  onUpdateStatus={status => updateKbStatus(item.id, status)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
        <div style={{ color: color || 'var(--text-secondary)' }}>{icon}</div>
      </div>
      <p className="text-2xl font-bold" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}

interface SectionProps {
  title: string;
  count: number;
  alert?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

function Section({ title, count, alert, fullWidth, children }: SectionProps) {
  return (
    <div
      className={fullWidth ? 'lg:col-span-2' : ''}
      style={{
        padding: '1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid',
        backgroundColor: alert ? 'var(--surface-error)' : 'var(--glass-bg)',
        borderColor: alert ? 'var(--color-error)' : 'var(--glass-border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        <span
          className="px-3 py-1 rounded-full text-sm font-medium"
          style={{
            backgroundColor: 'var(--surface-tertiary)',
            color: 'var(--text-secondary)',
          }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

interface GoalItemProps {
  goal: UnifiedGoal;
  isDebt?: boolean;
}

function GoalItem({ goal, isDebt }: GoalItemProps) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg transition-colors hover:bg-opacity-80"
      style={{
        backgroundColor: 'var(--surface-secondary)',
      }}
    >
      <div
        className="mt-0.5"
        style={{ color: goal.completed ? 'var(--color-success)' : 'var(--text-tertiary)' }}
        title={goal.completed ? 'Completed (linked to activity)' : 'Not completed - link to activity to complete'}
      >
        {goal.completed ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <Circle className="w-5 h-5" />
        )}
      </div>
      <div className="flex-1">
        <p
          className={goal.completed ? 'line-through' : ''}
          style={{ color: 'var(--text-primary)' }}
        >
          {goal.text}
        </p>
        {goal.description && (
          <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            <MarkdownRenderer content={goal.description} />
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span
            className="px-2 py-0.5 rounded text-xs font-medium capitalize"
            style={{
              backgroundColor: 'var(--surface-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            {goal.priority}
          </span>
          {goal.urgent && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: 'var(--color-error)',
                color: 'white',
              }}
            >
              Urgent
            </span>
          )}
          {isDebt && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: 'var(--color-error)',
                color: 'white',
              }}
            >
              Debt
            </span>
          )}
          {goal.verified && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: 'var(--color-success)',
                color: 'white',
              }}
            >
              Verified
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface MilestoneItemProps {
  milestone: Milestone;
}

function MilestoneItem({ milestone }: MilestoneItemProps) {
  const todayRequired = calculateTodayRequired(
    milestone.currentValue,
    milestone.targetValue,
    milestone.dailyAmount,
    milestone.periodStart,
    milestone.periodEnd
  );

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-opacity-80"
      style={{
        backgroundColor: 'var(--surface-secondary)',
      }}
    >
      <div className="flex-1">
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {milestone.targetMetric}
        </p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {milestone.currentValue} / {milestone.targetValue}
          {milestone.unit && ` ${milestone.unit}`}
        </p>
      </div>
      <div className="text-right">
        <div className="flex items-baseline justify-end gap-1">
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
                title={`Debt: ${todayRequired.debt} ${milestone.unit || ''}`}
              >
                {todayRequired.debt}
              </span>
            </>
          )}
          {milestone.unit && (
            <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>
              {milestone.unit}
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Today's Target
        </p>
      </div>
    </div>
  );
}

interface KbItemProps {
  item: KnowledgeItem;
  onUpdateStatus: (status: string) => void;
}

function KbItem({ item, onUpdateStatus }: KbItemProps) {
  return (
    <div
      className="p-3 rounded-lg"
      style={{
        backgroundColor: 'var(--surface-secondary)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            {item.metadata?.title || item.content}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {item.source} • {item.status}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onUpdateStatus('Planned')}
            className="px-3 py-1 rounded text-xs transition-colors"
            style={{
              backgroundColor: 'var(--surface-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            Plan
          </button>
          <button
            onClick={() => onUpdateStatus('Completed')}
            className="px-3 py-1 rounded text-xs transition-colors"
            style={{
              backgroundColor: 'var(--color-success)',
              color: 'white',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8">
      <p style={{ color: 'var(--text-tertiary)' }}>{message}</p>
    </div>
  );
}
