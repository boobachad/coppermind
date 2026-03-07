// ─── Autocomplete Dropdown Component ────────────────────────────────
// Displays entity suggestions with keyboard navigation, highlighting,
// and intelligent positioning (below/above caret with fallback).
// Performance: <50ms render, smooth scroll-to-selected.

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Lightbulb, BookOpen, Target, Flag, Zap, 
  Grid3x3, List, Folder, FileSpreadsheet, Book, 
  RotateCcw, Link, File 
} from 'lucide-react';
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

  // Calculate adjusted position to prevent viewport overflow
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  useEffect(() => {
    if (!isOpen) return;

    const DROPDOWN_WIDTH = 320; // 80 * 4 (w-80 in pixels)
    const DROPDOWN_MAX_HEIGHT = 256; // 64 * 4 (max-h-64 in pixels)
    const VIEWPORT_PADDING = 8; // Padding from viewport edges

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { top, left } = position;

    // Adjust horizontal position if overflows right edge
    if (left + DROPDOWN_WIDTH > viewportWidth - VIEWPORT_PADDING) {
      left = viewportWidth - DROPDOWN_WIDTH - VIEWPORT_PADDING;
    }

    // Adjust horizontal position if overflows left edge
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }

    // Adjust vertical position if overflows bottom edge
    if (top + DROPDOWN_MAX_HEIGHT > viewportHeight - VIEWPORT_PADDING) {
      // Try positioning above the caret
      const abovePosition = top - DROPDOWN_MAX_HEIGHT - 30; // 30px above caret
      if (abovePosition >= VIEWPORT_PADDING) {
        top = abovePosition;
      } else {
        // If can't fit above, position at bottom with max available height
        top = viewportHeight - DROPDOWN_MAX_HEIGHT - VIEWPORT_PADDING;
      }
    }

    setAdjustedPosition({ top, left });
  }, [isOpen, position]);

  if (!isOpen) return null;

  console.log('[AutocompleteDropdown] Rendering dropdown:', { 
    isOpen, 
    originalPosition: position, 
    adjustedPosition,
    resultsCount: results.length 
  });

  // Render dropdown using portal to escape stacking context issues
  const dropdownContent = (
    <div
      ref={dropdownRef}
      className="fixed w-80 max-h-64 overflow-y-auto rounded-lg shadow-2xl border"
      style={{
        top: `${adjustedPosition.top}px`,
        left: `${adjustedPosition.left}px`,
        zIndex: 999999,
        backgroundColor: 'var(--glass-bg)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--glass-border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {entityType}
          </span>
          {query && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              searching: "{query}"
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="py-1">
        {results.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
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
      <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg-subtle)' }}>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );

  // Render using portal to escape stacking context
  return createPortal(dropdownContent, document.body);
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
        className="px-3 py-2 cursor-pointer transition-colors"
        style={{
          backgroundColor: isSelected ? 'var(--glass-bg-subtle)' : 'transparent',
          color: 'var(--text-primary)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--glass-bg-subtle)';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
        onClick={onClick}
      >
        {/* Entity title with highlighting */}
        <div className="flex items-center gap-2">
          <EntityTypeIcon type={entity.type} />
          <span className="text-sm font-medium">
            <HighlightedText
              text={entity.title}
              ranges={highlightRanges}
              query={query}
            />
          </span>
        </div>

        {/* Entity preview */}
        {entity.preview && (
          <div className="mt-1 text-xs line-clamp-2 text-muted-foreground">
            {entity.preview}
          </div>
        )}

        {/* Match score indicator */}
        {matchScore > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <div className="h-1 w-16 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--glass-bg-subtle)' }}>
              <div
                className="h-full transition-all"
                style={{ 
                  width: `${matchScore * 100}%`,
                  backgroundColor: 'var(--color-accent-primary)',
                }}
              />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
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
  // Defensive: handle undefined or empty ranges
  if (!ranges || ranges.length === 0) {
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
        className="font-medium px-0.5 rounded"
        style={{
          backgroundColor: 'var(--color-accent-subtle)',
          color: 'var(--color-accent-primary)',
        }}
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
  const iconMap: Record<EntityType, React.ComponentType<{ className?: string }>> = {
    note: FileText,
    kb: Lightbulb,
    journal: BookOpen,
    goal: Target,
    milestone: Flag,
    activity: Zap,
    grid: Grid3x3,
    ladder: List,
    category: Folder,
    sheets: FileSpreadsheet,
    book: Book,
    retrospective: RotateCcw,
    url: Link,
  };

  const Icon = iconMap[type] || File;

  return <Icon className="h-4 w-4" />;
}
