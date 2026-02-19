import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, RefreshCw, Trash2, Users, AlertCircle } from 'lucide-react';
import type { CFFriend } from '../../pos/lib/types';
import { formatDateDDMMYYYY } from '../../pos/lib/time';

export function FriendsManager() {
  const [friends, setFriends] = useState<CFFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHandle, setNewHandle] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      setLoading(true);
      const data = await invoke<CFFriend[]>('get_cf_friends');
      setFriends(data);
    } catch (err) {
      setError('Failed to load friends');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHandle.trim()) {
      setError('Handle is required');
      return;
    }

    try {
      setError(null);
      await invoke('add_cf_friend', {
        request: {
          cfHandle: newHandle.trim(),
          displayName: newDisplayName.trim() || newHandle.trim(),
        },
      });
      setNewHandle('');
      setNewDisplayName('');
      setShowAddForm(false);
      await loadFriends();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleSync = async (friendId: string) => {
    try {
      setSyncing(friendId);
      setError(null);
      const count = await invoke<number>('sync_cf_friend_submissions', {
        friendId,
      });
      console.log(`Synced ${count} submissions`);
      await loadFriends();
    } catch (err) {
      setError('Failed to sync submissions');
      console.error(err);
    } finally {
      setSyncing(null);
    }
  };

  const handleDelete = async (friendId: string, displayName: string) => {
    if (!confirm(`Remove ${displayName}?`)) return;

    try {
      setError(null);
      await invoke('delete_cf_friend', { friendId });
      await loadFriends();
    } catch (err) {
      setError('Failed to delete friend');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading friends...</p>
        </div>
      </div>
    );
  }

  return (
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

      {/* Error Message */}
      {error && (
        <div
          className="p-4 rounded-lg mb-4 flex items-center gap-3"
          style={{
            backgroundColor: 'var(--color-error)',
            color: 'white',
            opacity: 0.9,
          }}
        >
          <AlertCircle size={20} />
          {error}
        </div>
      )}

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
          <form onSubmit={handleAddFriend} className="space-y-4">
            <div>
              <label className="block mb-2" style={{ color: 'var(--text-primary)' }}>
                Codeforces Handle *
              </label>
              <input
                type="text"
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                placeholder="e.g., tourist"
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--surface-secondary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label className="block mb-2" style={{ color: 'var(--text-primary)' }}>
                Display Name (optional)
              </label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Friendly name"
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--surface-secondary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewHandle('');
                  setNewDisplayName('');
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
          </form>
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
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                    {friend.displayName}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    @{friend.cfHandle}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(friend.id, friend.displayName ?? friend.cfHandle)}
                  className="p-2 rounded-lg hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    color: 'var(--color-error)',
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--text-secondary)' }}>Submissions:</span>
                  <span style={{ color: 'var(--text-primary)' }}>
                    {friend.submissionCount || 0}
                  </span>
                </div>
                {friend.lastSynced && (
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Last synced:</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                      {formatDateDDMMYYYY(new Date(friend.lastSynced))}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleSync(friend.id)}
                disabled={syncing === friend.id}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-text)',
                }}
              >
                <RefreshCw size={16} className={syncing === friend.id ? 'animate-spin' : ''} />
                {syncing === friend.id ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
