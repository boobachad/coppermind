import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FileText, CheckSquare, Settings, Plus, Share2 } from 'lucide-react';
import { getDb } from '../lib/db';
import { Note } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

export function Sidebar() {
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
      // Filter for top-level notes only
      const result = await db.select<Note[]>('SELECT * FROM notes WHERE parent_id IS NULL ORDER BY updated_at DESC');
      setNotes(result);
    } catch (err) {
      console.error("Failed to load notes", err);
    }
  };

  const createNote = async () => {
    try {
      const id = uuidv4();
      const db = await getDb();
      const now = Date.now();
      const initialContent = JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 }
          }
        ]
      });
      await db.execute('INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)', [
        id,
        'Untitled',
        initialContent,
        now,
        now
      ]);
      window.dispatchEvent(new Event('notes-updated'));
      navigate(`/notes/${id}`);
    } catch (err) {
      console.error("Failed to create note", err);
    }
  };

  return (
    <div className="w-64 bg-gray-50 h-screen flex flex-col flex-shrink-0">
      <div className="p-4 flex-1 overflow-hidden flex flex-col">
        <h1 className="text-lg font-semibold text-gray-700 mb-4 px-2">NoteDown</h1>
        <nav className="space-y-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100")}
          >
            <FileText className="mr-3 h-5 w-5" />
            All Notes
          </NavLink>
          <NavLink
            to="/todos"
            className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100")}
          >
            <CheckSquare className="mr-3 h-5 w-5" />
            To-Dos
          </NavLink>
          <NavLink
            to="/nodes"
            className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100")}
          >
            <Share2 className="mr-3 h-5 w-5" />
            Nodes & Graphs
          </NavLink>
        </nav>

        <div className="mt-6 flex items-center justify-between px-2 mb-2">
          <span className="text-xs font-semibold text-gray-500 uppercase">Recent Notes</span>
          <button onClick={createNote} className="text-gray-500 hover:text-gray-900 p-1 rounded hover:bg-gray-200">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {notes.map(note => (
            <NavLink
              key={note.id}
              to={`/notes/${note.id}`}
              className={({ isActive }) => clsx("block px-3 py-2 text-sm rounded-md truncate", isActive ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100")}
            >
              {note.title || 'Untitled'}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <NavLink
          to="/settings"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100")}
        >
          <Settings className="mr-3 h-5 w-5" />
          Settings
        </NavLink>
      </div>
    </div>
  );
}
