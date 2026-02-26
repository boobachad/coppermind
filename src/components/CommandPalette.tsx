import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  Home,
  Calendar,
  Target,
  Code2,
  Settings,
  FileText,
  ChevronRight,
  Plus,
  TrendingUp,
  Layers,
  Moon,
  Sun,
  Monitor,
  Lightbulb,
  BookMarked,
  RefreshCw,
  Github,
  Users,
} from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Page = 'root' | 'create' | 'theme' | 'sync' | 'sync-friends';

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState<Page>('root');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) {
      setPage('root');
      setSearch('');
    }
  }, [open]);

  useEffect(() => {
    // Clear search when navigating to subpages
    if (page !== 'root') {
      setSearch('');
    }
  }, [page]);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
    onOpenChange(false);
  }, [navigate, onOpenChange]);

  const handleBack = useCallback(() => {
    if (page === 'sync-friends') {
      setPage('sync');
    } else if (page !== 'root') {
      setPage('root');
    }
  }, [page]);

  const handleSyncLeetCode = useCallback(async () => {
    try {
      const toastId = toast.loading('Syncing LeetCode data...');
      const result = await invoke('scrape_leetcode');
      toast.dismiss(toastId);
      toast.success('LeetCode sync complete', { description: `Imported ${(result as any).newSubmissions} new submissions` });
      onOpenChange(false);
    } catch (err) {
      toast.dismiss();
      toast.error('LeetCode sync failed', { description: String(err) });
    }
  }, [onOpenChange]);

  const handleSyncCodeforces = useCallback(async () => {
    try {
      const toastId = toast.loading('Syncing Codeforces data...');
      const result = await invoke('scrape_codeforces');
      toast.dismiss(toastId);
      toast.success('Codeforces sync complete', { description: `Imported ${(result as any).newSubmissions} new submissions` });
      onOpenChange(false);
    } catch (err) {
      toast.dismiss();
      toast.error('Codeforces sync failed', { description: String(err) });
    }
  }, [onOpenChange]);

  const handleSyncGitHub = useCallback(async () => {
    try {
      const toastId = toast.loading('Syncing GitHub data...');
      const result = await invoke('scrape_github');
      toast.dismiss(toastId);
      toast.success('GitHub sync complete', { description: `Updated ${(result as any).newSubmissions} repositories` });
      onOpenChange(false);
    } catch (err) {
      toast.dismiss();
      toast.error('GitHub sync failed', { description: String(err) });
    }
  }, [onOpenChange]);

  const handleSyncFriend = useCallback(async (friendId: string, displayName: string) => {
    try {
      const toastId = toast.loading(`Syncing ${displayName}...`);
      const count = await invoke<number>('sync_cf_friend_submissions', { friendId });
      toast.dismiss(toastId);
      toast.success(`${displayName} sync complete`, { description: `Imported ${count} new submissions` });
      onOpenChange(false);
    } catch (err) {
      toast.dismiss();
      toast.error(`Failed to sync ${displayName}`, { description: String(err) });
    }
  }, [onOpenChange]);

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
          No results found.
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
              <CommandItem icon={<Home />} onSelect={() => handleNavigate('/')}>
                Notes
              </CommandItem>
              <CommandItem icon={<Home />} onSelect={() => handleNavigate('/pos')}>
                POS Home
              </CommandItem>
              <CommandItem icon={<Layers />} onSelect={() => handleNavigate('/pos/grid')}>
                Activity Grid
              </CommandItem>
              <CommandItem icon={<Target />} onSelect={() => handleNavigate('/briefing')}>
                Daily Briefing
              </CommandItem>
              <CommandItem icon={<Target />} onSelect={() => handleNavigate('/goals')}>
                Goals
              </CommandItem>
              <CommandItem icon={<BookMarked />} onSelect={() => handleNavigate('/milestones')}>
                Milestones
              </CommandItem>
              <CommandItem icon={<Lightbulb />} onSelect={() => handleNavigate('/knowledge')}>
                Knowledge Base
              </CommandItem>
              <CommandItem icon={<TrendingUp />} onSelect={() => handleNavigate('/pos/sheets')}>
                Sheets
              </CommandItem>
              <CommandItem icon={<Code2 />} onSelect={() => handleNavigate('/cf/ladders')}>
                Codeforces Ladders
              </CommandItem>
              <CommandItem icon={<Code2 />} onSelect={() => handleNavigate('/cf/categories')}>
                Codeforces Categories
              </CommandItem>
              <CommandItem icon={<Calendar />} onSelect={() => handleNavigate('/journal')}>
                Journal
              </CommandItem>
            </Command.Group>

            <Command.Separator style={{ height: '1px', backgroundColor: 'var(--glass-border)', margin: '8px 0' }} />

            <Command.Group heading="Quick Actions">
              <CommandItem icon={<Plus />} onSelect={() => setPage('create')}>
                Create New...
                <ChevronRight style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }} size={16} />
              </CommandItem>
              <CommandItem icon={<RefreshCw />} onSelect={() => setPage('sync')}>
                Sync Data
                <ChevronRight style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }} size={16} />
              </CommandItem>
              <CommandItem icon={<Monitor />} onSelect={() => setPage('theme')}>
                Change Theme
                <ChevronRight style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }} size={16} />
              </CommandItem>
            </Command.Group>

            <Command.Separator style={{ height: '1px', backgroundColor: 'var(--glass-border)', margin: '8px 0' }} />

            <Command.Group heading="System">
              <CommandItem icon={<Settings />} onSelect={() => handleNavigate('/settings')}>
                Settings
              </CommandItem>
            </Command.Group>
          </>
        )}

        {page === 'create' && (
          <>
            <Command.Group heading="Create New">
              <CommandItem icon={<FileText />} onSelect={() => handleNavigate('/notes/new')}>
                New Note
              </CommandItem>
              <CommandItem icon={<Target />} onSelect={() => handleNavigate('/goals?create=true')}>
                New Goal
              </CommandItem>
              <CommandItem icon={<BookMarked />} onSelect={() => handleNavigate('/milestones?create=true')}>
                New Milestone
              </CommandItem>
              <CommandItem icon={<Lightbulb />} onSelect={() => handleNavigate('/knowledge?create=true')}>
                New Knowledge Item
              </CommandItem>
              <CommandItem icon={<Calendar />} onSelect={() => {
                const today = new Date().toISOString().split('T')[0];
                handleNavigate(`/journal/${today}`);
              }}>
                New Journal Entry
              </CommandItem>
            </Command.Group>
          </>
        )}

        {page === 'theme' && (
          <>
            <Command.Group heading="Theme">
              <CommandItem icon={<Sun />} onSelect={() => { 
                localStorage.setItem('app_theme', 'solarized-light');
                document.documentElement.setAttribute('data-theme', 'solarized-light'); 
                onOpenChange(false); 
              }}>
                Solarized Light
              </CommandItem>
              <CommandItem icon={<Monitor />} onSelect={() => { 
                localStorage.setItem('app_theme', 'blue-light');
                document.documentElement.setAttribute('data-theme', 'blue-light'); 
                onOpenChange(false); 
              }}>
                Blue Light
              </CommandItem>
              <CommandItem icon={<Moon />} onSelect={() => { 
                localStorage.setItem('app_theme', 'dark');
                document.documentElement.setAttribute('data-theme', 'dark'); 
                onOpenChange(false); 
              }}>
                Dark
              </CommandItem>
            </Command.Group>
          </>
        )}

        {page === 'sync' && (
          <>
            <Command.Group heading="Sync Data">
              <CommandItem icon={<Code2 />} onSelect={handleSyncLeetCode}>
                Sync LeetCode
              </CommandItem>
              <CommandItem icon={<Code2 />} onSelect={handleSyncCodeforces}>
                Sync Codeforces
              </CommandItem>
              <CommandItem icon={<Github />} onSelect={handleSyncGitHub}>
                Sync GitHub
              </CommandItem>
              <CommandItem icon={<Users />} onSelect={() => setPage('sync-friends')}>
                Sync Codeforces Friends
                <ChevronRight style={{ marginLeft: 'auto', color: 'var(--text-tertiary)' }} size={16} />
              </CommandItem>
            </Command.Group>
          </>
        )}

        {page === 'sync-friends' && <SyncFriendsPage onSyncFriend={handleSyncFriend} />}
      </Command.List>
    </Command.Dialog>
  );
}

