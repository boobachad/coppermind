import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { getDb } from './db';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

interface CapturePayload {
    role: 'question' | 'answer';
    content: string;
}

// URL detection regex - matches http, https, non-protocol domains like google.com
const URL_REGEX = /^(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/i;

// Track active note and listeners
let activeNoteId: string | null = null;
let unlistenFn: UnlistenFn | null = null;
let isInitialized = false;

/**
 * Determines if content is a URL
 */
function isUrl(content: string): boolean {
    return URL_REGEX.test(content.trim());
}

// Lock to prevent concurrent creation
let isCreatingNote = false;

// Deduplication state
let lastCaptureTimestamp: number = 0;
let lastCapturedContent: string = '';
let lastCapturedRole: string = '';

/**
 * Get the target note ID for captured content
 * Priority: 1) Current active note, 2) Last viewed note, 3) Create new note
 */
async function getTargetNoteId(): Promise<string> {
    // Wait if we are currently creating a note
    while (isCreatingNote) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 1. Check if we have an active note
    if (activeNoteId) {
        console.log(`[CaptureService] Using active note: ${activeNoteId}`);
        return activeNoteId;
    }

    // 2. Fallback to last active note from localStorage
    const lastActive = localStorage.getItem('last_active_note');
    if (lastActive) {
        // Verify the note still exists
        const db = await getDb();
        const result = await db.select<{ id: string }[]>('SELECT id FROM notes WHERE id = $1', [lastActive]);
        if (result.length > 0) {
            console.log(`[CaptureService] Using last active note from localStorage: ${lastActive}`);
            activeNoteId = lastActive; // Cache it
            return lastActive;
        }
    }

    // 3. Create new note
    try {
        isCreatingNote = true;

        // Double check after acquiring lock in case it was set while waiting
        if (activeNoteId) return activeNoteId;

        console.log('[CaptureService] No active note found, creating new one...');
        return await createNewNote('Captured Notes');
    } finally {
        isCreatingNote = false;
    }
}

/**
 * Creates a new note and returns its ID
 */
async function createNewNote(title: string): Promise<string> {
    const id = uuidv4();
    const now = Date.now();
    const db = await getDb();

    await db.execute(
        'INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)',
        [id, title, JSON.stringify([]), now, now]
    );

    // Set as active note so subsequent captures go to same note
    activeNoteId = id;
    localStorage.setItem('last_active_note', id);

    window.dispatchEvent(new Event('notes-updated'));
    console.log(`[CaptureService] Created new note: ${id}`);
    return id;
}

/**
 * Add a message to a note
 */
async function addMessageToNote(noteId: string, role: 'question' | 'answer', content: string): Promise<void> {
    const db = await getDb();

    // Load existing messages
    const result = await db.select<{ content: string }[]>('SELECT content FROM notes WHERE id = $1', [noteId]);
    if (result.length === 0) return;

    let messages: any[] = [];
    try {
        messages = JSON.parse(result[0].content);
        if (!Array.isArray(messages)) messages = [];
    } catch {
        messages = [];
    }

    // Create new message
    const newMessage = {
        id: uuidv4(),
        role,
        content: JSON.stringify({
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }]
        }),
        created_at: Date.now()
    };

    messages.push(newMessage);

    // Save
    const now = Date.now();
    await db.execute('UPDATE notes SET content = $1, updated_at = $2 WHERE id = $3', [
        JSON.stringify(messages),
        now,
        noteId
    ]);

    window.dispatchEvent(new CustomEvent('note-content-updated', { detail: { noteId } }));
    window.dispatchEvent(new Event('notes-updated')); // Refresh sidebar
    console.log(`[CaptureService] Added ${role} to note ${noteId}`);
    toast.success(`Captured ${role}`, { description: 'Added to note' });
}

/**
 * Add a URL to a note's source_urls
 */
