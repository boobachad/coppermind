import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getDb } from '../lib/db';
import { softDelete } from '../lib/softDelete';
import { Note } from '../lib/types';
import { formatDistanceToNow } from 'date-fns';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { Trash2, Move } from 'lucide-react';

const getPreviewText = (content: string) => {
  if (!content) return '';
  try {
    const json = JSON.parse(content);
    let text = '';
    const extract = (node: any) => {
      // Handle Message object containing serialized ProseMirror doc
      if (node.role && node.content) {
        try {
          const msgDoc = JSON.parse(node.content);
          extract(msgDoc);
        } catch {
          text += node.content + ' ';
        }
        return;
      }
      if (node.type === 'text' && node.text) {
        text += node.text + ' ';
      }
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(extract);
      }
    };

    if (Array.isArray(json)) {
      json.forEach(extract);
    } else {
      extract(json);
    }
    return text.trim();
  } catch {
    return content;
  }
};

// Sortable Item Component
function SortableNote({
  note,
  onClick,
  onContextMenu,
  isRearrangeMode
}: {
  note: Note & { nestedCount: number },
  onClick: () => void,
  onContextMenu: (e: React.MouseEvent) => void,
  isRearrangeMode: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: note.id, disabled: !isRearrangeMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(isRearrangeMode ? listeners : {})}
      onClick={isRearrangeMode ? undefined : onClick}
      onContextMenu={onContextMenu}
      className={clsx(
        "material-glass-subtle rounded-xl p-6 transition-all flex flex-col h-48 group relative",
        !isRearrangeMode && "hover:bg-white/10 cursor-pointer hover:-translate-y-1 hover:shadow-xl",
        isRearrangeMode && "cursor-move ring-2 ring-transparent hover:ring-blue-500/50"
      )}
    >
      {note.nestedCount > 0 && (
        <div
          className="absolute top-3 right-3 text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm"
          style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-secondary)' }}
          title={`${note.nestedCount} nested notes inside`}
        >
          {note.nestedCount}
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2 truncate transition-colors pr-8" style={{ color: 'var(--text-primary)' }}>
        {note.title || 'Untitled'}
      </h3>
      <p className="text-sm mb-4 flex-1 overflow-hidden relative" style={{ color: 'var(--text-secondary)' }}>
        <span className="line-clamp-4 leading-relaxed">
          {getPreviewText(note.content) || <span className="italic" style={{ color: 'var(--text-tertiary)' }}>No content</span>}
        </span>
      </p>
      <div className="text-xs mt-auto pt-4 border-t flex justify-between items-center" style={{ color: 'var(--text-tertiary)', borderColor: 'var(--glass-border)' }}>
        <span>
          {(() => {
            try {
              return note.updated_at ? formatDistanceToNow(new Date(note.updated_at), { addSuffix: true }) : 'Unknown date';
            } catch {
              return 'Unknown date';
            }
          })()}
        </span>
        {isRearrangeMode && <Move className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />}
      </div>
    </div>
  );
}

export function NotesGrid({ parentId = null, embedded = false }: { parentId?: string | null, embedded?: boolean }) {
  const [notes, setNotes] = useState<(Note & { nestedCount: number })[]>([]);
  const [isRearrangeMode, setIsRearrangeMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const navigate = useNavigate();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadNotes();
    window.addEventListener('notes-updated', loadNotes);
    return () => window.removeEventListener('notes-updated', loadNotes);
  }, [parentId]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const loadNotes = async () => {
    try {
      const db = await getDb();
      // Direct query with proper filtering - same as Sidebar
      const filteredNotes = await db.select<Note[]>(
        parentId
          ? 'SELECT * FROM notes WHERE parent_id = $1 ORDER BY position ASC, updated_at DESC'
          : 'SELECT * FROM notes WHERE parent_id IS NULL ORDER BY position ASC, updated_at DESC',
        parentId ? [parentId] : []
      );

      // Get nested counts
      const allNotes = await db.select<Note[]>('SELECT id, parent_id FROM notes');
      const notesWithCounts = filteredNotes.map(note => ({
        ...note,
        nestedCount: allNotes.filter(n => n.parent_id === note.id).length
      }));

      setNotes(notesWithCounts);
    } catch (err) {
      console.error("Failed to load notes", err);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setNotes((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // Persist order asynchronously
        persistOrder(newItems);

        return newItems;
      });
    }
  };

  const persistOrder = async (items: Note[]) => {
    try {
      const db = await getDb();
      await Promise.all(items.map((note, index) =>
        db.execute('UPDATE notes SET position = $1 WHERE id = $2', [index, note.id])
      ));
    } catch (err) {
      console.error("Failed to persist order", err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, noteId });
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await softDelete('notes', deleteConfirm);
      setDeleteConfirm(null);
      loadNotes();
      window.dispatchEvent(new Event('notes-updated'));
    } catch (err) {
      console.error("Failed to delete note", err);
    }
  };

  return (
    <>
      <div className={embedded ? "w-full" : "h-full p-8 overflow-y-auto custom-scrollbar"}>
        <div className={embedded ? "w-full" : "max-w-6xl mx-auto"}>
          <div className="flex justify-end mb-4 h-8">
            {isRearrangeMode && (
              <button
                onClick={() => setIsRearrangeMode(false)}
                className="flex items-center text-sm px-3 py-1 rounded-full transition-colors border shadow-sm"
                style={{
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--glass-bg-subtle)',
                  borderColor: 'var(--glass-border)'
                }}
              >
                <Move className="w-4 h-4 mr-2" />
                Done Rearranging
              </button>
            )}
          </div>

          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64" style={{ color: 'var(--text-tertiary)' }}>
              <p className="text-sm font-medium mb-1">No notes found</p>
              <p className="text-xs">Create one from the sidebar +</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={notes.map(n => n.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {notes.map((note) => (
                    <SortableNote
                      key={note.id}
                      note={note}
                      onClick={() => navigate(`/notes/${note.id}`)}
                      onContextMenu={(e) => handleContextMenu(e, note.id)}
                      isRearrangeMode={isRearrangeMode}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9999]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed material-glass rounded-lg shadow-2xl py-1 w-48 z-[9999] overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-2 text-sm flex items-center transition-colors"
              style={{ color: 'var(--text-primary)' }}
              onClick={() => {
                setIsRearrangeMode(!isRearrangeMode);
                setContextMenu(null);
              }}
            >
              <Move className="w-3.5 h-3.5 mr-2 opacity-70" />
              {isRearrangeMode ? 'Disable Rearrange' : 'Re-arrange notes'}
            </button>
            <div className="h-px my-1" style={{ backgroundColor: 'var(--glass-border)' }} />
            <button
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center transition-colors"
              onClick={() => {
                setDeleteConfirm(contextMenu.noteId);
                setContextMenu(null);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2 opacity-70" />
              Delete note
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="material-glass rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl border" style={{ borderColor: 'var(--glass-border)' }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Delete Note?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium rounded-lg shadow-lg transition-all"
                style={{
                  color: 'white',
                  backgroundColor: 'var(--color-error-subtle-heavy)'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
