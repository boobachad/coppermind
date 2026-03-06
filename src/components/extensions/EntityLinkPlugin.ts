// ─── Entity Link Plugin for TipTap ──────────────────────────────────
// Extends AutolinkPlugin to detect and render entity cross-references.
// Provides real-time highlighting, validation, click navigation, and autocomplete.

import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node } from '@tiptap/pm/model';
import { invoke } from '@tauri-apps/api/core';
import { parseReferences } from '@/lib/entity-linking/core/parser';
import type { EntityType } from '@/lib/entity-linking/core/types';

/**
 * Entity link mark definition.
 * 
 * Renders cross-references as styled spans with click handlers.
 * Supports valid/invalid styling based on entity existence.
 */
export const EntityLink = Mark.create({
  name: 'entityLink',
  
  addOptions() {
    return {
      HTMLAttributes: {},
      validate: true,
    };
  },
  
  addAttributes() {
    return {
      entityType: {
        default: null,
        parseHTML: element => element.getAttribute('data-entity-type'),
        renderHTML: attributes => ({
          'data-entity-type': attributes.entityType,
        }),
      },
      identifier: {
        default: null,
        parseHTML: element => element.getAttribute('data-identifier'),
        renderHTML: attributes => ({
          'data-identifier': attributes.identifier,
        }),
      },
      subIdentifier: {
        default: null,
        parseHTML: element => element.getAttribute('data-sub-identifier'),
        renderHTML: attributes => 
          attributes.subIdentifier ? { 'data-sub-identifier': attributes.subIdentifier } : {},
      },
      aliasText: {
        default: null,
        parseHTML: element => element.getAttribute('data-alias'),
        renderHTML: attributes => 
          attributes.aliasText ? { 'data-alias': attributes.aliasText } : {},
      },
      exists: {
        default: true,
        parseHTML: element => element.getAttribute('data-exists') === 'true',
        renderHTML: attributes => ({
          'data-exists': attributes.exists,
        }),
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'span[data-entity-link]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    const isValid = HTMLAttributes['data-exists'] === 'true' || HTMLAttributes.exists === true;
    
    return [
      'span',
      mergeAttributes(
        { 'data-entity-link': '' },
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          class: isValid 
            ? 'text-primary underline cursor-pointer hover:text-primary/80 transition-colors' 
            : 'text-destructive line-through cursor-not-allowed',
        }
      ),
      0,
    ];
  },
  
  addProseMirrorPlugins() {
    return [
      // Decoration plugin for real-time highlighting
      new Plugin({
        key: new PluginKey('entityLinkDecorations'),
        
        state: {
          init(_, { doc }) {
            return findEntityLinks(doc);
          },
          apply(tr, oldState) {
            return tr.docChanged ? findEntityLinks(tr.doc) : oldState;
          },
        },
        
        props: {
          decorations(state) {
            return this.getState(state);
          },
          
          // Click handler for navigation
          handleClick(view, pos, event) {
            const { doc } = view.state;
            const $pos = doc.resolve(pos);
            const marks = $pos.marks();
            
            const entityLinkMark = marks.find(m => m.type.name === 'entityLink');
            
            if (entityLinkMark) {
              event.preventDefault();
              const attrs = entityLinkMark.attrs as {
                entityType: EntityType;
                identifier: string;
                subIdentifier?: string;
                exists: boolean;
              };
              handleEntityLinkClick(attrs);
              return true;
            }
            
            return false;
          },
        },
      }),
      
      // Auto-mark plugin to convert text patterns to entity links
      new Plugin({
        key: new PluginKey('entityLinkAutomark'),
        appendTransaction: (transactions, _oldState, newState) => {
          const docChanged = transactions.some(tr => tr.docChanged);
          if (!docChanged) return null;

          const { tr } = newState;
          const { schema } = newState;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            if (node.isText && node.text) {
              const refs = parseReferences(node.text);
              
              refs.forEach(ref => {
                const start = pos + ref.startIndex;
                const end = pos + ref.endIndex;

                // Check if this text already has an entity link mark
                const $start = newState.doc.resolve(start);
                const entityLinkMark = schema.marks.entityLink;
                const hasEntityLink = $start.marks().some(mark => mark.type === entityLinkMark);

                if (!hasEntityLink) {
                  tr.addMark(
                    start,
                    end,
                    schema.marks.entityLink.create({
                      entityType: ref.entityType,
                      identifier: ref.identifier,
                      subIdentifier: ref.subIdentifier,
                      aliasText: ref.aliasText,
                      exists: true, // Default to true, validation happens async
                    })
                  );
                  modified = true;
                }
              });
            }
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});

/**
 * Finds entity link patterns in document and creates decorations.
 * 
 * Decorations provide visual feedback without modifying document structure.
 * Used for real-time highlighting as user types.
 * 
 * @param doc - ProseMirror document node
 * @returns DecorationSet with entity link decorations
 * 
 * Complexity: O(n) where n = document text length
 */
function findEntityLinks(doc: Node): DecorationSet {
  const decorations: Decoration[] = [];
  
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    
    const text = node.text || '';
    const refs = parseReferences(text);
    
    for (const ref of refs) {
      decorations.push(
        Decoration.inline(
          pos + ref.startIndex,
          pos + ref.endIndex,
          {
            class: 'entity-link-decoration bg-accent/20 rounded px-0.5',
            'data-entity-type': ref.entityType,
            'data-identifier': ref.identifier,
          }
        )
      );
    }
  });
  
  return DecorationSet.create(doc, decorations);
}

/**
 * Handles click on entity link.
 * 
 * Navigates to target entity using navigation router.
 * Supports all entity types with appropriate navigation behavior.
 * 
 * Note: This is a simplified version for TipTap. Full navigation requires
 * React Router's navigate function and modal opener, which should be
 * provided via editor context or props.
 * 
 * @param attrs - Entity link mark attributes
 */
function handleEntityLinkClick(attrs: {
  entityType: EntityType;
  identifier: string;
  subIdentifier?: string;
  exists: boolean;
}): void {
  // Don't navigate if entity doesn't exist
  if (!attrs.exists) {
    console.warn('Cannot navigate to non-existent entity:', attrs);
    return;
  }
  
  // Simple navigation using window.location for now
  // TODO: Integrate with React Router navigate function
  const { entityType, identifier, subIdentifier } = attrs;
  
  switch (entityType) {
    case 'note':
      window.location.hash = `/notes/${identifier}`;
      break;
    case 'kb':
      window.location.hash = '/knowledge';
      break;
    case 'journal':
      window.location.hash = `/journal/${identifier}`;
      break;
    case 'goal':
      window.location.hash = '/pos/goals';
      break;
    case 'milestone':
      window.location.hash = '/milestones';
      break;
    case 'activity':
      window.location.hash = '/pos/grid';
      break;
    case 'grid':
      window.location.hash = `/pos/grid/${identifier}`;
      break;
    case 'ladder':
      window.location.hash = '/pos/ladder';
      break;
    case 'category':
      window.location.hash = '/pos/category';
      break;
    case 'sheets':
      window.location.hash = '/pos/sheets';
      break;
    case 'book':
      window.location.hash = '/pos/books';
      break;
    case 'retrospective':
      window.location.hash = '/retrospectives';
      break;
    case 'url':
      if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
        invoke('open_link', { url: identifier });
      }
      break;
    default:
      console.warn('Unknown entity type:', entityType);
  }
}

/**
 * Entity Link Plugin export.
 * 
 * Use this in TipTap editor configuration alongside AutolinkPlugin.
 * 
 * @example
 * ```tsx
 * const editor = useEditor({
 *   extensions: [
 *     StarterKit,
 *     AutolinkPlugin,
 *     EntityLinkPlugin,
 *     // ... other extensions
 *   ],
 * });
 * ```
 */
export const EntityLinkPlugin = EntityLink;

