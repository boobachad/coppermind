import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Editor, EditorRef } from '../components/Editor';
import { FloatingHeader } from '../components/FloatingHeader';
import { getDb } from '../lib/db';
import { Note } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string, title: string }>>([]);
  const saveTimeoutRef = useRef<any>(null);
  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    loadNote();
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
      
      // Update local state to reflect title change immediately if needed, 
      // but usually the next load or re-render handles it.
      // We can update the note object locally to keep title in sync with what's on screen
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
    if (action === 'delete') {
        if (window.confirm('Are you sure you want to delete this note?')) {
            const db = await getDb();
            await db.execute('DELETE FROM notes WHERE id = $1', [note.id]);
            window.dispatchEvent(new Event('notes-updated')); 
            navigate('/');
        }
    } else if (action === 'new-nested') {
        const id = uuidv4();
        const db = await getDb();
        const now = Date.now();
        await db.execute('INSERT INTO notes (id, title, content, created_at, updated_at, parent_id) VALUES ($1, $2, $3, $4, $5, $6)', [
            id,
            'Untitled',
            '',
            now,
            now,
            note.id
        ]);
        window.dispatchEvent(new Event('notes-updated'));
        navigate(`/notes/${id}`);
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!note) return <div className="p-8 text-gray-500">Note not found.</div>;

  return (
    <div className="relative h-full flex flex-col">
      <FloatingHeader 
        title={note.title} 
        onTitleChange={handleTitleChange} 
        breadcrumbs={breadcrumbs}
        onAction={handleAction}
      />
      <div className="max-w-4xl mx-auto p-8 h-full pt-20 w-full overflow-y-auto">
        <Editor 
          ref={editorRef}
          key={note.id} 
          content={note.content} 
          onChange={handleContentChange} 
        />
      </div>
    </div>
  );
}

const extractTitle = (contentJson: string) => {
  try {
    const json = JSON.parse(contentJson);
    // Find the first block that has text
    // Usually H1 is the title in Notion, but here we just take the first line
    const findText = (node: any): string => {
      if (node.text) return node.text;
      if (node.content) {
        return node.content.map(findText).join('');
      }
      return '';
    };

    if (json.content && json.content.length > 0) {
      const firstBlock = json.content[0];
      const text = findText(firstBlock);
      return text.slice(0, 50) || 'Untitled';
    }
    return 'Untitled';
  } catch {
    return 'Untitled';
  }
}
