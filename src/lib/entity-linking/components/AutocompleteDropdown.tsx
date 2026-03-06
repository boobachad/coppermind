// ─── Autocomplete Dropdown Component ────────────────────────────────
// Displays entity suggestions with keyboard navigation, highlighting,
// and intelligent positioning (below/above caret with fallback).
// Performance: <50ms render, smooth scroll-to-selected.

import React, { useEffect, useRef } from 'react';
import type { AutocompleteResult, EntityType } from '../core/types';

/**
 * Autocomplete dropdown props.
 */
export interface AutocompleteDropdownProps {
  /** Whether dropdown is visible */
  isOpen: boolean;
  /** Search query text */
  query: string;
  /** Entity type being searched */
  entityType: EntityType | null;
  /** Dropdown position coordinates */
  position: { top: number; left: number };
  /** Autocomplete results to display */
  results: AutocompleteResult[];
  /** Currently selected result index */
  selectedIndex: number;
  /** Callback when user selects a result */
  onSelect: (result: AutocompleteResult) => void;
  /** Callback to close dropdown */
  onClose: () => void;
}

/**
 * Autocomplete dropdown component for entity reference suggestions.
 * 
 * Features:
 * - Intelligent positioning (below caret, fallback to above if insufficient space)
 * - Keyboard navigation with visual feedback
 * - Fuzzy match highlighting
 * - Scroll-to-selected behavior
 * - Theme-aware semantic CSS
 * 
 * @example
 * ```tsx
 * <AutocompleteDropdown
 *   isOpen={state.isOpen}
 *   query={state.query}
 *   entityType={state.entityType}
 *   position={state.position}
 *   results={state.results}
 *   selectedIndex={state.selectedIndex}
 *   onSelect={handleSelect}
 *   onClose={handleClose}
 * />
 * ```
 */
export function AutocompleteDropdown({
  isOpen,
  query,
  entityType,
  position,
  results,
  selectedIndex,
  onSelect,
  onClose,
}: AutocompleteDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Adjust position if dropdown would overflow viewport
  useEffect(() => {
    if (!isOpen || !dropdownRef.current) return;

    const dropdown = dropdownRef.current;
    const rect = dropdown.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // If dropdown overflows bottom, position above caret
    if (rect.bottom > viewportHeight) {
      dropdown.style.top = `${position.top - rect.height - 25}px`;
    }
  }, [isOpen, position]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 w-80 max-h-64 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {entityType}
          </span>
          {query && (
            <span className="text-xs text-muted-foreground">
              searching: "{query}"
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="py-1">
        {results.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No matches found
          </div>
        ) : (
          results.map((result, index) => (
            <AutocompleteItem
              key={`${result.entity.type}:${result.entity.id}`}
              result={result}
              isSelected={index === selectedIndex}
              query={query}
              onClick={() => onSelect(result)}
              ref={index === selectedIndex ? selectedItemRef : null}
            />
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border bg-muted/30">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual autocomplete result item.
 */
interface AutocompleteItemProps {
  result: AutocompleteResult;
  isSelected: boolean;
  query: string;
  onClick: () => void;
}

const AutocompleteItem = React.forwardRef<HTMLDivElement, AutocompleteItemProps>(
  ({ result, isSelected, query, onClick }, ref) => {
    const { entity, matchScore, highlightRanges } = result;

    return (
      <div
        ref={ref}
        className={`
          px-3 py-2 cursor-pointer transition-colors
          ${isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'}
        `}
        onClick={onClick}
      >
        {/* Entity title with highlighting */}
        <div className="flex items-center gap-2">
          <EntityTypeIcon type={entity.type} />
          <span className="text-sm font-medium text-foreground">
            <HighlightedText
              text={entity.title}
              ranges={highlightRanges}
              query={query}
            />
          </span>
        </div>

        {/* Entity preview */}
        {entity.preview && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {entity.preview}
          </div>
        )}

        {/* Match score indicator */}
        {matchScore > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <div className="h-1 w-16 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${matchScore * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {Math.round(matchScore * 100)}%
            </span>
          </div>
        )}
      </div>
    );
  }
);

AutocompleteItem.displayName = 'AutocompleteItem';

/**
 * Highlights matching text ranges in entity title.
 */
interface HighlightedTextProps {
  text: string;
  ranges: [number, number][];
  query: string;
}

function HighlightedText({ text, ranges }: HighlightedTextProps) {
  if (ranges.length === 0) {
    return <>{text}</>;
  }

  const segments: JSX.Element[] = [];
  let lastIndex = 0;

  // Sort ranges by start position
  const sortedRanges = [...ranges].sort((a, b) => a[0] - b[0]);

  for (const [start, end] of sortedRanges) {
    // Add non-highlighted text before range
    if (start > lastIndex) {
      segments.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex, start)}
        </span>
      );
    }

    // Add highlighted text
    segments.push(
      <span
        key={`highlight-${start}`}
        className="bg-primary/20 text-primary font-medium"
      >
        {text.slice(start, end)}
      </span>
    );

    lastIndex = end;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push(
      <span key={`text-${lastIndex}`}>
        {text.slice(lastIndex)}
      </span>
    );
  }

  return <>{segments}</>;
}

/**
 * Entity type icon component.
 */
function EntityTypeIcon({ type }: { type: EntityType }) {
  const iconMap: Record<EntityType, string> = {
    note: '📝',
    kb: '💡',
    journal: '📔',
    goal: '🎯',
    milestone: '🏁',
    activity: '⚡',
    grid: '📊',
    ladder: '🪜',
    category: '📂',
    sheets: '📋',
    book: '📚',
    retrospective: '🔄',
    url: '🔗',
  };

  return (
    <span className="text-base" role="img" aria-label={type}>
      {iconMap[type] || '📄'}
    </span>
  );
}
