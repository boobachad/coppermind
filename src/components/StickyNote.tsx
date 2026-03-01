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
  const dragStart = useRef({ mouseX: 0, mouseY: 0, elementX: 0, elementY: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    
    // Only prevent dragging if we're actively editing (contentEditable has focus)
    if (isEditing) return;
    
    // Prevent default to enable dragging
    e.preventDefault();
    e.stopPropagation();
    
    // Store initial mouse position and element position
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elementX: data.x,
      elementY: data.y
    };
    setIsDragging(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      // Prevent default during dragging
      e.preventDefault();
      
      // Calculate delta from initial mouse position
      const deltaX = e.clientX - dragStart.current.mouseX;
      const deltaY = e.clientY - dragStart.current.mouseY;
      
      // New position = initial element position + mouse delta
      const x = Math.max(0, dragStart.current.elementX + deltaX);
      const y = Math.max(0, dragStart.current.elementY + deltaY);

      onUpdate(data.id, { x, y });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false });
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
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
            backgroundAttachment: 'local',
            pointerEvents: isEditing ? 'auto' : 'none' // Disable pointer events when not editing
          }}
          contentEditable={isEditing}
          suppressContentEditableWarning
          onBlur={(e) => {
            setIsEditing(false);
            onUpdate(data.id, { content: e.currentTarget.textContent || '' });
          }}
          onDoubleClick={() => {
            setIsEditing(true);
            setTimeout(() => contentRef.current?.focus(), 10);
          }}
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
            className="fixed rounded-lg shadow-xl p-2 z-[9999] flex flex-col gap-1 min-w-[140px] border"
            style={{ 
              top: contextMenuPos.y, 
              left: contextMenuPos.x,
              backgroundColor: 'var(--bg-secondary)',
              borderColor: 'var(--border-color)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div className="flex gap-1 p-1 mb-1 border-b" style={{ borderColor: 'var(--border-color)' }}>
              {Object.keys(COLORS).map(color => (
                <button
                  key={color}
                  className={clsx("w-4 h-4 rounded-full border transition-all hover:scale-110", COLORS[color])}
                  style={{ borderColor: 'var(--border-color)' }}
                  onClick={() => {
                    onUpdate(data.id, { color });
                    setShowMenu(false);
                  }}
                />
              ))}
            </div>

            <button
              onClick={() => {
                setIsEditing(true);
                setTimeout(() => contentRef.current?.focus(), 10);
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-all"
              style={{ 
                color: 'var(--text-primary)',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
            >
              <Edit className="w-3 h-3" /> Edit
            </button>

            <button
              onClick={() => {
                onReorder(data.id, 'front');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-all"
              style={{ 
                color: 'var(--text-secondary)',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <ArrowUp className="w-3 h-3" /> Bring to front
            </button>

            <button
              onClick={() => {
                onReorder(data.id, 'back');
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-all"
              style={{ 
                color: 'var(--text-secondary)',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              <ArrowDown className="w-3 h-3" /> Send to back
            </button>

            <div className="h-px my-1" style={{ backgroundColor: 'var(--border-color)' }} />

            <button
              onClick={() => {
                onDelete(data.id);
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-all"
              style={{ 
                color: 'var(--color-error)',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-error-bg)';
                e.currentTarget.style.color = 'var(--color-error)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--color-error)';
              }}
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
