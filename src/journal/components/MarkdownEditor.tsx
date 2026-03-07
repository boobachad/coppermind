import { useState, useCallback } from 'react';
import { EntityLinkTextarea } from '@/lib/entity-linking/components/EntityLinkTextarea';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

interface MarkdownEditorProps {
  initialContent: string;
  onContentChange: (content: string) => void;
  readOnly?: boolean;
}

export default function MarkdownEditor({ initialContent, onContentChange, readOnly }: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  const handleChange = useCallback((newContent: string) => {
    setContent(newContent);
    onContentChange(newContent);
  }, [onContentChange]);

  if (readOnly) {
    return (
      <div className="prose prose-sm max-w-none p-4 rounded-md border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
        <MarkdownRenderer content={content} />
      </div>
    );
  }

  return (
    <div className="border rounded-md" style={{ borderColor: 'var(--border-color)' }}>
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
        <button
          onClick={() => setActiveTab('write')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'write' ? '' : 'border-transparent'
          }`}
          style={{ 
            color: activeTab === 'write' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottomColor: activeTab === 'write' ? 'var(--color-accent-primary)' : 'transparent'
          }}
        >
          Write
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'preview' ? '' : 'border-transparent'
          }`}
          style={{ 
            color: activeTab === 'preview' ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottomColor: activeTab === 'preview' ? 'var(--color-accent-primary)' : 'transparent'
          }}
        >
          Preview
        </button>
      </div>

      {/* Content */}
      {activeTab === 'write' ? (
        <div>
          <EntityLinkTextarea
            value={content}
            onChange={handleChange}
            placeholder="Write your reflection here... (Markdown supported) Type [[note:my-note]] to link"
            className="w-full min-h-[300px] p-4 resize-y font-mono text-sm focus:outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
            }}
            rows={12}
          />
          <p className="text-xs italic text-muted-foreground px-4 pb-2">
            Use [[entity:identifier]] syntax to link (e.g., [[note:my-note]], [[kb:item-id]], [[goal:name]])
          </p>
        </div>
      ) : (
        <div className="prose prose-sm max-w-none p-4 min-h-[300px]" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
          {content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing to preview</p>
          )}
        </div>
      )}
    </div>
  );
}
