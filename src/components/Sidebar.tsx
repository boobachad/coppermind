import { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { FileText, Settings, Plus, Share2, Trash2, Grid3x3, Target, Box, FileSpreadsheet, BookOpen, Github, Search, Code, Users, Sparkles, List, Tag, CalendarRange, Brain, Sun } from 'lucide-react';
import { getDb } from '../lib/db';
import { softDelete } from '../lib/softDelete';
import { Note } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';
import clsx from 'clsx';
import { useConfirmDialog } from './ConfirmDialog';

export function Sidebar() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useConfirmDialog();

  useEffect(() => {
    loadNotes();
    window.addEventListener('notes-updated', loadNotes);
    return () => window.removeEventListener('notes-updated', loadNotes);
  }, []);

  const loadNotes = async () => {
    try {
      const db = await getDb();
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
        id, 'Untitled', initialContent, now, now
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

  const mainNavItems = [
    { to: "/", icon: FileText, label: "Notes" },
    { to: "/goals", icon: Target, label: "Goals" },
    { to: "/milestones", icon: CalendarRange, label: "Milestones" },
    { to: "/knowledge", icon: Brain, label: "Knowledge Base" },
    { to: "/briefing", icon: Sun, label: "Daily Briefing" },
    { to: "/nodes", icon: Share2, label: "Graph" },
    { to: "/pos", icon: Box, label: "POS" },
    { to: "/pos/grid", icon: Grid3x3, label: "Grid" },
    { to: "/pos/sheets", icon: FileSpreadsheet, label: "Sheets" },
    { to: "/pos/github", icon: Github, label: "GitHub" },
    { to: "/journal", icon: BookOpen, label: "Journal" },
  ];

  const cfNavItems = [
    { to: "/cf/ladders", icon: List, label: "Ladders" },
    { to: "/cf/categories", icon: Tag, label: "Categories" },
    { to: "/cf/friends", icon: Users, label: "CF Friends" },
    { to: "/cf/friends-ladder", icon: Code, label: "Friends Ladder" },
    { to: "/cf/daily", icon: Sparkles, label: "Daily Pick" },
  ];

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) => clsx(
        "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 group relative",
        isActive
          ? "shadow-[0_0_15px_rgba(255,255,255,0.1)] border"
          : "hover:bg-white/5 dark:hover:bg-white/5"
      )}
      style={({ isActive }) => ({
        backgroundColor: isActive ? 'var(--glass-bg-subtle)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderColor: isActive ? 'var(--glass-border)' : 'transparent'
      })}
    >
      <Icon className="mr-3 h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
      <span className="truncate">{label}</span>
      {/* Active Indicator Dot - Removed for cleaner look, relying on background */}
    </NavLink>
  );

  return (
    <div className="flex flex-col h-full w-full">
      {/* Scrollable Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-6">

        {/* Main Navigation */}
        <div className="space-y-1">
          <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Menu</div>
          {mainNavItems.map(item => <NavItem key={item.to} {...item} />)}
        </div>

        {/* Codeforces Section */}
        <div className="space-y-1">
          <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Codeforces</div>
          {cfNavItems.map(item => <NavItem key={item.to} {...item} />)}
        </div>

        {/* Notes Section */}
        <div className="space-y-3">
          <div className="px-3 flex items-center justify-between group">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Notes</span>
            <button
              onClick={createNote}
              className="p-1.5 rounded-md transition-all shadow-sm border"
              style={{
                backgroundColor: 'var(--glass-bg-subtle)',
                color: 'var(--text-secondary)',
                borderColor: 'var(--glass-border)'
              }}
              title="Create New Note"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative px-1">
            <Search className="absolute left-4 top-2.5 h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Filter notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border rounded-lg py-1.5 pl-9 pr-3 text-xs transition-colors outline-none"
              style={{
                backgroundColor: 'var(--glass-bg-subtle)',
                borderColor: 'var(--glass-border)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <div className="space-y-1 mt-1">
            {filteredNotes.map(note => (
              <div key={note.id} className="group/note relative flex items-center pr-2">
                <NavLink
                  to={`/notes/${note.id}`}
                  className={() => clsx(
                    "flex-1 flex items-center px-3 py-2.5 text-sm rounded-lg transition-all duration-200 truncate border",
                  )}
                  style={({ isActive }) => ({
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: isActive ? 'var(--glass-bg-subtle)' : 'transparent',
                    borderColor: isActive ? 'var(--glass-border)' : 'transparent',
                    fontWeight: isActive ? 500 : 400
                  })}
                >
                  <FileText className={clsx(
                    "mr-3 h-4 w-4 shrink-0 transition-opacity",
                    location.pathname.includes(note.id) ? "opacity-100" : "opacity-50"
                  )} style={{ color: 'currentColor' }} />
                  <span className="truncate">{note.title || 'Untitled'}</span>
                </NavLink>

                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    if (await confirm({ title: 'Delete Note?', description: 'This action cannot be undone.', confirmText: 'Delete', variant: 'destructive' })) {
                      await softDelete('notes', note.id);
                      window.dispatchEvent(new Event('notes-updated'));
                      if (window.location.pathname.includes(note.id)) navigate('/');
                    }
                  }}
                  className="absolute right-2 opacity-0 group-hover/note:opacity-100 p-1.5 hover:text-red-400 transition-opacity rounded-md backdrop-blur-sm"
                  style={{
                    color: 'var(--text-tertiary)',
                    backgroundColor: 'var(--glass-bg-subtle)'
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {filteredNotes.length === 0 && (
              <div className="px-3 py-2 text-xs italic" style={{ color: 'var(--text-tertiary)' }}>
                {searchQuery ? 'No matches' : 'Empty'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Settings */}
      <div className="p-3 border-t backdrop-blur-xl" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg-subtle)' }}>
        <NavLink
          to="/settings"
          className={() => clsx(
            "flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200"
          )}
          style={({ isActive }) => ({
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            backgroundColor: isActive ? 'var(--glass-bg-subtle)' : 'transparent'
          })}
        >
          <Settings className="mr-3 h-4 w-4" />
          Settings
        </NavLink>
      </div>
    </div>
  );
}
