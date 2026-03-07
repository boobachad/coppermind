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
  const elementRect = element.getBoundingClientRect();
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);
  
  // Copy textarea styles for accurate measurement
  div.style.position = 'absolute';
  div.style.top = `${elementRect.top + window.scrollY}px`;
  div.style.left = `${elementRect.left + window.scrollX}px`;
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
  
  document.body.removeChild(div);
  
  // Return viewport coordinates for fixed positioning
  return {
    top: markerRect.bottom + 5, // 5px below caret
    left: markerRect.left,
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
   * Trigger pattern: `[[entity_type:partial_query`
   * Example: "[[note:my-" triggers search for notes matching "my-"
   * 
   * Hierarchical grid navigation:
   * - `[[grid:` → Recent 30 days
   * - `[[grid:2026` → Months with activities (2026-03, 2026-04)
   * - `[[grid:2026-03` → Dates in month (2026-03-07, 2026-03-27)
   * - `[[grid:2026-03-27:activity:` → Activities for that date
   * 
   * Complexity: O(t * m) where t = trigrams, m = matches
   * Performance target: <50ms
   */
  const detectTrigger = useCallback(async () => {
    if (!inputRef.current) return;
    
    const cursorPos = inputRef.current.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    
    // Check for grid:date:activity: pattern first (4-part reference)
    const gridActivityMatch = textBeforeCursor.match(/\[\[grid:(\d{4}-\d{2}-\d{2}):activity:([^\]:]*)$/);
    
    if (gridActivityMatch) {
      const [, date, query] = gridActivityMatch;
      
      console.log('[Autocomplete] Grid activity trigger:', { date, query });
      
      try {
        // Lazy-load activities for this specific date
        const { invoke } = await import('@tauri-apps/api/core');
        const activities = await invoke<Array<{
          entityType: string;
          entityId: string;
          title: string;
          searchableText: string;
          metadata: string | null;
        }>>('get_activities_for_date_autocomplete', { date });
        
        console.log('[Autocomplete] Fetched activities:', activities.length);
        
        // Filter by query and compute highlight ranges
        const lowerQuery = query.toLowerCase();
        const filtered = activities
          .filter(a => a.title.toLowerCase().includes(lowerQuery))
          .slice(0, 10)
          .map(a => {
            // Compute highlight ranges for case-insensitive substring match
            const highlightRanges: [number, number][] = [];
            const lowerTitle = a.title.toLowerCase();
            const matchIndex = lowerTitle.indexOf(lowerQuery);
            
            if (matchIndex !== -1) {
              highlightRanges.push([matchIndex, matchIndex + query.length]);
            }
            
            return {
              entity: {
                type: 'activity' as EntityType,
                id: a.entityId,
                title: a.title,
                exists: true,
              },
              matchScore: 1.0,
              highlightRanges,
            };
          });
        
        const position = calculateDropdownPosition(inputRef.current, cursorPos);
        
        setState({
          isOpen: true,
          query,
          entityType: 'activity',
          position,
          results: filtered,
          selectedIndex: 0,
        });
        return;
      } catch (error) {
        console.error('[Autocomplete] Failed to fetch activities:', error);
        setState(prev => ({ ...prev, isOpen: false }));
        return;
      }
    }
    
    // Check for grid date pattern (Hierarchical navigation)
    const gridDateMatch = textBeforeCursor.match(/\[\[grid:([^\]:]*)$/);
    
    if (gridDateMatch) {
      const [, query] = gridDateMatch;
      
      console.log('[Autocomplete] Grid date trigger:', { query });
      
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        let items: string[] = [];
        
        // Hierarchical navigation:
        // 1. [[grid: → Recent 30 days
        // 2. [[grid:2026 → Months with activities (2026-03, 2026-04)
        // 3. [[grid:2026-03 → Dates in month (2026-03-07, 2026-03-27)
        
        if (query.trim() === '') {
          // Case 1: [[grid: → Show recent 30 days
          items = await invoke<string[]>('get_recent_grid_dates');
          console.log('[Autocomplete] Recent grid dates:', items.length);
        } else if (/^\d{4}$/.test(query)) {
          // Case 2: [[grid:2026 → Show months with activities
          items = await invoke<string[]>('search_grid_months', { year: query });
          console.log('[Autocomplete] Months for year:', items.length);
        } else if (/^\d{4}-\d{2}$/.test(query)) {
          // Case 3: [[grid:2026-03 → Show dates in month
          items = await invoke<string[]>('search_grid_dates_in_month', { yearMonth: query });
          console.log('[Autocomplete] Dates in month:', items.length);
        } else {
          // Invalid pattern - close dropdown
          setState(prev => ({ ...prev, isOpen: false }));
          return;
        }
        
        // Convert items to autocomplete results
        const results = items.slice(0, 10).map(item => ({
          entity: {
            type: 'grid' as EntityType,
            id: item,
            title: `Grid: ${item}`,
            exists: true,
          },
          matchScore: 1.0,
          highlightRanges: [] as [number, number][],
        }));
        
        const position = calculateDropdownPosition(inputRef.current, cursorPos);
        
        setState({
          isOpen: true,
          query,
          entityType: 'grid',
          position,
          results,
          selectedIndex: 0,
        });
        return;
      } catch (error) {
        console.error('[Autocomplete] Failed to fetch grid items:', error);
        setState(prev => ({ ...prev, isOpen: false }));
        return;
      }
    }
    
    // Standard pattern: [[entity_type:query (without closing ]])
    const match = textBeforeCursor.match(/\[\[(\w+):([^\]:]*)$/);
    
    console.log('[Autocomplete] Detecting trigger:', { textBeforeCursor, match, cursorPos });
    
    if (match) {
      const [, entityType, query] = match;
      
      console.log('[Autocomplete] Match found:', { entityType, query, isValid: isValidEntityType(entityType) });
      
      if (isValidEntityType(entityType)) {
        const results = fuzzySearch(query, entityType, cache, 10);
        const position = calculateDropdownPosition(inputRef.current, cursorPos);
        
        console.log('[Autocomplete] Opening dropdown:', { results: results.length, position });
        
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
   * Delays search by 150ms to batch keystrokes.
   * Reduces unnecessary fuzzy search calls.
   */
  const debouncedDetect = useMemo(
    () => debounce(detectTrigger, 150),
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
