// ─── Autocomplete Hook ──────────────────────────────────────────────
// React hook for entity reference autocomplete with keyboard navigation,
// caret positioning, and debounced fuzzy search. Performance: <50ms response.

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { EntityType, EntityCacheStore, AutocompleteResult } from '../core/types';
import { fuzzySearch } from '../core/cache';

/**
 * Autocomplete dropdown position.
 */
export interface DropdownPosition {
  top: number;
  left: number;
}

/**
 * Autocomplete state.
 */
export interface AutocompleteState {
  isOpen: boolean;
  query: string;
  entityType: EntityType | null;
  position: DropdownPosition;
  results: AutocompleteResult[];
  selectedIndex: number;
}

/**
 * Autocomplete hook return type.
 */
export interface UseAutocompleteReturn {
  state: AutocompleteState;
  selectResult: (result: AutocompleteResult) => void;
  closeDropdown: () => void;
  handleKeyDown: (e: KeyboardEvent) => boolean;
}

/**
 * Valid entity type guard.
 */
const VALID_ENTITY_TYPES: readonly EntityType[] = [
  'note', 'kb', 'journal', 'goal', 'milestone', 'activity',
  'grid', 'ladder', 'category', 'sheets', 'book', 'retrospective', 'url'
] as const;

function isValidEntityType(type: string): type is EntityType {
  return VALID_ENTITY_TYPES.includes(type as EntityType);
}

/**
 * Calculates dropdown position relative to caret in textarea/input.
 * 
 * Uses invisible div technique to measure caret coordinates.
 * Complexity: O(1)
 * 
 * @param element - Textarea or input element
 * @param caretPosition - Character offset of caret
 * @returns Position coordinates for dropdown
 */
export function calculateDropdownPosition(
  element: HTMLTextAreaElement | HTMLInputElement,
  caretPosition: number
): DropdownPosition {
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);
  
  // Copy textarea styles for accurate measurement
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.font = style.font;
  div.style.padding = style.padding;
  div.style.width = style.width;
  div.style.border = style.border;
  div.style.lineHeight = style.lineHeight;
  
  // Insert text up to caret
  div.textContent = element.value.substring(0, caretPosition);
  
  // Add marker span at caret position
  const marker = document.createElement('span');
  marker.textContent = '|';
  div.appendChild(marker);
  
  document.body.appendChild(div);
  
  const markerRect = marker.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  
  document.body.removeChild(div);
  
  return {
    top: markerRect.top - elementRect.top + element.scrollTop + 20, // 20px below caret
    left: markerRect.left - elementRect.left + element.scrollLeft,
  };
}

/**
 * Debounces function calls.
 * 
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * React hook for autocomplete functionality.
 * 
 * Detects entity type prefix (e.g., "note:"), performs fuzzy search,
 * handles keyboard navigation, and manages dropdown positioning.
 * 
 * @param value - Current input value
 * @param inputRef - Ref to textarea/input element
 * @param cache - Entity cache store
 * @param onSelect - Callback when user selects result
 * @returns Autocomplete state and handlers
 * 
 * @example
 * ```tsx
 * const inputRef = useRef<HTMLTextAreaElement>(null);
 * const { cache } = useEntityCache();
 * const autocomplete = useAutocomplete(value, inputRef, cache, handleSelect);
 * 
 * return (
 *   <>
 *     <textarea ref={inputRef} onKeyDown={autocomplete.handleKeyDown} />
 *     {autocomplete.state.isOpen && <AutocompleteDropdown {...autocomplete} />}
 *   </>
 * );
 * ```
 */
export function useAutocomplete(
  value: string,
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement>,
  cache: EntityCacheStore,
  onSelect: (result: AutocompleteResult) => void
): UseAutocompleteReturn {
  const [state, setState] = useState<AutocompleteState>({
    isOpen: false,
    query: '',
    entityType: null,
    position: { top: 0, left: 0 },
    results: [],
    selectedIndex: 0,
  });

  /**
   * Detects autocomplete trigger and performs fuzzy search.
   * 
   * Trigger pattern: `entity_type:partial_query`
   * Example: "note:my-" triggers search for notes matching "my-"
   * 
   * Complexity: O(t * m) where t = trigrams, m = matches
   * Performance target: <50ms
   */
  const detectTrigger = useCallback(() => {
    if (!inputRef.current) return;
    
    const cursorPos = inputRef.current.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    
    // Match pattern: entity_type:query
    const match = textBeforeCursor.match(/(\w+):(\w*)$/);
    
    if (match) {
      const [, entityType, query] = match;
      
      if (isValidEntityType(entityType)) {
        const results = fuzzySearch(query, entityType, cache, 10);
        const position = calculateDropdownPosition(inputRef.current, cursorPos);
        
        setState({
          isOpen: true,
          query,
          entityType,
          position,
          results,
          selectedIndex: 0,
        });
        return;
      }
    }
    
    // No match - close dropdown
    setState(prev => ({ ...prev, isOpen: false }));
  }, [value, inputRef, cache]);

  /**
   * Debounced trigger detection.
   * 
   * Delays search by 300ms to batch keystrokes.
   * Reduces unnecessary fuzzy search calls.
   */
  const debouncedDetect = useMemo(
    () => debounce(detectTrigger, 300),
    [detectTrigger]
  );

  // Trigger detection on value change
  useEffect(() => {
    debouncedDetect();
  }, [value, debouncedDetect]);

  /**
   * Selects autocomplete result and inserts into input.
   * 
   * @param result - Selected autocomplete result
   */
  const selectResult = useCallback((result: AutocompleteResult) => {
    onSelect(result);
    setState(prev => ({ ...prev, isOpen: false }));
  }, [onSelect]);

  /**
   * Closes autocomplete dropdown.
   */
  const closeDropdown = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  /**
   * Handles keyboard navigation in autocomplete dropdown.
   * 
   * - Arrow Down: Move selection down
   * - Arrow Up: Move selection up
   * - Enter: Select current result
   * - Escape: Close dropdown
   * 
   * @param e - Keyboard event
   * @returns true if event was handled, false otherwise
   */
  const handleKeyDown = useCallback((e: KeyboardEvent): boolean => {
    if (!state.isOpen) return false;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, prev.results.length - 1),
        }));
        return true;
        
      case 'ArrowUp':
        e.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }));
        return true;
        
      case 'Enter':
        e.preventDefault();
        if (state.results[state.selectedIndex]) {
          selectResult(state.results[state.selectedIndex]);
        }
        return true;
        
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        return true;
        
      default:
        return false;
    }
  }, [state.isOpen, state.results, state.selectedIndex, selectResult, closeDropdown]);

  return {
    state,
    selectResult,
    closeDropdown,
    handleKeyDown,
  };
}
