import { useState, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { syncAllTables, isPgConnected } from '../lib/pgSync';
import { getDb } from '../lib/db';
import {
  Monitor,
  Download,
  Palette,
  Maximize,
  ChevronRight,
  X,
  Check,
  DatabaseZap,
  RefreshCw
} from 'lucide-react';
import { formatTime } from '../pos/lib/time';


export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [uiScale, setUiScale] = useState(() => {
    const saved = localStorage.getItem('app_ui_scale');
    return saved ? parseFloat(saved) : 1;
  });

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('md');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncAllTables();
      if (isPgConnected()) {
        setLastSyncTime(formatTime(new Date()));
      }
    } catch (err) {
      console.error('[Settings] Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    (document.body.style as any).zoom = uiScale;
    localStorage.setItem('app_ui_scale', uiScale.toString());
  }, [uiScale]);

  const handleExport = async () => {
    try {
      const db = await getDb();
      const notes = await db.select<Array<{ title: string; content: string; updated_at: string }>>(
        'SELECT title, content, updated_at FROM notes ORDER BY updated_at DESC'
      );

      let content = '';
      let filename = 'notes-export';
      let mimeType = 'text/plain';

      if (exportFormat === 'md') {
        content = notes.map(n => `# ${n.title || 'Untitled'}\n\n${n.content || ''}\n\n---\n`).join('\n');
        filename += '.md';
        mimeType = 'text/markdown';
      } else if (exportFormat === 'txt') {
        content = notes.map(n => `${n.title || 'Untitled'}\n${'='.repeat((n.title || 'Untitled').length)}\n\n${n.content || ''}\n\n`).join('\n');
        filename += '.txt';
      } else if (exportFormat === 'json') {
        content = JSON.stringify(notes, null, 2);
        filename += '.json';
        mimeType = 'application/json';
      } else if (exportFormat === 'html') {
        content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Notes Export</title><style>body{font-family:sans-serif;max-width:800px;margin:auto;padding:2rem;color:var(--text-primary)}h1{border-bottom:1px solid var(--border-primary)}hr{border:1px solid var(--border-primary)}</style></head><body>${notes.map(n => `<h1>${n.title || 'Untitled'}</h1><div>${n.content || ''}</div><hr>`).join('')}</body></html>`;
        filename += '.html';
        mimeType = 'text/html';
      }

      // Use browser download API (works in Tauri webview without extra plugins)
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Settings] Export failed:', err);
    } finally {
      setShowExportModal(false);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 pb-32">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Settings</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Customize your experience</p>
          </div>

          {/* Appearance Section */}
          <section className="mb-6">
            <div className="mb-3">
              <h2 className="text-lg font-semibold flex items-center" style={{ color: 'var(--text-primary)' }}>
                <Palette className="w-5 h-5 mr-2" style={{ color: 'var(--text-secondary)' }} />
                Appearance
              </h2>
            </div>
            <div className="rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>

              {/* Themes */}
              <div className="p-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <div className="mb-4">
                  <h3 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Theme</h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Choose your preferred visual style</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setTheme('solarized-light')}
                    className={`h-24 rounded-lg border transition-all ${theme === 'solarized-light' ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme === 'solarized-light' ? 'var(--pos-info-border)' : 'var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      ...(theme === 'solarized-light' && { ringColor: 'var(--pos-info-border)' })
                    }}
                  >
                    <div className="flex flex-col items-center justify-center h-full relative">
                      {theme === 'solarized-light' && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--pos-info-border)' }}>
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div className="w-8 h-8 rounded-full mb-2 border" style={{ backgroundColor: 'var(--theme-preview-solarized-bg)', borderColor: 'var(--theme-preview-solarized-border)' }}></div>
                      <span className="text-xs font-medium" style={{ color: theme === 'solarized-light' ? 'var(--pos-info-text)' : 'var(--text-secondary)' }}>Solarized</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setTheme('blue-light')}
                    className={`h-24 rounded-lg border transition-all ${theme === 'blue-light' ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme === 'blue-light' ? 'var(--pos-info-border)' : 'var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      ...(theme === 'blue-light' && { ringColor: 'var(--pos-info-border)' })
                    }}
                  >
                    <div className="flex flex-col items-center justify-center h-full relative">
                      {theme === 'blue-light' && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--pos-info-border)' }}>
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div className="w-8 h-8 rounded-full mb-2 border" style={{ backgroundColor: 'var(--theme-preview-blue-bg)', borderColor: 'var(--theme-preview-blue-border)' }}></div>
                      <span className="text-xs font-medium" style={{ color: theme === 'blue-light' ? 'var(--pos-info-text)' : 'var(--text-secondary)' }}>Blue Light</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setTheme('dark')}
                    className={`h-24 rounded-lg border transition-all ${theme === 'dark' ? 'ring-2' : ''}`}
                    style={{
                      borderColor: theme === 'dark' ? 'var(--pos-info-border)' : 'var(--border-color)',
                      backgroundColor: 'var(--bg-primary)',
                      ...(theme === 'dark' && { ringColor: 'var(--pos-info-border)' })
                    }}
                  >
                    <div className="flex flex-col items-center justify-center h-full relative">
                      {theme === 'dark' && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--pos-info-border)' }}>
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <div className="w-8 h-8 rounded-full mb-2 border" style={{ backgroundColor: 'var(--theme-preview-dark-bg)', borderColor: 'var(--theme-preview-dark-border)' }}></div>
                      <span className="text-xs font-medium" style={{ color: theme === 'dark' ? 'var(--pos-info-text)' : 'var(--text-secondary)' }}>Dark</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* UI Scale */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-medium flex items-center mb-1" style={{ color: 'var(--text-primary)' }}>
                      <Maximize className="w-4 h-4 mr-2" style={{ color: 'var(--text-secondary)' }} />
                      UI Scale
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Adjust interface size</p>
                  </div>
                  <span className="text-sm font-mono px-3 py-1 rounded border" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', borderColor: 'var(--border-color)' }}>
                    {Math.round(uiScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={uiScale}
                  onChange={(e) => setUiScale(parseFloat(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-primary)', accentColor: 'var(--pos-info-border)' }}
                />
                <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>75%</span>
                  <span>100%</span>
                  <span>150%</span>
                </div>
              </div>

            </div>
          </section>

          {/* Data Management */}
          <section className="mb-6">
            <div className="mb-3">
              <h2 className="text-lg font-semibold flex items-center" style={{ color: 'var(--text-primary)' }}>
                <Monitor className="w-5 h-5 mr-2" style={{ color: 'var(--text-secondary)' }} />
                Data & Storage
              </h2>
            </div>
            <div className="rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
              {/* Sync to PostgreSQL */}
              <div
                onClick={handleManualSync}
                className={`p-5 flex items-center justify-between cursor-pointer transition-colors border-b ${isSyncing ? 'pointer-events-none opacity-60' : ''}`}
                style={{ borderColor: 'var(--border-color)' }}
                onMouseEnter={(e) => !isSyncing && (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div className="flex items-center">
                  <div className="p-2 rounded-lg mr-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <DatabaseZap className="w-6 h-6" style={{ color: 'var(--pos-info-text)' }} />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Sync to PostgreSQL</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {isSyncing
                        ? 'Syncing...'
                        : lastSyncTime
                          ? `Last synced at ${lastSyncTime}`
                          : isPgConnected()
                            ? 'Auto-syncs every hour · Click to sync now'
                            : 'Not connected · Click to retry'}
                    </p>
                  </div>
                </div>
                <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} style={{ color: 'var(--text-secondary)' }} />
              </div>

              {/* Export Notes */}
              <div
                onClick={() => setShowExportModal(true)}
                className="p-5 flex items-center justify-between cursor-pointer transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div className="flex items-center">
                  <div className="p-2 rounded-lg mr-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <Download className="w-6 h-6" style={{ color: 'var(--pos-success-text)' }} />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Export Notes</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Download your notes in various formats</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'var(--overlay-bg)' }} onClick={() => setShowExportModal(false)}>
          <div className="rounded-lg shadow-xl max-w-md w-full overflow-hidden border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-color)' }}>
              <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Export Notes</h3>
              <button onClick={() => setShowExportModal(false)} className="transition-colors" style={{ color: 'var(--text-secondary)' }} onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')} onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>Select the format to export your notes:</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'md',   label: 'Markdown',   ext: '.md'   },
                  { id: 'txt',  label: 'Plain Text',  ext: '.txt'  },
                  { id: 'json', label: 'JSON',        ext: '.json' },
                  { id: 'html', label: 'HTML',        ext: '.html' },
                ].map(fmt => (
                  <button
                    key={fmt.id}
                    onClick={() => setExportFormat(fmt.id)}
                    className={`p-4 rounded-lg border transition-all text-left ${exportFormat === fmt.id ? 'ring-2' : ''}`}
                    style={{
                      borderColor: exportFormat === fmt.id ? 'var(--pos-info-border)' : 'var(--border-color)',
                      backgroundColor: exportFormat === fmt.id ? 'var(--pos-info-bg)' : 'var(--bg-primary)',
                      color: exportFormat === fmt.id ? 'var(--pos-info-text)' : 'var(--text-primary)',
                    }}
                  >
                    <div className="font-bold text-lg">{fmt.ext}</div>
                    <div className="text-sm opacity-80">{fmt.label}</div>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 rounded-lg font-medium transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  className="px-6 py-2 rounded-lg font-medium flex items-center"
                  style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
