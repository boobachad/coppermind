import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { MessageBubble } from '../components/MessageBubble';
import { StickyNote } from '../components/StickyNote';
import { StickerLayer, StickerLayerRef } from '../components/StickerLayer';
import { SourceUrlsDisplay } from '../components/SourceUrlsDisplay';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { Loader } from '../components/Loader';
import { getDb } from '../lib/db';
import { setActiveNote } from '../lib/CaptureService';
import { Note, StickyNote as StickyNoteType, Message } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';
import { formatDateDDMMYYYY, getLocalDateString } from '../pos/lib/time';
import { softDelete } from '../lib/softDelete';
import { migrateTipTapToPlainText } from '../lib/tiptap-migration';
import { NoteTitleInput, MessageInputArea } from './NotePageComps';
import { extractUrls, detectUrlType } from '../lib/kb-utils';

export function NotePage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [stickyNotes, setStickyNotes] = useState<StickyNoteType[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickerLayerRef = useRef<StickerLayerRef>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const { confirm } = useConfirmDialog();

  useEffect(() => {
    loadNote();
    loadStickyNotes();
    if (id) {
      setActiveNote(id);
    }
    return () => setActiveNote(null);
  }, [id]);

  useEffect(() => {
    const handleUrlUpdate = (e: CustomEvent<{ noteId: string }>) => {
      if (e.detail.noteId === id) loadNote();
    };
    const handleContentUpdate = (e: CustomEvent<{ noteId: string }>) => {
      if (e.detail.noteId === id) loadNote();
    };
    const handleNotesUpdated = () => loadNote();
    const handleStickyNotesUpdated = () => loadStickyNotes();

    window.addEventListener('note-urls-updated', handleUrlUpdate as EventListener);
    window.addEventListener('note-content-updated', handleContentUpdate as EventListener);
    window.addEventListener('notes-updated', handleNotesUpdated);
    window.addEventListener('sticky-notes-updated', handleStickyNotesUpdated);

    return () => {
      window.removeEventListener('note-urls-updated', handleUrlUpdate as EventListener);
      window.removeEventListener('note-content-updated', handleContentUpdate as EventListener);
      window.removeEventListener('notes-updated', handleNotesUpdated);
      window.removeEventListener('sticky-notes-updated', handleStickyNotesUpdated);
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

        try {
          const urlsStr = loadedNote.source_urls as string | undefined;
          const urls = JSON.parse(urlsStr || '[]');
          setSourceUrls(Array.isArray(urls) ? urls : []);
        } catch {
          setSourceUrls([]);
        }

        try {
          const parsed = JSON.parse(loadedNote.content);
          if (Array.isArray(parsed)) {
            const validatedMessages = parsed.map((m: { id: string; role: string; content: string; created_at: number }) => ({
              ...m,
              content: migrateTipTapToPlainText(m.content),
              role: (m.role === 'user' || m.role === 'question' ? 'question' : 'answer') as 'question' | 'answer'
            }));
            setMessages(validatedMessages);
          } else {
            setMessages([]);
          }
        } catch {
          if (loadedNote.content) {
            const initialMsg: Message = {
              id: uuidv4(),
              role: 'answer',
              content: loadedNote.content,
              created_at: loadedNote.created_at
            };
            setMessages([initialMsg]);
          } else {
            setMessages([]);
          }
        }
      }
    } catch (err) {
      console.error('Error loading note:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStickyNotes = async () => {
    if (!id) return;
    try {
      const db = await getDb();
      const result = await db.select<StickyNoteType[]>(
        'SELECT * FROM sticky_notes WHERE note_id = $1 AND type = $2',
        [id, 'text']
      );
      setStickyNotes(result);
    } catch (err) {
      console.error('Error loading sticky notes:', err);
    }
  };

  const saveMessages = async (newMessages: Message[]) => {
    if (!id) return;
    try {
      const db = await getDb();
      const contentStr = JSON.stringify(newMessages);
      const now = Date.now();
      await db.execute('UPDATE notes SET content = $1, updated_at = $2 WHERE id = $3', [
        contentStr, now, id
      ]);
      window.dispatchEvent(new Event('notes-updated'));
      setNote(prev => prev ? { ...prev, content: contentStr, updated_at: now } : null);
    } catch (err) {
      console.error('Error saving messages:', err);
    }
  };

  const handleAddSticky = (type: 'note' | 'postal' | 'check' | 'smile') => {
    if (type === 'note') {
      const stickyId = uuidv4();
      const newSticky: StickyNoteType = {
        id: stickyId,
        note_id: id!,
        content: '',
        color: 'yellow',
        x: 100,
        y: 100,
        created_at: Date.now(),
        type: 'text',
        rotation: 0,
        scale: 1
      };
      setStickyNotes(prev => [...prev, newSticky]);
      getDb().then(db => {
        db.execute(
          'INSERT INTO sticky_notes (id, note_id, content, color, x, y, created_at, type, rotation, scale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [stickyId, id!, '', 'yellow', 100, 100, Date.now(), 'text', 0, 1]
        );
      });
    } else {
      stickerLayerRef.current?.addSticker(type);
    }
  };

  const handleSendMessage = (role: 'question' | 'answer', content: string) => {
    const newMsg: Message = {
      id: uuidv4(),
      role,
      content,
      created_at: Date.now()
    };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    saveMessages(updatedMessages);

    // Capture any URLs in the message to the daily KB item
    const detectedUrls = extractUrls(content);
    if (detectedUrls.length > 0 && id) {
      const today = getLocalDateString();
      invoke('capture_daily_urls', {
        date: today,
        urls: detectedUrls.map(url => ({
          url,
          urlType: detectUrlType(url),
          sourceType: 'note',
          sourceId: id,
          sourceTitle: note?.title || 'Untitled Note',
          sourceContext: 'content',
        })),
      }).catch(err => console.error('Failed to capture URLs from note:', err));
    }
  };

  const handleStickyReorder = (stickyId: string, direction: 'front' | 'back') => {
    setStickyNotes(prev => {
      const noteIndex = prev.findIndex(n => n.id === stickyId);
      if (noteIndex === -1) return prev;
      const stickyNote = prev[noteIndex];
      const newNotes = [...prev];
      newNotes.splice(noteIndex, 1);
      if (direction === 'front') {
        newNotes.push(stickyNote);
      } else {
        newNotes.unshift(stickyNote);
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
    await softDelete('sticky_notes', stickyId);
    setStickyNotes(prev => prev.filter(s => s.id !== stickyId));
  };

  const handleAddUrl = async (url: string) => {
    if (!id) return;
    const newUrls = [...sourceUrls, url];
    setSourceUrls(newUrls);
    const db = await getDb();
    await db.execute('UPDATE notes SET source_urls = $1, updated_at = $2 WHERE id = $3', [
      JSON.stringify(newUrls), Date.now(), id
    ]);
  };

  const handleRemoveUrl = async (url: string) => {
    if (!id) return;
    const newUrls = sourceUrls.filter(u => u !== url);
    setSourceUrls(newUrls);
    const db = await getDb();
    await db.execute('UPDATE notes SET source_urls = $1, updated_at = $2 WHERE id = $3', [
      JSON.stringify(newUrls), Date.now(), id
    ]);
  };

  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const saveMessagesRef = useRef(saveMessages);
  useEffect(() => { saveMessagesRef.current = saveMessages; }, [saveMessages]);

  const handleMessageUpdate = useCallback((msgId: string, newContent: string) => {
    const current = messagesRef.current;
    const updated = current.map(m => m.id === msgId ? { ...m, content: newContent } : m);
    setMessages(updated);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveMessagesRef.current(updated), 1000);
  }, []);

  const handleMessageDelete = useRef((msgId: string) => {
    const current = messagesRef.current;
    const updated = current.filter(m => m.id !== msgId);
    setMessages(updated);
    saveMessages(updated);
  }).current;

  const handleMessageMoveUp = useRef((msgId: string) => {
    const current = messagesRef.current;
    const index = current.findIndex(m => m.id === msgId);
    if (index <= 0) return;
    const updated = [...current];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setMessages(updated);
    saveMessages(updated);
  }).current;

  const handleMessageMoveDown = useRef((msgId: string) => {
    const current = messagesRef.current;
    const index = current.findIndex(m => m.id === msgId);
    if (index === -1 || index >= current.length - 1) return;
    const updated = [...current];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setMessages(updated);
    saveMessages(updated);
  }).current;

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader /></div>;
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
        Note not found
      </div>
    );
  }

  return (
    <div className="h-full relative flex flex-col bg-transparent">
      <div className="flex-1 overflow-y-auto relative p-4 pb-48 custom-scrollbar">
        <div className="max-w-6xl mx-auto w-full pt-12 relative animate-in fade-in duration-500">

          <NoteTitleInput noteId={note.id} initialTitle={note.title || ''} />

          <div className="flex items-center mb-8 text-sm gap-4 px-4" style={{ color: 'var(--text-secondary)' }}>
            <SourceUrlsDisplay
              urls={sourceUrls}
              onAdd={handleAddUrl}
              onRemove={handleRemoveUrl}
            />
            <div className="flex-1" />
            <span className="text-xs opacity-60">
              {note.updated_at ? formatDateDDMMYYYY(new Date(note.updated_at)) : ''}
            </span>
          </div>

          <StickerLayer ref={stickerLayerRef} noteId={note.id} />

          <div className="space-y-6">
            {messages.map((msg, index) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onUpdate={handleMessageUpdate}
                onDelete={handleMessageDelete}
                onMoveUp={handleMessageMoveUp}
                onMoveDown={handleMessageMoveDown}
                canMoveUp={index > 0}
                canMoveDown={index < messages.length - 1}
              />
            ))}
            {messages.length === 0 && (
              <div className="italic text-center p-4" style={{ color: 'var(--text-tertiary)' }}>
                Start writing...
              </div>
            )}
          </div>
        </div>

        {stickyNotes.map(sn => (
          <StickyNote
            key={sn.id}
            data={sn}
            onUpdate={updateSticky}
            onDelete={deleteSticky}
            onReorder={handleStickyReorder}
          />
        ))}
      </div>

      <MessageInputArea
        onSendMessage={handleSendMessage}
        onAddSticky={handleAddSticky}
      />
    </div>
  );
}
