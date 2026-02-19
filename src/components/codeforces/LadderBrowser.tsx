import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { List, Upload, ChevronRight, Code } from 'lucide-react';
import type { CFLadder, LadderStats } from '../../pos/lib/types';
import { formatDateDDMMYYYY } from '../../pos/lib/time';

interface LadderWithStats extends CFLadder {
  stats: LadderStats | null;
}

export function LadderBrowser() {
  const [ladders, setLadders] = useState<LadderWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadLadders();
  }, []);

  const loadLadders = async () => {
    try {
      setError('');
      const result = await invoke<CFLadder[]>('get_ladders');
      const laddersWithStats = await Promise.all(
        result.map(async (ladder) => {
          try {
            const stats = await invoke<LadderStats>('get_ladder_stats', { ladderId: ladder.id });
            return { ...ladder, stats };
          } catch {
            return { ...ladder, stats: null };
          }
        })
      );
      setLadders(laddersWithStats);
    } catch (err) {
      console.error('Failed to load ladders:', err);
      setError(String(err));
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
      await invoke('import_ladder_from_html', {
        req: { htmlContent: html, source: 'A2OJ' },
      });
      await loadLadders();
    } catch (err) {
      setError('Import failed: ' + String(err));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>Loading ladders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            <List className="inline-block mr-2 mb-1" size={28} />
            Codeforces Ladders
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Practice problems organised by difficulty</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm"
            className="hidden"
            onChange={handleFileSelected}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 rounded-lg transition-all hover:scale-105"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
              opacity: importing ? 0.6 : 1,
            }}
          >
            <Upload className="inline-block mr-2 mb-1" size={18} />
            {importing ? 'Importing…' : 'Import Ladder HTML'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-error)', color: 'white' }}>
          {error}
        </div>
      )}

      {ladders.length === 0 && (
        <div className="p-12 rounded-xl text-center" style={{ backgroundColor: 'var(--surface-secondary)', border: '1px solid var(--border-primary)' }}>
          <Code size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Ladders Yet</h3>
          <p style={{ color: 'var(--text-secondary)' }} className="mb-6 max-w-md mx-auto">
            Import an A2OJ-style ladder HTML file to get started.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 rounded-lg hover:scale-105"
            style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
          >
            <Upload className="inline-block mr-2 mb-1" size={18} />
            Import Your First Ladder
          </button>
        </div>
      )}

      {ladders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ladders.map((ladder) => (
            <div
              key={ladder.id}
              className="p-6 rounded-xl transition-all hover:scale-[1.02] cursor-pointer"
              style={{ backgroundColor: 'var(--glass-bg)', border: '1px solid var(--glass-border)', backdropFilter: 'blur(8px)' }}
              onClick={() => navigate(`/cf/ladders/${ladder.id}`)}
            >
              <div className="flex items-center justify-between mb-4">
                {ladder.difficulty != null && (
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: `var(--pos-heatmap-level-${Math.min(ladder.difficulty, 5)})`,
                      color: 'var(--text-primary)',
                    }}
                  >
                    Level {ladder.difficulty}
                  </span>
                )}
                <ChevronRight size={20} style={{ color: 'var(--text-tertiary)' }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{ladder.name}</h3>
              {ladder.description && (
                <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{ladder.description}</p>
              )}
              <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
                {ladder.problemCount} problems · imported {formatDateDDMMYYYY(new Date(ladder.createdAt))}
              </p>
              {ladder.stats && (
                <div className="pt-4 border-t" style={{ borderColor: 'var(--border-primary)' }}>
                  <div className="flex justify-between text-sm mb-2">
                    <span style={{ color: 'var(--text-secondary)' }}>Progress</span>
                    <span style={{ color: ladder.stats.progressPercentage > 50 ? 'var(--color-success)' : 'var(--text-primary)' }}>
                      {ladder.stats.solved}/{ladder.stats.totalProblems}
                    </span>
                  </div>
                  <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--surface-secondary)' }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${ladder.stats.progressPercentage}%`,
                        backgroundColor: `var(--pos-heatmap-level-${Math.min(Math.ceil(ladder.stats.progressPercentage / 20) + 1, 5)})`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
