import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ExternalLink, CheckCircle, Circle, Target, ArrowLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Loader } from '@/components/Loader';
import type { CFLadderProblem, LadderStats } from '../../pos/lib/types';
import { getLocalDateString } from '../../pos/lib/time';

interface ProblemSetData {
  id: string;
  name: string;
  description: string | null;
  difficulty?: number | null;
}

interface ProblemSetViewProps {
  itemId: string;
  getItemCommand: string;
  itemParamName: 'ladderId' | 'categoryId';
  getProblemsCommand: string;
  problemsParamName: 'ladderId' | 'categoryId';
  getStatsCommand: string;
  statsParamName: 'ladderId' | 'categoryId';
  backButtonText: string;
  onBack: () => void;
  headerIcon?: React.ReactNode;
  showDifficulty?: boolean;
  showStatusColumn?: boolean;
}

export function ProblemSetView({
  itemId,
  getItemCommand,
  itemParamName,
  getProblemsCommand,
  problemsParamName,
  getStatsCommand,
  statsParamName,
  backButtonText,
  onBack,
  headerIcon,
  showDifficulty = false,
  showStatusColumn = false,
}: ProblemSetViewProps) {
  const [item, setItem] = useState<ProblemSetData | null>(null);
  const [problems, setProblems] = useState<CFLadderProblem[]>([]);
  const [stats, setStats] = useState<LadderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [goalAdded, setGoalAdded] = useState<string | null>(null);

  useEffect(() => {
    if (itemId) loadData();
  }, [itemId]);

  const loadData = async () => {
    if (!itemId) return;
    try {
      setLoading(true);
      const [itemData, problemsData, statsData] = await Promise.all([
        invoke<ProblemSetData>(getItemCommand, { [itemParamName]: itemId }),
        invoke<CFLadderProblem[]>(getProblemsCommand, { [problemsParamName]: itemId }),
        invoke<LadderStats>(getStatsCommand, { [statsParamName]: itemId }),
      ]);
      setItem(itemData);
      setProblems(problemsData || []);
      setStats(statsData);
    } catch (err) {
      toast.error('Failed to load data', { description: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToGoals = async (problem: CFLadderProblem) => {
    try {
      await invoke('create_unified_goal', {
        req: {
          text: `Solve ${problem.onlineJudge}: ${problem.problemName}`,
          dueDate: `${getLocalDateString()}T00:00:00Z`,
          priority: 'medium',
          problemId: problem.problemUrl,
        },
      });
      setGoalAdded(problem.id);
      setTimeout(() => setGoalAdded(null), 2000);
      toast.success('Added to goals');
    } catch (err) {
      toast.error('Failed to add to goals', { description: String(err) });
      console.error('Failed to add to goals:', err);
    }
  };

  const getDifficultyColor = (level: number | null) => {
    if (!level) return 'var(--pos-heatmap-level-1)';
    if (level <= 1200) return 'var(--pos-heatmap-level-2)';
    if (level <= 1800) return 'var(--pos-heatmap-level-3)';
    if (level <= 2400) return 'var(--pos-heatmap-level-4)';
    return 'var(--pos-heatmap-level-5)';
  };

  const getProgressColor = (percent: number) => {
    if (percent === 0) return 'var(--text-tertiary)';
    if (percent < 25) return 'var(--pos-heatmap-level-1)';
    if (percent < 50) return 'var(--pos-heatmap-level-2)';
    if (percent < 75) return 'var(--pos-heatmap-level-3)';
    if (percent < 100) return 'var(--pos-heatmap-level-4)';
    return 'var(--color-success)';
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div className="text-center">
          <Loader />
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-error)' }}>
        Not found
      </div>
    );
  }

  const progressPercent = stats ? Math.round(stats.progressPercentage) : 0;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', background: 'transparent',
              border: '1px solid var(--border-primary)', borderRadius: '0.5rem',
              color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: '1rem',
            }}
          >
            <ArrowLeft size={16} />{backButtonText}
          </button>

          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '1rem', padding: '2rem', backdropFilter: 'blur(10px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              {headerIcon && (
                <div style={{ padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: '0.75rem' }}>
                  {headerIcon}
                </div>
              )}
              <h1 style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                {item.name}
              </h1>
            </div>

            {item.description && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: '1.6', marginLeft: headerIcon ? '4.5rem' : '0' }}>
                {item.description}
              </p>
            )}

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '2rem', marginLeft: headerIcon ? '0.5rem' : '0' }}>
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Progress</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {stats?.solved ?? 0} / {stats?.totalProblems ?? 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Attempted</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {stats?.attempted ?? 0}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Completion</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '600', color: getProgressColor(progressPercent) }}>{progressPercent}%</div>
              </div>
              {showDifficulty && item.difficulty != null && (
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Difficulty</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '600', padding: '0.25rem 0.75rem', background: getDifficultyColor(item.difficulty), borderRadius: '0.5rem', display: 'inline-block' }}>
                    Level {item.difficulty}
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: '1.5rem', height: '8px', background: 'var(--surface-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPercent}%`, background: getProgressColor(progressPercent), transition: 'width 0.3s ease' }} />
            </div>
          </div>
        </div>

        {/* Problems Table */}
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '1rem', overflow: 'hidden', backdropFilter: 'blur(10px)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '60px' }}>#</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Problem</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '120px' }}>Judge</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '100px' }}>Rating</th>
                  {showStatusColumn && (
                    <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '120px' }}>Status</th>
                  )}
                  <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '140px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem, idx) => (
                  <tr key={problem.id} style={{ borderBottom: '1px solid var(--border-secondary)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '1rem', color: 'var(--text-tertiary)' }}>{problem.position || idx + 1}</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {problem.status === 'OK'
                          ? <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
                          : problem.status
                            ? <Circle size={16} style={{ color: 'var(--color-warning)' }} />
                            : <Circle size={16} style={{ color: 'var(--text-tertiary)' }} />}
                        <span style={{ color: 'var(--text-primary)', fontWeight: problem.status === 'OK' ? '500' : '400' }}>
                          {problem.problemName}
                        </span>
                      </div>
                      {problem.solvedByFriends && problem.solvedByFriends.length > 0 && (
                        <div style={{ marginLeft: '1.5rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          <span role="img" aria-label="friends">👥</span> Solved by: <span style={{ color: 'var(--text-secondary)' }}>{problem.solvedByFriends.slice(0, 3).join(', ')}</span>
                          {problem.solvedByFriends.length > 3 && <span> (+{problem.solvedByFriends.length - 3} more)</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{problem.onlineJudge}</td>
                    <td style={{ padding: '1rem' }}>
                      {problem.difficulty != null && (
                        <span style={{ padding: '0.25rem 0.5rem', background: getDifficultyColor(problem.difficulty), borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: '500' }}>
                          {problem.difficulty}
                        </span>
                      )}
                    </td>
                    {showStatusColumn && (
                      <td style={{ padding: '1rem', textAlign: 'center' }}>
                        {problem.status === 'OK'
                          ? <span style={{ color: 'var(--color-success)', fontSize: '0.875rem', fontWeight: '500' }}>OK</span>
                          : problem.status
                            ? <span style={{ color: 'var(--color-warning)', fontSize: '0.875rem', fontWeight: '500' }}>{problem.status}</span>
                            : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>Not Started</span>}
                      </td>
                    )}
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          onClick={() => invoke('open_link', { url: problem.problemUrl })}
                          style={{ padding: '0.375rem 0.5rem', background: 'var(--surface-secondary)', border: 'none', borderRadius: '0.375rem', color: 'var(--text-primary)', cursor: 'pointer' }}
                          title="Open problem"
                        >
                          <ExternalLink size={14} />
                        </button>

                        <button
                          onClick={() => handleAddToGoals(problem)}
                          style={{
                            padding: '0.375rem 0.5rem',
                            background: goalAdded === problem.id ? 'var(--color-success)' : 'var(--btn-primary-bg)',
                            border: 'none', borderRadius: '0.375rem',
                            color: 'var(--btn-primary-text)', cursor: 'pointer',
                          }}
                          title="Add to goals"
                        >
                          {goalAdded === problem.id ? <CheckCircle size={14} /> : <Plus size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {problems.length === 0 && (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <Target size={48} style={{ opacity: 0.3, margin: '0 auto 1rem' }} />
              <p>No problems yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
