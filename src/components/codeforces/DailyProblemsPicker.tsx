import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, RefreshCw, Plus, ExternalLink } from 'lucide-react';
import type { DailyRecommendation } from '../../pos/lib/types';
import { getLocalDateString } from '../../pos/lib/time';

type RecommendationStrategy = 'ladder' | 'friends' | 'category' | 'rating' | 'hybrid';

const STRATEGY_BUTTONS: { key: RecommendationStrategy; label: string; icon: string }[] = [
  { key: 'hybrid',   label: 'Hybrid',    icon: '🎯' },
  { key: 'ladder',   label: 'Ladder',    icon: '📊' },
  { key: 'friends',  label: 'Friends',   icon: '👥' },
  { key: 'category', label: 'Category',  icon: '📚' },
  { key: 'rating',   label: 'Rating',    icon: '⭐' },
];

function diffLevel(difficulty: number | null): number {
  if (!difficulty) return 1;
  if (difficulty < 1200) return 1;
  if (difficulty < 1600) return 2;
  if (difficulty < 2000) return 3;
  if (difficulty < 2400) return 4;
  return 5;
}

export function DailyProblemsPicker() {
  const [recommendations, setRecommendations] = useState<DailyRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [strategy, setStrategy] = useState<RecommendationStrategy>('hybrid');
  const [goalAdded, setGoalAdded] = useState<string | null>(null);

  useEffect(() => {
    loadRecommendations();
  }, [strategy]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await invoke<DailyRecommendation[]>('get_daily_recommendations', {
        strategy,
        count: 5,
      });
      setRecommendations(data || []);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      setError(String(err));
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  const addToGoals = async (rec: DailyRecommendation) => {
    try {
      await invoke('create_unified_goal', {
        goal: {
          text: `Solve ${rec.onlineJudge}: ${rec.problemName}`,
          for_date: getLocalDateString(),
          priority: 'medium',
          category: 'coding_codeforces',
          problem_url: rec.problemUrl,
        },
      });
      setGoalAdded(rec.problemId);
      setTimeout(() => setGoalAdded(null), 2000);
    } catch (err) {
      console.error('Failed to add to goals:', err);
    }
  };

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
          style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-error)', color: 'white' }}>
          {error}
        </div>
      )}

      {/* Strategy Selector */}
      <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(10px)' }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
          Recommendation Strategy
        </h2>
        <div className="flex flex-wrap gap-2">
          {STRATEGY_BUTTONS.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setStrategy(btn.key)}
              className="px-4 py-2 rounded-lg transition-all hover:scale-105"
              style={{
                backgroundColor: strategy === btn.key ? 'var(--color-accent-primary)' : 'var(--surface-secondary)',
                color: strategy === btn.key ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <span className="mr-2">{btn.icon}</span>{btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--color-accent-primary)', borderTopColor: 'transparent' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Finding problems…</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {recommendations.map((rec, idx) => (
            <div
              key={rec.problemId}
              className="p-6 rounded-lg transition-all hover:scale-[1.01]"
              style={{ backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(10px)' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: 'var(--color-accent-primary)', color: 'white' }}>
                      Problem {idx + 1}
                    </span>
                    {rec.difficulty != null && (
                      <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: `var(--pos-heatmap-level-${diffLevel(rec.difficulty)})`, color: 'white' }}>
                        {rec.difficulty}
                      </span>
                    )}
                    <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                      {rec.strategy}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {rec.problemName}
                  </h3>
                  <p className="text-sm mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    {rec.problemId} · {rec.onlineJudge}
                  </p>
                  <p className="text-sm px-3 py-1 rounded inline-block" style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                    💡 {rec.reason}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => window.open(rec.problemUrl, '_blank')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:scale-105"
                  style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--color-accent-primary)', border: '1px solid var(--border-primary)' }}
                >
                  <ExternalLink size={18} />Open Problem
                </button>
                <button
                  onClick={() => addToGoals(rec)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:scale-105"
                  style={{ backgroundColor: goalAdded === rec.problemId ? 'var(--color-success)' : 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
                >
                  <Plus size={18} />
                  {goalAdded === rec.problemId ? 'Added!' : 'Add to Goals'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && recommendations.length === 0 && !error && (
        <div className="text-center p-12">
          <Sparkles size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Recommendations</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Try a different strategy, or import ladders and add friends first.
          </p>
        </div>
      )}
    </div>
  );
}
