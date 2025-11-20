import { useState } from 'react';
import { Editor } from '@tiptap/react';
import {
  Copy,
  Clipboard,
  Maximize,
  Palette,
  PaintBucket,
  Highlighter,
  Image as ImageIcon,
  FileText,
  Check,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Type,
  ArrowRight
} from 'lucide-react';
import { handleImageUpload, handlePDFUpload } from './extensions/uploadHelper';

interface ContextMenuProps {
  editor: Editor;
  position: { x: number; y: number } | null;
  onClose: () => void;
}

const COLORS = [
  { label: 'Light Blue', value: '#60a5fa' },
  { label: 'Light Red', value: '#f87171' },
  { label: 'Light Green', value: '#4ade80' },
  { label: 'Light Orange', value: '#fb923c' },
  { label: 'Light Yellow', value: '#facc15' },
  { label: 'Light Purple', value: '#c084fc' },
  { label: 'Light Pink', value: '#f472b6' },
  { label: 'Gray', value: '#9ca3af' },
];

const BACKGROUNDS = [
  { label: 'Soft Yellow', value: '#fef08a' },
  { label: 'Soft Orange', value: '#ffedd5' },
  { label: 'Soft Pink', value: '#fce7f3' },
  { label: 'Soft Blue', value: '#dbeafe' },
  { label: 'Soft Green', value: '#dcfce7' },
  { label: 'Soft Purple', value: '#f3e8ff' },
  { label: 'Soft Gray', value: '#f3f4f6' },
  { label: 'Reset', value: 'unset' },
];