async function addUrlToNote(noteId: string, url: string): Promise<void> {
    const db = await getDb();

    // Load existing URLs
    const result = await db.select<{ source_urls: string }[]>('SELECT source_urls FROM notes WHERE id = $1', [noteId]);
    if (result.length === 0) return;

    let urls: string[] = [];
    try {
        urls = JSON.parse(result[0].source_urls || '[]');
        if (!Array.isArray(urls)) urls = [];
    } catch {
        urls = [];
    }

    // Avoid duplicates
    if (!urls.includes(url)) {
        urls.push(url);
    }

    // Save
    const now = Date.now();
    await db.execute('UPDATE notes SET source_urls = $1, updated_at = $2 WHERE id = $3', [
        JSON.stringify(urls),
        now,
        noteId
    ]);

    window.dispatchEvent(new CustomEvent('note-urls-updated', { detail: { noteId } }));
    console.log(`[CaptureService] Added URL to note ${noteId}: ${url}`);
    toast.success('Captured URL', { description: url });
}

/**
 * Handle captured content from Tauri backend
 */
async function handleCapture(payload: CapturePayload): Promise<void> {
    const { role, content } = payload;
    const trimmedContent = content.trim();

    if (!trimmedContent) {
        console.log('[CaptureService] Empty content, ignoring');
        return;
    }

    // Deduplication: Only ignore if same content AND same role (same double-shift)
    // This allows: left-shift (question) -> right-shift (answer) with same content
    if (lastCapturedContent === trimmedContent && lastCapturedRole === role) {
        console.log('[CaptureService] Ignoring duplicate: same content + same role');
        toast.info('Duplicate capture ignored');
        return;
    }

    // Deduplicate rapid events (debounce within 1 second)
    const now = Date.now();
    if (
        lastCaptureTimestamp &&
        now - lastCaptureTimestamp < 1000 &&
        lastCapturedContent === trimmedContent &&
        lastCapturedRole === role
    ) {
        console.log('[CaptureService] Ignoring duplicate capture event (debounced)');
        return;
    }

    // Update duplication state
    lastCaptureTimestamp = now;
    lastCapturedContent = trimmedContent;
    lastCapturedRole = role;

    const noteId = await getTargetNoteId();

    const isUrlContent = isUrl(trimmedContent);
    console.log(`[CaptureService] Detecting type for: "${trimmedContent}"`);
    console.log(`[CaptureService] Is URL? ${isUrlContent} (Regex: ${URL_REGEX.source})`);

    if (isUrlContent) {
        // It's a URL - add to source_urls
        console.log(`[CaptureService] Capturing URL: "${trimmedContent}"`);
        await addUrlToNote(noteId, trimmedContent);
    } else {
        // It's text - add as message
        console.log(`[CaptureService] Capturing ${role}: "${trimmedContent}"`);
        await addMessageToNote(noteId, role, trimmedContent);
    }
}

/**
 * Set the currently active note
 */
export function setActiveNote(noteId: string | null): void {
    activeNoteId = noteId;
    if (noteId) {
        localStorage.setItem('last_active_note', noteId);
    }
}

/**
 * Initialize the capture service
 */
export async function initCaptureService(): Promise<void> {
    if (isInitialized) return;

    // Check if we're in Tauri environment
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
        console.log('[CaptureService] Not in Tauri environment, skipping initialization');
        return;
    }

    try {
        unlistenFn = await listen<CapturePayload>('capture-content', (event) => {
            console.log('[CaptureService] Received capture event:', event.payload);
            handleCapture(event.payload);
        });

        isInitialized = true;
        console.log('[CaptureService] Initialized - listening for double-shift captures');
    } catch (err) {
        console.error('[CaptureService] Failed to initialize:', err);
    }
}

/**
 * Cleanup the capture service
 */
export function cleanupCaptureService(): void {
    if (unlistenFn) {
        unlistenFn();
        unlistenFn = null;
    }
    isInitialized = false;
}
