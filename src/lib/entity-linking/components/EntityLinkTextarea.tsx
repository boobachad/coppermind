// ─── Entity Link Textarea Component ────────────────────────────────
// Plain textarea with entity linking autocomplete support.
// Preserves all native textarea behaviors (selection, undo/redo, accessibility).

import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { useEntityLinking } from '../hooks/useEntityLinking';
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
 * Textarea component with entity linking autocomplete.
 * 
 * Features:
 * - Autocomplete suggestions with fuzzy search
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Preserves all native textarea behaviors
 * - Theme-aware semantic CSS
 * - Seamlessly integrates into any container (no extra wrapper styling)
 * 
 * Edit Mode Behavior:
 * - Shows raw markdown: `# heading`, `**bold**`, `[[entity:id|alias]]`
 * - No visual highlights or rendering
 * - Autocomplete triggers on `[[` syntax
 * 
 * Design Philosophy:
 * - Acts as a native textarea replacement
 * - Inherits all styling from parent container
 * - Minimal wrapper (only for autocomplete positioning)
 * - No background, border, or padding by default
 * 
 * @example
 * ```tsx
 * <EntityLinkTextarea
 *   value={content}
 *   onChange={setContent}
 *   placeholder="Type [[note:id|alias]] to link..."
 *   rows={10}
 *   className="w-full p-4"
 *   style={{ backgroundColor: 'var(--bg-secondary)' }}
 * />
 * ```
 */
export const EntityLinkTextarea = forwardRef<HTMLTextAreaElement, EntityLinkTextareaProps>(
  ({ value, onChange, className = '', rows = 5, ...props }, ref) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Expose textarea ref to parent
    useImperativeHandle(ref, () => textareaRef.current!);

    // Entity linking autocomplete logic
    const {
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

      // Find the partial reference to replace (with [[)
      const match = textBeforeCursor.match(/\[\[(\w+):([^\]:]*)$/);
      if (!match) return;

      const replaceStart = cursorPos - match[0].length;
      const newRef = `[[${result.entity.type}:${result.entity.id}|${result.entity.title}]]`;
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
      <div className="relative w-full h-full">
        {/* Plain textarea - shows raw markdown */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={rows}
          className={`
            w-full h-full
            caret-foreground
            placeholder:text-muted-foreground
            focus:outline-none
            resize-y whitespace-pre-wrap break-words
            ${className}
          `}
          style={{
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: 'inherit',
            padding: 'inherit',
            color: 'var(--text-primary)',
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
            // No-op: Autocomplete closing is handled by the state machine in useEntityLinking
            // when onSelectResult is called. This prop is required by the interface but intentionally empty.
            onClose={() => {}}
          />
        )}
      </div>
    );
  }
);

EntityLinkTextarea.displayName = 'EntityLinkTextarea';
