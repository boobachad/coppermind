import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDb } from '../lib/db';
import { Note } from '../lib/types';
import { formatDistanceToNow } from 'date-fns';

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

export function NotesGrid() {
  const [notes, setNotes] = useState<Note[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotes();
    window.addEventListener('notes-updated', loadNotes);
    return () => window.removeEventListener('notes-updated', loadNotes);
  }, []);

  const loadNotes = async () => {
    try {
      const db = await getDb();
      const result = await db.select<Note[]>('SELECT * FROM notes ORDER BY updated_at DESC');
      setNotes(result);
    } catch (err) {
      console.error("Failed to load notes", err);
    }
  };

  return (
    <div className="h-full p-8 bg-gray-50 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <p className="text-xl font-medium mb-2">No notes yet</p>
            <p>Create a new note to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {notes.map((note) => (
              <div
                key={note.id}
                onClick={() => navigate(`/notes/${note.id}`)}
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100 flex flex-col h-48 group"
              >
                <h3 className="text-lg font-semibold text-gray-800 mb-2 truncate group-hover:text-blue-600 transition-colors">
                  {note.title || 'Untitled'}
                </h3>
                <p className="text-sm text-gray-500 mb-4 flex-1 overflow-hidden relative">
                  <span className="line-clamp-4">
                    {getPreviewText(note.content) || <span className="italic text-gray-400">No content</span>}
                  </span>
                </p>
                <div className="text-xs text-gray-400 mt-auto pt-4 border-t border-gray-50">
                  {formatDistanceToNow(note.updated_at, { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
