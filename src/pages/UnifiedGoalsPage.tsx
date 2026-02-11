import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Search, CheckCircle2, Trash2, Calendar, X, Repeat, Target } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import clsx from 'clsx';
import * as chrono from 'chrono-node';
import { UnifiedGoal, UnifiedGoalMetric } from '../lib/types';
import { Loader } from '../components/Loader';
import { DatePicker } from '../components/DatePicker';
import { PieChart, Pie, Tooltip, ResponsiveContainer } from 'recharts';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Smart parsing for natural language input
const parseSmartInput = (text: string) => {
  const parsedDate = chrono.parseDate(text);
  const isUrgent = /urgent|asap|immediately/i.test(text);
  const isHighPriority = /high priority|priority high|important/i.test(text) || isUrgent;

  return {
    date: parsedDate,
    urgent: isUrgent,
    priority: isHighPriority ? 'high' : 'medium' as 'low' | 'medium' | 'high'
  };
};

export function UnifiedGoalsPage() {
  const [goals, setGoals] = useState<UnifiedGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'urgent' | 'debt'>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'priority' | 'due'>('newest');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Form State
  const [formText, setFormText] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formUrgent, setFormUrgent] = useState(false);
  const [formDate, setFormDate] = useState<Date | undefined>(undefined);
  const [formTime, setFormTime] = useState('');
  const [formProblemId, setFormProblemId] = useState('');
  const [formMetrics, setFormMetrics] = useState<{ label: string; target: string; unit: string }[]>([]);
  const [newMetric, setNewMetric] = useState({ label: '', target: '', unit: '' });
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  useEffect(() => {
    loadGoals();
  }, [filter]);

  // Smart input parsing
  useEffect(() => {
    if (!formText) return;
    const smart = parseSmartInput(formText);
    if (smart.urgent) setFormUrgent(true);
    if (smart.priority === 'high') setFormPriority('high');
    if (smart.date) {
      setFormDate(smart.date);
      setFormTime(format(smart.date, 'HH:mm'));
    }
  }, [formText]);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const filters = {
        completed: filter === 'completed' ? true : filter === 'active' ? false : undefined,
        urgent: filter === 'urgent' ? true : undefined,
        isDebt: filter === 'debt' ? true : undefined,
        search: search || undefined,
      };

      const result = await invoke<UnifiedGoal[]>('get_unified_goals', { filters });
      setGoals(result);
    } catch (err) {
      toast.error('Failed to load goals', { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGoal = async () => {
    if (!formText.trim()) return;

    let dueDate = undefined;
    if (formDate) {
      const dateStr = format(formDate, 'yyyy-MM-dd');
      const d = new Date(`${dateStr}T${formTime || '00:00'}`);
      dueDate = d.toISOString();
    }

    const metricsData = formMetrics.map(m => ({
      id: crypto.randomUUID(),
      label: m.label,
      target: parseFloat(m.target),
      current: 0,
      unit: m.unit
    }));

    try {
      await invoke('create_unified_goal', {
        req: {
          text: formText,
          description: formDescription || undefined,
          priority: formPriority,
          urgent: formUrgent,
          dueDate,
          recurringPattern: selectedDays.length > 0 ? selectedDays.join(',') : undefined,
          metrics: metricsData.length > 0 ? metricsData : undefined,
          problemId: formProblemId || undefined,
        },
      });

      toast.success('Goal created');
      setIsModalOpen(false);
      resetForm();
      loadGoals();
    } catch (err) {
      toast.error('Failed to create goal', { description: String(err) });
    }
  };

  const resetForm = () => {
    setFormText('');
    setFormDescription('');
    setFormPriority('medium');
    setFormUrgent(false);
    setFormDate(undefined);
    setFormTime('');
    setFormProblemId('');
    setFormMetrics([]);
    setNewMetric({ label: '', target: '', unit: '' });
    setSelectedDays([]);
  };

  const deleteGoal = async (id: string) => {
    try {
      await invoke('delete_unified_goal', { id });
      toast.success('Goal deleted');
      loadGoals();
    } catch (err) {
      toast.error('Failed to delete goal', { description: String(err) });
    }
  };

  const updateMetric = async (goalId: string, metricId: string, newValue: number, allMetrics: UnifiedGoalMetric[]) => {
    try {
      const updatedMetrics = allMetrics.map(m =>
        m.id === metricId ? { ...m, current: newValue } : m
      );
      await invoke('update_unified_goal', {
        id: goalId,
        req: { metrics: updatedMetrics }
      });
      loadGoals();
      toast.success('Metric updated');
    } catch (err) {
      toast.error('Failed to update metric', { description: String(err) });
    }
  };

  const addMetric = () => {
    if (newMetric.target && newMetric.unit) {
      setFormMetrics([...formMetrics, { ...newMetric, label: newMetric.label || 'Target' }]);
      setNewMetric({ label: '', target: '', unit: '' });
    }
  };

  const removeMetric = (index: number) => {
    setFormMetrics(formMetrics.filter((_, i) => i !== index));
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  // Filtering & Sorting
  const filteredGoals = useMemo(() => {
    let res = goals;

    if (search) {
      res = res.filter(g => g.text.toLowerCase().includes(search.toLowerCase()));
    }

    return res.sort((a, b) => {
      if (sortBy === 'priority') {
        const pMap = { high: 3, medium: 2, low: 1 };
        return pMap[b.priority as keyof typeof pMap] - pMap[a.priority as keyof typeof pMap];
      }
      if (sortBy === 'due') {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [goals, search, sortBy]);

  const stats = {
    total: goals.length,
    completed: goals.filter(g => g.completed).length,
    pending: goals.filter(g => !g.completed).length,
    urgent: goals.filter(g => g.urgent && !g.completed).length,
    debt: goals.filter(g => g.isDebt).length,
  };

  const debtGoals = goals.filter(g => g.isDebt && !g.completed);
  const regularGoals = filteredGoals.filter(g => !g.isDebt);

  const chartData = [
    { name: 'Completed', value: stats.completed, color: '#10B981' },
    { name: 'Pending', value: stats.pending, color: '#EF4444' },
  ];

  if (loading) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex-1 flex items-center justify-center">
          <Loader />
        </div>
      </div>
    );
  }

  function toggleGoal(): void {
    throw new Error('Function not implemented.');
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header with Stats */}
      <div className="border-b p-8 shadow-sm" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">Goals</h1>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Unified task and goal management</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 rounded-lg shadow-sm transition-all hover:opacity-90"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <Plus className="w-5 h-5 mr-2" />
            New Goal
          </button>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
          <div className="p-6 rounded-2xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <p className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--pos-info-text)' }}>Total</p>
            <p className="text-4xl font-bold mt-2">{stats.total}</p>
          </div>
          <div className="p-6 rounded-2xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <p className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--pos-success-text)' }}>Completed</p>
            <p className="text-4xl font-bold mt-2">{stats.completed}</p>
          </div>
          <div className="p-6 rounded-2xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <p className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--pos-warning-text)' }}>Pending</p>
            <p className="text-4xl font-bold mt-2">{stats.pending}</p>
          </div>
          <div className="p-6 rounded-2xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <p className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--pos-error-text)' }}>Urgent</p>
            <p className="text-4xl font-bold mt-2">{stats.urgent}</p>
          </div>
          <div className="p-6 rounded-2xl border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            <p className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--pos-debt-text)' }}>Debt</p>
            <p className="text-4xl font-bold mt-2">{stats.debt}</p>
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={50}
                  paddingAngle={5}
                  dataKey="value"
                  shape={(props: any) => {
                    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, payload } = props;
                    const fill = payload.color;
                    return (
                      <path
                        d={`M ${cx},${cy} L ${cx + outerRadius * Math.cos(-startAngle * Math.PI / 180)},${cy + outerRadius * Math.sin(-startAngle * Math.PI / 180)} A ${outerRadius},${outerRadius} 0 ${endAngle - startAngle > 180 ? 1 : 0},1 ${cx + outerRadius * Math.cos(-endAngle * Math.PI / 180)},${cy + outerRadius * Math.sin(-endAngle * Math.PI / 180)} L ${cx + innerRadius * Math.cos(-endAngle * Math.PI / 180)},${cy + innerRadius * Math.sin(-endAngle * Math.PI / 180)} A ${innerRadius},${innerRadius} 0 ${endAngle - startAngle > 180 ? 1 : 0},0 ${cx + innerRadius * Math.cos(-startAngle * Math.PI / 180)},${cy + innerRadius * Math.sin(-startAngle * Math.PI / 180)} Z`}
                        fill={fill}
                      />
                    );
                  }}
                />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-4 border-b flex flex-wrap items-center justify-between gap-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search goals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadGoals()}
              className="w-full pl-10 pr-4 py-2 border-none rounded-lg focus:ring-2 focus:ring-blue-500"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase" style={{ color: 'var(--text-secondary)' }}>Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm font-mono"
              style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg p-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {(['all', 'active', 'completed', 'urgent', 'debt'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-all',
                  filter === f ? 'shadow-sm' : ''
                )}
                style={{
                  backgroundColor: filter === f ? 'var(--bg-primary)' : 'transparent',
                  color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'priority' | 'due')}
            className="px-3 py-2 rounded-lg text-sm font-medium border-none focus:ring-2 focus:ring-blue-500"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            <option value="newest">Newest First</option>
            <option value="priority">Priority</option>
            <option value="due">Due Date</option>
          </select>
        </div>
      </div>

      {/* Goals List */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="space-y-8 max-w-5xl mx-auto">
          {/* Regular Goals */}
          <div className="space-y-3">
            {regularGoals.map((goal) => (
            <div
              key={goal.id}
              className="group relative overflow-hidden transition-all hover:shadow-lg"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div className="flex items-start gap-4 p-4">
                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Title and badges */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3
                      className={clsx(
                        'text-base font-semibold leading-tight',
                        goal.completed && 'line-through opacity-60'
                      )}
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {goal.text}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {goal.verified && (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'var(--pos-success-bg)' }}
                          title="Verified"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--pos-success-text)' }} />
                        </div>
                      )}
                      {goal.recurringPattern && (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'var(--pos-info-bg)' }}
                          title={`Repeats: ${goal.recurringPattern}`}
                        >
                          <Repeat className="w-3.5 h-3.5" style={{ color: 'var(--pos-info-text)' }} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status badges row */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {goal.urgent && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: 'var(--pos-error-bg)', color: 'var(--pos-error-text)' }}
                      >
                        Urgent
                      </span>
                    )}
                    {goal.priority === 'high' && !goal.urgent && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: 'var(--pos-warning-bg)', color: 'var(--pos-warning-text)' }}
                      >
                        High Priority
                      </span>
                    )}
                    {goal.isDebt && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: 'var(--pos-debt-bg)', color: 'var(--pos-debt-text)' }}
                      >
                        Overdue
                      </span>
                    )}
                    {goal.dueDate && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <Calendar className="w-3 h-3" />
                        {format(new Date(goal.dueDate), 'MMM d, HH:mm')}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {goal.description && (
                    <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
                      {goal.description}
                    </p>
                  )}

                  {/* Problem ID */}
                  {goal.problemId && (
                    <div className="mb-3">
                      <code
                        className="text-xs px-2 py-1 rounded"
                        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
                      >
                        {goal.problemId}
                      </code>
                    </div>
                  )}

                  {/* Metrics */}
                  {goal.metrics && goal.metrics.length > 0 && (
                    <div className="space-y-2.5 mb-3">
                      {goal.metrics.map((metric) => {
                        const progress = Math.min((metric.current / metric.target) * 100, 100);
                        return (
                          <div key={metric.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {metric.label}
                              </span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={metric.current}
                                  onChange={(e) =>
                                    updateMetric(goal.id, metric.id, parseFloat(e.target.value) || 0, goal.metrics!)
                                  }
                                  className="w-14 px-1.5 py-0.5 text-xs text-center font-mono border rounded"
                                  style={{
                                    backgroundColor: 'var(--bg-primary)',
                                    borderColor: 'var(--border-color)',
                                    color: 'var(--text-primary)',
                                  }}
                                />
                                <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  / {metric.target} {metric.unit}
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
                              <div
                                className="h-full transition-all duration-300 rounded-full"
                                style={{
                                  width: `${progress}%`,
                                  backgroundColor:
                                    progress === 100
                                      ? 'var(--pos-success-text)'
                                      : progress >= 75
                                      ? 'var(--pos-info-text)'
                                      : 'var(--pos-warning-text)',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer metadata */}
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <span>Created {format(new Date(goal.createdAt), 'MMM d')}</span>
                    {goal.originalDate && (
                      <>
                        <span>•</span>
                        <span style={{ color: 'var(--pos-debt-text)' }}>From {goal.originalDate}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => deleteGoal(goal.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 rounded-lg transition-all hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--pos-error-text)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  title="Delete goal"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {regularGoals.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <Target className="w-8 h-8" style={{ color: 'var(--text-secondary)' }} />
              </div>
              <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>No goals found</p>
            </div>
          )}
          </div>

          {/* Debt Locker Section */}
          {debtGoals.length > 0 && (
            <div className="rounded-lg p-6 border" style={{
              borderColor: 'var(--pos-debt-border)',
              backgroundColor: 'var(--pos-debt-bg)'
            }}>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--pos-debt-text)' }}>
                Debt Locker <span className="text-xs font-normal px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>{debtGoals.length} items</span>
              </h2>

              <div className="space-y-3">
                {debtGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="group rounded-lg p-4 transition-all hover:opacity-80 border flex items-start gap-4"
                    style={{
                      borderColor: 'var(--pos-debt-border)',
                      backgroundColor: 'var(--pos-debt-bg)'
                    }}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{goal.text}</p>
                      {goal.description && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {goal.description}
                        </p>
                      )}
                      <p className="text-xs mt-1" style={{ color: 'var(--pos-debt-text)' }}>
                        From {goal.originalDate}
                      </p>
                    </div>

                    <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold" style={{
                      backgroundColor: 'var(--pos-debt-bg)',
                      color: 'var(--pos-debt-text)',
                      borderColor: 'var(--pos-debt-border)',
                      borderWidth: '1px'
                    }}>
                      Overdue
                    </span>

                    <button
                      onClick={() => deleteGoal(goal.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 rounded-lg transition-all"
                      style={{ color: 'var(--pos-error-text)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="p-6 border-b flex justify-between items-center sticky top-0 z-10" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
              <div>
                <h3 className="text-lg font-bold">New Goal</h3>
                {selectedDays.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--pos-info-text)' }}>
                    Recurring Template
                  </p>
                )}
              </div>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} style={{ color: 'var(--text-secondary)' }} className="hover:opacity-80">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Goal Text */}
              <div>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Goal</label>
                <input
                  autoFocus
                  type="text"
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="e.g. Submit report by Friday urgent"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
                <p className="text-xs mt-1 italic" style={{ color: 'var(--pos-info-text)' }}>
                  Tip: Try "tomorrow" or "urgent" for smart parsing
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg h-20 resize-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Priority & Urgent */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Priority</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as 'low' | 'medium' | 'high')}
                    className="w-full px-3 py-2 border rounded-lg"
                    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center space-x-2 cursor-pointer p-2 border rounded-lg w-full transition-colors" style={{ borderColor: 'var(--border-color)' }}>
                    <input
                      type="checkbox"
                      checked={formUrgent}
                      onChange={(e) => setFormUrgent(e.target.checked)}
                      className="w-4 h-4 rounded focus:ring-red-500"
                      style={{ accentColor: 'var(--pos-error-text)' }}
                    />
                    <span className="text-sm font-medium" style={{ color: 'var(--pos-error-text)' }}>Mark Urgent</span>
                  </label>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Due Date</label>
                  <DatePicker date={formDate} setDate={setFormDate} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Time</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {/* Problem ID */}
              <div>
                <label className="block text-xs font-semibold uppercase mb-1" style={{ color: 'var(--text-secondary)' }}>Problem ID / URL (Optional)</label>
                <input
                  type="text"
                  value={formProblemId}
                  onChange={(e) => setFormProblemId(e.target.value)}
                  placeholder="LeetCode/Codeforces URL or ID"
                  className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                  style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Metrics */}
              <div className="rounded-md p-4 space-y-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <div>
                  <label className="block text-xs font-semibold uppercase mb-2" style={{ color: 'var(--text-secondary)' }}>Quantitative Tracking (Optional)</label>

                  <div className="space-y-2 mb-2">
                    {formMetrics.map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                        <span className="font-semibold" style={{ color: 'var(--pos-goal-link-text)' }}>{m.label}:</span>
                        <span>{m.target} {m.unit}</span>
                        <button onClick={() => removeMetric(idx)} className="ml-auto hover:opacity-80" style={{ color: 'var(--pos-error-text)' }}>×</button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      placeholder="Label (e.g. Pushups)"
                      className="w-1/3 px-3 py-2 border rounded-lg text-sm"
                      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      value={newMetric.label}
                      onChange={(e) => setNewMetric({ ...newMetric, label: e.target.value })}
                    />
                    <input
                      type="number"
                      placeholder="Target"
                      className="w-1/4 px-3 py-2 border rounded-lg text-sm"
                      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      value={newMetric.target}
                      onChange={(e) => setNewMetric({ ...newMetric, target: e.target.value })}
                    />
                    <input
                      placeholder="Unit (e.g. reps)"
                      className="w-1/4 px-3 py-2 border rounded-lg text-sm"
                      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      value={newMetric.unit}
                      onChange={(e) => setNewMetric({ ...newMetric, unit: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && addMetric()}
                    />
                    <button onClick={addMetric} className="px-4 py-2 rounded-lg font-bold" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>+</button>
                  </div>
                </div>

                {/* Recurring Pattern */}
                <div>
                  <label className="block text-xs font-semibold uppercase mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <Repeat className="w-3 h-3" /> Repeat On
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map(day => (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className="w-9 h-9 rounded-full text-xs font-bold transition-all border"
                        style={{
                          backgroundColor: selectedDays.includes(day) ? 'var(--pos-goal-link-border)' : 'var(--bg-primary)',
                          borderColor: selectedDays.includes(day) ? 'var(--pos-goal-link-border)' : 'var(--border-color)',
                          color: selectedDays.includes(day) ? 'white' : 'var(--text-secondary)'
                        }}
                      >
                        {day.charAt(0)}
                      </button>
                    ))}
                    <button
                      onClick={() => setSelectedDays(selectedDays.length === 7 ? [] : [...WEEKDAYS])}
                      className="text-[10px] uppercase ml-2 hover:opacity-80"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {selectedDays.length === 7 ? 'Clear' : 'All'}
                    </button>
                  </div>
                  <p className="text-[10px] mt-2" style={{ color: 'var(--text-secondary)' }}>
                    {selectedDays.length === 0
                      ? "Single goal for the selected date."
                      : `Repeating goal: Will appear every ${selectedDays.join(', ')}.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-3 sticky bottom-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
              <button
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                className="px-4 py-2 font-medium rounded-lg hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGoal}
                disabled={!formText.trim()}
                className="px-6 py-2 font-medium rounded-lg shadow-sm disabled:opacity-50"
                style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
              >
                {selectedDays.length > 0 ? 'Create Recurring Goal' : 'Create Goal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
