// ─── Navigation Router ──────────────────────────────────────────────────
// Handles click events and routes to appropriate entity pages/modals.
// Supports all 15 entity types + external URLs.

import { invoke } from '@tauri-apps/api/core';
import type { NavigateFunction } from 'react-router-dom';
import type { ParsedReference } from '../core/types';

/**
 * Modal opener function type.
 * Used to open modals for grid slots, ladder problems, category problems.
 */
export type ModalOpener = (modalType: string, props: Record<string, any>) => void;

/**
 * Navigation options for entity linking.
 */
export interface NavigationOptions {
  navigate: NavigateFunction;
  openModal?: ModalOpener;
}

/**
 * Navigates to an entity based on parsed reference.
 * 
 * Handles all 15 entity types + external URLs:
 * - note, kb, journal, goal, milestone, activity
 * - grid (page + slot), ladder (page + problem)
 * - category (page + problem), sheets, book, retrospective
 * - url (external links)
 * 
 * @param ref - Parsed reference containing entity type and identifiers
 * @param options - Navigation options (navigate function, modal opener)
 * 
 * @example
 * ```ts
 * navigateToEntity(
 *   { entityType: 'note', identifier: 'my-note', ... },
 *   { navigate, openModal }
 * );
 * ```
 */
export function navigateToEntity(
  ref: ParsedReference,
  options: NavigationOptions
): void {
  const { navigate, openModal } = options;
  const { entityType, identifier, subIdentifier } = ref;

  switch (entityType) {
    case 'note':
      // Navigate to note detail page
      navigate(`/notes/${identifier}`);
      break;

    case 'kb':
      // Navigate to knowledge base with highlighted item
      navigate('/knowledge', { state: { highlightItemId: identifier } });
      break;

    case 'journal':
      // Navigate to journal entry page (identifier = YYYY-MM-DD)
      navigate(`/journal/${identifier}`);
      break;

    case 'goal':
      // Navigate to unified goals page with highlighted goal
      navigate('/pos/goals', { state: { highlightGoalId: identifier } });
      break;

    case 'milestone':
      // Navigate to milestones page with highlighted milestone
      navigate('/milestones', { state: { highlightMilestoneId: identifier } });
      break;

    case 'activity':
      // Navigate to grid page for activity's date
      // Backend resolves activity ID to date
      invoke<{ date: string }>('get_activity_date', { activityId: identifier })
        .then(({ date }) => navigate(`/pos/grid/${date}`))
        .catch((error) => {
          console.error(`Failed to resolve activity ${identifier}:`, error);
          // Fallback: navigate to today's grid
          const today = new Date().toISOString().split('T')[0];
          navigate(`/pos/grid/${today}`);
        });
      break;

    case 'grid':
      if (subIdentifier && subIdentifier.startsWith('slot-')) {
        // Open SlotPopup modal for specific slot
        const slotIndex = parseInt(subIdentifier.replace('slot-', ''), 10);
        if (openModal) {
          openModal('SlotPopup', { date: identifier, slotIndex });
        } else {
          console.warn('Modal opener not provided for grid slot navigation');
          // Fallback: navigate to grid page
          navigate(`/pos/grid/${identifier}`);
        }
      } else {
        // Navigate to grid page for date
        navigate(`/pos/grid/${identifier}`);
      }
      break;

    case 'ladder':
      if (subIdentifier) {
        // Open ladder problem modal
        if (openModal) {
          openModal('LadderProblemModal', {
            ladderId: identifier,
            problemName: subIdentifier,
          });
        } else {
          console.warn('Modal opener not provided for ladder problem navigation');
          // Fallback: navigate to ladder page
          navigate(`/cf/ladders/${identifier}`);
        }
      } else {
        // Navigate to ladder page
        navigate(`/cf/ladders/${identifier}`);
      }
      break;

    case 'category':
      if (subIdentifier) {
        // Open category problem modal
        if (openModal) {
          openModal('CategoryProblemModal', {
            categoryId: identifier,
            problemName: subIdentifier,
          });
        } else {
          console.warn('Modal opener not provided for category problem navigation');
          // Fallback: navigate to category page
          navigate(`/cf/categories/${identifier}`);
        }
      } else {
        // Navigate to category page
        navigate(`/cf/categories/${identifier}`);
      }
      break;

    case 'sheets':
      // Navigate to sheets page and scroll to problem
      const problemId = subIdentifier || identifier;
      navigate('/pos/sheets', {
        state: { scrollToProblem: problemId },
      });
      break;

    case 'book':
      // Navigate to book detail page
      navigate(`/pos/books/${identifier}`);
      break;

    case 'retrospective':
      // Navigate to retrospectives page with highlighted retro
      navigate('/retrospectives', {
        state: { highlightRetroId: identifier },
      });
      break;

    case 'url':
      // Open external URL in default browser
      invoke('open_link', { url: identifier })
        .catch((error) => {
          console.error(`Failed to open URL ${identifier}:`, error);
        });
      break;

    default:
      console.warn(`Unknown entity type: ${entityType}`);
  }
}

