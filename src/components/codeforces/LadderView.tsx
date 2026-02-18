import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { ExternalLink, CheckCircle, Circle, Target, ArrowLeft, Plus } from 'lucide-react';
import type { CFLadder, CFLadderProblem, LadderStats } from '../../pos/lib/types';

export default function LadderView() {
  const { ladderId } = useParams<{ ladderId: string }>();
  const navigate = useNavigate();
  const [ladder, setLadder] = useState<CFLadder | null>(null);
  const [problems, setProblems] = useState<CFLadderProblem[]>([]);
  const [stats, setStats] = useState<LadderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLadder();
  }, [ladderId]);

  const loadLadder = async () => {
    if (!ladderId) return;
    
    try {
      setLoading(true);
      const [ladderData, problemsData, statsData] = await Promise.all([
        invoke<CFLadder[]>('get_ladders', { filters: { id: ladderId } }),
        invoke<CFLadderProblem[]>('get_ladder_problems', { ladderId }),
        invoke<LadderStats>('get_ladder_stats', { ladderId })
      ]);
      
      if (ladderData && ladderData[0]) {
        setLadder(ladderData[0]);
        setProblems(problemsData || []);
        setStats(statsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ladder');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSolved = async (problemId: string) => {
    try {
      await invoke('track_ladder_progress', {
        request: {
          ladder_id: ladderId,
          problem_id: problemId,
          status: 'solved'
        }
      });
      await loadLadder(); // Refresh
    } catch (err) {
      console.error('Failed to mark as solved:', err);
    }
  };

  const handleAddToGoals = async (problem: CFLadderProblem) => {
    // TODO: Integration with UnifiedGoals
    console.log('Add to goals:', problem);
  };

  const getDifficultyColor = (level: number) => {
    if (level <= 2) return 'var(--pos-heatmap-level-2)';
    if (level <= 3) return 'var(--pos-heatmap-level-3)';
    if (level <= 4) return 'var(--pos-heatmap-level-4)';
    return 'var(--pos-heatmap-level-5)';
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '400px',
        color: 'var(--text-secondary)'
      }}>
        Loading ladder...
      </div>
    );
  }

  if (error || !ladder) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-error)' }}>
        {error || 'Ladder not found'}
      </div>
    );
  }

  const progressPercent = stats ? Math.round(stats.progressPercentage) : 0;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => navigate('/codeforces/ladders')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            borderRadius: '0.5rem',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          <ArrowLeft size={16} />
          Back to Ladders
        </button>

        <div style={{
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: '1rem',
          padding: '2rem',
          backdropFilter: 'blur(10px)'
        }}>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: '700', 
            marginBottom: '0.5rem',
            color: 'var(--text-primary)'
          }}>
            {ladder.title}
          </h1>
          
          {ladder.description && (
            <p style={{ 
              color: 'var(--text-secondary)', 
              marginBottom: '1.5rem',
              lineHeight: '1.6'
            }}>
              {ladder.description}
            </p>
          )}

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                Progress
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                {stats?.solved || 0} / {stats?.totalProblems || 0}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                Completion
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--color-success)' }}>
                {progressPercent}%
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                Difficulty
              </div>
              <div style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600',
                padding: '0.25rem 0.75rem',
                background: getDifficultyColor(ladder.difficulty),
                borderRadius: '0.5rem',
                display: 'inline-block'
              }}>
                Level {ladder.difficulty}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ 
              height: '8px', 
              background: 'var(--surface-secondary)', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                height: '100%', 
                width: `${progressPercent}%`,
                background: `linear-gradient(to right, var(--pos-heatmap-level-3), var(--pos-heatmap-level-5))`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Problems Table */}
      <div style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: '1rem',
        overflow: 'hidden',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ 
                background: 'var(--surface-secondary)',
                borderBottom: '1px solid var(--border-primary)'
              }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '60px' }}>#</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Problem</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '120px' }}>Judge</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '100px' }}>Difficulty</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '120px' }}>Status</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-secondary)', width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem, idx) => (
                <tr 
                  key={problem.id}
                  style={{ 
                    borderBottom: '1px solid var(--border-secondary)',
                    backgroundColor: problem.status === 'solved' ? 'var(--color-success)' : 'transparent',
                    opacity: problem.status === 'solved' ? 0.1 : 1,
                    transition: 'background 0.2s'
                  }}
                >
                  <td style={{ padding: '1rem', color: 'var(--text-tertiary)' }}>
                    {problem.position || idx + 1}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {problem.status === 'solved' ? (
                        <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
                      ) : (
                        <Circle size={16} style={{ color: 'var(--text-tertiary)' }} />
                      )}
                      <span style={{ 
                        color: 'var(--text-primary)', 
                        fontWeight: problem.status === 'solved' ? '500' : '400'
                      }}>
                        {problem.name}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    {problem.onlineJudge}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.5rem',
                      background: getDifficultyColor(problem.difficulty),
                      borderRadius: '0.375rem',
                      fontSize: '0.75rem',
                      fontWeight: '500'
                    }}>
                      {problem.difficulty}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'center' }}>
                    {problem.status === 'solved' ? (
                      <span style={{ color: 'var(--color-success)', fontSize: '0.875rem', fontWeight: '500' }}>
                        Solved
                      </span>
                    ) : problem.status === 'attempted' ? (
                      <span style={{ color: 'var(--color-warning)', fontSize: '0.875rem', fontWeight: '500' }}>
                        Attempted
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                        Not Started
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        onClick={() => window.open(problem.url, '_blank')}
                        style={{
                          padding: '0.375rem 0.75rem',
                          background: 'var(--btn-secondary-bg)',
                          border: 'none',
                          borderRadius: '0.375rem',
                          color: 'var(--btn-secondary-text)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.875rem'
                        }}
                        title="Open problem"
                      >
                        <ExternalLink size={14} />
                      </button>
                      
                      {problem.status !== 'solved' && (
                        <button
                          onClick={() => handleMarkSolved(problem.id)}
                          style={{
                            padding: '0.375rem 0.75rem',
                            background: 'var(--color-success)',
                            border: 'none',
                            borderRadius: '0.375rem',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.875rem'
                          }}
                          title="Mark as solved"
                        >
                          <CheckCircle size={14} />
                        </button>
                      )}

                      <button
                        onClick={() => handleAddToGoals(problem)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          background: 'var(--btn-primary-bg)',
                          border: 'none',
                          borderRadius: '0.375rem',
                          color: 'var(--btn-primary-text)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.875rem'
                        }}
                        title="Add to goals"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {problems.length === 0 && (
          <div style={{ 
            padding: '4rem 2rem', 
            textAlign: 'center',
            color: 'var(--text-tertiary)'
          }}>
            <Target size={48} style={{ opacity: 0.3, margin: '0 auto 1rem' }} />
            <p>No problems in this ladder yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
