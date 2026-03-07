// ─── Core Module Exports ────────────────────────────────────────────
// Central export point for entity linking core functionality.
// Enables tree-shaking with named exports.

// Parser
export { parseReferences } from './parser';

// Validator
export { validateReference, batchValidate } from './validator';

// Cache
export {
  generateTrigrams,
  buildTrigramIndex,
  fuzzySearch,
  calculateHighlightRanges,
  updateCache,
  removeFromCache,
  isValidEntityType,
  createEmptyCache,
  initializeCache,
} from './cache';

// Types
export type {
  EntityType,
  CrossReference,
  ParsedReference,
  EntityReference,
  AutocompleteResult,
  EntityCacheStore,
  CachedEntity,
} from './types';
