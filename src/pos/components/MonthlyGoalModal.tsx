import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Milestone } from '../lib/types';

interface MilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingGoal: Milestone | null;
}

export function MonthlyGoalModal({ isOpen, onClose, onSuccess, editingGoal }: MilestoneModalProps) {
  const [targetMetric, setTargetMetric] = useState('');
  const [dailyAmount, setDailyAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [problemId, setProblemId] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-calculate period as current month
  const getCurrentMonthPeriod = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const lastDayNum = new Date(y, m + 1, 0).getDate();
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    
    return {
      start: `${y}-${mm}-${dd}T00:00:00Z`,
      end: `${y}-${mm}-${String(lastDayNum).padStart(2, '0')}T23:59:59Z`,
      daysLeft: lastDayNum - d + 1,
      monthName: now.toLocaleDateString('en-US', { month: 'long' })
    };
  };

  const period = getCurrentMonthPeriod();
  const targetValue = dailyAmount ? parseInt(dailyAmount) * period.daysLeft : 0;

  useEffect(() => {
    if (isOpen) {
      if (editingGoal) {
        setTargetMetric(editingGoal.targetMetric);
        const estimatedDaily = Math.ceil(editingGoal.targetValue / period.daysLeft);
        setDailyAmount(String(estimatedDaily));
        setProblemId(editingGoal.problemId || '');
        setUnit(editingGoal.unit || '');
      } else {
        setTargetMetric('');
        setDailyAmount('');
        setProblemId('');
        setUnit('');
      }
    }
  }, [isOpen, editingGoal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetMetric || !dailyAmount) {
      toast.error('Please fill in all required fields');
      return;
    }

    const amount = parseInt(dailyAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Daily amount must be a positive number');
      return;
    }

    setSaving(true);
    try {
      if (editingGoal) {
        await invoke('update_milestone', {
          id: editingGoal.id,
          req: {
            targetValue: targetValue,
          },
        });
        toast.success('Milestone updated');
      } else {
        await invoke('create_milestone', {
          req: {
            targetMetric,
            dailyAmount: amount,
            periodStart: period.start,
            periodEnd: period.end,
            periodType: 'monthly',
            problemId: problemId || undefined,
            recurringPattern: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
            label: targetMetric.toLowerCase(),
            unit: unit || undefined,
          },
        });
        toast.success('Milestone created');
      }
      onSuccess();
    } catch (err) {
      const errorMsg = err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : String(err);
      toast.error('Failed to save milestone', { description: errorMsg });
      console.error('Milestone error:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 backdrop-blur-[2px] transition-all duration-300"
        style={{ backgroundColor: 'var(--overlay-bg)' }}
        onClick={onClose}
      />
      <div className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl p-6 material-glass animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {editingGoal ? 'Edit Milestone' : 'Create Milestone'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              <Target className="w-4 h-4 inline mr-2" />
              Metric Name
            </label>
            <input
              type="text"
              value={targetMetric}
              onChange={e => setTargetMetric(e.target.value)}
              placeholder="e.g., Pushups, Pages Read, Commits"
              className="w-full px-4 py-2 rounded-lg border transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Unit
            </label>
            <input
              type="text"
              value={unit}
              onChange={e => setUnit(e.target.value)}
              placeholder="e.g., reps, pages, minutes"
              className="w-full px-4 py-2 rounded-lg border transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Daily Amount
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={dailyAmount}
                onChange={e => setDailyAmount(e.target.value)}
                placeholder="e.g., 100"
                min="1"
                className="w-32 px-4 py-2 rounded-lg border transition-colors"
                style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                required
              />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                × {period.daysLeft} days left in {period.monthName} = <strong style={{ color: 'var(--color-accent-primary)' }}>{targetValue}</strong>
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Problem ID / URL (Optional)
            </label>
            <input
              type="text"
              value={problemId}
              onChange={e => setProblemId(e.target.value)}
              placeholder="LeetCode/Codeforces URL"
              className="w-full px-4 py-2 rounded-lg border transition-colors font-mono text-sm"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
            >
              {saving ? 'Saving…' : editingGoal ? 'Update Milestone' : 'Create Milestone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
