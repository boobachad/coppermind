// ─── Entity Cache Hook ──────────────────────────────────────────────
// React hook for managing client-side entity cache with automatic initialization
// and incremental updates. Provides O(1) entity lookup and fuzzy search.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { 
  EntityCacheStore, 
  CachedEntity, 
  EntityReference,
  EntityType 
} from '../core/types';
import { 
  createEmptyCache, 
  initializeCache, 
  updateCache, 
  removeFromCache 
} from '../core/cache';

/**
 * Cache sync status states.
 */
export type CacheSyncStatus = 
  | 'idle'       // Not started
  | 'loading'    // Fetching entities from backend
  | 'ready'      // Cache loaded and ready
  | 'error';     // Failed to load cache

/**
 * Entity cache hook return type.
 */
export interface UseEntityCacheReturn {
  cache: EntityCacheStore;
  status: CacheSyncStatus;
  error: string | null;
  refreshCache: () => Promise<void>;
  addEntity: (entity: EntityReference) => void;
  deleteEntity: (entityType: EntityType, entityId: string) => void;
}

/**
 * React hook for managing entity cache.
 * 
 * Initializes cache on mount by fetching all entities from backend.
 * Provides methods for incremental cache updates when entities change.
 * 
 * @returns Cache store, sync status, and update methods
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { cache, status, addEntity } = useEntityCache();
 *   
 *   if (status === 'loading') return <div>Loading...</div>;
 *   if (status === 'error') return <div>Failed to load cache</div>;
 *   
 *   // Use cache for validation and autocomplete
 *   const results = fuzzySearch('my-note', 'note', cache);
 * }
 * ```
 */
export function useEntityCache(): UseEntityCacheReturn {
  const [cache, setCache] = useState<EntityCacheStore>(createEmptyCache());
  const [status, setStatus] = useState<CacheSyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches all entities from backend and initializes cache.
   * 
   * Complexity: O(n * t) where n = entities, t = avg trigrams
   * Performance target: <2s for 10,000 entities
   */
  const loadCache = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const entities = await invoke<CachedEntity[]>('get_all_entities_for_cache');
      
      const initializedCache = initializeCache(entities);
      setCache(initializedCache);
      setStatus('ready');
      
      console.log(`Entity cache initialized: ${entities.length} entities`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setStatus('error');
      console.error('Failed to initialize entity cache:', err);
      
      // Fallback to empty cache to allow app to continue
      setCache(createEmptyCache());
    }
  }, []);

  /**
   * Refreshes cache by re-fetching all entities.
   * 
   * Use when cache may be stale or after bulk operations.
   */
  const refreshCache = useCallback(async () => {
    await loadCache();
  }, [loadCache]);

  /**
   * Adds or updates entity in cache incrementally.
   * 
   * Use when entity is created or updated to avoid full cache refresh.
   * 
   * @param entity - Entity reference to add/update
   * 
   * Complexity: O(t) where t = trigrams for this entity
   */
  const addEntity = useCallback((entity: EntityReference) => {
    setCache(prev => {
      const updated = { ...prev };
      updateCache(updated, entity);
      return updated;
    });
  }, []);

  /**
   * Removes entity from cache incrementally.
   * 
   * Use when entity is deleted to avoid full cache refresh.
   * 
   * @param entityType - Type of entity to remove
   * @param entityId - ID of entity to remove
   * 
   * Complexity: O(t) where t = trigrams for this entity
   */
  const deleteEntity = useCallback((entityType: EntityType, entityId: string) => {
    setCache(prev => {
      const updated = { ...prev };
      removeFromCache(updated, entityType, entityId);
      return updated;
    });
  }, []);

  // Initialize cache on mount
  useEffect(() => {
    loadCache();
  }, [loadCache]);

  return {
    cache,
    status,
    error,
    refreshCache,
    addEntity,
    deleteEntity,
  };
}