export const ContextMenu = ({ editor, position, onClose }: ContextMenuProps) => {
  const [activeSubmenu, setActiveSubmenu] = useState<'text' | 'bg' | 'convert' | null>(null);

  if (!position) return null;

  const handleCopy = () => {
    // This assumes the user has selected something or we select the block under cursor
    // For simplicity, we just trigger browser copy if supported or tell user to use Ctrl+C
    // Actually, we can use navigator.clipboard.writeText if we have the text
    const selection = editor.state.selection;
    const text = editor.state.doc.textBetween(selection.from, selection.to, '\n');
    navigator.clipboard.writeText(text);
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      editor.chain().focus().insertContent(text).run();
    } catch (e) {
      console.error('Paste failed', e);
    }
    onClose();
  };

  const handleSelectAll = () => {
    editor.chain().focus().selectAll().run();
    onClose();
  };

  const handleImage = async () => {
    const src = await handleImageUpload();
    if (src) {
      editor.chain().focus().setImage({ src }).run();
    }
    onClose();
  };

  const handlePDF = async () => {
    const result = await handlePDFUpload();
    if (result) {
      editor.chain().focus().insertContent({
        type: 'pdf',
        attrs: { src: result.src, name: result.name }
      }).run();
    }
    onClose();
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose} 
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        className="fixed z-50 bg-white dark:bg-dark-surface text-black dark:text-dark-text-primary shadow-xl border border-gray-200 dark:border-dark-border rounded-lg py-1 w-64 max-w-xs flex flex-col text-sm"
        style={{ top: position.y, left: position.x }}
      >
        <MenuItem icon={Copy} label="Copy" onClick={handleCopy} />
        <MenuItem icon={Clipboard} label="Paste" onClick={handlePaste} />
        <MenuItem icon={Maximize} label="Select All" onClick={handleSelectAll} />
        
        <div className="h-px bg-gray-100 dark:bg-dark-border my-1" />
        
        <div className="relative">
          <MenuItem 
            icon={ArrowRight} 
            label="Convert to" 
            onClick={() => setActiveSubmenu(activeSubmenu === 'convert' ? null : 'convert')}
            active={activeSubmenu === 'convert'}
            hasSubmenu
          />
          {activeSubmenu === 'convert' && (
            <div className="absolute left-full top-0 ml-1 bg-white dark:bg-dark-surface shadow-xl border border-gray-200 dark:border-dark-border rounded-lg py-1 w-48 z-50 max-h-64 overflow-y-auto">
               <MenuItem icon={Type} label="Text" onClick={() => { editor.chain().focus().setParagraph().run(); onClose(); }} />
               <MenuItem icon={Heading1} label="Heading 1" onClick={() => { editor.chain().focus().setHeading({ level: 1 }).run(); onClose(); }} />
               <MenuItem icon={Heading2} label="Heading 2" onClick={() => { editor.chain().focus().setHeading({ level: 2 }).run(); onClose(); }} />
               <MenuItem icon={Heading3} label="Heading 3" onClick={() => { editor.chain().focus().setHeading({ level: 3 }).run(); onClose(); }} />
               <MenuItem icon={List} label="Bullet List" onClick={() => { editor.chain().focus().toggleBulletList().run(); onClose(); }} />
               <MenuItem icon={ListOrdered} label="Numbered List" onClick={() => { editor.chain().focus().toggleOrderedList().run(); onClose(); }} />
               <MenuItem icon={CheckSquare} label="Task List" onClick={() => { editor.chain().focus().toggleTaskList().run(); onClose(); }} />
               <MenuItem icon={Quote} label="Quote" onClick={() => { editor.chain().focus().setBlockquote().run(); onClose(); }} />
               <MenuItem icon={Code} label="Code Block" onClick={() => { editor.chain().focus().setCodeBlock().run(); onClose(); }} />
            </div>
          )}
        </div>

        <div className="relative">
          <MenuItem 
            icon={Palette} 
            label="Text Color" 
            onClick={() => setActiveSubmenu(activeSubmenu === 'text' ? null : 'text')} 
            active={activeSubmenu === 'text'}
            hasSubmenu
          />
          {activeSubmenu === 'text' && (
            <div className="absolute left-full top-0 ml-1 bg-white dark:bg-dark-surface shadow-xl border border-gray-200 dark:border-dark-border rounded-lg p-2 grid grid-cols-4 gap-1 w-48 z-50">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  className="w-8 h-8 rounded-full border border-gray-100 dark:border-dark-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                  onClick={() => {
                    editor.chain().focus().setColor(c.value).run();
                    onClose();
                  }}
                />
              ))}
              <button 
                className="w-8 h-8 rounded-full border border-gray-200 dark:border-dark-border flex items-center justify-center hover:bg-gray-50 dark:hover:bg-dark-border text-xs"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  onClose();
                }}
                title="Reset"
              >
                <Check size={12} className="dark:text-dark-text-primary" />
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <MenuItem 
            icon={PaintBucket} 
            label="Background Color" 
            onClick={() => setActiveSubmenu(activeSubmenu === 'bg' ? null : 'bg')}
            active={activeSubmenu === 'bg'}
            hasSubmenu
          />
          {activeSubmenu === 'bg' && (
            <div className="absolute left-full top-0 ml-1 bg-white dark:bg-dark-surface shadow-xl border border-gray-200 dark:border-dark-border rounded-lg p-2 grid grid-cols-4 gap-1 w-48 z-50">
              {BACKGROUNDS.map((c) => (
                <button
                  key={c.value}
                  className="w-8 h-8 rounded-full border border-gray-100 dark:border-dark-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value === 'unset' ? 'white' : c.value }}
                  title={c.label}
                  onClick={() => {
                    if (c.value === 'unset') {
                        editor.chain().focus().unsetHighlight().run();
                    } else {
                        editor.chain().focus().toggleHighlight({ color: c.value }).run();
                    }
                    onClose();
                  }}
                >
                    {c.value === 'unset' && <Check size={12} className="mx-auto text-black" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <MenuItem 
            icon={Highlighter} 
            label="Highlight Text" 
            onClick={() => {
                editor.chain().focus().toggleHighlight().run();
                onClose();
            }} 
        />

        <div className="h-px bg-gray-100 dark:bg-dark-border my-1" />

        <MenuItem icon={ImageIcon} label="Add Image" onClick={handleImage} />
        <MenuItem icon={FileText} label="Add PDF" onClick={handlePDF} />

      </div>
    </>
  );
};

const MenuItem = ({ icon: Icon, label, onClick, hasSubmenu, active }: any) => (
  <button
    className={`w-full px-4 py-2 text-left flex items-center justify-between hover:bg-gray-100 dark:hover:bg-dark-border transition-colors outline-none ${active ? 'bg-gray-100 dark:bg-dark-border' : ''}`}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <Icon size={16} className="text-gray-500 dark:text-dark-text-secondary" />
      <span className="dark:text-dark-text-primary">{label}</span>
    </div>
    {hasSubmenu && <span className="text-gray-400 dark:text-dark-text-secondary">›</span>}
  </button>
);
