import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FileText, CheckSquare, Settings, Plus, Share2, Trash2, Grid3x3, Target, Box, FileSpreadsheet, BookOpen } from 'lucide-react';
import { getDb } from '../lib/db';
import { Note } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { useConfirmDialog } from './ConfirmDialog';

export function Sidebar() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { confirm } = useConfirmDialog();

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
    <div className="w-64 bg-themed-surface h-full flex flex-col flex-shrink-0 border-r border-themed-border">
      <div className="p-3 border-b border-themed-border space-y-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <FileText className="mr-3 h-4 w-4" />
          Home
        </NavLink>
        <NavLink
          to="/todos"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <CheckSquare className="mr-3 h-4 w-4" />
          To-Dos
        </NavLink>
        <NavLink
          to="/nodes"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <Share2 className="mr-3 h-4 w-4" />
          Graph
        </NavLink>
        <NavLink
          to="/pos"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <Box className="mr-3 h-4 w-4" />
          POS
        </NavLink>
        <NavLink
          to="/pos/grid"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <Grid3x3 className="mr-3 h-4 w-4" />
          POS Grid
        </NavLink>
        <NavLink
          to="/pos/goals"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <Target className="mr-3 h-4 w-4" />
          POS Goals
        </NavLink>
        <NavLink
          to="/pos/sheets"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <FileSpreadsheet className="mr-3 h-4 w-4" />
          POS Sheets
        </NavLink>
        <NavLink
          to="/journal"
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <BookOpen className="mr-3 h-4 w-4" />
          Journal
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
            className="w-full bg-themed-bg border-none rounded-lg py-2 pl-9 pr-4 text-sm text-themed-text-primary placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:bg-themed-bg transition-colors"
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
          <span className="text-xs font-semibold text-themed-text-secondary uppercase tracking-wider">Notes</span>
          <button
            onClick={createNote}
            className="text-gray-400 hover:text-themed-text-primary transition-colors"
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
                    ? "bg-themed-bg text-themed-text-primary font-medium"
                    : "text-themed-text-secondary hover:bg-themed-bg/50"
                )}
              >
                {note.title || 'Untitled'}
              </NavLink>

              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const confirmed = await confirm({
                    title: 'Delete Note',
                    description: 'Are you sure you want to delete this note? This action cannot be undone.',
                    confirmText: 'Delete',
                    variant: 'destructive'
                  });
                  if (confirmed) {
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
                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 rounded hover:bg-themed-bg transition-all"
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
          className={({ isActive }) => clsx("flex items-center px-3 py-2 text-sm font-medium rounded-md", isActive ? "bg-themed-bg text-themed-text-primary" : "text-themed-text-secondary hover:bg-themed-bg/50")}
        >
          <Settings className="mr-3 h-4 w-4" />
          Settings
        </NavLink>
      </div>

    </div>
  );
}
