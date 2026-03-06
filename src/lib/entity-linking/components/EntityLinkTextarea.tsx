// ─── Entity Link Textarea Component ────────────────────────────────
// Wrapper for <textarea> with entity linking support using mirror overlay.
// Preserves all native textarea behaviors (selection, undo/redo, accessibility).

import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { useEntityLinking } from '../hooks/useEntityLinking';
import { MirrorOverlay } from './MirrorOverlay';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import type { AutocompleteResult } from '../core/types';

/**
 * Entity link textarea props.
 */
export interface EntityLinkTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  /** Textarea value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * Textarea component with entity linking support.
 * 
 * Features:
 * - Real-time cross-reference detection and validation
 * - Mirror overlay for styled link rendering
 * - Autocomplete suggestions with fuzzy search
 * - Keyboard navigation
 * - Preserves native textarea behaviors
 * - Theme-aware semantic CSS
 * 
 * Architecture:
 * - Transparent textarea (z-index: 2) for input
 * - Mirror div (z-index: 1) for styled links
 * - Synchronized scroll and dimensions
 * 
 * @example
 * ```tsx
 * <EntityLinkTextarea
 *   value={content}
 *   onChange={setContent}
 *   placeholder="Type note:my-note to link..."
 *   rows={10}
 *   className="w-full"
 * />
 * ```
 */
export const EntityLinkTextarea = forwardRef<HTMLTextAreaElement, EntityLinkTextareaProps>(
  ({ value, onChange, className = '', rows = 5, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expose textarea ref to parent
    useImperativeHandle(ref, () => textareaRef.current!);

    // Entity linking logic
    const {
      parsedRefs,
      validatedRefs,
      autocomplete,
      handleKeyDown: handleAutocompleteKeyDown,
    } = useEntityLinking(value, onChange, textareaRef);

    /**
     * Handles autocomplete selection.
     * Inserts complete reference with alias at cursor position.
     */
    const onSelectResult = (result: AutocompleteResult) => {
      if (!textareaRef.current) return;

      const cursorPos = textareaRef.current.selectionStart || 0;
      const textBeforeCursor = value.slice(0, cursorPos);
      const textAfterCursor = value.slice(cursorPos);

      // Find the partial reference to replace
      const match = textBeforeCursor.match(/(\w+):(\w*)$/);
      if (!match) return;

      const replaceStart = cursorPos - match[0].length;
      const newRef = `${result.entity.type}:${result.entity.id}|${result.entity.title}`;
      const newValue = value.slice(0, replaceStart) + newRef + textAfterCursor;

      onChange(newValue);

      // Move cursor after inserted reference
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = replaceStart + newRef.length;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
          textareaRef.current.focus();
        }
      }, 0);
    };

    /**
     * Handles keyboard events for autocomplete navigation.
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (autocomplete.isOpen) {
        const handled = handleAutocompleteKeyDown(e);
        if (handled) {
          return;
        }
      }

      // Call original onKeyDown if provided
      props.onKeyDown?.(e);
    };

    return (
      <div className="relative">
        {/* Mirror overlay for styled links */}
        <MirrorOverlay
          text={value}
          references={validatedRefs}
          parsedRefs={parsedRefs}
          textareaRef={textareaRef}
        />

        {/* Transparent textarea for input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={rows}
          className={`
            relative z-[2] w-full px-3 py-2 rounded-md
            bg-transparent border border-border
            text-transparent caret-foreground
            placeholder:text-muted-foreground
            focus:outline-none focus:ring-2 focus:ring-ring
            resize-y whitespace-pre-wrap break-words
            ${className}
          `}
          style={{
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
          }}
          {...props}
        />

        {/* Autocomplete dropdown */}
        {autocomplete.isOpen && (
          <AutocompleteDropdown
            isOpen={autocomplete.isOpen}
            query={autocomplete.query}
            entityType={autocomplete.entityType}
            position={autocomplete.position}
            results={autocomplete.results}
            selectedIndex={autocomplete.selectedIndex}
            onSelect={onSelectResult}
            onClose={() => {}}
          />
        )}
      </div>
    );
  }
);

EntityLinkTextarea.displayName = 'EntityLinkTextarea';
