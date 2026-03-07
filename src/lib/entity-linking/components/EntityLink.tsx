// ─── Entity Link Component ──────────────────────────────────────────
// Renders individual entity reference as styled, clickable link.
// Supports valid/invalid states, hover tooltips, and navigation.
// Uses semantic CSS for theme compatibility.

import { useNavigate } from 'react-router-dom';
import type { ParsedReference, EntityReference } from '../core/types';
import { navigateToEntity } from '../navigation/router';

/**
 * Entity link component props.
 */
export interface EntityLinkProps {
  /** Parsed reference data */
  reference: ParsedReference;
  /** Validated entity data (undefined if not yet validated) */
  entity?: EntityReference;
  /** Optional custom display text (overrides alias/title) */
  displayText?: string;
  /** Optional click handler (overrides default navigation) */
  onClick?: (ref: ParsedReference) => void;
  /** Optional className for additional styling */
  className?: string;
}

/**
 * Entity link component for rendering styled cross-references.
 * 
 * Features:
 * - Valid/invalid styling based on entity existence
 * - Hover tooltip with entity preview
 * - Click navigation to entity page/modal
 * - Alias text support
 * - Theme-aware semantic CSS
 * 
 * @param props - Component props
 * @returns Entity link JSX element
 * 
 * @example
 * ```tsx
 * <EntityLink
 *   reference={parsedRef}
 *   entity={validatedEntity}
 * />
 * ```
 * 
 * Styling:
 * - Valid link: text-primary underline cursor-pointer
 * - Invalid link: text-destructive line-through cursor-not-allowed
 * - Hover: text-primary/80 (valid only)
 * 
 * Performance: O(1) render time
 */
export function EntityLink({
  reference,
  entity,
  displayText,
  onClick,
  className = '',
}: EntityLinkProps) {
  const navigate = useNavigate();

  /**
   * Determines display text for link.
   * 
   * Priority:
   * 1. Custom displayText prop
   * 2. Alias from reference (if provided)
   * 3. Entity title (if validated)
   * 4. Identifier fallback
   * 
   * Note: showRawSyntax is removed - we always show the alias/title
   * The raw syntax is visible in the textarea underneath
   */
  const text = displayText 
    || reference.aliasText 
    || entity?.title 
    || reference.identifier;

  /**
   * Determines if link is valid.
   * 
   * Link is valid if:
   * - Entity is validated AND exists
   * - OR entity type is 'url' (always valid if format is correct)
   */
  const isValid = entity?.exists === true || reference.entityType === 'url';

  /**
   * Handles link click.
   * 
   * If custom onClick provided, uses that.
   * Otherwise, navigates to entity using router.
   * 
   * For invalid links, prevents navigation.
   */
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Don't navigate if invalid
    if (!isValid) return;

    // Use custom handler if provided
    if (onClick) {
      onClick(reference);
      return;
    }

    // Default navigation
    navigateToEntity(reference, { navigate });
  };

  /**
   * Builds tooltip text.
   * 
   * Shows:
   * - Entity type
   * - Identifier
   * - Preview (if available)
   * - "Not found" for invalid links
   */
  const tooltipText = isValid
    ? [
        `${reference.entityType}:${reference.identifier}`,
        entity?.preview && `Preview: ${entity.preview}`,
      ]
        .filter(Boolean)
        .join('\n')
    : `${reference.entityType}:${reference.identifier} (not found)`;

  /**
   * Determines CSS classes based on validity.
   * 
   * Valid: primary color, underline, pointer cursor, hover effect
   * Invalid: destructive color, line-through, not-allowed cursor
   */
  const linkClasses = isValid
    ? 'text-primary underline cursor-pointer hover:text-primary/80 pointer-events-auto'
    : 'text-destructive line-through cursor-not-allowed pointer-events-auto';

  return (
    <span
      className={`entity-link ${linkClasses} ${className}`}
      onClick={handleClick}
      title={tooltipText}
      data-entity-type={reference.entityType}
      data-entity-id={reference.identifier}
      data-valid={isValid}
    >
      {text}
    </span>
  );
}

