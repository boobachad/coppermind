import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Calendar, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { MonthlyGoal } from '../lib/types';

interface MonthlyGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingGoal: MonthlyGoal | null;
}

export function MonthlyGoalModal({ isOpen, onClose, onSuccess, editingGoal }: MonthlyGoalModalProps) {
  const [targetMetric, setTargetMetric] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [strategy, setStrategy] = useState<'EvenDistribution' | 'FrontLoad' | 'Manual'>('EvenDistribution');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingGoal) {
        setTargetMetric(editingGoal.targetMetric);
        setTargetValue(String(editingGoal.targetValue));
        setPeriodStart(editingGoal.periodStart.split('T')[0]);
        setPeriodEnd(editingGoal.periodEnd.split('T')[0]);
        setStrategy(editingGoal.strategy);
      } else {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const lastDayNum = new Date(y, m + 1, 0).getDate();
        const mm = String(m + 1).padStart(2, '0');
        setTargetMetric('');
        setTargetValue('');
        setPeriodStart(`${y}-${mm}-01`);
        setPeriodEnd(`${y}-${mm}-${String(lastDayNum).padStart(2, '0')}`);
        setStrategy('EvenDistribution');
      }
    }
  }, [isOpen, editingGoal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!targetMetric || !targetValue || !periodStart || !periodEnd) {
      toast.error('Please fill in all required fields');
      return;
    }

    const value = parseInt(targetValue, 10);
    if (isNaN(value) || value <= 0) {
      toast.error('Target value must be a positive number');
      return;
    }

    setSaving(true);
    try {
      if (editingGoal) {
        await invoke('update_monthly_goal', {
          id: editingGoal.id,
          targetMetric,
          targetValue: value,
          periodStart: `${periodStart}T00:00:00Z`,
          periodEnd: `${periodEnd}T23:59:59Z`,
          strategy,
        });
        toast.success('Monthly goal updated');
      } else {
        await invoke('create_monthly_goal', {
          targetMetric,
          targetValue: value,
          periodStart: `${periodStart}T00:00:00Z`,
          periodEnd: `${periodEnd}T23:59:59Z`,
          strategy,
        });
        toast.success('Monthly goal created');
      }
      onSuccess();
    } catch (err) {
      toast.error('Failed to save monthly goal', { description: String(err) });
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
            {editingGoal ? 'Edit Monthly Goal' : 'Create Monthly Goal'}
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
              Target Metric
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
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Target Value
            </label>
            <input
              type="number"
              value={targetValue}
              onChange={e => setTargetValue(e.target.value)}
              placeholder="e.g., 3000"
              min="1"
              className="w-full px-4 py-2 rounded-lg border transition-colors"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                <Calendar className="w-4 h-4 inline mr-2" />Period Start
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={e => setPeriodStart(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border transition-colors"
                style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                <Calendar className="w-4 h-4 inline mr-2" />Period End
              </label>
              <input
                type="date"
                value={periodEnd}
                onChange={e => setPeriodEnd(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border transition-colors"
                style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Distribution Strategy
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['EvenDistribution', 'FrontLoad', 'Manual'] as const).map(strat => (
                <button
                  key={strat}
                  type="button"
                  onClick={() => setStrategy(strat)}
                  className="px-4 py-3 rounded-lg border transition-all duration-200"
                  style={{
                    backgroundColor: strategy === strat ? 'var(--btn-primary-bg)' : 'var(--surface-secondary)',
                    borderColor: strategy === strat ? 'var(--btn-primary-bg)' : 'var(--border-primary)',
                    color: strategy === strat ? 'var(--btn-primary-text)' : 'var(--text-secondary)',
                  }}
                >
                  {strat.replace(/([A-Z])/g, ' $1').trim()}
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              {strategy === 'EvenDistribution' && 'Spreads target evenly across remaining days'}
              {strategy === 'FrontLoad' && 'Doubles the daily target to finish earlier'}
              {strategy === 'Manual' && 'No automatic redistribution'}
            </p>
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
              {saving ? 'Saving…' : editingGoal ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
