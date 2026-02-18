import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, RefreshCw, Plus, ExternalLink } from 'lucide-react';
import type { CFLadderProblem } from '../../pos/lib/types';

type RecommendationStrategy = 'ladder' | 'friends' | 'category' | 'rating' | 'hybrid';

interface DailyRecommendation {
  problem: CFLadderProblem;
  reason: string;
  strategy: RecommendationStrategy;
}

export function DailyProblemsPicker() {
  const [recommendations, setRecommendations] = useState<DailyRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<RecommendationStrategy>('hybrid');
  const [selectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadRecommendations();
  }, [strategy]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      // For now, mock data - backend command would be get_daily_recommendations
      const mockRecommendations: DailyRecommendation[] = [
        {
          problem: {
            id: '1',
            ladderId: 'ladder1',
            position: 1,
            name: 'Two Sum',
            url: 'https://codeforces.com/problemset/problem/1/A',
            onlineJudge: 'Codeforces',
            difficulty: 800,
            problemId: '1A',
          },
          reason: 'Next unsolved in Ladder 12',
          strategy: 'ladder',
        },
        {
          problem: {
            id: '2',
            ladderId: 'ladder1',
            position: 2,
            name: 'Array Manipulation',
            url: 'https://codeforces.com/problemset/problem/2/B',
            onlineJudge: 'Codeforces',
            difficulty: 1200,
            problemId: '2B',
          },
          reason: 'Solved by 3 friends recently',
          strategy: 'friends',
        },
        {
          problem: {
            id: '3',
            ladderId: 'ladder1',
            position: 3,
            name: 'Dynamic Programming',
            url: 'https://codeforces.com/problemset/problem/3/C',
            onlineJudge: 'Codeforces',
            difficulty: 1600,
            problemId: '3C',
          },
          reason: 'Weak category: DP',
          strategy: 'category',
        },
      ];
      setRecommendations(mockRecommendations);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const addToGoals = async (problem: CFLadderProblem) => {
    try {
      await invoke('create_unified_goal', {
        goal: {
          text: `Solve ${problem.problemId}: ${problem.name}`,
          for_date: selectedDate,
          priority: 'medium',
          category: 'coding_codeforces',
        },
      });
      alert('Added to goals!');
    } catch (err) {
      console.error('Failed to add to goals:', err);
    }
  };

  const openProblem = (url: string) => {
    window.open(url, '_blank');
  };

  const strategyButtons: { key: RecommendationStrategy; label: string; icon: string }[] = [
    { key: 'hybrid', label: 'Hybrid', icon: '🎯' },
    { key: 'ladder', label: 'Ladder', icon: '📊' },
    { key: 'friends', label: 'Friends', icon: '👥' },
    { key: 'category', label: 'Category', icon: '📚' },
    { key: 'rating', label: 'Rating', icon: '⭐' },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Sparkles size={28} style={{ color: 'var(--color-accent-primary)' }} />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Daily Problem Recommendations
          </h1>
        </div>
        <button
          onClick={loadRecommendations}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
          style={{
            backgroundColor: 'var(--btn-primary-bg)',
            color: 'var(--btn-primary-text)',
          }}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Strategy Selector */}
      <div
        className="p-4 rounded-lg mb-6"
        style={{
          backgroundColor: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          Recommendation Strategy
        </h2>
        <div className="flex flex-wrap gap-2">
          {strategyButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setStrategy(btn.key)}
              className="px-4 py-2 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor:
                  strategy === btn.key ? 'var(--color-accent-primary)' : 'var(--surface-secondary)',
                color: strategy === btn.key ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <span className="mr-2">{btn.icon}</span>
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p style={{ color: 'var(--text-secondary)' }}>Finding problems...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {recommendations.map((rec, idx) => (
            <div
              key={rec.problem.id}
              className="p-6 rounded-lg transition-all hover:scale-[1.01]"
              style={{
                backgroundColor: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="px-3 py-1 rounded-full text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--color-accent-primary)',
                        color: 'white',
                      }}
                    >
                      Problem {idx + 1}
                    </span>
                    <span
                      className="px-2 py-1 rounded text-xs"
                      style={{
                        backgroundColor:
                          rec.problem.difficulty < 1200
                            ? 'var(--pos-heatmap-level-1)'
                            : rec.problem.difficulty < 1600
                              ? 'var(--pos-heatmap-level-2)'
                              : rec.problem.difficulty < 2000
                                ? 'var(--pos-heatmap-level-3)'
                                : rec.problem.difficulty < 2400
                                  ? 'var(--pos-heatmap-level-4)'
                                  : 'var(--pos-heatmap-level-5)',
                        color: 'white',
                      }}
                    >
                      {rec.problem.difficulty}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {rec.problem.name}
                  </h3>
                  <p className="text-sm mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    {rec.problem.problemId} • {rec.problem.onlineJudge}
                  </p>
                  <p
                    className="text-sm px-3 py-1 rounded inline-block"
                    style={{
                      backgroundColor: 'var(--surface-secondary)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    💡 {rec.reason}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => openProblem(rec.problem.url)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:scale-105"
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    color: 'var(--color-accent-primary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <ExternalLink size={18} />
                  Open Problem
                </button>
                <button
                  onClick={() => addToGoals(rec.problem)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:scale-105"
                  style={{
                    backgroundColor: 'var(--color-success)',
                    color: 'white',
                  }}
                >
                  <Plus size={18} />
                  Add to Goals
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && recommendations.length === 0 && (
        <div className="text-center p-12">
          <Sparkles size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            No Recommendations
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Try a different strategy or add ladders and friends first
          </p>
        </div>
      )}
    </div>
  );
}
