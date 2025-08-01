import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Editor, EditorRef } from '../components/Editor';
import { FloatingHeader } from '../components/FloatingHeader';
import { StickyNote } from '../components/StickyNote';
import { NotesGrid } from '../components/NotesGrid';
import { getDb } from '../lib/db';
import { Note, StickyNote as StickyNoteType } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string, title: string }>>([]);
  const [stickyNotes, setStickyNotes] = useState<StickyNoteType[]>([]);
  const saveTimeoutRef = useRef<any>(null);
  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    loadNote();
    loadStickyNotes();
  }, [id]);

  useEffect(() => {
    if (note) {
      loadBreadcrumbs(note);
    }
  }, [note]);

  const loadNote = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const db = await getDb();
      const result = await db.select<Note[]>('SELECT * FROM notes WHERE id = $1', [id]);
      if (result.length > 0) {
        setNote(result[0]);
      }
    } catch (err) {
      console.error("Error loading note:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStickyNotes = async () => {
    if (!id) return;
    try {
      const db = await getDb();
      const result = await db.select<StickyNoteType[]>('SELECT * FROM sticky_notes WHERE note_id = $1', [id]);
      setStickyNotes(result);
    } catch (err) {
      console.error("Error loading sticky notes:", err);
    }
  };

  const loadBreadcrumbs = async (currentNote: Note) => {
    const crumbs = [];
    let current = currentNote;
    try {
        const db = await getDb();
        // Loop up to 5 levels
        for (let i = 0; i < 5; i++) {
          if (!current.parent_id) break;
          const result = await db.select<Note[]>('SELECT * FROM notes WHERE id = $1', [current.parent_id]);
          if (result.length === 0) break;
          current = result[0];
          crumbs.unshift({ id: current.id, title: current.title });
        }
        setBreadcrumbs(crumbs);
    } catch (e) {
        console.error(e);
    }
  };

  const saveNote = useCallback(async (content: string) => {
    if (!id) return;
    try {
      const db = await getDb();
      const title = extractTitle(content);
      const now = Date.now();
      await db.execute('UPDATE notes SET title = $1, content = $2, updated_at = $3 WHERE id = $4', [
        title,
        content,
        now,
        id
      ]);
      window.dispatchEvent(new Event('notes-updated'));
      setNote(prev => prev ? { ...prev, title, content } : null);
    } catch (err) {
      console.error("Error saving note:", err);
    }
  }, [id]);

  const handleContentChange = (content: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveNote(content);
    }, 500);
  };

  const handleTitleChange = (newTitle: string) => {
    if (editorRef.current) {
        editorRef.current.setTitle(newTitle);
    }
  };

  const handleAction = async (action: string) => {
    if (!note) return;
    const db = await getDb();

    if (action === 'delete') {
      if (confirm('Are you sure you want to delete this note?')) {
        await db.execute('DELETE FROM notes WHERE id = $1', [note.id]);
        window.dispatchEvent(new Event('notes-updated'));
        navigate('/');
      }
    } else if (action === 'new-nested') {
        const newId = uuidv4();
        const now = Date.now();
        await db.execute('INSERT INTO notes (id, title, content, created_at, updated_at, parent_id) VALUES ($1, $2, $3, $4, $5, $6)', [
            newId,
            'Untitled',
            '',
            now,
            now,
            note.id
        ]);
        window.dispatchEvent(new Event('notes-updated'));
        navigate(`/notes/${newId}`);
    } else if (action === 'new-sticky') {
        const newId = uuidv4();
        const now = Date.now();
        // Calculate center position
        const centerX = Math.max(0, window.innerWidth / 2 - 128); // 128 is half of w-64 (256px)
        const centerY = Math.max(0, window.innerHeight / 2 - 128);
        
        await db.execute('INSERT INTO sticky_notes (id, note_id, content, color, x, y, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
            newId,
            note.id,
            'New Sticky Note',
            'yellow',
            centerX,
            centerY,
            now
        ]);
        loadStickyNotes();
    }
  };

  const handleStickyReorder = (id: string, direction: 'front' | 'back') => {
      setStickyNotes(prev => {
          const noteIndex = prev.findIndex(n => n.id === id);
          if (noteIndex === -1) return prev;
          
          const note = prev[noteIndex];
          const newNotes = [...prev];
          newNotes.splice(noteIndex, 1);
          
          if (direction === 'front') {
              newNotes.push(note);
          } else {
              newNotes.unshift(note);
          }
          
          return newNotes;
      });
  };

  const updateSticky = async (stickyId: string, updates: Partial<StickyNoteType>) => {
      const db = await getDb();
      const current = stickyNotes.find(s => s.id === stickyId);
      if (!current) return;
      
      const updated = { ...current, ...updates };
      setStickyNotes(prev => prev.map(s => s.id === stickyId ? updated : s));
      
      if (updates.x !== undefined || updates.y !== undefined) {
          await db.execute('UPDATE sticky_notes SET x = $1, y = $2 WHERE id = $3', [updated.x, updated.y, stickyId]);
      }
      if (updates.content !== undefined) {
          await db.execute('UPDATE sticky_notes SET content = $1 WHERE id = $2', [updated.content, stickyId]);
      }
      if (updates.color !== undefined) {
          await db.execute('UPDATE sticky_notes SET color = $1 WHERE id = $2', [updated.color, stickyId]);
      }
  };
  
  const deleteSticky = async (stickyId: string) => {
      if(!confirm("Delete sticky note?")) return;
      const db = await getDb();
      await db.execute('DELETE FROM sticky_notes WHERE id = $1', [stickyId]);
      setStickyNotes(prev => prev.filter(s => s.id !== stickyId));
  };

  const extractTitle = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    const h1 = div.querySelector('h1');
    if (h1 && h1.textContent) return h1.textContent.substring(0, 50);
    const p = div.querySelector('p');
    if (p && p.textContent) return p.textContent.substring(0, 50);
    return 'Untitled';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!note) {
    return <div className="flex items-center justify-center h-full">Note not found</div>;
  }

  return (
    <div className="h-full relative flex flex-col bg-white">
      <FloatingHeader 
        title={note.title || 'Untitled'} 
        onTitleChange={handleTitleChange}
        breadcrumbs={breadcrumbs}
        onAction={handleAction}
      />
      
      <div className="flex-1 overflow-y-auto relative">
        <div className="max-w-4xl mx-auto w-full pb-24">
          <Editor 
            ref={editorRef}
            initialContent={note.content} 
            onChange={handleContentChange} 
          />
          
          {/* Nested Notes Section */}
          <div className="mt-8 px-12 pt-8 border-t border-gray-100">
             <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <span>Nested Notes</span>
                <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs">
                   {/* We could show count here if we fetched it, but NotesGrid handles empty state */}
                </span>
             </h3>
             <NotesGrid parentId={note.id} embedded={true} />
          </div>
        </div>

        {/* Sticky Notes Overlay */}
        {stickyNotes.map(sn => (
           <StickyNote 
              key={sn.id} 
              data={sn} 
              onUpdate={updateSticky} 
              onDelete={deleteSticky}
              onReorder={handleStickyReorder}
           />
        ))}
      </div>
    </div>
  );
}
