// ─── TipTap Migration Utilities ────────────────────────────────────
// Utilities for migrating legacy TipTap JSON content to plain text.
// Used during note loading to ensure backward compatibility.

/**
 * Helper to extract text from TipTap document object.
 * Handles already-parsed TipTap document structures.
 */
function extractTextFromDoc(doc: any): string {
  if (!doc || typeof doc !== 'object') {
    return '';
  }

  // Verify it's a TipTap document structure
  if (doc.type !== 'doc' || !Array.isArray(doc.content)) {
    return '';
  }

  // Extract text from all block nodes recursively
  const extractTextFromNode = (node: any): string => {
    // Handle text nodes
    if (node.type === 'text') {
      return node.text || '';
    }
    
    // Handle hard breaks
    if (node.type === 'hardBreak') {
      return '\n';
    }
    
    // Handle inline nodes with content
    if (node.content && Array.isArray(node.content)) {
      const childText = node.content.map(extractTextFromNode).join('');
      
      // Add block-level formatting
      switch (node.type) {
        case 'heading':
          return childText;
        case 'codeBlock':
          return childText;
        case 'blockquote':
          return childText;
        case 'listItem':
          return childText;
        case 'bulletList':
        case 'orderedList':
          return node.content.map(extractTextFromNode).join('\n');
        default:
          return childText;
      }
    }
    
    return '';
  };

  // Extract text from all top-level block nodes
  const plainText = doc.content
    .map(extractTextFromNode)
    .filter((text: string) => text.length > 0)
    .join('\n');

  return plainText;
}

/**
 * Extracts plain text from TipTap JSON document structure.
 * 
 * TipTap stores content as nested JSON with structure:
 * ```json
 * {
 *   "type": "doc",
 *   "content": [
 *     {
 *       "type": "paragraph",
 *       "content": [
 *         { "type": "text", "text": "Hello world" }
 *       ]
 *     }
 *   ]
 * }
 * ```
 * 
 * This function flattens it to: "Hello world"
 * 
 * @param content - Message content (string, object, or primitive)
 * @returns Plain text extracted from TipTap JSON, or original content if not JSON
 * 
 * @example
 * ```ts
 * const tiptapJson = '{"type":"doc","content":[{"type":"paragraph","content":[{"text":"Hello"}]}]}';
 * const plain = migrateTipTapToPlainText(tiptapJson);
 * // Returns: "Hello"
 * ```
 */
export function migrateTipTapToPlainText(content: any): string {
  // Handle primitives (number, boolean, null, undefined)
  if (content === null || content === undefined) {
    return '';
  }
  
  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }

  // Handle already-parsed TipTap document objects
  if (typeof content === 'object' && !Array.isArray(content)) {
    const extracted = extractTextFromDoc(content);
    if (extracted) {
      return extracted;
    }
    // If not a valid TipTap doc, stringify as fallback
    return String(content);
  }

  // Handle arrays (shouldn't happen but fallback)
  if (Array.isArray(content)) {
    return String(content);
  }

  // Handle strings - try to parse as JSON
  if (typeof content !== 'string') {
    return String(content);
  }

  // Check if content looks like JSON (starts with '{')
  if (!content.trim().startsWith('{')) {
    return content;
  }

  try {
    const contentObj = JSON.parse(content);
    const extracted = extractTextFromDoc(contentObj);
    return extracted || content;
  } catch {
    // If parsing fails, return original content
    return content;
  }
}
