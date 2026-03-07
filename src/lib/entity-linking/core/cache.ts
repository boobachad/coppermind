// ─── Entity Cache ───────────────────────────────────────────────────
// Client-side O(1) entity lookup with trigram-based fuzzy search.
// Performance: Lookup O(1), Fuzzy search O(t*m), target <50ms for 10k entities.

import type { 
  EntityType, 
  CachedEntity, 
  EntityCacheStore, 
  AutocompleteResult,
  EntityReference 
} from './types';

/**
 * Generates trigrams from text for fuzzy search indexing.
 * 
 * Trigrams are 3-character substrings used for approximate string matching.
 * Example: "hello" → ["hel", "ell", "llo"]
 * 
 * @param text - Text to generate trigrams from
 * @returns Array of trigram strings
 * 
 * Complexity: O(n) where n = text length
 */
export function generateTrigrams(text: string): string[] {
  const normalized = text.toLowerCase().trim();
  const trigrams: string[] = [];
  
  // Need at least 3 characters for trigrams
  if (normalized.length < 3) {
    return [normalized];
  }
  
  for (let i = 0; i < normalized.length - 2; i++) {
    trigrams.push(normalized.slice(i, i + 3));
  }
  
  return trigrams;
}

/**
 * Builds trigram index for fast fuzzy search.
 * 
 * Creates inverted index: trigram → Set<entityKey>
 * Enables O(1) lookup per trigram for fuzzy matching.
 * 
 * @param entities - Array of cached entities
 * @returns Map of trigram to entity keys
 * 
 * Complexity: O(n * t) where n = entities, t = avg trigrams per entity
 * Memory: ~10MB for 10,000 entities
 */
export function buildTrigramIndex(entities: CachedEntity[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  
  for (const entity of entities) {
    const trigrams = generateTrigrams(entity.searchableText);
    const entityKey = `${entity.entityType}:${entity.entityId}`;
    
    for (const trigram of trigrams) {
      if (!index.has(trigram)) {
        index.set(trigram, new Set());
      }
      index.get(trigram)!.add(entityKey);
    }
  }
  
  return index;
}

/**
 * Performs fuzzy search on entity cache using trigram matching.
 * 
 * Scores entities by trigram overlap with query.
 * Returns top N matches sorted by relevance.
 * 
 * @param query - Search query string
 * @param entityType - Entity type to filter by
 * @param cache - Entity cache store
 * @param limit - Maximum results to return (default: 10)
 * @returns Array of autocomplete results with scores
 * 
 * Complexity: O(t * m) where t = query trigrams, m = matches per trigram
 * Performance target: <50ms for 10,000 entities
 */
export function fuzzySearch(
  query: string,
  entityType: EntityType,
  cache: EntityCacheStore,
  limit: number = 10
): AutocompleteResult[] {
  if (!query || query.length === 0) {
    // Return top entities for empty query
    const typeMap = cache.byType.get(entityType);
    if (!typeMap) return [];
    
    return Array.from(typeMap.values())
      .slice(0, limit)
      .map(entity => ({
        entity: {
          type: entityType,
          id: entity.entityId,
          title: entity.title,
          preview: entity.metadata,
          exists: true,
        },
        matchScore: 0,
        highlightRanges: [],
      }));
  }
  
  const queryTrigrams = generateTrigrams(query);
  const candidates = new Map<string, number>(); // entityKey -> score
  
  // Score entities by trigram overlap
  for (const trigram of queryTrigrams) {
    const matches = cache.trigramIndex.get(trigram);
    if (!matches) continue;
    
    for (const entityKey of matches) {
      if (!entityKey.startsWith(entityType + ':')) continue;
      candidates.set(entityKey, (candidates.get(entityKey) || 0) + 1);
    }
  }
  
  // Sort by score and return top N
  const results: AutocompleteResult[] = [];
  
  for (const [key, score] of Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)) {
    const [type, id] = key.split(':', 2);
    const entity = cache.byType.get(type as EntityType)?.get(id);
    
    if (!entity) continue;
    
    results.push({
      entity: {
        type: entity.entityType,
        id: entity.entityId,
        title: entity.title,
        preview: entity.metadata,
        exists: true,
      },
      matchScore: score / queryTrigrams.length,
      highlightRanges: calculateHighlightRanges(query, entity.title),
    });
  }
  
  return results;
}

/**
 * Calculates character ranges to highlight in search results.
 * 
 * Finds matching substrings for visual feedback.
 * Case-insensitive matching.
 * 
 * @param query - Search query
 * @param text - Text to find matches in
 * @returns Array of [start, end] tuples for highlighting
 * 
 * Complexity: O(n) where n = text length
 */
