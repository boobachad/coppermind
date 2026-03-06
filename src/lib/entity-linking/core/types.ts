// ─── Type Definitions ───────────────────────────────────────────────
// TypeScript interfaces for the Universal Cross-Reference Linking System.

/**
 * Entity types supported by the cross-reference system.
 */
export type EntityType = 
  | 'note' 
  | 'kb' 
  | 'journal' 
  | 'goal' 
  | 'milestone' 
  | 'activity' 
  | 'grid' 
  | 'ladder' 
  | 'category' 
  | 'sheets' 
  | 'book' 
  | 'retrospective'
  | 'url';

/**
 * Cross-reference relationship stored in database.
 */
export interface CrossReference {
  id: string;
  sourceEntityType: EntityType;
  sourceEntityId: string;
  sourceField: string;
  targetEntityType: EntityType;
  targetEntityId: string;
  referenceText: string;
  aliasText?: string;
  positionStart: number;
  positionEnd: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Parsed cross-reference from text.
 */
export interface ParsedReference {
  entityType: EntityType;
  identifier: string;
  subIdentifier?: string;
  aliasText?: string;
  startIndex: number;
  endIndex: number;
  rawText: string;
}

/**
 * Resolved entity reference with metadata.
 */
export interface EntityReference {
  type: EntityType;
  id: string;
  title: string;
  preview?: string;
  exists: boolean;
}

/**
 * Autocomplete search result.
 */
export interface AutocompleteResult {
  entity: EntityReference;
  matchScore: number;
  highlightRanges: [number, number][];
}

/**
 * Client-side entity cache store.
 */
export interface EntityCacheStore {
  byType: Map<EntityType, Map<string, CachedEntity>>;
  trigramIndex: Map<string, Set<string>>;
  lastSync: number;
}

/**
 * Cached entity for client-side lookup.
 */
export interface CachedEntity {
  entityType: EntityType;
  entityId: string;
  title: string;
  searchableText: string;
  metadata?: string;
}
