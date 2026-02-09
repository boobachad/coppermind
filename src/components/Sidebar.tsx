import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FileText, CheckSquare, Settings, Plus, Share2, Trash2 } from 'lucide-react';
import { getDb } from '../lib/db';
import { Note } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';

export function Sidebar() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
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
      const initialContent = JSON.stringify([]);
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

  const filteredNotes = notes.filter(note =>
    (note.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-64 bg-gray-50 dark:bg-dark-bgSecondary h-full flex flex-col flex-shrink-0 border-r border-gray-200 dark:border-dark-border">
      <div className="p-3 border-b border-gray-200 dark:border-dark-border space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-gray-200 dark:bg-dark-surface text-gray-900 dark:text-dark-text-primary" : "text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-surface")}
        >
          <FileText className="mr-3 h-4 w-4" />
          Home
        </NavLink>
        <NavLink
          to="/todos"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-gray-200 dark:bg-dark-surface text-gray-900 dark:text-dark-text-primary" : "text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-surface")}
        >
          <CheckSquare className="mr-3 h-4 w-4" />
          To-Dos
        </NavLink>
        <NavLink
          to="/nodes"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-gray-200 dark:bg-dark-surface text-gray-900 dark:text-dark-text-primary" : "text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-surface")}
        >
          <Share2 className="mr-3 h-4 w-4" />
          Graph
        </NavLink>
      </div>

      <div className="p-4 flex-1 overflow-hidden flex flex-col">
        {/* Search Bar */}
        <div className="mb-6 relative">
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-200/50 dark:bg-dark-surface/50 border-none rounded-lg py-2 pl-9 pr-4 text-sm text-gray-900 dark:text-dark-text-primary placeholder-gray-500 focus:ring-0 focus:bg-gray-200 dark:focus:bg-dark-surface transition-colors"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">Notes</span>
          <button
            onClick={createNote}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-dark-text-primary transition-colors"
            title="Create New Note"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-0.5">
          {filteredNotes.map(note => (
            <div key={note.id} className="group relative flex items-center">
              <NavLink
                to={`/notes/${note.id}`}
                className={({ isActive }) => clsx(
                  "flex-1 block px-3 py-2 text-sm rounded-md truncate pr-8 transition-colors",
                  isActive
                    ? "bg-gray-200 dark:bg-dark-surface text-gray-900 dark:text-dark-text-primary font-medium"
                    : "text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-surface/50"
                )}
              >
                {note.title || 'Untitled'}
              </NavLink>

              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm('Are you sure you want to delete this note?')) {
                    try {
                      const db = await getDb();
                      await db.execute('DELETE FROM notes WHERE id = $1', [note.id]);
                      window.dispatchEvent(new Event('notes-updated'));
                      if (window.location.pathname.includes(note.id)) {
                        navigate('/');
                      }
                    } catch (err) {
                      console.error("Failed to delete note", err);
                    }
                  }
                }}
                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-200 dark:hover:bg-dark-bg transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {filteredNotes.length === 0 && (
            <div className="px-3 py-4 text-sm text-gray-400 text-center italic">
              {searchQuery ? 'No notes found' : 'No notes yet'}
            </div>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="p-3 border-t border-gray-200 dark:border-dark-border">
        <NavLink
          to="/settings"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-gray-200 dark:bg-dark-surface text-gray-900 dark:text-dark-text-primary" : "text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-surface")}
        >
          <Settings className="mr-3 h-4 w-4" />
          Settings
        </NavLink>
      </div>

    </div>
  );
}
