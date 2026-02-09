import { useState, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext';
import {
  Monitor,
  Download,
  Palette,
  Maximize,
  ChevronRight,
  X,
  Check
} from 'lucide-react';


export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const [uiScale, setUiScale] = useState(() => {
    // Try to recover state from localStorage or default to 1
    const saved = localStorage.getItem('app_ui_scale');
    return saved ? parseFloat(saved) : 1;
  });

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('md');

  // Apply UI Scale
  useEffect(() => {
    // Apply zoom to the body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document.body.style as any).zoom = uiScale;
    localStorage.setItem('app_ui_scale', uiScale.toString());
  }, [uiScale]);

  const handleExport = () => {
    // Mock export functionality
    alert(`Exporting as .${exportFormat} (Feature coming soon!)`);
    setShowExportModal(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-8 pb-32 dark:text-dark-text-primary">
      <h1 className="text-3xl font-bold mb-8 text-gray-800 dark:text-dark-text-primary">Settings</h1>

      {/* Appearance Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-700 dark:text-dark-text-primary">
          <Palette className="w-5 h-5 mr-2" />
          Appearance
        </h2>
        <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden">

          {/* Themes */}
          <div className="p-6 border-b border-gray-200 dark:border-dark-border relative">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">Theme</h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary">Choose your preferred visual style</p>
              </div>
            </div>
            <div className="flex space-x-3 mt-4">
              <button
                onClick={() => theme === 'dark' && toggleTheme()}
                className={`w-24 h-16 rounded-lg bg-white border-2 flex items-center justify-center relative transition-all ${theme === 'light' ? 'border-blue-500 shadow-md ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'}`}
              >
                {theme === 'light' && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <span className={`text-sm font-medium ${theme === 'light' ? 'text-gray-900' : 'text-gray-500'}`}>Light</span>
              </button>

              <button
                onClick={() => theme === 'light' && toggleTheme()}
                className={`w-24 h-16 rounded-lg bg-[#121212] border-2 flex items-center justify-center relative transition-all ${theme === 'dark' ? 'border-blue-500 shadow-md ring-2 ring-blue-100' : 'border-gray-700 hover:border-gray-600'}`}
              >
                {theme === 'dark' && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-400'}`}>Dark</span>
              </button>
            </div>
          </div>

          {/* UI Scale */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary flex items-center">
                  <Maximize className="w-4 h-4 mr-2 text-gray-500 dark:text-dark-text-secondary" />
                  UI Scale
                </h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary">Adjust the size of the interface</p>
              </div>
              <span className="text-sm font-mono bg-gray-100 dark:bg-dark-bg dark:text-dark-text-primary px-2 py-1 rounded">
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
              className="w-full h-2 bg-gray-200 dark:bg-dark-bg rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between mt-2 text-xs text-gray-400 dark:text-dark-text-secondary">
              <span>75%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
          </div>

        </div>
      </section>

      {/* Data Management */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-700 dark:text-dark-text-primary">
          <Monitor className="w-5 h-5 mr-2" />
          Data & Storage
        </h2>
        <div className="bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-xl shadow-sm overflow-hidden">
          <div
            onClick={() => setShowExportModal(true)}
            className="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
          >
            <div className="flex items-center">
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg mr-4">
                <Download className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">Export Notes</h3>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary">Download your notes in various formats</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-dark-text-secondary" />
          </div>
        </div>
      </section>

      {/* About & Legal - Removed as per user request */}

      <div className="mt-12 text-center text-sm text-gray-400 dark:text-dark-text-secondary">
        <p>NoteDown v1.0.0</p>
        <p className="mt-1">Built with React, Tauri & Tailwind</p>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExportModal(false)}>
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 dark:border-dark-border flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">Export Notes</h3>
              <button onClick={() => setShowExportModal(false)} className="text-gray-400 dark:text-dark-text-secondary hover:text-gray-600 dark:hover:text-dark-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 dark:text-dark-text-secondary mb-4">Select the format you'd like to export your notes in:</p>

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
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-dark-text-primary'
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
                  className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg rounded-lg font-medium"
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
