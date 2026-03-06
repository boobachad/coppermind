// ─── Cross-Reference Parser ────────────────────────────────────────
// Extracts cross-reference patterns from text using regex.
// Performance: O(n) where n = text length, target <5ms for 10k chars.

import type { ParsedReference, EntityType } from './types'

// Regex pattern for cross-reference syntax
// Pattern: entity:identifier[:sub_identifier][|alias]
// Examples: note:my-note, grid:2024-03-06:slot-3, kb:item|Custom Title
const CROSS_REF_REGEX = /(\w+):([^:\s|]+)(?::([^:\s|]+))?(?:\|([^|\n]+))?/g;

/**
 * Parses cross-references from text.
 * 
 * Extracts all cross-reference patterns matching the syntax:
 * `entity:identifier[:sub_identifier][|alias]`
 * 
 * @param text - Text content to parse
 * @returns Array of parsed references with position information
 * 
 * @example
 * ```ts
 * const refs = parseReferences('See note:my-note and grid:2024-03-06:slot-3');
 * // Returns 2 ParsedReference objects
 * ```
 * 
 * Performance: O(n) where n = text length
 * Target: <5ms for 10,000 characters
 */
export function parseReferences(text: string): ParsedReference[] {
  const references: ParsedReference[] = [];
  const regex = new RegExp(CROSS_REF_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    references.push({
      entityType: match[1] as EntityType,
      identifier: match[2],
      subIdentifier: match[3] || undefined,
      aliasText: match[4] || undefined,
      startIndex: match.index,
      endIndex: regex.lastIndex,
      rawText: match[0],
    });
  }

  return references;
}

/**
 * Validates if a string is a valid entity type.
 * 
 * @param type - String to check
 * @returns True if valid EntityType
 */
export function isValidEntityType(type: string): type is EntityType {
  const validTypes: EntityType[] = [
    'note',
    'kb',
    'journal',
    'goal',
    'milestone',
    'activity',
    'grid',
    'ladder',
    'category',
    'sheets',
    'book',
    'retrospective',
    'url',
  ];
  
  return validTypes.includes(type as EntityType);
}
