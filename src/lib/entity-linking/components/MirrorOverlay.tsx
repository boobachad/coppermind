// ─── Mirror Overlay Component ───────────────────────────────────────
// Renders styled entity links in textarea using backdrop technique.
// Positions styled div behind transparent textarea to preserve native behaviors.
// Performance: Minimal overhead, synchronizes scroll in O(1).

import { useEffect, useRef, type RefObject } from 'react';
import type { ParsedReference, EntityReference } from '../core/types';
import { EntityLink } from './EntityLink';

/**
 * Mirror overlay props.
 */
export interface MirrorOverlayProps {
  /** Current textarea text content */
  text: string;
  /** Map of validated entity references */
  references: Map<string, EntityReference>;
  /** Array of parsed references from text */
  parsedRefs: ParsedReference[];
  /** Ref to the textarea element */
  textareaRef: RefObject<HTMLTextAreaElement>;
  /** Optional className for styling */
  className?: string;
}

/**
 * Mirror overlay component for rendering styled links in textarea.
 * 
 * Uses backdrop technique:
 * 1. Position styled div behind textarea
 * 2. Make textarea text transparent (but keep caret visible)
 * 3. Render styled content in backdrop div
 * 4. Synchronize scroll position
 * 
 * This preserves all native textarea behaviors:
 * - Selection
 * - Copy/paste
 * - Undo/redo
 * - Accessibility
 * - Touch interactions
 * 
 * @param props - Component props
 * @returns Mirror overlay JSX element
 * 
 * @example
 * ```tsx
 * <div className="relative">
 *   <MirrorOverlay
 *     text={value}
 *     references={validatedRefs}
 *     parsedRefs={parsedRefs}
 *     textareaRef={textareaRef}
 *   />
 *   <textarea
 *     ref={textareaRef}
 *     value={value}
 *     className="relative z-[2] bg-transparent text-transparent caret-foreground"
 *   />
 * </div>
 * ```
 * 
 * Performance:
 * - Scroll sync: O(1)
 * - Render: O(n) where n = number of references
 * - Memory: Minimal (single div + text nodes)
 */
export function MirrorOverlay({
  text,
  references,
  parsedRefs,
  textareaRef,
  className = '',
}: MirrorOverlayProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  /**
   * Synchronizes scroll position between textarea and mirror div.
   * 
   * Ensures styled links stay aligned with textarea text as user scrolls.
   * Complexity: O(1)
   */
  useEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;

    const syncScroll = () => {
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
    };

    // Initial sync
    syncScroll();

    // Sync on scroll
    textarea.addEventListener('scroll', syncScroll);
    return () => textarea.removeEventListener('scroll', syncScroll);
  }, [textareaRef]);

  /**
   * Renders text content with styled entity links.
   * 
   * Algorithm:
   * 1. Sort references by position
   * 2. Iterate through text, splitting at reference boundaries
   * 3. Render plain text segments as <span>
   * 4. Render references as <EntityLink> components
   * 
   * Complexity: O(n) where n = number of references
   * 
   * @returns Array of JSX elements (text spans + entity links)
   */
  const renderContent = () => {
    const segments: JSX.Element[] = [];
    let lastIndex = 0;

    // Sort references by start position for sequential rendering
    const sortedRefs = [...parsedRefs].sort((a, b) => a.startIndex - b.startIndex);

    for (const ref of sortedRefs) {
      // Render plain text before reference
      if (ref.startIndex > lastIndex) {
        segments.push(
          <span key={`text-${lastIndex}`}>
            {text.slice(lastIndex, ref.startIndex)}
          </span>
        );
      }

      // Render styled entity link
      const key = `${ref.entityType}:${ref.identifier}`;
      const entity = references.get(key);

      segments.push(
        <EntityLink
          key={`ref-${ref.startIndex}`}
          reference={ref}
          entity={entity}
        />
      );

      lastIndex = ref.endIndex;
    }

    // Render remaining text after last reference
    if (lastIndex < text.length) {
      segments.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex)}
        </span>
      );
    }

    return segments;
  };

  return (
    <div
      ref={mirrorRef}
      className={`
        absolute inset-0 overflow-hidden pointer-events-none
        whitespace-pre-wrap break-words z-[1]
        text-foreground
        ${className}
      `}
      style={{
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        padding: 'inherit',
        border: 'inherit',
      }}
      aria-hidden="true"
    >
      {renderContent()}
    </div>
  );
}

