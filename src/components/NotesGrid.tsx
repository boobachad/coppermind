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

export function NotesGrid({ parentId = null, embedded = false }: { parentId?: string | null, embedded?: boolean }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotes();
    window.addEventListener('notes-updated', loadNotes);
    return () => window.removeEventListener('notes-updated', loadNotes);
  }, [parentId]);

  const loadNotes = async () => {
    try {
      const db = await getDb();
      // Fetch all notes to calculate counts locally for now (efficient enough for local app)
      const allNotes = await db.select<Note[]>('SELECT * FROM notes');
      const filteredNotes = allNotes
        .filter(n => parentId ? n.parent_id === parentId : !n.parent_id)
        .sort((a, b) => b.updated_at - a.updated_at);
        
      const notesWithCounts = filteredNotes.map(note => ({
        ...note,
        nestedCount: allNotes.filter(n => n.parent_id === note.id).length
      }));
      
      setNotes(notesWithCounts);
    } catch (err) {
      console.error("Failed to load notes", err);
    }
  };

  return (
    <div className={embedded ? "w-full" : "h-full p-8 bg-gray-50 overflow-y-auto"}>
      <div className={embedded ? "w-full" : "max-w-6xl mx-auto"}>
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <p className="text-sm font-medium mb-1">No nested notes</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {(notes as any[]).map((note) => (
              <div
                key={note.id}
                onClick={() => navigate(`/notes/${note.id}`)}
                className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-gray-100 flex flex-col h-48 group relative"
              >
                {note.nestedCount > 0 && (
                  <div 
                    className="absolute top-3 right-3 bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full"
                    title={`${note.nestedCount} nested notes inside`}
                  >
                    {note.nestedCount}
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-800 mb-2 truncate group-hover:text-blue-600 transition-colors pr-8">
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
