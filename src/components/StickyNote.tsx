import { useState, useRef, useEffect } from 'react';
import { StickyNote as StickyNoteType } from '../lib/types';
import clsx from 'clsx';
import { Trash2, Pin, Edit, ArrowUp, ArrowDown } from 'lucide-react';

interface Props {
  data: StickyNoteType;
  onUpdate: (id: string, updates: Partial<StickyNoteType>) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, direction: 'front' | 'back') => void;
}

const COLORS: Record<string, string> = {
  rose: 'bg-rose-200',
  red: 'bg-red-200',
  yellow: 'bg-yellow-100',
  lightBlue: 'bg-sky-200',
  darkBlue: 'bg-blue-300',
};

import { createPortal } from 'react-dom';

export function StickyNote({ data, onUpdate, onDelete, onReorder }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isEditing) return; // Only left click, ignore if editing text
    e.stopPropagation();
    setIsDragging(true);
    const rect = noteRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const parentRect = noteRef.current?.offsetParent?.getBoundingClientRect();
      if (!parentRect) return;

      const x = e.clientX - parentRect.left - dragOffset.current.x;
      const y = e.clientY - parentRect.top - dragOffset.current.y;

      onUpdate(data.id, { x, y });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, data.id, onUpdate]);

  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);
  };

  useEffect(() => {
    const closeMenu = () => setShowMenu(false);
    if (showMenu) window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [showMenu]);

  return (
    <>
      <div
        ref={noteRef}
        style={{ left: data.x, top: data.y }}
        className={clsx(
          "absolute w-64 h-64 rounded-xl shadow-xl transition-shadow duration-300",
          COLORS[data.color] || COLORS.yellow,
          isDragging ? "cursor-grabbing z-50 shadow-2xl scale-105" : "cursor-grab z-10",
          "flex flex-col overflow-hidden"
        )}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {/* Pin Icon */}
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20">
          <div>
            <Pin className="w-6 h-6 text-red-500 drop-shadow-md fill-current" />
          </div>
        </div>

        {/* Content Area with Notebook Lines */}
        <div
          ref={contentRef}
          className="flex-1 p-6 pt-8 outline-none resize-none bg-transparent font-handwriting text-gray-800 leading-8"
          style={{
            backgroundImage: 'linear-gradient(transparent 31px, var(--color-shadow-line) 32px)',
            backgroundSize: '100% 32px',
            backgroundAttachment: 'local'
          }}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => {
            setIsEditing(false);
            onUpdate(data.id, { content: e.currentTarget.textContent || '' });
          }}
          onFocus={() => setIsEditing(true)}
        >
          {data.content}
        </div>
      </div>

      {/* Context Menu via Portal */}
      {showMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9999]"
            onClick={() => setShowMenu(false)}
            onContextMenu={(e) => { e.preventDefault(); setShowMenu(false); }}
          />
          <div
            className="fixed material-glass-subtle rounded-lg shadow-xl border border-white/10 p-2 z-[9999] flex flex-col gap-1 min-w-[140px]"
            style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
          >
            <div className="flex gap-1 p-1 mb-1 border-b border-white/10">
              {Object.keys(COLORS).map(color => (
                <button
                  key={color}
                  className={clsx("w-4 h-4 rounded-full border border-black/10", COLORS[color])}
                  onClick={() => onUpdate(data.id, { color })}
                />
              ))}
            </div>

            <button
              onClick={() => {
                setIsEditing(true);
                setTimeout(() => contentRef.current?.focus(), 10);
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-white hover:bg-white/10 rounded"
            >
              <Edit className="w-3 h-3" /> Edit
            </button>

            <button
              onClick={() => onReorder(data.id, 'front')}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-white/80 hover:bg-white/10 rounded"
            >
              <ArrowUp className="w-3 h-3" /> Bring to front
            </button>

            <button
              onClick={() => onReorder(data.id, 'back')}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-white/80 hover:bg-white/10 rounded"
            >
              <ArrowDown className="w-3 h-3" /> Send to back
            </button>

            <div className="h-px bg-white/10 my-1" />

            <button
              onClick={() => onDelete(data.id)}
              className="flex items-center gap-2 px-2 py-1.5 text-sm text-red-300 hover:bg-red-500/20 rounded"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
