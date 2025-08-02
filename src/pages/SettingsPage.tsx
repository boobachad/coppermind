import { useState, useEffect } from 'react';
import { 
  Monitor, 
  Download, 
  Shield, 
  FileText, 
  Scale, 
  ChevronRight, 
  X,
  Check,
  Palette,
  Maximize
} from 'lucide-react';

const LEGAL_DOCS = {
  agreement: {
    title: "User Agreement",
    content: `
# User Agreement

**Last Updated: ${new Date().toLocaleDateString()}**

## 1. Acceptance of Terms
By accessing and using NoteDown ("the Application"), you accept and agree to be bound by the terms and provision of this agreement.

## 2. Use License
Permission is granted to temporarily download one copy of the materials (information or software) on NoteDown for personal, non-commercial transitory viewing only.

## 3. Disclaimer
The materials on NoteDown are provided "as is". NoteDown makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties, including without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.

## 4. Limitations
In no event shall NoteDown or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on NoteDown.

## 5. Local Data Storage
You understand that NoteDown operates primarily as a local-first application. You are responsible for backing up your own data. We are not responsible for data loss due to browser cache clearing, device failure, or other local issues.
    `
  },
  license: {
    title: "GNU General Public License",
    content: `
# GNU General Public License v3.0

Copyright (C) 2024 NoteDown Contributors

Everyone is permitted to copy and distribute verbatim copies of this license document, but changing it is not allowed.

## Preamble
The GNU General Public License is a free, copyleft license for software and other kinds of works.

## Terms and Conditions

### 1. Definitions.
"This License" refers to version 3 of the GNU General Public License.
"The Program" refers to any copyrightable work licensed under this License.

### 2. Basic Permissions.
All rights granted under this License are granted for the term of copyright on the Program, and are irrevocable provided the stated conditions are met. This License explicitly affirms your unlimited permission to run the unmodified Program.

### 3. Protecting Users' Legal Rights From Anti-Circumvention Law.
No covered work shall be deemed part of an effective technological measure under any applicable law fulfilling obligations under article 11 of the WIPO copyright treaty.

### 4. Conveying Verbatim Copies.
You may convey verbatim copies of the Program's source code as you receive it, in any medium, provided that you conspicuously and appropriately publish on each copy an appropriate copyright notice.

*(This is a summarized excerpt. For the full text, please visit gnu.org/licenses/gpl-3.0.html)*
    `
  },
  privacy: {
    title: "Privacy Policy",
    content: `
# Privacy Policy

**Last Updated: ${new Date().toLocaleDateString()}**

## 1. Data Collection
NoteDown is designed as a privacy-focused, local-first application. 
**We do not collect, transmit, or store your personal notes on our servers.**

## 2. Local Storage
All notes, settings, and application data are stored locally on your device using your browser's LocalStorage or IndexedDB technologies.

## 3. Third-Party Services
The Application does not utilize third-party tracking, analytics, or advertising services.

## 4. Data Export
You retain full ownership of your data. The Application provides tools to export your notes in standard formats (Markdown, TXT, etc.) for your portability needs.

## 5. Changes to This Policy
We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
    `
  }
};