export function calculateHighlightRanges(query: string, text: string): [number, number][] {
  const ranges: [number, number][] = [];
  const normalizedQuery = query.toLowerCase();
  const normalizedText = text.toLowerCase();
  
  let startIndex = 0;
  while (startIndex < normalizedText.length) {
    const index = normalizedText.indexOf(normalizedQuery, startIndex);
    if (index === -1) break;
    
    ranges.push([index, index + normalizedQuery.length]);
    startIndex = index + normalizedQuery.length;
  }
  
  return ranges;
}

/**
 * Updates cache with new or modified entity.
 * 
 * Adds entity to byType map and rebuilds trigram index for that entity.
 * Incremental update to avoid full index rebuild.
 * 
 * @param cache - Entity cache store to update
 * @param entity - Entity reference to add/update
 * 
 * Complexity: O(t) where t = trigrams for this entity
 */
export function updateCache(cache: EntityCacheStore, entity: EntityReference): void {
  // Get or create type map
  if (!cache.byType.has(entity.type)) {
    cache.byType.set(entity.type, new Map());
  }
  
  const typeMap = cache.byType.get(entity.type)!;
  
  // Create cached entity
  const cachedEntity: CachedEntity = {
    entityType: entity.type,
    entityId: entity.id,
    title: entity.title,
    searchableText: entity.title,
    metadata: entity.preview,
  };
  
  // Update byType map
  typeMap.set(entity.id, cachedEntity);
  
  // Update trigram index
  const trigrams = generateTrigrams(cachedEntity.searchableText);
  const entityKey = `${entity.type}:${entity.id}`;
  
  for (const trigram of trigrams) {
    if (!cache.trigramIndex.has(trigram)) {
      cache.trigramIndex.set(trigram, new Set());
    }
    cache.trigramIndex.get(trigram)!.add(entityKey);
  }
  
  // Update sync timestamp
  cache.lastSync = Date.now();
}

/**
 * Removes entity from cache.
 * 
 * Removes from byType map and cleans up trigram index.
 * 
 * @param cache - Entity cache store
 * @param entityType - Type of entity to remove
 * @param entityId - ID of entity to remove
 * 
 * Complexity: O(t) where t = trigrams for this entity
 */
export function removeFromCache(
  cache: EntityCacheStore,
  entityType: EntityType,
  entityId: string
): void {
  const typeMap = cache.byType.get(entityType);
  if (!typeMap) return;
  
  const entity = typeMap.get(entityId);
  if (!entity) return;
  
  // Remove from byType map
  typeMap.delete(entityId);
  
  // Remove from trigram index
  const trigrams = generateTrigrams(entity.searchableText);
  const entityKey = `${entityType}:${entityId}`;
  
  for (const trigram of trigrams) {
    const matches = cache.trigramIndex.get(trigram);
    if (matches) {
      matches.delete(entityKey);
      // Clean up empty sets
      if (matches.size === 0) {
        cache.trigramIndex.delete(trigram);
      }
    }
  }
  
  cache.lastSync = Date.now();
}

/**
 * Type guard to check if a string is a valid EntityType.
 * 
 * Used for runtime validation of entity type strings.
 * 
 * NOTE: This array must be kept in sync with the EntityType union in types.ts.
 * If EntityType is updated, update this array accordingly.
 * 
 * @param type - String to check
 * @returns True if type is valid EntityType
 * 
 * Complexity: O(1)
 */
export function isValidEntityType(type: string): type is EntityType {
  const validTypes: EntityType[] = [
    'note',
    'kb',
    'journal',
    'goal',
    'milestone',
    'activity',
    'grid',
    'ladder',
    'category',
    'sheets',
    'book',
    'retrospective',
    'url',
  ];
  
  return validTypes.includes(type as EntityType);
}

/**
 * Creates empty entity cache store.
 * 
 * @returns Initialized cache store
 */
export function createEmptyCache(): EntityCacheStore {
  return {
    byType: new Map(),
    trigramIndex: new Map(),
    lastSync: 0,
  };
}

/**
 * Initializes cache from array of entities.
 * 
 * Builds both byType map and trigram index.
 * 
 * @param entities - Array of cached entities
 * @returns Initialized cache store
 * 
 * Complexity: O(n * t) where n = entities, t = avg trigrams
 */
export function initializeCache(entities: CachedEntity[]): EntityCacheStore {
  const cache = createEmptyCache();
  
  // Build byType map
  for (const entity of entities) {
    if (!cache.byType.has(entity.entityType)) {
      cache.byType.set(entity.entityType, new Map());
    }
    cache.byType.get(entity.entityType)!.set(entity.entityId, entity);
  }
  
  // Build trigram index
  cache.trigramIndex = buildTrigramIndex(entities);
  cache.lastSync = Date.now();
  
  return cache;
}
