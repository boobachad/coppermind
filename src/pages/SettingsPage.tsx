import { useState, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { syncAllTables, isPgConnected } from '../lib/pgSync';
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


export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [uiScale, setUiScale] = useState(() => {
    // Try to recover state from localStorage or default to 1
    const saved = localStorage.getItem('app_ui_scale');
    return saved ? parseFloat(saved) : 1;
  });

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('md');
  const { alert } = useConfirmDialog();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncAllTables();
      // Only mark success if PG actually connected and synced
      if (isPgConnected()) {
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('[Settings] Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Apply UI Scale
  useEffect(() => {
    // Apply zoom to the body
    (document.body.style as any).zoom = uiScale;
    localStorage.setItem('app_ui_scale', uiScale.toString());
  }, [uiScale]);

  const handleExport = async () => {
    // Mock export functionality
    await alert(`Exporting as .${exportFormat} (Feature coming soon!)`, 'Export');
    setShowExportModal(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-8 pb-32 text-themed-text-primary">
      <h1 className="text-3xl font-bold mb-8 text-themed-text-primary">Settings</h1>

      {/* Appearance Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center text-themed-text-primary">
          <Palette className="w-5 h-5 mr-2" />
          Appearance
        </h2>
        <div className="bg-themed-surface border border-themed-border rounded-xl shadow-sm overflow-hidden">

          {/* Themes */}
          <div className="p-6 border-b border-themed-border relative">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium text-themed-text-primary">Theme</h3>
                <p className="text-sm text-themed-text-secondary">Choose your preferred visual style</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <button
                onClick={() => setTheme('solarized-light')}
                className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center relative transition-all ${theme === 'solarized-light' ? 'border-blue-500 shadow-sm ring-2 ring-blue-100' : 'border-themed-border hover:border-themed-text-secondary bg-themed-surface'}`}
              >
                {theme === 'solarized-light' && (
                  <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="w-6 h-6 rounded-full bg-[#FDF6E3] border border-gray-300 mb-2 shadow-sm"></div>
                <span className={`text-xs font-medium ${theme === 'solarized-light' ? 'text-blue-700' : 'text-themed-text-secondary'}`}>Solarized</span>
              </button>

              <button
                onClick={() => setTheme('blue-light')}
                className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center relative transition-all ${theme === 'blue-light' ? 'border-blue-500 shadow-sm ring-2 ring-blue-100' : 'border-themed-border hover:border-themed-text-secondary bg-themed-surface'}`}
              >
                {theme === 'blue-light' && (
                  <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="w-6 h-6 rounded-full bg-[#F0F7FF] border border-gray-300 mb-2 shadow-sm"></div>
                <span className={`text-xs font-medium ${theme === 'blue-light' ? 'text-blue-700' : 'text-themed-text-secondary'}`}>Blue Light</span>
              </button>

              <button
                onClick={() => setTheme('dark')}
                className={`h-20 rounded-xl border-2 flex flex-col items-center justify-center relative transition-all ${theme === 'dark' ? 'border-blue-500 shadow-sm ring-2 ring-blue-100' : 'border-themed-border hover:border-themed-text-secondary bg-themed-surface'}`}
              >
                {theme === 'dark' && (
                  <div className="absolute top-2 right-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="w-6 h-6 rounded-full bg-[#1A1C1F] border border-gray-600 mb-2 shadow-sm"></div>
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-blue-700' : 'text-themed-text-secondary'}`}>Dark</span>
              </button>
            </div>
          </div>

          {/* UI Scale */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-themed-text-primary flex items-center">
                  <Maximize className="w-4 h-4 mr-2 text-themed-text-secondary" />
                  UI Scale
                </h3>
                <p className="text-sm text-themed-text-secondary">Adjust the size of the interface</p>
              </div>
              <span className="text-sm font-mono bg-themed-surface text-themed-text-primary px-2 py-1 rounded">
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
              className="w-full h-2 bg-themed-surface rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between mt-2 text-xs text-themed-text-secondary">
              <span>75%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
          </div>

        </div>
      </section>

      {/* Data Management */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center text-themed-text-primary">
          <Monitor className="w-5 h-5 mr-2" />
          Data & Storage
        </h2>
        <div className="bg-themed-surface border border-themed-border rounded-xl shadow-sm overflow-hidden">
          {/* Sync to PostgreSQL */}
          <div
            onClick={handleManualSync}
            className={`p-6 flex items-center justify-between cursor-pointer hover:bg-themed-bg transition-colors border-b border-themed-border ${isSyncing ? 'pointer-events-none opacity-60' : ''
              }`}
          >
            <div className="flex items-center">
              <div className="p-2 bg-themed-surface rounded-lg mr-4">
                <DatabaseZap className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-themed-text-primary">Sync to PostgreSQL</h3>
                <p className="text-sm text-themed-text-secondary">
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
            <RefreshCw className={`w-5 h-5 text-themed-text-secondary ${isSyncing ? 'animate-spin' : ''}`} />
          </div>

          {/* Export Notes */}
          <div
            onClick={() => setShowExportModal(true)}
            className="p-6 flex items-center justify-between cursor-pointer hover:bg-themed-bg transition-colors"
          >
            <div className="flex items-center">
              <div className="p-2 bg-themed-surface rounded-lg mr-4">
                <Download className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-themed-text-primary">Export Notes</h3>
                <p className="text-sm text-themed-text-secondary">Download your notes in various formats</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-themed-text-secondary" />
          </div>
        </div>
      </section>

      <div className="mt-12 text-center text-sm text-themed-text-secondary">
        <p>NoteDown v1.0.0</p>
        <p className="mt-1">Built with React, Tauri & Tailwind</p>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExportModal(false)}>
          <div className="bg-themed-surface rounded-2xl shadow-xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-themed-border flex justify-between items-center">
              <h3 className="text-xl font-semibold text-themed-text-primary">Export Notes</h3>
              <button onClick={() => setShowExportModal(false)} className="text-themed-text-secondary hover:text-themed-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-themed-text-secondary mb-4">Select the format you'd like to export your notes in:</p>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'md', label: 'Markdown', ext: '.md' },
                  { id: 'pdf', label: 'PDF Document', ext: '.pdf' },
                  { id: 'txt', label: 'Plain Text', ext: '.txt' },
                  { id: 'img', label: 'Image', ext: '.png' },
                ].map(fmt => (
                  <button
                    key={fmt.id}
                    onClick={() => setExportFormat(fmt.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${exportFormat === fmt.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-themed-border hover:border-themed-text-secondary text-themed-text-primary'
                      }`}
                  >
                    <div className="font-bold text-lg">{fmt.ext}</div>
                    <div className="text-sm opacity-80">{fmt.label}</div>
                  </button>
                ))}
              </div>

              <div className="mt-8 flex justify-end space-x-3">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 text-themed-text-secondary hover:bg-themed-bg rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center"
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
