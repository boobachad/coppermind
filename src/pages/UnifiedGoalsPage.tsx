import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import clsx from 'clsx';
import { UnifiedGoal } from '../pos/lib/types';
import { Loader } from '../components/Loader';
import { DatePicker } from '../components/DatePicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

// New Components
import { GoalStats } from '../pos/components/GoalStats';
import { GoalList } from '../pos/components/GoalList';
import { GoalFormModal } from '../pos/components/GoalFormModal';
import { MonthlyGoalWidget } from '../pos/components/MonthlyGoalWidget';
import { DebtTrail } from '../pos/components/DebtTrail';

export function UnifiedGoalsPage() {
  const [goals, setGoals] = useState<UnifiedGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'urgent' | 'debt'>('active');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'priority' | 'due'>('newest');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [editingGoal, setEditingGoal] = useState<UnifiedGoal | null>(null);

  useEffect(() => {
    loadGoals();
  }, []); // Only load on mount (and manual refreshes), filter change is local

  const loadGoals = async () => {
    setLoading(true);
    try {
      // Fetch ALL goals to support global stats + local filtering
      const filters = {
        timezone_offset: -new Date().getTimezoneOffset(),
        // No other filters - fetch everything!
      };

      const result = await invoke<UnifiedGoal[]>('get_unified_goals', { filters });
      setGoals(result);
    } catch (err) {
      toast.error('Failed to load goals', { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleEditGoal = (goal: UnifiedGoal) => {
    setEditingGoal(goal);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingGoal(null);
  };

  const handleModalSuccess = () => {
    handleModalClose();
    loadGoals();
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

  // Filtering & Sorting
  const filteredGoals = useMemo(() => {
    let res = goals;

    // 1. Text Search
    if (search) {
      res = res.filter(g => g.text.toLowerCase().includes(search.toLowerCase()));
    }

    // 2. View Filter
    if (filter === 'active') {
      res = res.filter(g => !g.completed && !g.isDebt);
    } else if (filter === 'completed') {
      res = res.filter(g => g.completed);
    } else if (filter === 'urgent') {
      res = res.filter(g => g.urgent); // Urgent shows regardless of debt status
    } else if (filter === 'debt') {
      res = res.filter(g => g.isDebt && !g.completed); // Show only incomplete debt
    }
    // 'all' shows everything (no filter needed)

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
  }, [goals, search, sortBy, filter]);

  const debtGoals = filteredGoals.filter(g => g.isDebt && !g.completed);
  const regularGoals = filteredGoals.filter(g => !g.isDebt);

  if (loading) {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex-1 flex items-center justify-center">
          <Loader />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden material-base transition-colors duration-300">
      {/* Header with Stats */}
      <div className="border-b p-8 shadow-sm transition-colors duration-300" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-(--text-primary)">Goals</h1>
            <p className="mt-1 text-muted-foreground">Unified task and goal management</p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 rounded-lg shadow-md transition-all hover:opacity-90 font-medium bg-primary text-primary-foreground"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Goal
          </button>
        </div>

        {/* Stats Dashboard */}
        <GoalStats goals={goals} />
        
        {/* Monthly Goals Widget */}
        <div className="mt-6">
          <MonthlyGoalWidget />
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-4 border-b flex flex-wrap items-center justify-between gap-4 transition-colors duration-300" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-tertiary)" />
            <input
              type="text"
              placeholder="Search goals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              // onKeyDown={(e) => e.key === 'Enter' && loadGoals()} // Search is now instant/local
              className="w-full pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
              style={{
                backgroundColor: 'var(--glass-bg-subtle)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)'
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase text-(--text-tertiary)">Date:</label>
            <div className="w-[180px]">
              <DatePicker
                date={selectedDate ? new Date(selectedDate) : undefined}
                setDate={(date) => setSelectedDate(date ? format(date, 'yyyy-MM-dd') : '')}
                placeholder="Filter by date"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-lg p-1 border" style={{ backgroundColor: 'var(--glass-bg-subtle)', borderColor: 'var(--border-color)' }}>
            {(['all', 'active', 'completed', 'urgent', 'debt'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-all',
                  filter === f ? 'shadow-sm' : 'hover:bg-white/5'
                )}
                style={{
                  backgroundColor: filter === f ? 'var(--bg-base)' : 'transparent',
                  color: filter === f ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'newest' | 'priority' | 'due')}>
            <SelectTrigger className="w-[160px] bg-background border-border text-foreground text-xs h-9 shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border text-popover-foreground">
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="due">Due Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Goals List */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        {/* Debt Trail (if debt exists) */}
        {debtGoals.length > 0 && (
          <div className="mb-8">
            <DebtTrail daysBack={30} onDebtResolved={loadGoals} />
          </div>
        )}
        
        {/* Goals Lists */}
        <GoalList
          regularGoals={regularGoals}
          debtGoals={debtGoals}
          onEdit={handleEditGoal}
          onDelete={deleteGoal}
        />
      </div>

      {/* Create/Edit Modal */}
      <GoalFormModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        editingGoal={editingGoal}
      />
    </div>
  );
}
