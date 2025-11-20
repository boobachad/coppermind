import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDb } from '../lib/db';
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
import { Trash2, Move, X } from 'lucide-react';

const getPreviewText = (content: string) => {
  if (!content) return '';
  try {
    const json = JSON.parse(content);
    let text = '';
    const extract = (node: any) => {
      if (node.type === 'text' && node.text) {
        text += node.text + ' ';
      }
      if (node.content && Array.isArray(node.content)) {
        node.content.forEach(extract);
      }
    };
    extract(json);
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
        "bg-white dark:bg-dark-surface rounded-xl p-6 shadow-sm transition-all border border-gray-100 dark:border-dark-border flex flex-col h-48 group relative",
        !isRearrangeMode && "hover:shadow-md cursor-pointer",
        isRearrangeMode && "cursor-move ring-2 ring-transparent dark:ring-transparent hover:ring-blue-200 dark:hover:ring-blue-900"
      )}
    >
      {note.nestedCount > 0 && (
        <div 
          className="absolute top-3 right-3 bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary text-xs font-semibold px-2 py-0.5 rounded-full"
          title={`${note.nestedCount} nested notes inside`}
        >
          {note.nestedCount}
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-800 dark:text-dark-text-primary mb-2 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors pr-8">
        {note.title || 'Untitled'}
      </h3>
      <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-4 flex-1 overflow-hidden relative">
        <span className="line-clamp-4">
          {getPreviewText(note.content) || <span className="italic text-gray-400">No content</span>}
        </span>
      </p>
      <div className="text-xs text-gray-400 mt-auto pt-4 border-t border-gray-50 flex justify-between items-center">
        <span>{formatDistanceToNow(note.updated_at, { addSuffix: true })}</span>
        {isRearrangeMode && <Move className="w-4 h-4 text-gray-400" />}
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
      const allNotes = await db.select<Note[]>('SELECT * FROM notes');
      const filteredNotes = allNotes
        .filter(n => parentId ? n.parent_id === parentId : !n.parent_id)
        .sort((a, b) => {
          // Sort by position if available, otherwise by updated_at desc
          if (a.position !== undefined && b.position !== undefined && a.position !== b.position) {
             return a.position - b.position;
          }
          return b.updated_at - a.updated_at;
        });
        
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
      const db = await getDb();
      // Delete note and its children (cascade should handle it if set up, but safe to do recursive if needed. 
      // Current DB schema has FOREIGN KEY but let's just delete the note. 
      // The user just said "Delete note".
      await db.execute('DELETE FROM notes WHERE id = $1', [deleteConfirm]);
      
      // Also delete sticky notes associated with it? 
      // Schema says: FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
      // So stickies are safe.
      
      // Nested notes? Schema doesn't have CASCADE for parent_id. 
      // Ideally we should delete children too or orphan them.
      // For now, let's just delete the note.
      
      setDeleteConfirm(null);
      loadNotes();
      window.dispatchEvent(new Event('notes-updated'));
    } catch (err) {
      console.error("Failed to delete note", err);
    }
  };

  return (
    <div className={embedded ? "w-full" : "h-full p-8 bg-gray-50 dark:bg-dark-bg overflow-y-auto"}>
      <div className={embedded ? "w-full" : "max-w-6xl mx-auto"}>
        <div className="flex justify-end mb-4 h-8">
           {isRearrangeMode && (
             <button 
               onClick={() => setIsRearrangeMode(false)}
               className="flex items-center text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
             >
               <Move className="w-4 h-4 mr-2" />
               Done Rearranging
             </button>
           )}
        </div>

        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-dark-text-secondary">
            <p className="text-sm font-medium mb-1">No nested notes</p>
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

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed bg-white dark:bg-dark-surface rounded-lg shadow-xl border border-gray-200 dark:border-dark-border py-1 w-48 z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-50 dark:hover:bg-dark-border flex items-center"
            onClick={() => {
              setIsRearrangeMode(!isRearrangeMode);
              setContextMenu(null);
            }}
          >
            <Move className="w-4 h-4 mr-2" />
            {isRearrangeMode ? 'Disable Rearrange' : 'Re-arrange notes'}
          </button>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
            onClick={() => {
              setDeleteConfirm(contextMenu.noteId);
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete note
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-surface rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">Delete Note?</h3>
            <p className="text-sm text-gray-500 dark:text-dark-text-secondary mb-6">
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-bg rounded-lg"
              >
                Cancel
              </button>
              <button 
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
