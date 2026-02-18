import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Calendar, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { MonthlyGoal } from '../lib/types';
import { getDistributionPreview } from '../lib/balancer-utils';

interface MonthlyGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingGoal: MonthlyGoal | null;
}

interface DistributionPreview {
  date: string;
  target: number;
  actual: number;
}

export function MonthlyGoalModal({ isOpen, onClose, onSuccess, editingGoal }: MonthlyGoalModalProps) {
  const [targetMetric, setTargetMetric] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [strategy, setStrategy] = useState<'EvenDistribution' | 'FrontLoad' | 'Manual'>('EvenDistribution');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<DistributionPreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingGoal) {
        // Populate for editing
        setTargetMetric(editingGoal.targetMetric);
        setTargetValue(String(editingGoal.targetValue));
        setPeriodStart(editingGoal.periodStart.split('T')[0]); // Extract date part
        setPeriodEnd(editingGoal.periodEnd.split('T')[0]);
        setStrategy(editingGoal.strategy);
      } else {
        // Default to current month
        const now = new Date(); // For form defaults, new Date() is OK
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        setTargetMetric('');
        setTargetValue('');
        setPeriodStart(firstDay.toISOString().split('T')[0]);
        setPeriodEnd(lastDay.toISOString().split('T')[0]);
        setStrategy('EvenDistribution');
      }
      setShowPreview(false);
      setPreview([]);
    }
  }, [isOpen, editingGoal]);

  const handleGeneratePreview = () => {
    if (!periodStart || !periodEnd || !targetValue || !targetMetric) {
      toast.error('Please fill in all required fields');
      return;
    }

    const value = parseInt(targetValue, 10);
    if (isNaN(value) || value <= 0) {
      toast.error('Target value must be a positive number');
      return;
    }

    try {
      // Create a mock MonthlyGoal for preview
      const mockGoal: MonthlyGoal = {
        id: 'preview',
        targetMetric,
        targetValue: value,
        periodStart: `${periodStart}T00:00:00Z`,
        periodEnd: `${periodEnd}T23:59:59Z`,
        strategy,
        currentValue: 0,
        createdAt: new Date().toISOString(), // For mock, current time is OK
        updatedAt: new Date().toISOString(),
      };

      // Empty linked goals for preview (shows all targets, no actuals)
      const previewData = getDistributionPreview(mockGoal, []);

      setPreview(previewData);
      setShowPreview(true);
    } catch (err) {
      toast.error('Failed to generate preview', { description: String(err) });
    }
  };

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
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--glass-bg)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl p-6 border shadow-2xl"
        style={{
          backgroundColor: 'var(--surface-primary)',
          borderColor: 'var(--glass-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {editingGoal ? 'Edit Monthly Goal' : 'Create Monthly Goal'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              color: 'var(--text-secondary)',
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Target Metric */}
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
              style={{
                backgroundColor: 'var(--surface-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              required
            />
          </div>

          {/* Target Value */}
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
              style={{
                backgroundColor: 'var(--surface-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
              required
            />
          </div>

          {/* Period Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                <Calendar className="w-4 h-4 inline mr-2" />
                Period Start
              </label>
              <input
                type="date"
                value={periodStart}
                onChange={e => setPeriodStart(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border transition-colors"
                style={{
                  backgroundColor: 'var(--surface-secondary)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                <Calendar className="w-4 h-4 inline mr-2" />
                Period End
              </label>
              <input
                type="date"
                value={periodEnd}
                onChange={e => setPeriodEnd(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border transition-colors"
                style={{
                  backgroundColor: 'var(--surface-secondary)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
                required
              />
            </div>
          </div>

          {/* Distribution Strategy */}
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

          {/* Preview Button */}
          <button
            type="button"
            onClick={handleGeneratePreview}
            className="w-full px-4 py-2 rounded-lg border transition-colors"
            style={{
              backgroundColor: 'var(--surface-secondary)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            Generate Distribution Preview
          </button>

          {/* Preview Section */}
          {showPreview && preview.length > 0 && (
            <div
              className="rounded-lg p-4 max-h-64 overflow-y-auto border"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                borderColor: 'var(--border-primary)',
              }}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                Daily Distribution Preview (First 7 days)
              </h3>
              <div className="space-y-2">
                {preview.slice(0, 7).map((day, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>{day.date}</span>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      Target: {day.target}
                    </span>
                  </div>
                ))}
                {preview.length > 7 && (
                  <p className="text-xs text-center pt-2" style={{ color: 'var(--text-tertiary)' }}>
                    ... and {preview.length - 7} more days
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border transition-colors"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                borderColor: 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              {saving ? 'Saving...' : editingGoal ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
