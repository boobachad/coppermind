import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownEditorProps {
  initialContent: string;
  onContentChange: (content: string) => void;
  readOnly?: boolean;
}

export default function MarkdownEditor({ initialContent, onContentChange, readOnly }: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    onContentChange(newContent);
  }, [onContentChange]);

  if (readOnly) {
    return (
      <div className="prose prose-sm max-w-none p-4 rounded-md border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
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
            activeTab === 'write' ? 'border-blue-500' : 'border-transparent'
          }`}
          style={{ color: activeTab === 'write' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          Write
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'preview' ? 'border-blue-500' : 'border-transparent'
          }`}
          style={{ color: activeTab === 'preview' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
        >
          Preview
        </button>
      </div>

      {/* Content */}
      {activeTab === 'write' ? (
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Write your reflection here... (Markdown supported)"
          className="w-full min-h-[300px] p-4 resize-y font-mono text-sm focus:outline-none"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}
        />
      ) : (
        <div className="prose prose-sm max-w-none p-4 min-h-[300px]" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
          {content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing to preview</p>
          )}
        </div>
      )}
    </div>
  );
}