export function SettingsPage() {
  const [uiScale, setUiScale] = useState(() => {
    // Try to recover state from localStorage or default to 1
    const saved = localStorage.getItem('app_ui_scale');
    return saved ? parseFloat(saved) : 1;
  });
  
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeLegalDoc, setActiveLegalDoc] = useState<keyof typeof LEGAL_DOCS | null>(null);
  const [exportFormat, setExportFormat] = useState('md');

  // Apply UI Scale
  useEffect(() => {
    // Apply zoom to the body
    (document.body.style as any).zoom = uiScale;
    localStorage.setItem('app_ui_scale', uiScale.toString());
  }, [uiScale]);

  const handleExport = () => {
    // Mock export functionality
    alert(`Exporting as .${exportFormat} (Feature coming soon!)`);
    setShowExportModal(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-8 pb-32">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Settings</h1>

      {/* Appearance Section */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-700">
          <Palette className="w-5 h-5 mr-2" />
          Appearance
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          
          {/* Themes (Disabled) */}
          <div className="p-6 border-b border-gray-100 opacity-60 relative">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium text-gray-900">Theme</h3>
                <p className="text-sm text-gray-500">Choose your preferred visual style</p>
              </div>
              <span className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-500 rounded">Coming Soon</span>
            </div>
            <div className="flex space-x-3 mt-4 pointer-events-none">
              <div className="w-24 h-16 rounded-lg bg-white border-2 border-blue-500 shadow-sm flex items-center justify-center relative">
                <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-medium">Light</span>
              </div>
              <div className="w-24 h-16 rounded-lg bg-gray-900 border border-gray-200 flex items-center justify-center">
                <span className="text-sm font-medium text-white">Dark</span>
              </div>
              <div className="w-24 h-16 rounded-lg bg-amber-50 border border-gray-200 flex items-center justify-center">
                <span className="text-sm font-medium text-amber-900">Sepia</span>
              </div>
            </div>
          </div>

          {/* UI Scale */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-gray-900 flex items-center">
                  <Maximize className="w-4 h-4 mr-2 text-gray-500" />
                  UI Scale
                </h3>
                <p className="text-sm text-gray-500">Adjust the size of the interface</p>
              </div>
              <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
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
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>75%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
          </div>

        </div>
      </section>

      {/* Data Management */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-700">
          <Monitor className="w-5 h-5 mr-2" />
          Data & Storage
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div 
            onClick={() => setShowExportModal(true)}
            className="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center">
              <div className="p-2 bg-green-50 rounded-lg mr-4">
                <Download className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Export Notes</h3>
                <p className="text-sm text-gray-500">Download your notes in various formats</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </section>

      {/* About & Legal */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-700">
          <Shield className="w-5 h-5 mr-2" />
          About & Legal
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
          
          <button 
            onClick={() => setActiveLegalDoc('agreement')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center">
              <Scale className="w-5 h-5 text-gray-400 mr-3" />
              <span className="text-gray-700 font-medium">User Agreement</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          <button 
            onClick={() => setActiveLegalDoc('license')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center">
              <FileText className="w-5 h-5 text-gray-400 mr-3" />
              <span className="text-gray-700 font-medium">License (GNU GPLv3)</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

          <button 
            onClick={() => setActiveLegalDoc('privacy')}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center">
              <Shield className="w-5 h-5 text-gray-400 mr-3" />
              <span className="text-gray-700 font-medium">Privacy Policy</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>

        </div>
      </section>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExportModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-900">Export Notes</h3>
              <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">Select the format you'd like to export your notes in:</p>
              
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
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      exportFormat === fmt.id 
                        ? 'border-blue-500 bg-blue-50 text-blue-700' 
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
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
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
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

      {/* Legal Doc Modal */}
      {activeLegalDoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setActiveLegalDoc(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-xl font-semibold text-gray-900">
                {LEGAL_DOCS[activeLegalDoc].title}
              </h3>
              <button onClick={() => setActiveLegalDoc(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 overflow-y-auto prose prose-blue max-w-none">
              {LEGAL_DOCS[activeLegalDoc].content.split('\n').map((line, i) => {
                 // Simple markdown-ish parser for display
                 if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-bold mb-4">{line.replace('# ', '')}</h1>;
                 if (line.startsWith('## ')) return <h2 key={i} className="text-xl font-semibold mt-6 mb-3">{line.replace('## ', '')}</h2>;
                 if (line.startsWith('### ')) return <h3 key={i} className="text-lg font-medium mt-4 mb-2">{line.replace('### ', '')}</h3>;
                 if (line.startsWith('**')) return <p key={i} className="mb-2"><strong>{line.replace(/\*\*/g, '')}</strong></p>;
                 if (line.trim() === '') return <br key={i} />;
                 return <p key={i} className="mb-2 text-gray-600">{line}</p>;
              })}
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end">
              <button 
                onClick={() => setActiveLegalDoc(null)}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
