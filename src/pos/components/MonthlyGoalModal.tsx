import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Calendar, Target, TrendingUp } from 'lucide-react';
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
  const [targetValue, setTargetValue] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [problemId, setProblemId] = useState('');
  const [recurringPattern, setRecurringPattern] = useState('');
  const [label, setLabel] = useState('');
  const [unit, setUnit] = useState('');
  const [saving, setSaving] = useState(false);

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  useEffect(() => {
    if (isOpen) {
      if (editingGoal) {
        setTargetMetric(editingGoal.targetMetric);
        setTargetValue(String(editingGoal.targetValue));
        setPeriodStart(editingGoal.periodStart.split('T')[0]);
        setPeriodEnd(editingGoal.periodEnd.split('T')[0]);
        setProblemId(editingGoal.problemId || '');
        setRecurringPattern(editingGoal.recurringPattern || '');
        setLabel(editingGoal.label || '');
        setUnit(editingGoal.unit || '');
      } else {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const d = now.getDate();
        const lastDayNum = new Date(y, m + 1, 0).getDate();
        const mm = String(m + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        setTargetMetric('');
        setTargetValue('');
        setPeriodStart(`${y}-${mm}-${dd}`);
        setPeriodEnd(`${y}-${mm}-${String(lastDayNum).padStart(2, '0')}`);
        setProblemId('');
        setRecurringPattern('Mon,Tue,Wed,Thu,Fri,Sat,Sun'); // Default to all days
        setLabel('');
        setUnit('');
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
        await invoke('update_milestone', {
          id: editingGoal.id,
          req: {
            targetValue: value,
          },
        });
        toast.success('Milestone updated');
      } else {
        await invoke('create_milestone', {
          req: {
            targetMetric,
            targetValue: value,
            periodStart: `${periodStart}T00:00:00Z`,
            periodEnd: `${periodEnd}T23:59:59Z`,
            problemId: problemId || undefined,
            recurringPattern: recurringPattern || undefined,
            label: label || undefined,
            unit: unit || undefined,
          },
        });
        toast.success('Milestone created');
      }
      onSuccess();
    } catch (err) {
      toast.error('Failed to save milestone', { description: String(err) });
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
                Metric Label
              </label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g., pushups"
                className="w-full px-4 py-2 rounded-lg border transition-colors"
                style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
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
                placeholder="e.g., reps"
                className="w-full px-4 py-2 rounded-lg border transition-colors"
                style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
              />
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

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Recurring Pattern
            </label>
            <div className="flex gap-2 flex-wrap">
              {WEEKDAYS.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    const days = recurringPattern.split(',').filter(Boolean);
                    const newDays = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
                    setRecurringPattern(newDays.join(','));
                  }}
                  className="w-10 h-10 rounded-full border transition-all text-xs font-bold"
                  style={{
                    backgroundColor: recurringPattern.split(',').includes(day) ? 'var(--btn-primary-bg)' : 'var(--surface-secondary)',
                    borderColor: recurringPattern.split(',').includes(day) ? 'var(--btn-primary-bg)' : 'var(--border-primary)',
                    color: recurringPattern.split(',').includes(day) ? 'var(--btn-primary-text)' : 'var(--text-secondary)',
                  }}
                >
                  {day.charAt(0)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const days = recurringPattern.split(',').filter(Boolean);
                  setRecurringPattern(days.length === 7 ? '' : WEEKDAYS.join(','));
                }}
                className="text-xs uppercase ml-3 hover:text-primary font-medium transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {recurringPattern.split(',').filter(Boolean).length === 7 ? 'Clear' : 'Select All'}
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              {!recurringPattern ? 'No recurring pattern - generates instances for all days in period' : `Generates instances on: ${recurringPattern}`}
            </p>
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
