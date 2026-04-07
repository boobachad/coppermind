// ─── Markdown Renderer Component ───────────────────────────────────
// Renders markdown with custom entity link support.
// Parses [[entity:id|alias]] syntax and renders as clickable links.
// O(n) complexity for parsing and rendering.

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseReferences } from '@/lib/entity-linking/core/parser';
import { batchValidate } from '@/lib/entity-linking/core/validator';
import { useEntityCache } from '@/lib/entity-linking/hooks/useEntityCache';
import { EntityLink } from '@/lib/entity-linking/components/EntityLink';
import { open } from '@tauri-apps/plugin-shell';
import type { Components } from 'react-markdown';
import type { EntityReference } from '@/lib/entity-linking/core/types';

interface MarkdownRendererProps {
  /** Markdown content with entity links */
  content: string;
  /** Optional className for styling */
  className?: string;
}

/**
 * Markdown renderer with entity link support.
 * 
 * Features:
 * - Standard markdown rendering (GFM support)
 * - Entity link parsing and rendering
 * - Clickable entity references
 * - Theme-aware semantic CSS
 * 
 * Entity link syntax: [[entity:id|alias]]
 * - Shows alias text in read-only mode
 * - Clickable navigation to entity
 * - Valid/invalid styling
 * 
 * @param props - Component props
 * @returns Rendered markdown JSX
 * 
 * Performance: O(n) where n = content length
 */
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const { cache, status } = useEntityCache();
  const [validatedRefs, setValidatedRefs] = useState<Map<string, EntityReference>>(new Map());

  // Parse and validate entity references
  useEffect(() => {
    if (status !== 'ready') return;

    const refs = parseReferences(content);
    if (refs.length > 0) {
      batchValidate(refs, cache).then(setValidatedRefs);
    } else {
      setValidatedRefs(new Map());
    }
  }, [content, cache, status]);

  /**
   * Custom text renderer that handles entity links.
   * 
   * Replaces [[entity:id|alias]] with EntityLink components.
   * Preserves normal text rendering for non-entity content.
   */
  const components: Components = {
    p: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <p>{processedChildren}</p>;
    },
    h1: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <h1>{processedChildren}</h1>;
    },
    h2: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <h2>{processedChildren}</h2>;
    },
    h3: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <h3>{processedChildren}</h3>;
    },
    h4: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <h4>{processedChildren}</h4>;
    },
    h5: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <h5>{processedChildren}</h5>;
    },
    h6: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <h6>{processedChildren}</h6>;
    },
    li: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <li>{processedChildren}</li>;
    },
    blockquote: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <blockquote>{processedChildren}</blockquote>;
    },
    strong: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <strong>{processedChildren}</strong>;
    },
    em: ({ children }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return <em>{processedChildren}</em>;
    },
    a: ({ href, children, ...props }) => {
      const processedChildren = processTextWithEntityLinks(children);
      return (
        <a 
          href={href} 
          {...props} 
          onClick={(e) => {
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
              e.preventDefault();
              open(href).catch(err => console.error("Failed to open URL:", err));
            }
          }}
          target="_blank"
          rel="noopener noreferrer"
        >
          {processedChildren}
        </a>
      );
    },
  };

  /**
   * Processes text content to replace entity link syntax with EntityLink components.
   * 
   * Algorithm:
   * 1. Find all entity references in text
   * 2. Split text into segments (plain text + entity links)
   * 3. Render EntityLink components for references
   * 4. Preserve plain text segments
   * 
   * Complexity: O(n) where n = text length
   */
  function processTextWithEntityLinks(children: React.ReactNode): React.ReactNode {
    if (typeof children !== 'string') {
      return children;
    }

    const text = children;
    const refs = parseReferences(text);

    if (refs.length === 0) {
      return text;
    }

    const segments: React.ReactNode[] = [];
    let lastIndex = 0;

    // Sort references by position
    const sortedRefs = [...refs].sort((a, b) => a.startIndex - b.startIndex);

    for (const ref of sortedRefs) {
      // Add plain text before reference
      if (ref.startIndex > lastIndex) {
        segments.push(text.slice(lastIndex, ref.startIndex));
      }

      // Add entity link component (read-only mode: show alias)
      const key = `${ref.entityType}:${ref.identifier}`;
      const entity = validatedRefs.get(key);

      segments.push(
        <EntityLink
          key={`ref-${ref.startIndex}`}
          reference={ref}
          entity={entity}
        />
      );

      lastIndex = ref.endIndex;
    }

    // Add remaining text after last reference
    if (lastIndex < text.length) {
      segments.push(text.slice(lastIndex));
    }

    return segments;
  }

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
