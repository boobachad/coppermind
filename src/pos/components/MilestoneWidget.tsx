import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Milestone } from '../lib/types';
import { MonthlyGoalCard } from './MonthlyGoalCard';
import { MonthlyGoalModal } from './MonthlyGoalModal';
import { Loader } from '@/components/Loader';

interface MilestoneWidgetProps {
  /**
   * If provided, only show goals for this specific month (YYYY-MM format)
   * Otherwise, shows all active milestones
   */
  month?: string;
  /**
   * If true, shows goals from all time periods, not just active ones
   */
  showAll?: boolean;
  /**
   * If true, opens the create modal on mount
   */
  openCreateModal?: boolean;
  /**
   * If true, the selected month is in the past (read-only mode)
   */
  isArchived?: boolean;
}

export function MilestoneWidget({ month, showAll = false, openCreateModal = false, isArchived = false }: MilestoneWidgetProps) {
  const [goals, setGoals] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Milestone | null>(null);

  useEffect(() => {
    loadMilestones();
  }, [month, showAll]);

  useEffect(() => {
    if (openCreateModal) {
      setIsModalOpen(true);
    }
  }, [openCreateModal]);

  const loadMilestones = async () => {
    setLoading(true);
    try {
      const result = await invoke<Milestone[]>('get_milestones', {
        activeOnly: false, // Always fetch all milestones for month filtering
      });

      // Filter by month if specified
      let filtered = result;
      if (month) {
        // Get month boundaries in YYYY-MM-DD format (no timezone conversion)
        const [year, monthNum] = month.split('-').map(Number);
        const monthStartStr = `${year}-${String(monthNum).padStart(2, '0')}-01`;
        
        // Calculate last day of month
        const lastDay = new Date(year, monthNum, 0).getDate(); // monthNum is next month, day 0 = last day of previous
        const monthEndStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        filtered = result.filter(goal => {
          const goalStart = goal.periodStart.split('T')[0];
          const goalEnd = goal.periodEnd.split('T')[0];
          
          // Milestone overlaps with month if:
          // - It starts before month ends AND
          // - It ends after month starts
          return goalStart <= monthEndStr && goalEnd >= monthStartStr;
        });
      } else if (!showAll) {
        // If no month specified and not showAll, filter active only
        const now = new Date().toISOString();
        filtered = result.filter(goal => goal.periodEnd >= now);
      }

      setGoals(filtered);
    } catch (err) {
      toast.error('Failed to load milestones', { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGoal = () => {
    setEditingGoal(null);
    setIsModalOpen(true);
  };

  const handleEditGoal = (goal: Milestone) => {
    setEditingGoal(goal);
    setIsModalOpen(true);
  };

  const handleDeleteGoal = async (id: string) => {
    try {
      await invoke('delete_milestone', { id });
      toast.success('Milestone deleted');
      loadMilestones();
    } catch (err) {
      toast.error('Failed to delete milestone', { description: String(err) });
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingGoal(null);
  };

  const handleModalSuccess = () => {
    handleModalClose();
    loadMilestones();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Milestones
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Track period-based targets with automatic daily distribution
          </p>
        </div>
        {!isArchived && (
          <button
            onClick={handleCreateGoal}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <Plus className="w-4 h-4" />
            <span>New Milestone</span>
          </button>
        )}
      </div>

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center border"
          style={{
            backgroundColor: 'var(--glass-bg)',
            borderColor: 'var(--glass-border)',
          }}
        >
          <p className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>
            No milestones yet
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
            Create a milestone to automatically distribute daily targets across any period
          </p>
          <button
            onClick={handleCreateGoal}
            className="px-6 py-3 rounded-lg transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            Create Your First Milestone
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {goals.map(goal => (
            <MonthlyGoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => handleEditGoal(goal)}
              onDelete={() => handleDeleteGoal(goal.id)}
              isArchived={isArchived}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <MonthlyGoalModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        editingGoal={editingGoal}
      />
    </div>
  );
}
