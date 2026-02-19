import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { Tag, CheckCircle, TrendingUp, Upload } from 'lucide-react';
import type { CFCategory } from '../../pos/lib/types';

export default function CategoryBrowser() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CFCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
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
      // Category name defaults to the HTML title; user can rename later
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {categories.map((category) => {
            const progress = category.problemCount > 0
              ? Math.round((category.solvedCount / category.problemCount) * 100)
              : 0;

            return (
              <div
                key={category.id}
                onClick={() => navigate(`/codeforces/categories/${category.id}`)}
                style={{
                  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                  borderRadius: '1rem', padding: '1.5rem', cursor: 'pointer',
                  transition: 'all 0.2s ease', backdropFilter: 'blur(10px)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ padding: '0.5rem', background: 'var(--surface-secondary)', borderRadius: '0.5rem' }}>
                    <Tag size={20} style={{ color: 'var(--color-accent-primary)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                      {category.name}
                    </h3>
                    {category.description && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.4', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {category.description}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{category.solvedCount} / {category.problemCount} solved</span>
                    <span style={{ fontWeight: '600', color: getProgressColor(progress) }}>{progress}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--surface-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: getProgressColor(progress), transition: 'width 0.3s ease' }} />
                  </div>
                </div>

                {progress === 100 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', border: '1px solid var(--color-success)', borderRadius: '0.5rem' }}>
                    <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-success)', fontWeight: '500' }}>Completed!</span>
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
