// ─── Entity Linking Module ─────────────────────────────────────────
// Universal cross-reference linking system.
// Central export point for all entity linking functionality.

// Core functions
export {
  parseReferences,
  validateReference,
  batchValidate,
  generateTrigrams,
  buildTrigramIndex,
  fuzzySearch,
  calculateHighlightRanges,
  updateCache,
  removeFromCache,
  isValidEntityType,
  createEmptyCache,
  initializeCache,
} from './core';

// Types
export type {
  EntityType,
  CrossReference,
  ParsedReference,
  EntityReference,
  AutocompleteResult,
  EntityCacheStore,
  CachedEntity,
} from './core';

// Hooks
export {
  useEntityLinking,
  useEntityCache,
  useAutocomplete,
} from './hooks';

// Components
export {
  EntityLink,
  AutocompleteDropdown,
  EntityLinkInput,
  EntityLinkTextarea,
} from './components';

export type {
  EntityLinkProps,
  AutocompleteDropdownProps,
  EntityLinkInputProps,
  EntityLinkTextareaProps,
} from './components';

// Navigation
export { navigateToEntity } from './navigation/router';
