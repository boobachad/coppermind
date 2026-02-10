import { useEffect, useState, useRef } from 'react';
import clsx from 'clsx';
import { useParams } from 'react-router-dom';
import { MessageBubble } from '../components/MessageBubble';
import { StickyNote } from '../components/StickyNote';
import { StickerLayer, StickerLayerRef } from '../components/StickerLayer';
import { SourceUrlsDisplay } from '../components/SourceUrlsDisplay';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { getDb } from '../lib/db';
import { setActiveNote } from '../lib/CaptureService';
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
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const { confirm } = useConfirmDialog();

  useEffect(() => {
    loadNote();
    loadStickyNotes();
    // Track this as the active note for capture
    if (id) {
      setActiveNote(id);
    }
    return () => setActiveNote(null);
  }, [id]);


  // Listen for capture events
  useEffect(() => {
    const handleUrlUpdate = (e: CustomEvent<{ noteId: string }>) => {
      console.log('[NotePage] Received note-urls-updated for:', e.detail.noteId, 'current id:', id);
      if (e.detail.noteId === id) loadNote();
    };
    const handleContentUpdate = (e: CustomEvent<{ noteId: string }>) => {
      console.log(`[NotePage] Received note-content-updated for: ${e.detail.noteId}, current id: ${id}`);
      if (e.detail.noteId === id) {
        console.log('[NotePage] Received notes-updated, reloading note');

        // Fetch and log current content for debugging
        getDb().then(db => {
          db.select<{ content: string }[]>('SELECT content FROM notes WHERE id = $1', [id])
            .then(result => {
              if (result && result.length > 0) {
                console.log(`[NotePage] Content in DB for note ${id}:`, result[0].content);
              } else {
                console.log(`[NotePage] No content found in DB for note ${id}`);
              }
            });
        });

        loadNote();
      }
    };
    const handleNotesUpdated = () => {
      console.log('[NotePage] Received notes-updated, reloading note');
      loadNote();
    };
    window.addEventListener('note-urls-updated', handleUrlUpdate as EventListener);
    window.addEventListener('note-content-updated', handleContentUpdate as EventListener);
    window.addEventListener('notes-updated', handleNotesUpdated);
    return () => {
      window.removeEventListener('note-urls-updated', handleUrlUpdate as EventListener);
      window.removeEventListener('note-content-updated', handleContentUpdate as EventListener);
      window.removeEventListener('notes-updated', handleNotesUpdated);
    };
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

        // Load source URLs
        try {
          const urlsStr = loadedNote.source_urls as string | undefined;
          const urls = JSON.parse(urlsStr || '[]');
          setSourceUrls(Array.isArray(urls) ? urls : []);
        } catch {
          setSourceUrls([]);
        }

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
    const confirmed = await confirm({
      title: 'Delete Sticky Note',
      description: 'Delete this sticky note?',
      confirmText: 'Delete',
      variant: 'destructive'
    });
    if (!confirmed) return;
    const db = await getDb();
    await db.execute('DELETE FROM sticky_notes WHERE id = $1', [stickyId]);
    setStickyNotes(prev => prev.filter(s => s.id !== stickyId));
  };

  const handleAddUrl = async (url: string) => {
    if (!id) return;
    const newUrls = [...sourceUrls, url];
    setSourceUrls(newUrls);
    const db = await getDb();
    await db.execute('UPDATE notes SET source_urls = $1, updated_at = $2 WHERE id = $3', [
      JSON.stringify(newUrls),
      Date.now(),
      id
    ]);
  };

  const handleRemoveUrl = async (url: string) => {
    if (!id) return;
    const newUrls = sourceUrls.filter(u => u !== url);
    setSourceUrls(newUrls);
    const db = await getDb();
    await db.execute('UPDATE notes SET source_urls = $1, updated_at = $2 WHERE id = $3', [
      JSON.stringify(newUrls),
      Date.now(),
      id
    ]);
  };

  // Stable handlers for messages using Ref
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const handleMessageUpdate = useRef((id: string, newContent: string) => {
    const currentMessages = messagesRef.current;
    const updated = currentMessages.map(m => m.id === id ? { ...m, content: newContent } : m);
    setMessages(updated);

    // Save logic
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveMessages(updated);
    }, 1000);
  }).current;

  const handleMessageDelete = useRef((id: string) => {
    const currentMessages = messagesRef.current;
    const updated = currentMessages.filter(m => m.id !== id);
    setMessages(updated);
    saveMessages(updated);
  }).current;


  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!note) {
    return <div className="flex items-center justify-center h-full">Note not found</div>;
  }

  return (
    <div className="h-full relative flex flex-col bg-themed-bg">
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto relative p-4 pb-48">
        <div className="max-w-3xl mx-auto w-full pt-12 relative animate-in fade-in duration-500">

          {/* Note Title Input */}
          <input
            type="text"
            value={note.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            className="w-full text-4xl font-bold bg-transparent border-none outline-none text-themed-text-primary placeholder-themed-text-secondary/50 mb-4 px-4"
          />

          {/* Meta Row */}
          <div className="flex items-center text-themed-text-secondary mb-8 text-sm gap-4 px-4">
            <SourceUrlsDisplay
              urls={sourceUrls}
              onAdd={handleAddUrl}
              onRemove={handleRemoveUrl}
            />
            <div className="flex-1"></div>
            <span className="text-xs opacity-60">
              {note.updated_at ? new Date(note.updated_at).toLocaleDateString() : ''}
            </span>
          </div>

          <StickerLayer ref={stickerLayerRef} noteId={note.id} />

          {/* Chat Messages */}
          <div className="space-y-6">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onUpdate={handleMessageUpdate}
                onDelete={handleMessageDelete}
              />
            ))}
            {/* Fallback for empty new notes */}
            {messages.length === 0 && (
              <div className="text-themed-text-secondary italic text-center p-4">Start writing...</div>
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
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-themed-bg via-themed-bg to-transparent pb-8 pt-12 px-4 z-40">
        <div className="max-w-5xl mx-auto relative cursor-text" onClick={() => inputRef.current?.focus()}>

          {/* Role Selection Tabs - Floating above input */}
          <div className="absolute -top-10 left-0 flex space-x-2">
            <button
              onClick={() => setInputRole('question')}
              className={clsx(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                inputRole === 'question'
                  ? "bg-themed-text-primary text-themed-bg"
                  : "bg-themed-surface text-themed-text-secondary hover:bg-themed-border"
              )}
            >
              Question
            </button>
            <button
              onClick={() => setInputRole('answer')}
              className={clsx(
                "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
                inputRole === 'answer'
                  ? "bg-themed-text-primary text-themed-bg"
                  : "bg-themed-surface text-themed-text-secondary hover:bg-themed-border"
              )}
            >
              Answer
            </button>
          </div>

          <div className={clsx(
            "bg-themed-surface rounded-2xl flex items-end p-2 transition-all shadow-sm ring-0 outline-none border-0",
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
              className="w-full bg-transparent border-none focus:ring-0 focus:outline-none resize-none max-h-[200px] min-h-[44px] py-3 px-3 text-themed-text-primary placeholder-themed-text-secondary shadow-none ring-0 outline-none"
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
              className={clsx(
                "mb-1 p-2 disabled:opacity-50 disabled:cursor-not-allowed text-themed-bg rounded-xl transition-colors shrink-0",
                "bg-themed-text-primary hover:opacity-90"
              )}
            >
              {/* Arrow Up Icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>
            </button>
          </div>
          <div className="text-center text-xs text-themed-text-secondary mt-2">
            Press Enter to send, Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  );
}
