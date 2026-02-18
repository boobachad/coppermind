import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tag, CheckCircle, TrendingUp } from 'lucide-react';

interface CFCategory {
  id: string;
  name: string;
  description: string | null;
  problem_count: number;
  solved_count: number;
}

export default function CategoryBrowser() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CFCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      // TODO: Implement get_categories command
      // const data = await invoke<CFCategory[]>('get_categories');
      // setCategories(data || []);
      setCategories([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
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
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '400px',
        color: 'var(--text-secondary)'
      }}>
        Loading categories...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-error)' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2rem', 
          fontWeight: '700', 
          marginBottom: '0.5rem',
          color: 'var(--text-primary)'
        }}>
          Problem Categories
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Practice by topic: DP, Graphs, Trees, and more
        </p>
      </div>

      {/* Import Button */}
      <div style={{ 
        marginBottom: '2rem',
        padding: '1rem',
        background: 'var(--surface-secondary)',
        borderRadius: '0.75rem',
        border: '1px solid var(--border-primary)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontWeight: '500', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
              Category Data
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {categories.length} categories imported
            </div>
          </div>
          <button
            onClick={() => {/* TODO: Implement bulk import */}}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <TrendingUp size={16} />
            Import All Categories
          </button>
        </div>
      </div>

      {/* Categories Grid */}
      {categories.length > 0 ? (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1.5rem'
        }}>
          {categories.map((category) => {
            const progress = category.problem_count > 0 
              ? Math.round((category.solved_count / category.problem_count) * 100)
              : 0;

            return (
              <div
                key={category.id}
                onClick={() => navigate(`/codeforces/categories/${category.id}`)}
                style={{
                  background: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '1rem',
                  padding: '1.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backdropFilter: 'blur(10px)',
                  transform: 'scale(1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{
                    padding: '0.5rem',
                    background: 'var(--surface-secondary)',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Tag size={20} style={{ color: 'var(--color-accent-primary)' }} />
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <h3 style={{ 
                      fontSize: '1.125rem', 
                      fontWeight: '600', 
                      marginBottom: '0.25rem',
                      color: 'var(--text-primary)'
                    }}>
                      {category.name}
                    </h3>
                    
                    {category.description && (
                      <p style={{ 
                        fontSize: '0.875rem', 
                        color: 'var(--text-secondary)',
                        lineHeight: '1.4',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {category.description}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem'
                  }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {category.solved_count} / {category.problem_count} problems
                    </span>
                    <span style={{ 
                      fontWeight: '600',
                      color: getProgressColor(progress)
                    }}>
                      {progress}%
                    </span>
                  </div>
                  
                  <div style={{ 
                    height: '6px', 
                    background: 'var(--surface-secondary)', 
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${progress}%`,
                      background: getProgressColor(progress),
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                {progress === 100 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: 'var(--color-success)',
                    opacity: 0.15,
                    borderRadius: '0.5rem'
                  }}>
                    <CheckCircle size={16} style={{ color: 'var(--color-success)', opacity: 1 }} />
                    <span style={{ fontSize: '0.875rem', color: 'var(--color-success)', fontWeight: '500', opacity: 1 }}>
                      Completed!
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          background: 'var(--surface-secondary)',
          borderRadius: '1rem',
          border: '1px solid var(--border-primary)'
        }}>
          <Tag size={64} style={{ 
            color: 'var(--text-tertiary)', 
            opacity: 0.3,
            margin: '0 auto 1.5rem'
          }} />
          <h3 style={{ 
            fontSize: '1.25rem', 
            fontWeight: '600', 
            marginBottom: '0.5rem',
            color: 'var(--text-primary)'
          }}>
            No Categories Yet
          </h3>
          <p style={{ 
            color: 'var(--text-secondary)', 
            marginBottom: '1.5rem',
            maxWidth: '400px',
            margin: '0 auto'
          }}>
            Import your category HTML files to start practicing by topic.
          </p>
          <button
            onClick={() => {/* TODO: Implement bulk import */}}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '1rem'
            }}
          >
            Import Categories
          </button>
        </div>
      )}
    </div>
  );
}
