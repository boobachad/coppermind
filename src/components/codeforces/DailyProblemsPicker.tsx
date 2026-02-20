import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, RefreshCw, Plus, ExternalLink, Zap, Trophy, Users, BookOpen, Target, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Loader } from '@/components/Loader';
import type { DailyRecommendation, CFCategory } from '../../pos/lib/types';
import { getLocalDateString } from '../../pos/lib/time';

type RecommendationStrategy = 'ladder' | 'friends' | 'category' | 'rating' | 'hybrid';

const STRATEGIES: { key: RecommendationStrategy; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'hybrid', label: 'Hybrid', icon: <Zap size={20} />, desc: 'Smart mix' },
  { key: 'ladder', label: 'Ladder', icon: <Trophy size={20} />, desc: 'Next up' },
  { key: 'friends', label: 'Friends', icon: <Users size={20} />, desc: 'Community' },
  { key: 'category', label: 'Category', icon: <BookOpen size={20} />, desc: 'Topical' },
  { key: 'rating', label: 'Rating', icon: <Target size={20} />, desc: '+/- 200' },
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
  const [strategy, setStrategy] = useState<RecommendationStrategy>('hybrid');
  const [goalAdded, setGoalAdded] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<CFCategory[]>([]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const cats = await invoke<CFCategory[]>('get_categories');
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    loadRecommendations();
  }, [strategy]);

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      const data = await invoke<DailyRecommendation[]>('get_daily_recommendations', {
        strategy,
        count: 5,
        categoryId: strategy === 'category' ? selectedCategory : null,
      });
      setRecommendations(data || []);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      toast.error('Failed to load recommendations', { description: String(err) });
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  const addToGoals = async (rec: DailyRecommendation) => {
    try {
      await invoke('create_unified_goal', {
        req: {
          text: `Solve ${rec.onlineJudge}: ${rec.problemName}`,
          dueDate: `${getLocalDateString()}T00:00:00Z`,
          priority: 'medium',
          problemId: rec.problemUrl,
        },
      });
      setGoalAdded(rec.problemId);
      setTimeout(() => setGoalAdded(null), 2000);
      toast.success('Added to goals');
    } catch (err) {
      toast.error('Failed to add to goals', { description: String(err) });
      console.error('Failed to add to goals:', err);
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center" style={{ color: 'var(--text-primary)' }}>
              <Sparkles className="mr-3" size={28} style={{ color: 'var(--color-warning)' }} />
              Daily Training
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>Curated problem set to push your limits today</p>
          </div>
          <button
            onClick={loadRecommendations}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: 'var(--glass-bg-subtle)',
              color: 'var(--text-primary)',
              border: '1px solid var(--glass-border)'
            }}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Strategy Selector */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {STRATEGIES.map((opt) => {
            const isActive = strategy === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setStrategy(opt.key)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all border ${isActive ? 'scale-105 shadow-lg' : 'hover:bg-(--glass-bg-subtle)'}`}
                style={{
                  backgroundColor: isActive ? 'var(--color-accent-primary)' : 'var(--glass-bg)',
                  borderColor: isActive ? 'transparent' : 'var(--glass-border)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-primary)',
                  backdropFilter: 'blur(8px)'
                }}
              >
                <div className="mb-1 opacity-90">{opt.icon}</div>
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{opt.desc}</div>
              </button>
            );
          })}
        </div>

        {/* Category Selector (show only when category strategy is selected) */}
        {strategy === 'category' && (
          <div className="mb-6 p-4 rounded-xl" style={{ 
            backgroundColor: 'var(--glass-bg)', 
            border: '1px solid var(--glass-border)' 
          }}>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              Select Topic (optional - leave empty for random)
            </label>
            <select
              value={selectedCategory || ''}
              onChange={(e) => {
                setSelectedCategory(e.target.value || null);
                // Reload recommendations when category changes
                setTimeout(() => loadRecommendations(), 100);
              }}
              className="w-full px-4 py-2 rounded-lg"
              style={{
                backgroundColor: 'var(--surface-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <option value="">Random Topics (All Categories)</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.problemCount} problems)
                </option>
              ))}
            </select>
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              {selectedCategory 
                ? 'Get problems from selected topic at your difficulty level'
                : 'Get random problems from all topics at your difficulty level'}
            </p>
          </div>
        )}

        {/* Recommendations List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader />
            <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>Analyzing your performance...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec, idx) => (
              <div
                key={rec.problemId}
                className="group p-6 rounded-xl transition-all hover:scale-[1.01] hover:shadow-xl relative overflow-hidden"
                style={{
                  backgroundColor: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  backdropFilter: 'blur(8px)'
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                        style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-secondary)' }}>
                        {idx + 1}
                      </span>
                      {rec.difficulty != null && (
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-medium"
                          style={{
                            backgroundColor: `var(--pos-heatmap-level-${diffLevel(rec.difficulty)})`,
                            color: 'var(--text-primary)'
                          }}>
                          {rec.difficulty}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-tertiary)' }}>
                        {rec.onlineJudge}
                      </span>
                    </div>

                    <h3 className="text-xl font-bold mb-2 truncate pr-4" style={{ color: 'var(--text-primary)' }}>
                      {rec.problemName}
                    </h3>

                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <Zap size={14} style={{ color: 'var(--color-warning)' }} />
                      <span>{rec.reason}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => addToGoals(rec)}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all font-medium min-w-[140px]"
                      style={{
                        backgroundColor: goalAdded === rec.problemId ? 'var(--color-success)' : 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)'
                      }}
                    >
                      {goalAdded === rec.problemId ? <CheckCircle size={18} /> : <Plus size={18} />}
                      {goalAdded === rec.problemId ? 'Added' : 'Add Goal'}
                    </button>

                    <button
                      onClick={() => invoke('open_link', { url: rec.problemUrl })}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all font-medium hover:bg-(--glass-bg-subtle)"
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <ExternalLink size={18} />
                      Solve
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {recommendations.length === 0 && (
              <div className="text-center py-20">
                <Target size={64} className="mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <h3 className="text-xl font-medium" style={{ color: 'var(--text-secondary)' }}>No recommendations found</h3>
                <p style={{ color: 'var(--text-tertiary)' }}>Try switching strategies or refreshing</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
