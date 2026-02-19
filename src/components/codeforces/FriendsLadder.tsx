import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Target, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import type { FriendsLadderProblem } from '../../pos/lib/types';
import { getLocalDateString } from '../../pos/lib/time';

function diffLevel(d: number | null): number {
  if (!d) return 1;
  if (d < 1200) return 1;
  if (d < 1600) return 2;
  if (d < 2000) return 3;
  if (d < 2400) return 4;
  return 5;
}

export function FriendsLadder() {
  const [problems, setProblems] = useState<FriendsLadderProblem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minDifficulty, setMinDifficulty] = useState(800);
  const [maxDifficulty, setMaxDifficulty] = useState(2000);
  const [daysBack, setDaysBack] = useState(30);
  const [limit, setLimit] = useState(50);
  const [goalAdded, setGoalAdded] = useState<string | null>(null);

  const handleGenerate = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await invoke<FriendsLadderProblem[]>('generate_friends_ladder', {
        minDifficulty,
        maxDifficulty,
        daysBack,
        limit,
      });
      setProblems(data || []);
    } catch (err) {
      console.error('Failed to generate ladder:', err);
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const addToGoals = async (problem: FriendsLadderProblem) => {
    try {
      await invoke('create_unified_goal', {
        req: {
          text: `Solve ${problem.problemName} (${problem.problemId})`,
          dueDate: `${getLocalDateString()}T00:00:00Z`,
          priority: 'medium',
          problemId: problem.problemUrl,
        },
      });
      setGoalAdded(problem.problemId);
      setTimeout(() => setGoalAdded(null), 2000);
    } catch (err) {
      console.error('Failed to add to goals:', err);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Target size={28} style={{ color: 'var(--color-accent-primary)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Friends Ladder Generator
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-error)', color: 'white' }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="p-6 rounded-lg mb-6" style={{ backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(10px)' }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Filter Options</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Min Rating', value: minDifficulty, onChange: setMinDifficulty, min: 800, max: 3500, step: 100 },
            { label: 'Max Rating', value: maxDifficulty, onChange: setMaxDifficulty, min: 800, max: 3500, step: 100 },
            { label: 'Days Back', value: daysBack, onChange: setDaysBack, min: 7, max: 365, step: 7 },
            { label: 'Limit', value: limit, onChange: setLimit, min: 10, max: 200, step: 10 },
          ].map((field) => (
            <div key={field.label}>
              <label className="block mb-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{field.label}</label>
              <input
                type="number"
                value={field.value}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={(e) => field.onChange(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--surface-secondary)', border: '1px solid var(--border-primary)', color: 'var(--text-primary)' }}
              />
            </div>
          ))}
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2 rounded-lg transition-all hover:scale-105 disabled:opacity-50"
          style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Generating…' : 'Generate Ladder'}
        </button>
      </div>

      {/* Results */}
      {problems.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(10px)' }}>
          <div className="p-4 border-b" style={{ borderColor: 'var(--border-primary)' }}>
            <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {problems.length} Problems Found
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-secondary)' }}>
                  {['#', 'Problem', 'Rating', 'Solved By', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {problems.map((problem, idx) => (
                  <tr key={problem.problemId} style={{ borderTop: '1px solid var(--border-primary)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{problem.problemName}</div>
                      <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{problem.problemId}</div>
                    </td>
                    <td className="px-4 py-3">
                      {problem.difficulty != null && (
                        <span className="px-2 py-1 rounded text-sm" style={{ backgroundColor: `var(--pos-heatmap-level-${diffLevel(problem.difficulty)})`, color: 'white' }}>
                          {problem.difficulty}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="px-2 py-1 rounded text-sm font-semibold" style={{ backgroundColor: 'var(--color-accent-primary)', color: 'white' }}>
                          {problem.solveCount}
                        </span>
                        {problem.solvedBy.length > 0 && (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            ({problem.solvedBy.slice(0, 3).join(', ')}{problem.solvedBy.length > 3 ? '…' : ''})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => window.open(problem.problemUrl, '_blank')}
                          className="p-2 rounded-lg hover:scale-110 transition-transform"
                          style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--color-accent-primary)' }}
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button
                          onClick={() => addToGoals(problem)}
                          className="p-2 rounded-lg hover:scale-110 transition-transform"
                          style={{ backgroundColor: goalAdded === problem.problemId ? 'var(--color-success)' : 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && problems.length === 0 && (
        <div className="text-center p-12">
          <Target size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Ladder Generated</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Set your filters and click Generate to create a ladder from your friends' solved problems.
          </p>
        </div>
      )}
    </div>
  );
}
