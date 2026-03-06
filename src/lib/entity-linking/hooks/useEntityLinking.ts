// ─── Main Entity Linking Hook ───────────────────────────────────────
// Orchestrates parsing, validation, and autocomplete for entity references.
// Integrates all core services for universal text input linking support.

import { useState, useEffect, useCallback, RefObject } from 'react';
import type {
  ParsedReference,
  EntityReference,
  AutocompleteResult,
} from '../core/types';
import { parseReferences } from '../core/parser';
import { batchValidate } from '../core/validator';
import { useEntityCache } from './useEntityCache';
import { useAutocomplete } from './useAutocomplete';

/**
 * Entity linking hook return type.
 */
export interface UseEntityLinkingReturn {
  parsedRefs: ParsedReference[];
  validatedRefs: Map<string, EntityReference>;
  autocomplete: {
    isOpen: boolean;
    results: AutocompleteResult[];
    selectedIndex: number;
    position: { top: number; left: number };
  };
  handleAutocompleteSelect: (result: AutocompleteResult) => void;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

/**
 * Main hook for entity linking in standard inputs (textarea/input).
 * 
 * Orchestrates:
 * - Real-time parsing of cross-references
 * - Batch validation with cache-first strategy
 * - Autocomplete with fuzzy search
 * - Keyboard navigation
 * 
 * @param value - Current input value
 * @param onChange - Callback to update input value
 * @param inputRef - Ref to textarea/input element
 * @returns Parsed refs, validated refs, autocomplete state, handlers
 * 
 * @example
 * ```tsx
 * function MyInput() {
 *   const [value, setValue] = useState('');
 *   const inputRef = useRef<HTMLTextAreaElement>(null);
 *   const linking = useEntityLinking(value, setValue, inputRef);
 *   
 *   return (
 *     <>
 *       <textarea
 *         ref={inputRef}
 *         value={value}
 *         onChange={e => setValue(e.target.value)}
 *         onKeyDown={linking.handleKeyDown}
 *       />
 *       {linking.autocomplete.isOpen && (
 *         <AutocompleteDropdown {...linking.autocomplete} />
 *       )}
 *     </>
 *   );
 * }
 * ```
 * 
 * Performance:
 * - Parsing: O(n) where n = text length
 * - Validation: O(k) where k = uncached refs
 * - Autocomplete: O(t*m) where t = trigrams, m = matches
 */
export function useEntityLinking(
  value: string,
  onChange: (value: string) => void,
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement>
): UseEntityLinkingReturn {
  const [parsedRefs, setParsedRefs] = useState<ParsedReference[]>([]);
  const [validatedRefs, setValidatedRefs] = useState<Map<string, EntityReference>>(
    new Map()
  );

  const { cache, status } = useEntityCache();

  /**
   * Handles autocomplete selection.
   * 
   * Replaces partial reference with complete syntax including alias.
   * Preserves cursor position after insertion.
   * 
   * @param result - Selected autocomplete result
   * 
   * Algorithm:
   * 1. Find partial reference before cursor
   * 2. Calculate replacement range
   * 3. Build complete reference with alias
   * 4. Insert and restore cursor position
   * 
   * Complexity: O(1)
   */
  const handleSelect = useCallback(
    (result: AutocompleteResult) => {
      if (!inputRef.current) return;

      const cursorPos = inputRef.current.selectionStart || 0;
      const textBeforeCursor = value.slice(0, cursorPos);
      const textAfterCursor = value.slice(cursorPos);

      // Find partial reference pattern before cursor
      const match = textBeforeCursor.match(/(\w+):(\w*)$/);
      if (!match) return;

      // Calculate replacement range
      const replaceStart = cursorPos - match[0].length;

      // Build complete reference with alias
      const newRef = `${result.entity.type}:${result.entity.id}|${result.entity.title}`;

      // Insert complete reference
      const newValue = value.slice(0, replaceStart) + newRef + textAfterCursor;
      onChange(newValue);

      // Restore cursor position after inserted reference
      setTimeout(() => {
        const newCursorPos = replaceStart + newRef.length;
        inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        inputRef.current?.focus();
      }, 0);
    },
    [value, onChange, inputRef]
  );

  // Initialize autocomplete hook
  const autocomplete = useAutocomplete(value, inputRef, cache, handleSelect);

  /**
   * Parses and validates references on text change.
   * 
   * Triggered on every value update for real-time feedback.
   * Uses batch validation to minimize backend calls.
   * 
   * Performance:
   * - Parse: <5ms for 10k chars
   * - Validate: <100ms for 50 refs
   */
  useEffect(() => {
    // Skip if cache not ready
    if (status !== 'ready') return;

    // Parse references from text (O(n))
    const refs = parseReferences(value);
    setParsedRefs(refs);

    // Batch validate if references found
    if (refs.length > 0) {
      batchValidate(refs, cache).then(setValidatedRefs);
    } else {
      // Clear validation results if no references
      setValidatedRefs(new Map());
    }
  }, [value, cache, status]);

  /**
   * Handles keyboard events for autocomplete navigation.
   * 
   * Delegates to autocomplete hook's keyboard handler.
   * Returns true if event was handled (prevents default).
   * 
   * @param e - React keyboard event
   * @returns True if event was handled
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Convert React event to native KeyboardEvent for autocomplete handler
      const nativeEvent = e.nativeEvent;
      return autocomplete.handleKeyDown(nativeEvent);
    },
    [autocomplete]
  );

  return {
    parsedRefs,
    validatedRefs,
    autocomplete: {
      isOpen: autocomplete.state.isOpen,
      results: autocomplete.state.results,
      selectedIndex: autocomplete.state.selectedIndex,
      position: autocomplete.state.position,
    },
    handleAutocompleteSelect: handleSelect,
    handleKeyDown,
  };
}

/**
 * Helper to get entity reference by key.
 * 
 * @param validatedRefs - Map of validated references
 * @param entityType - Entity type
 * @param identifier - Entity identifier
 * @returns Entity reference or undefined
 */
export function getValidatedRef(
  validatedRefs: Map<string, EntityReference>,
  entityType: string,
  identifier: string
): EntityReference | undefined {
  const key = `${entityType}:${identifier}`;
  return validatedRefs.get(key);
}

/**
 * Helper to check if reference is valid.
 * 
 * @param validatedRefs - Map of validated references
 * @param ref - Parsed reference to check
 * @returns True if reference exists and is valid
 */
export function isReferenceValid(
  validatedRefs: Map<string, EntityReference>,
  ref: ParsedReference
): boolean {
  const entity = getValidatedRef(validatedRefs, ref.entityType, ref.identifier);
  return entity?.exists === true;
}

/**
 * Helper to get display text for reference.
 * 
 * Uses alias if provided, otherwise falls back to identifier or title.
 * 
 * @param ref - Parsed reference
 * @param validatedRefs - Map of validated references
 * @returns Display text for reference
 */
export function getReferenceDisplayText(
  ref: ParsedReference,
  validatedRefs: Map<string, EntityReference>
): string {
  // Use alias if provided
  if (ref.aliasText) {
    return ref.aliasText;
  }

  // Use validated title if available
  const entity = getValidatedRef(validatedRefs, ref.entityType, ref.identifier);
  if (entity?.title) {
    return entity.title;
  }

  // Fallback to identifier
  return ref.identifier;
}

/**
 * Helper to filter references by validity.
 * 
 * @param refs - Array of parsed references
 * @param validatedRefs - Map of validated references
 * @returns Object with valid and invalid reference arrays
 */
export function partitionReferences(
  refs: ParsedReference[],
  validatedRefs: Map<string, EntityReference>
): { valid: ParsedReference[]; invalid: ParsedReference[] } {
  const valid: ParsedReference[] = [];
  const invalid: ParsedReference[] = [];

  for (const ref of refs) {
    if (isReferenceValid(validatedRefs, ref)) {
      valid.push(ref);
    } else {
      invalid.push(ref);
    }
  }

  return { valid, invalid };
}
