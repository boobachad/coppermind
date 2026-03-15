import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { getDb } from '../lib/db';
import { EntityLinkTextarea } from '../lib/entity-linking/components/EntityLinkTextarea';

// ─── NoteTitleInput ──────────────────────────────────────────────

export function NoteTitleInput({ noteId, initialTitle }: { noteId: string; initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!isTypingRef.current) {
      setTitle(initialTitle);
    }
  }, [initialTitle]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isTypingRef.current = true;
    const val = e.target.value;
    setTitle(val);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const db = await getDb();
        await db.execute('UPDATE notes SET title = $1, updated_at = $2 WHERE id = $3', [
          val,
          Date.now(),
          noteId,
        ]);
        window.dispatchEvent(new Event('notes-updated'));
        isTypingRef.current = false;
      } catch (err) {
        console.error('Error updating title:', err);
        isTypingRef.current = false;
      }
    }, 1000);
  };

  return (
    <input
      type="text"
      value={title}
      onChange={handleChange}
      placeholder="Untitled"
      className="w-full text-4xl font-bold bg-transparent border-none outline-none mb-4 px-4"
      style={{ color: 'var(--text-primary)' }}
    />
  );
}

// ─── MessageInputArea ────────────────────────────────────────────

interface MessageInputAreaProps {
  onSendMessage: (role: 'question' | 'answer', content: string) => void;
  onAddSticky: (type: 'note' | 'postal' | 'check' | 'smile') => void;
}

export function MessageInputArea({ onSendMessage, onAddSticky }: MessageInputAreaProps) {
  const [inputValue, setInputValue] = useState('');
  const [inputRole, setInputRole] = useState<'question' | 'answer'>('question');
  const [showStickyMenu, setShowStickyMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputRole, inputValue);
      setInputValue('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    }
  };

  const handleStickySelect = (type: 'note' | 'postal' | 'check' | 'smile') => {
    onAddSticky(type);
    setShowStickyMenu(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 pb-8 pt-12 px-4 z-40" style={{
      background: 'linear-gradient(to top, var(--bg-base) 0%, transparent 100%)',
    }}>
      <div className="max-w-6xl mx-auto relative cursor-text" onClick={() => inputRef.current?.focus()}>

        {/* Role tabs */}
        <div className="absolute -top-10 left-0 flex space-x-2">
          {(['question', 'answer'] as const).map(role => (
            <button
              key={role}
              onClick={() => setInputRole(role)}
              className={clsx(
                'px-4 py-1.5 rounded-full text-xs font-semibold transition-all capitalize',
                inputRole === role ? 'shadow-lg' : 'material-glass-subtle',
              )}
              style={inputRole === role
                ? { backgroundColor: 'var(--text-primary)', color: 'var(--bg-base)' }
                : { color: 'var(--text-secondary)' }}
            >
              {role}
            </button>
          ))}
        </div>

        <div className="material-glass-subtle rounded-2xl flex items-end gap-2 p-2 transition-all ring-0 outline-none">
          <div className="flex-1 min-w-0">
            <EntityLinkTextarea
              ref={inputRef}
              value={inputValue}
              onChange={(newValue) => {
                setInputValue(newValue);
                if (inputRef.current) {
                  inputRef.current.style.height = 'auto';
                  inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={inputRole === 'question' ? 'Ask a question...' : 'Write an answer...'}
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none resize-none max-h-[200px] min-h-[44px] py-3 px-3 shadow-none ring-0 outline-none"
              style={{ color: 'var(--text-primary)' }}
              rows={1}
            />
          </div>

          {/* Sticky note dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStickyMenu(!showStickyMenu)}
              className="mb-1 p-2 rounded-xl transition-all shrink-0"
              style={{ backgroundColor: 'var(--color-accent-primary)', color: 'var(--bg-primary)' }}
              title="Add Sticky Note or Stamp"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
            </button>

            {showStickyMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowStickyMenu(false)} />
                <div className="absolute bottom-full right-0 mb-2 material-glass-subtle rounded-lg shadow-xl border p-2 z-20 min-w-[160px]" style={{ borderColor: 'var(--border-color)' }}>
                  <div className="space-y-1">
                    <button onClick={() => handleStickySelect('note')} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors" style={{ color: 'var(--text-primary)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/></svg>
                      Sticky Note
                    </button>
                    <div className="h-px my-1" style={{ backgroundColor: 'var(--border-primary)' }} />
                    <div className="text-xs px-3 py-1" style={{ color: 'var(--text-secondary)' }}>Stamps:</div>
                    <button onClick={() => handleStickySelect('postal')} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors" style={{ color: 'var(--color-error)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2"/><path d="M5 7 3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9l-2-2"/><path d="M9 7v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V7"/></svg>
                      Postal
                    </button>
                    <button onClick={() => handleStickySelect('check')} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors" style={{ color: 'var(--color-success)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      Approved
                    </button>
                    <button onClick={() => handleStickySelect('smile')} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors" style={{ color: 'var(--color-warning)' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/></svg>
                      Smile
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="mb-1 p-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shrink-0 shadow-md"
            style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-base)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
          </button>
        </div>
        <div className="text-center text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
