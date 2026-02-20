import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Upload, Code } from 'lucide-react';
import { toast } from 'sonner';
import { Loader } from '@/components/Loader';
import type { LadderStats } from '../../pos/lib/types';
import { formatDateDDMMYYYY } from '../../pos/lib/time';
import { CodeforcesCard } from './CodeforcesCard';

interface ProblemSetItem {
  id: string;
  name: string;
  description: string | null;
  problemCount: number;
  createdAt: string;
  difficulty?: number | null;
  ratingMin?: number | null;
  ratingMax?: number | null;
}

interface ProblemSetWithStats extends ProblemSetItem {
  stats: LadderStats | null;
}

interface ProblemSetBrowserProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  emptyStateTitle: string;
  emptyStateDescription: string;
  getItemsCommand: string;
  getStatsCommand: string;
  statsParamName: 'ladderId' | 'categoryId';
  importCommand: string;
  importRequestBuilder: (htmlContent: string) => Record<string, unknown>;
  importSuccessMessage: string;
  onItemClick: (item: ProblemSetItem) => void;
  showScanButton?: boolean;
  scanCommand?: string;
  showDifficultyBadge?: boolean;
}

export function ProblemSetBrowser({
  title,
  subtitle,
  icon,
  emptyStateTitle,
  emptyStateDescription,
  getItemsCommand,
  getStatsCommand,
  statsParamName,
  importCommand,
  importRequestBuilder,
  importSuccessMessage,
  onItemClick,
  showScanButton = false,
  scanCommand,
  showDifficultyBadge = false,
}: ProblemSetBrowserProps) {
  const [items, setItems] = useState<ProblemSetWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const result = await invoke<ProblemSetItem[]>(getItemsCommand);
      const itemsWithStats = await Promise.all(
        result.map(async (item) => {
          try {
            const stats = await invoke<LadderStats>(getStatsCommand, { 
              [statsParamName]: item.id
            });
            return { ...item, stats };
          } catch (err) {
            console.error(`Failed to load stats for ${item.name}:`, err);
            return { ...item, stats: null };
          }
        })
      );
      itemsWithStats.sort((a, b) => {
        const solvedA = a.stats?.solved ?? 0;
        const solvedB = b.stats?.solved ?? 0;
        return solvedB - solvedA;
      });
      setItems(itemsWithStats);
    } catch (err) {
      console.error('Failed to load items:', err);
      toast.error(`Failed to load ${title.toLowerCase()}`, { description: String(err) });
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
      const req = importRequestBuilder(html);
      await invoke(importCommand, { req });
      toast.success(importSuccessMessage);
      await loadItems();
    } catch (err) {
      toast.error('Import failed', { description: String(err) });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleScan = async () => {
    if (!scanCommand) return;
    try {
      setImporting(true);
      const msg = await invoke(scanCommand);
      toast.success('Scan complete', { description: String(msg) });
      loadItems();
    } catch (e) {
      toast.error('Scan failed', { description: String(e) });
    } finally {
      setImporting(false);
    }
  };

  const getSubtitle = (item: ProblemSetWithStats): string => {
    // Priority 1: Show rating range if available
    if (item.ratingMin != null && item.ratingMax != null) {
      const diffText = item.difficulty != null ? ` | Difficulty: ${item.difficulty}/10` : '';
      return `Rating: ${item.ratingMin}-${item.ratingMax}${diffText}`;
    }
    
    // Priority 2: Show difficulty only
    if (item.difficulty != null) {
      return `Difficulty: ${item.difficulty}/10`;
    }
    
    // Priority 3: Fallback to import date
    return `Imported ${formatDateDDMMYYYY(new Date(item.createdAt))}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader />
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>Loading {title.toLowerCase()}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
              {icon}
              {title}
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
          </div>
          <div className="flex gap-2">
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
              {importing ? 'Importing…' : 'Import HTML'}
            </button>

            {showScanButton && scanCommand && (
              <button
                onClick={handleScan}
                disabled={importing}
                className="px-4 py-2 rounded-lg transition-all hover:scale-105"
                style={{
                  backgroundColor: 'var(--surface-tertiary)',
                  color: 'var(--text-primary)',
                  opacity: importing ? 0.6 : 1,
                }}
              >
                <Upload className="inline-block mr-2 mb-1" size={18} />
                Scan & Import Public Data
              </button>
            )}
          </div>
        </div>

        {items.length === 0 && (
          <div className="p-12 rounded-xl text-center" style={{ backgroundColor: 'var(--surface-secondary)', border: '1px solid var(--border-primary)' }}>
            <Code size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{emptyStateTitle}</h3>
            <p style={{ color: 'var(--text-secondary)' }} className="mb-6 max-w-md mx-auto">
              {emptyStateDescription}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 rounded-lg hover:scale-105"
              style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
            >
              <Upload className="inline-block mr-2 mb-1" size={18} />
              Import Your First {title.includes('Ladder') ? 'Ladder' : 'Category'}
            </button>
          </div>
        )}

        {items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <CodeforcesCard
                key={item.id}
                title={item.name}
                subtitle={getSubtitle(item)}
                description={item.description ?? undefined}
                progress={{
                  solved: item.stats?.solved ?? 0,
                  total: item.stats?.totalProblems ?? item.problemCount
                }}
                onClick={() => onItemClick(item)}
                tags={showDifficultyBadge && item.difficulty != null ? [{
                  label: `Level ${item.difficulty}`,
                  color: 'var(--text-primary)',
                  bgColor: `var(--pos-heatmap-level-${Math.min(item.difficulty, 5)})`
                }] : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
