import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  Home,
  Calendar,
  Target,
  BookOpen,
  Code2,
  Github,
  Settings,
  FileText,
  Search,
  Clock,
  TrendingUp,
  Layers,
  ChevronRight,
} from 'lucide-react';
import type { Activity, Milestone, Submission } from '../pos/lib/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Page = 'root' | 'navigation' | 'search' | 'recent' | 'shortcuts';

interface SearchResults {
  activities: Activity[];
  milestones: Milestone[];
  submissions: Submission[];
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState<Page>('root');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResults>({
    activities: [],
    milestones: [],
    submissions: [],
  });

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setPage('root');
      setSearch('');
      setSearchResults({ activities: [], milestones: [], submissions: [] });
    }
  }, [open]);

  // Async search
  useEffect(() => {
    if (search.length < 2) {
      setSearchResults({ activities: [], milestones: [], submissions: [] });
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true);
      try {
        const [activities, milestones, submissions] = await Promise.all([
          invoke<Activity[]>('search_activities', { query: search }).catch(() => []),
          invoke<Milestone[]>('search_milestones', { query: search }).catch(() => []),
          invoke<Submission[]>('search_submissions', { query: search }).catch(() => []),
        ]);
        setSearchResults({ activities, milestones, submissions });
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [search]);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
    onOpenChange(false);
  }, [navigate, onOpenChange]);

  const handleBack = useCallback(() => {
    if (page !== 'root') {
      setPage('root');
    }
  }, [page]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Backspace' && !search && page !== 'root')) {
          e.preventDefault();
          handleBack();
        }
      }}
    >
      <div style={{ backgroundColor: 'var(--glass-bg)' }}>
        <Command.Input
          placeholder={page === 'root' ? 'Type a command or search...' : 'Search...'}
          value={search}
          onValueChange={setSearch}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      <Command.List
        style={{
          maxHeight: '400px',
          overflow: 'auto',
          padding: '8px',
          backgroundColor: 'var(--glass-bg)',
        }}
      >
        <Command.Empty
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: '14px',
          }}
        >
          {loading ? 'Searching...' : 'No results found.'}
        </Command.Empty>

        {page === 'root' && (
          <>
            <Command.Group
              heading="Navigation"
              style={{
                padding: '8px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <CommandItem icon={<Home />} onSelect={() => handleNavigate('/pos')}>
                Home
              </CommandItem>
              <CommandItem icon={<Calendar />} onSelect={() => handleNavigate('/pos/daily')}>
                Daily View
              </CommandItem>
              <CommandItem icon={<Layers />} onSelect={() => handleNavigate('/pos/grid')}>
                Grid View
              </CommandItem>
              <CommandItem icon={<Target />} onSelect={() => handleNavigate('/pos/briefing')}>
                Daily Briefing
              </CommandItem>
              <CommandItem icon={<TrendingUp />} onSelect={() => handleNavigate('/pos/sheets')}>
                Sheets
              </CommandItem>
              <CommandItem icon={<Code2 />} onSelect={() => handleNavigate('/codeforces')}>
                Codeforces
              </CommandItem>
              <CommandItem icon={<Github />} onSelect={() => handleNavigate('/github')}>
                GitHub
              </CommandItem>
              <CommandItem icon={<BookOpen />} onSelect={() => handleNavigate('/pos/books')}>
                Books
              </CommandItem>
            </Command.Group>

            <Command.Separator style={{ height: '1px', backgroundColor: 'var(--glass-border)', margin: '8px 0' }} />

            <Command.Group heading="Actions">
              <CommandItem icon={<Search />} onSelect={() => setPage('search')} shortcut="⌘S">
                Search Everything
                <ChevronRight className="ml-auto" size={16} style={{ color: 'var(--text-tertiary)' }} />
              </CommandItem>
              <CommandItem icon={<Clock />} onSelect={() => setPage('recent')} shortcut="⌘R">
                Recent Items
                <ChevronRight className="ml-auto" size={16} style={{ color: 'var(--text-tertiary)' }} />
              </CommandItem>
              <CommandItem icon={<Settings />} onSelect={() => handleNavigate('/settings')}>
                Settings
              </CommandItem>
            </Command.Group>
          </>
        )}

        {page === 'search' && (
          <>
            {searchResults.activities.length > 0 && (
              <Command.Group heading="Activities">
                {searchResults.activities.slice(0, 5).map((activity) => (
                  <CommandItem
                    key={activity.id}
                    icon={<FileText size={16} />}
                    onSelect={() => handleNavigate(`/pos/daily?date=${activity.date}`)}
                  >
                    <div>
                      <div>{activity.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{activity.date}</div>
                    </div>
                  </CommandItem>
                ))}
              </Command.Group>
            )}

            {searchResults.milestones.length > 0 && (
              <Command.Group heading="Milestones">
                {searchResults.milestones.slice(0, 5).map((milestone) => (
                  <CommandItem
                    key={milestone.id}
                    icon={<Target size={16} />}
                    onSelect={() => handleNavigate('/pos/briefing')}
                  >
                    <div>
                      <div>{milestone.targetMetric}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        {milestone.currentValue}/{milestone.targetValue}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </Command.Group>
            )}

            {searchResults.submissions.length > 0 && (
              <Command.Group heading="Submissions">
                {searchResults.submissions.slice(0, 5).map((submission) => (
                  <CommandItem
                    key={submission.id}
                    icon={<Code2 size={16} />}
                    onSelect={() => handleNavigate('/codeforces')}
                  >
                    <div>
                      <div>{submission.problemTitle}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        {submission.platform} • {submission.verdict}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </Command.Group>
            )}
          </>
        )}

        {page === 'recent' && (
          <Command.Group heading="Recent">
            <CommandItem icon={<Clock size={16} />} onSelect={() => handleNavigate('/pos/daily')}>
              Today's Activities
            </CommandItem>
            <CommandItem icon={<Target size={16} />} onSelect={() => handleNavigate('/pos/briefing')}>
              Daily Briefing
            </CommandItem>
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

interface CommandItemProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
}

function CommandItem({ icon, children, onSelect, shortcut }: CommandItemProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        color: 'var(--text-primary)',
        transition: 'background-color 0.15s',
      }}
    >
      {icon && <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>{icon}</span>}
      <span style={{ flex: 1 }}>{children}</span>
      {shortcut && (
        <kbd
          style={{
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'monospace',
            backgroundColor: 'var(--surface-tertiary)',
            color: 'var(--text-tertiary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          {shortcut}
        </kbd>
      )}
    </Command.Item>
  );
}