interface SyncFriendsPageProps {
  onSyncFriend: (friendId: string, displayName: string) => void;
}

function SyncFriendsPage({ onSyncFriend }: SyncFriendsPageProps) {
  const [friends, setFriends] = useState<Array<{ id: string; displayName: string; cfHandle: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFriends = async () => {
      try {
        const result = await invoke<Array<{ id: string; displayName: string; cfHandle: string }>>('get_cf_friends');
        setFriends(result);
      } catch (err) {
        toast.error('Failed to load friends', { description: String(err) });
      } finally {
        setLoading(false);
      }
    };
    loadFriends();
  }, []);

  if (loading) {
    return (
      <Command.Group heading="Codeforces Friends">
        <Command.Item disabled>
          <span style={{ color: 'var(--text-tertiary)' }}>Loading friends...</span>
        </Command.Item>
      </Command.Group>
    );
  }

  if (friends.length === 0) {
    return (
      <Command.Group heading="Codeforces Friends">
        <Command.Item disabled>
          <span style={{ color: 'var(--text-tertiary)' }}>No friends added yet</span>
        </Command.Item>
      </Command.Group>
    );
  }

  return (
    <Command.Group heading="Sync Codeforces Friend">
      {friends.map(friend => (
        <CommandItem
          key={friend.id}
          icon={<Users />}
          onSelect={() => onSyncFriend(friend.id, friend.displayName)}
        >
          {friend.displayName} ({friend.cfHandle})
        </CommandItem>
      ))}
    </Command.Group>
  );
}

interface CommandItemProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
}

function CommandItem({ icon, children, onSelect }: CommandItemProps) {
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
    </Command.Item>
  );
}
