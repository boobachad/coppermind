import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, RefreshCw, Trash2, Users, Trophy, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Loader } from '@/components/Loader';
import { useConfirmDialog } from '@/components/ConfirmDialog';
import type { CFFriend } from '../../pos/lib/types';
import { formatDateDDMMYYYY } from '../../pos/lib/time';
import { getRatingColor, isLegendaryGrandmaster } from './utils';

export function FriendsManager() {
  const [friends, setFriends] = useState<CFFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { confirm } = useConfirmDialog();

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      setLoading(true);
      const data = await invoke<CFFriend[]>('get_cf_friends');
      setFriends(data);
    } catch (err) {
      toast.error('Failed to load friends', { description: String(err) });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newHandle.trim()) {
      toast.error('Handle is required');
      return;
    }

    try {
      setIsAdding(true);
      const newFriend = await invoke<CFFriend>('add_cf_friend', {
        request: {
          cfHandle: newHandle.trim(),
          displayName: null, // Backend will use handle
        },
      });

      // Auto-sync data for the new friend
      await invoke('sync_cf_friend_submissions', { friendId: newFriend.id });

      setNewHandle('');
      setShowAddForm(false);
      toast.success('Friend added successfully');
      await loadFriends();
    } catch (err) {
      toast.error('Failed to add friend', { description: String(err) });
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddFriend();
    }
  };

  const handleSync = async (friendId: string) => {
    try {
      setSyncing(friendId);
      const count = await invoke<number>('sync_cf_friend_submissions', {
        friendId,
      });
      toast.success('Sync complete', { description: `Synced ${count} submissions` });
      await loadFriends();
    } catch (err) {
      toast.error('Failed to sync submissions', { description: String(err) });
      console.error(err);
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async (friendId: string, handle: string) => {
    const confirmed = await confirm({
      title: 'Remove Friend',
      description: `Are you sure you want to remove ${handle}? This will delete all their submission data.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await invoke('delete_cf_friend', { friendId });
      toast.success('Friend removed');
      await loadFriends();
    } catch (err) {
      toast.error('Failed to delete friend', { description: String(err) });
      console.error(err);
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <Loader />
          <p className="mt-4" style={{ color: 'var(--text-secondary)' }}>Loading friends...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users size={28} style={{ color: 'var(--color-accent-primary)' }} />
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Codeforces Friends
            </h1>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:scale-105"
            style={{
              backgroundColor: 'var(--btn-primary-bg)',
              color: 'var(--btn-primary-text)',
            }}
          >
            <Plus size={20} />
            Add Friend
          </button>
        </div>

        {/* Add Friend Form */}
        {showAddForm && (
          <div
            className="p-6 rounded-lg mb-6"
            style={{
              backgroundColor: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div className="space-y-4">
              <div>
                <label className="block mb-2" style={{ color: 'var(--text-primary)' }}>
                  Codeforces Handle *
                </label>
                <input
                  type="text"
                  value={newHandle}
                  onChange={(e) => setNewHandle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., tourist"
                  className="w-full px-4 py-2 rounded-lg"
                  autoFocus
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleAddFriend()}
                  disabled={isAdding}
                  className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                  }}
                >
                  {isAdding && <RefreshCw size={16} className="animate-spin" />}
                  {isAdding ? 'Adding...' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewHandle('');
                  }}
                  className="px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Friends List */}
        {friends.length === 0 ? (
          <div className="text-center p-12">
            <Users size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
            <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              No Friends Added
            </h3>
            <p style={{ color: 'var(--text-secondary)' }} className="mb-4">
              Add Codeforces friends to track their solved problems
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-3 rounded-lg"
              style={{
                backgroundColor: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
              }}
            >
              Add Your First Friend
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="p-4 rounded-lg transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    {isLegendaryGrandmaster(friend.currentRating) ? (
                      <h3 className="font-bold text-xl">
                        <span style={{ color: '#000000' }}>{friend.cfHandle[0]}</span>
                        <span style={{ color: '#ff0000' }}>{friend.cfHandle.slice(1)}</span>
                      </h3>
                    ) : (
                      <h3 className="font-bold text-xl" style={{ color: getRatingColor(friend.currentRating) }}>
                        {friend.cfHandle}
                      </h3>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                        <Trophy size={10} />
                        Max: {friend.maxRating || 'N/A'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(friend.id, friend.cfHandle)}
                    className="p-2 rounded-lg hover:scale-110 transition-transform opacity-60 hover:opacity-100"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--color-error)',
                    }}
                    title="Remove friend"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex justify-between items-center text-sm p-2 rounded-lg" style={{ backgroundColor: 'var(--surface-secondary)' }}>
                    <div className="flex items-center gap-2">
                      <TrendingUp size={14} style={{ color: getRatingColor(friend.currentRating) }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Current Rating</span>
                    </div>
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                      {friend.currentRating || 'Unrated'}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm px-2">
                    <span style={{ color: 'var(--text-secondary)' }}>Submissions (AC / Total)</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                      {friend.submissionCount || 0} <span style={{ color: 'var(--text-tertiary)' }}>/ {friend.totalSubmissions || 0}</span>
                    </span>
                  </div>

                  {friend.lastSynced && (
                    <div className="flex justify-between text-sm px-2">
                      <span style={{ color: 'var(--text-secondary)' }}>Last synced</span>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                        {formatDateDDMMYYYY(new Date(friend.lastSynced))}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleSync(friend.id)}
                  disabled={syncing === friend.id}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all disabled:opacity-50 hover:scale-[1.02]"
                  style={{
                    backgroundColor: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-text)',
                  }}
                >
                  <RefreshCw size={14} className={syncing === friend.id ? 'animate-spin' : ''} />
                  {syncing === friend.id ? 'Syncing...' : 'Sync Data'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
