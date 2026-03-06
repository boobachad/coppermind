// ─── Entity Link Input Component ───────────────────────────────────
// Wrapper for standard <input> with entity linking support.
// Preserves all native input behaviors (selection, undo/redo, accessibility).

import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { useEntityLinking } from '../hooks/useEntityLinking';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import type { AutocompleteResult } from '../core/types';

/**
 * Entity link input props.
 */
export interface EntityLinkInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Input value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Optional className for styling */
  className?: string;
}

/**
 * Input component with entity linking support.
 * 
 * Features:
 * - Real-time cross-reference detection
 * - Autocomplete suggestions
 * - Keyboard navigation
 * - Preserves native input behaviors
 * - Theme-aware semantic CSS
 * 
 * @example
 * ```tsx
 * <EntityLinkInput
 *   value={description}
 *   onChange={setDescription}
 *   placeholder="Type note:my-note to link..."
 *   className="w-full"
 * />
 * ```
 */
export const EntityLinkInput = forwardRef<HTMLInputElement, EntityLinkInputProps>(
  ({ value, onChange, className = '', ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);

    // Expose input ref to parent
    useImperativeHandle(ref, () => inputRef.current!);

    // Entity linking logic
    const {
      autocomplete,
      handleKeyDown: handleAutocompleteKeyDown,
    } = useEntityLinking(value, onChange, inputRef);

    /**
     * Handles autocomplete selection.
     * Inserts complete reference with alias at cursor position.
     */
    const onSelectResult = (result: AutocompleteResult) => {
      if (!inputRef.current) return;

      const cursorPos = inputRef.current.selectionStart || 0;
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
        if (inputRef.current) {
          const newCursorPos = replaceStart + newRef.length;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          inputRef.current.focus();
        }
      }, 0);
    };

    /**
     * Handles keyboard events for autocomplete navigation.
     */
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`
            w-full px-3 py-2 rounded-md
            bg-input border border-border
            text-foreground placeholder:text-muted-foreground
            focus:outline-none focus:ring-2 focus:ring-ring
            ${className}
          `}
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

EntityLinkInput.displayName = 'EntityLinkInput';
