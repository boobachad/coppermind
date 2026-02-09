import { useEffect, useState, useRef } from 'react';
import clsx from 'clsx';
import { useParams } from 'react-router-dom';
import { MessageBubble } from '../components/MessageBubble';
import { StickyNote } from '../components/StickyNote';
import { StickerLayer, StickerLayerRef } from '../components/StickerLayer';
import { getDb } from '../lib/db';
import { Note, StickyNote as StickyNoteType, Message } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  // const navigate = useNavigate(); // Unused
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [stickyNotes, setStickyNotes] = useState<StickyNoteType[]>([]);
  const saveTimeoutRef = useRef<any>(null);
  const stickerLayerRef = useRef<StickerLayerRef>(null);

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [inputRole, setInputRole] = useState<'question' | 'answer'>('question');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadNote();
    loadStickyNotes();
  }, [id]);

  const loadNote = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const db = await getDb();
      const result = await db.select<Note[]>('SELECT * FROM notes WHERE id = $1', [id]);
      if (result.length > 0) {
        const loadedNote = result[0];
        setNote(loadedNote);

        // Load messages from content
        try {
          const parsed = JSON.parse(loadedNote.content);

          if (Array.isArray(parsed)) {
            // Ensure robust handling of roles if data comes from external sources
            const validatedMessages = parsed.map((m: any) => ({
              ...m,
              // Normalize roles: 'user' -> 'question', 'assistant' -> 'answer'
              role: (m.role === 'user' || m.role === 'question') ? 'question' : 'answer'
            }));
            setMessages(validatedMessages);
          } else {
            // Handle legacy/empty content
            setMessages([]);
          }
        } catch {
          // Fallback for non-JSON content (legacy plain text)
          if (loadedNote.content) {
            const initialMsg: Message = {
              id: uuidv4(),
              role: 'answer',
              content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: loadedNote.content }] }] }),
              created_at: loadedNote.created_at
            };
            setMessages([initialMsg]);
          } else {
            setMessages([]);
          }
        }
      }
    } catch (err) {
      console.error("Error loading note:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadStickyNotes = async () => {
    if (!id) return;
    try {
      const db = await getDb();
      const result = await db.select<StickyNoteType[]>('SELECT * FROM sticky_notes WHERE note_id = $1', [id]);
      setStickyNotes(result);
    } catch (err) {
      console.error("Error loading sticky notes:", err);
    }
  };

  const saveMessages = async (newMessages: Message[]) => {
    if (!id) return;
    try {
      const db = await getDb();
      const contentStr = JSON.stringify(newMessages);
      const now = Date.now();
      await db.execute('UPDATE notes SET content = $1, updated_at = $2 WHERE id = $3', [
        contentStr,
        now,
        id
      ]);
      window.dispatchEvent(new Event('notes-updated'));
      setNote(prev => prev ? { ...prev, content: contentStr, updated_at: now } : null);
    } catch (err) {
      console.error("Error saving messages:", err);
    }
  };

  const handleTitleChange = async (newTitle: string) => {
    if (!note) return;
    try {
      const db = await getDb();
      await db.execute('UPDATE notes SET title = $1, updated_at = $2 WHERE id = $3', [
        newTitle,
        Date.now(),
        note.id
      ]);
      setNote(prev => prev ? { ...prev, title: newTitle } : null);
      window.dispatchEvent(new Event('notes-updated'));
    } catch (err) {
      console.error("Error updating title:", err);
    }
  };

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      const newUserMsg: Message = {
        id: uuidv4(),
        role: inputRole,
        content: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: inputValue }] }] }),
        created_at: Date.now()
      };

      const updatedMessages = [...messages, newUserMsg];
      setMessages(updatedMessages);
      saveMessages(updatedMessages);

      setInputValue('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    }
  };

  const handleStickyReorder = (id: string, direction: 'front' | 'back') => {
    setStickyNotes(prev => {
      const noteIndex = prev.findIndex(n => n.id === id);
      if (noteIndex === -1) return prev;

      const note = prev[noteIndex];
      const newNotes = [...prev];
      newNotes.splice(noteIndex, 1);

      if (direction === 'front') {
        newNotes.push(note);
      } else {
        newNotes.unshift(note);
      }

      return newNotes;
    });
  };

  const updateSticky = async (stickyId: string, updates: Partial<StickyNoteType>) => {
    const db = await getDb();
    const current = stickyNotes.find(s => s.id === stickyId);
    if (!current) return;

    const updated = { ...current, ...updates };
    setStickyNotes(prev => prev.map(s => s.id === stickyId ? updated : s));

    if (updates.x !== undefined || updates.y !== undefined) {
      await db.execute('UPDATE sticky_notes SET x = $1, y = $2 WHERE id = $3', [updated.x, updated.y, stickyId]);
    }
    if (updates.content !== undefined) {
      await db.execute('UPDATE sticky_notes SET content = $1 WHERE id = $2', [updated.content, stickyId]);
    }
    if (updates.color !== undefined) {
      await db.execute('UPDATE sticky_notes SET color = $1 WHERE id = $2', [updated.color, stickyId]);
    }
  };

  const deleteSticky = async (stickyId: string) => {
    if (!confirm("Delete sticky note?")) return;
    const db = await getDb();
    await db.execute('DELETE FROM sticky_notes WHERE id = $1', [stickyId]);
    setStickyNotes(prev => prev.filter(s => s.id !== stickyId));
  };


  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!note) {
    return <div className="flex items-center justify-center h-full">Note not found</div>;
  }

  return (
    <div className="h-full relative flex flex-col bg-white dark:bg-dark-bg">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto relative p-4 pb-48">
        <div className="max-w-3xl mx-auto w-full pt-12 relative animate-in fade-in duration-500">

          {/* Note Title Input */}
          <input
            type="text"
            value={note.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            className="w-full text-4xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-dark-text-muted mb-4 px-4"
          />

          {/* Meta Row */}
          <div className="flex items-center text-gray-400 dark:text-dark-text-secondary mb-8 text-sm gap-4 px-4">
            <div className="flex items-center gap-2 hover:text-gray-600 dark:hover:text-dark-text-primary cursor-pointer transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              <span className="truncate max-w-xs">Link to resource...</span>
            </div>
            <div className="flex-1"></div>
            <span className="text-xs opacity-60">
              {new Date(note.updated_at).toLocaleDateString()}
            </span>
          </div>

          <StickerLayer ref={stickerLayerRef} noteId={note.id} />

          {/* Chat Messages */}
          <div className="space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onUpdate={(newContent) => {
                  const updated = messages.map(m => m.id === msg.id ? { ...m, content: newContent } : m);
                  setMessages(updated);
                  // For simplicity, we trigger save on every update (debouncing logic handled in Editor usually, but here we just save)
                  // Ideally we debounce this.
                  if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
                  saveTimeoutRef.current = setTimeout(() => {
                    saveMessages(updated);
                  }, 1000);
                }}
                onDelete={() => {
                  const updated = messages.filter(m => m.id !== msg.id);
                  setMessages(updated);
                  saveMessages(updated);
                }}
              />
            ))}
            {/* Fallback for empty new notes */}
            {messages.length === 0 && (
              <div className="text-gray-400 italic text-center p-4">Start writing...</div>
            )}
          </div>
        </div>

        {/* Sticky Notes Overlay */}
        {stickyNotes.filter(sn => sn.type !== 'stamp').map(sn => (
          <StickyNote
            key={sn.id}
            data={sn}
            onUpdate={updateSticky}
            onDelete={deleteSticky}
            onReorder={handleStickyReorder}
          />
        ))}
      </div>

      {/* Input Pill Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent dark:from-dark-bg dark:via-dark-bg pb-8 pt-12 px-4 z-40">
        <div className="max-w-3xl mx-auto relative cursor-text" onClick={() => inputRef.current?.focus()}>

          {/* Role Selection Tabs - Floating above input */}
          <div className="absolute -top-10 left-0 flex space-x-2">
            <button
              onClick={() => setInputRole('question')}
              className={clsx(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                inputRole === 'question'
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-gray-200 dark:bg-dark-surface text-gray-500 hover:bg-gray-300 dark:hover:bg-dark-border"
              )}
            >
              Question
            </button>
            <button
              onClick={() => setInputRole('answer')}
              className={clsx(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                inputRole === 'answer'
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-gray-200 dark:bg-dark-surface text-gray-500 hover:bg-gray-300 dark:hover:bg-dark-border"
              )}
            >
              Answer
            </button>
          </div>

          <div className={clsx(
            "bg-white dark:bg-dark-surface rounded-2xl flex items-end p-2 transition-all shadow-sm ring-0 outline-none border-0",
          )}>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                // Auto-grow
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={inputRole === 'question' ? "Ask a question..." : "Write an answer..."}
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none resize-none max-h-[200px] min-h-[44px] py-3 px-3 text-gray-900 dark:text-dark-text-primary placeholder-gray-400 dark:placeholder-gray-500 shadow-none ring-0 outline-none"
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
              className={clsx(
                "mb-1 p-2 disabled:bg-gray-300 dark:disabled:bg-dark-border disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0",
                "bg-black hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
              )}
            >
              {/* Arrow Up Icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
            </button>
          </div>
          <div className="text-center text-xs text-gray-400 dark:text-dark-text-secondary mt-2">
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
}