/**
 * Checks if an entity type requires modal opening.
 * 
 * @param entityType - Entity type to check
 * @param hasSubIdentifier - Whether reference has sub-identifier
 * @returns True if entity requires modal
 */
export function requiresModal(
  entityType: string,
  hasSubIdentifier: boolean
): boolean {
  if (!hasSubIdentifier) return false;

  return (
    (entityType === 'grid' && hasSubIdentifier) ||
    (entityType === 'ladder' && hasSubIdentifier) ||
    (entityType === 'category' && hasSubIdentifier)
  );
}

/**
 * Gets the navigation path for an entity reference.
 * 
 * Returns null for entities that require modals or external URLs.
 * 
 * @param ref - Parsed reference
 * @returns Navigation path or null
 */
export function getNavigationPath(ref: ParsedReference): string | null {
  const { entityType, identifier, subIdentifier } = ref;

  // External URLs don't have paths
  if (entityType === 'url') return null;

  // Entities with sub-identifiers that require modals
  if (requiresModal(entityType, !!subIdentifier)) return null;

  switch (entityType) {
    case 'note':
      return `/notes/${identifier}`;
    case 'kb':
      return '/knowledge';
    case 'journal':
      return `/journal/${identifier}`;
    case 'goal':
      return '/pos/goals';
    case 'milestone':
      return '/milestones';
    case 'activity':
      return null; // Requires backend resolution
    case 'grid':
      return `/pos/grid/${identifier}`;
    case 'ladder':
      return `/cf/ladders/${identifier}`;
    case 'category':
      return `/cf/categories/${identifier}`;
    case 'sheets':
      return '/pos/sheets';
    case 'book':
      return `/pos/books/${identifier}`;
    case 'retrospective':
      return '/retrospectives';
    default:
      return null;
  }
}

/**
 * Checks if an entity type is external (opens in browser).
 * 
 * @param entityType - Entity type to check
 * @returns True if entity opens externally
 */
export function isExternalEntity(entityType: string): boolean {
  return entityType === 'url';
}

/**
 * Gets a human-readable label for an entity type.
 * 
 * @param entityType - Entity type
 * @returns Display label
 */
export function getEntityTypeLabel(entityType: string): string {
  const labels: Record<string, string> = {
    note: 'Note',
    kb: 'Knowledge Base',
    journal: 'Journal',
    goal: 'Goal',
    milestone: 'Milestone',
    activity: 'Activity',
    grid: 'Grid',
    ladder: 'Ladder',
    category: 'Category',
    sheets: 'Sheets',
    book: 'Book',
    retrospective: 'Retrospective',
    url: 'External Link',
  };

  return labels[entityType] || entityType;
}
