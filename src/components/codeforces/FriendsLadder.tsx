import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Target, ExternalLink, Plus, RefreshCw } from 'lucide-react';

interface FriendsLadderProblem {
  problem_id: string;
  problem_name: string;
  contest_id: number;
  index: string;
  difficulty: number | null;
  solved_by: string[];
  solve_count: number;
}

export function FriendsLadder() {
  const [problems, setProblems] = useState<FriendsLadderProblem[]>([]);
  const [loading, setLoading] = useState(false);
  const [minDifficulty, setMinDifficulty] = useState(800);
  const [maxDifficulty, setMaxDifficulty] = useState(2000);
  const [daysBack, setDaysBack] = useState(30);
  const [limit, setLimit] = useState(50);

  const handleGenerate = async () => {
    try {
      setLoading(true);
      const data = await invoke<FriendsLadderProblem[]>('generate_friends_ladder', {
        minDifficulty,
        maxDifficulty,
        daysBack,
        limit,
      });
      setProblems(data);
    } catch (err) {
      console.error('Failed to generate ladder:', err);
    } finally {
      setLoading(false);
    }
  };

  const openProblem = (contestId: number, index: string) => {
    window.open(`https://codeforces.com/problemset/problem/${contestId}/${index}`, '_blank');
  };

  const addToGoals = async (problem: FriendsLadderProblem) => {
    try {
      await invoke('create_unified_goal', {
        goal: {
          text: `Solve CF ${problem.contest_id}${problem.index}: ${problem.problem_name}`,
          for_date: new Date().toISOString().split('T')[0],
          priority: 'medium',
          category: 'coding_codeforces',
        },
      });
      alert('Added to goals!');
    } catch (err) {
      console.error('Failed to add to goals:', err);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Target size={28} style={{ color: 'var(--color-accent-primary)' }} />
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Friends Ladder Generator
        </h1>
      </div>

      {/* Filters */}
      <div
        className="p-6 rounded-lg mb-6"
        style={{
          backgroundColor: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Filter Options
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Min Difficulty
            </label>
            <input
              type="number"
              value={minDifficulty}
              onChange={(e) => setMinDifficulty(Number(e.target.value))}
              step={100}
              min={800}
              max={3500}
              className="w-full px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div>
            <label className="block mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Max Difficulty
            </label>
            <input
              type="number"
              value={maxDifficulty}
              onChange={(e) => setMaxDifficulty(Number(e.target.value))}
              step={100}
              min={800}
              max={3500}
              className="w-full px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div>
            <label className="block mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Last N Days
            </label>
            <input
              type="number"
              value={daysBack}
              onChange={(e) => setDaysBack(Number(e.target.value))}
              min={1}
              max={365}
              className="w-full px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div>
            <label className="block mb-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Max Problems
            </label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              min={10}
              max={200}
              className="w-full px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-4 flex items-center gap-2 px-6 py-3 rounded-lg transition-all disabled:opacity-50"
          style={{
            backgroundColor: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-text)',
          }}
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Generating...' : 'Generate Ladder'}
        </button>
      </div>

      {/* Problems Table */}
      {problems.length > 0 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: 'var(--surface-secondary)' }}>
                  <th className="px-4 py-3 text-left" style={{ color: 'var(--text-primary)' }}>
                    #
                  </th>
                  <th className="px-4 py-3 text-left" style={{ color: 'var(--text-primary)' }}>
                    Problem
                  </th>
                  <th className="px-4 py-3 text-center" style={{ color: 'var(--text-primary)' }}>
                    Difficulty
                  </th>
                  <th className="px-4 py-3 text-center" style={{ color: 'var(--text-primary)' }}>
                    Solved By
                  </th>
                  <th className="px-4 py-3 text-right" style={{ color: 'var(--text-primary)' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {problems.map((problem, idx) => (
                  <tr
                    key={problem.problem_id}
                    className="transition-colors hover:bg-opacity-50"
                    style={{
                      borderTop: '1px solid var(--border-primary)',
                    }}
                  >
                    <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {problem.problem_name}
                        </div>
                        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                          {problem.contest_id}
                          {problem.index}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {problem.difficulty && (
                        <span
                          className="px-2 py-1 rounded text-sm"
                          style={{
                            backgroundColor:
                              problem.difficulty < 1200
                                ? 'var(--pos-heatmap-level-1)'
                                : problem.difficulty < 1600
                                  ? 'var(--pos-heatmap-level-2)'
                                  : problem.difficulty < 2000
                                    ? 'var(--pos-heatmap-level-3)'
                                    : problem.difficulty < 2400
                                      ? 'var(--pos-heatmap-level-4)'
                                      : 'var(--pos-heatmap-level-5)',
                            color: 'white',
                          }}
                        >
                          {problem.difficulty}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className="px-2 py-1 rounded text-sm font-semibold"
                          style={{
                            backgroundColor: 'var(--color-accent-primary)',
                            color: 'white',
                          }}
                        >
                          {problem.solve_count}
                        </span>
                        {problem.solved_by.length > 0 && (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            ({problem.solved_by.slice(0, 3).join(', ')}
                            {problem.solved_by.length > 3 ? '...' : ''})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openProblem(problem.contest_id, problem.index)}
                          className="p-2 rounded-lg hover:scale-110 transition-transform"
                          style={{
                            backgroundColor: 'var(--surface-secondary)',
                            color: 'var(--color-accent-primary)',
                          }}
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button
                          onClick={() => addToGoals(problem)}
                          className="p-2 rounded-lg hover:scale-110 transition-transform"
                          style={{
                            backgroundColor: 'var(--color-success)',
                            color: 'white',
                          }}
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

      {/* Empty State */}
      {!loading && problems.length === 0 && (
        <div className="text-center p-12">
          <Target size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            No Ladder Generated
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Set your filters and click Generate to create a ladder from your friends' solutions
          </p>
        </div>
      )}
    </div>
  );
}
