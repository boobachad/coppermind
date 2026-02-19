import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Tag, CheckCircle, TrendingUp, Upload, ChevronDown, ChevronRight as ChevronRightIcon, ExternalLink } from 'lucide-react';
import type { CFCategory, CFLadderProblem } from '../../pos/lib/types';

export default function CategoryBrowser() {
  const [categories, setCategories] = useState<CFCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [categoryProblems, setCategoryProblems] = useState<Record<string, CFLadderProblem[]>>({});
  const [loadingProblems, setLoadingProblems] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await invoke<CFCategory[]>('get_categories');
      setCategories(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const html = await file.text();
      await invoke('import_categories_from_html', {
        req: { htmlContent: html, categoryName: null },
      });
      await loadCategories();
    } catch (err) {
      setError('Import failed: ' + String(err));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleExpand = async (categoryId: string) => {
    if (expanded === categoryId) {
      setExpanded(null);
      return;
    }
    setExpanded(categoryId);
    if (!categoryProblems[categoryId]) {
      try {
        setLoadingProblems(categoryId);
        const problems = await invoke<CFLadderProblem[]>('get_category_problems', { categoryId });
        setCategoryProblems(prev => ({ ...prev, [categoryId]: problems || [] }));
      } catch (err) {
        setError('Failed to load problems: ' + String(err));
      } finally {
        setLoadingProblems(null);
      }
    }
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', color: 'var(--text-secondary)' }}>
        Loading categories…
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
          Problem Categories
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Practice by topic: DP, Graphs, Trees, and more</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-error)', color: 'white', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Import Bar */}
      <div style={{ marginBottom: '2rem', padding: '1rem', background: 'var(--surface-secondary)', borderRadius: '0.75rem', border: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: '500', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Category Data</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {categories.length} {categories.length === 1 ? 'category' : 'categories'} imported
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input ref={fileInputRef} type="file" accept=".html,.htm" className="hidden" style={{ display: 'none' }} onChange={handleFileSelected} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              style={{
                padding: '0.625rem 1.25rem', background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)', border: 'none', borderRadius: '0.5rem',
                cursor: importing ? 'not-allowed' : 'pointer', fontWeight: '500',
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                opacity: importing ? 0.7 : 1,
              }}
            >
              {importing ? <TrendingUp size={16} /> : <Upload size={16} />}
              {importing ? 'Importing…' : 'Import Category HTML'}
            </button>
          </div>
        </div>
      </div>

      {categories.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {categories.map((category) => {
            const progress = category.problemCount > 0
              ? Math.round((category.solvedCount / category.problemCount) * 100)
              : 0;
            const isExpanded = expanded === category.id;
            const problems = categoryProblems[category.id] || [];

            return (
              <div
                key={category.id}
                style={{
                  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                  borderRadius: '1rem', overflow: 'hidden', backdropFilter: 'blur(10px)',
                }}
              >
                {/* Card header — click to expand */}
                <div
                  onClick={() => toggleExpand(category.id)}
                  style={{ padding: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '1rem' }}
                >
                  <div style={{ padding: '0.5rem', background: 'var(--surface-secondary)', borderRadius: '0.5rem', flexShrink: 0 }}>
                    <Tag size={20} style={{ color: 'var(--color-accent-primary)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                        {category.name}
                      </h3>
                      {progress === 100 && (
                        <CheckCircle size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        {category.solvedCount} / {category.problemCount} solved
                      </span>
                      <div style={{ flex: 1, height: '6px', background: 'var(--surface-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: getProgressColor(progress), transition: 'width 0.3s ease' }} />
                      </div>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', color: getProgressColor(progress), flexShrink: 0 }}>{progress}%</span>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronDown size={20} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    : <ChevronRightIcon size={20} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
                </div>

                {/* Expanded problem list */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border-primary)' }}>
                    {loadingProblems === category.id ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Loading problems…
                      </div>
                    ) : problems.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        No problems found in this category.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-secondary)' }}>
                            {['#', 'Problem', 'Rating', 'Judge', ''].map(h => (
                              <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {problems.map((p, idx) => (
                            <tr key={p.id} style={{ borderTop: '1px solid var(--border-secondary)' }}>
                              <td style={{ padding: '0.75rem 1rem', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>{idx + 1}</td>
                              <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', fontWeight: '500' }}>{p.problemName}</td>
                              <td style={{ padding: '0.75rem 1rem' }}>
                                {p.difficulty != null && (
                                  <span style={{ padding: '0.2rem 0.5rem', background: 'var(--surface-secondary)', borderRadius: '0.375rem', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                                    {p.difficulty}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{p.onlineJudge}</td>
                              <td style={{ padding: '0.75rem 1rem' }}>
                                <button
                                  onClick={() => window.open(p.problemUrl, '_blank')}
                                  style={{ padding: '0.375rem 0.5rem', background: 'var(--surface-secondary)', border: 'none', borderRadius: '0.375rem', color: 'var(--color-accent-primary)', cursor: 'pointer' }}
                                >
                                  <ExternalLink size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', background: 'var(--surface-secondary)', borderRadius: '1rem', border: '1px solid var(--border-primary)' }}>
          <Tag size={64} style={{ color: 'var(--text-tertiary)', opacity: 0.3, margin: '0 auto 1.5rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>No Categories Yet</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            Import an A2OJ-style category HTML file to start practising by topic.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: '0.75rem 1.5rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '500', fontSize: '1rem' }}
          >
            <Upload className="inline-block mr-2 mb-1" size={16} />
            Import Categories
          </button>
        </div>
      )}
    </div>
  );
}
