import { Editor } from './Editor';
import { Message } from '../lib/types';
import clsx from 'clsx';
import { useState, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmDialog } from './ConfirmDialog';

interface MessageBubbleProps {
    message: Message;
    onUpdate: (id: string, content: string) => void;
    onDelete: (id: string) => void;
}

export const MessageBubble = memo(function MessageBubble({ message, onUpdate, onDelete }: MessageBubbleProps) {
    const isQuestion = message.role === 'question';
    const [isFocused, setIsFocused] = useState(false);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
    const [draftContent, setDraftContent] = useState(message.content);
    const { confirm } = useConfirmDialog();

    // Reset draft content when opening focus mode
    const openFocusMode = () => {
        setDraftContent(message.content);
        setIsFocused(true);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
        setShowContextMenu(true);
    };

    // Global click listener to close context menu
    useEffect(() => {
        const closeMenu = () => setShowContextMenu(false);
        if (showContextMenu) {
            window.addEventListener('click', closeMenu);
        }
        return () => window.removeEventListener('click', closeMenu);
    }, [showContextMenu]);

    return (
        <>
            <div
                className={clsx(
                    "flex w-full mb-6",
                    isQuestion ? "justify-end" : "justify-start"
                )}
            >
                {/* Bubble */}
                <div
                    onContextMenu={handleContextMenu}
                    className={clsx(
                        "rounded-2xl px-5 py-3 shadow-md text-sm overflow-hidden max-w-[90%] inline-block backdrop-blur-md border",
                        isQuestion
                            ? "rounded-tr-sm"
                            : "rounded-tl-sm"
                    )}
                    style={{
                        backgroundColor: isQuestion ? 'var(--glass-bg-subtle)' : 'var(--glass-bg)',
                        borderColor: 'var(--glass-border)',
                        color: 'var(--text-primary)'
                    }}>
                    <Editor
                        content={message.content}
                        editable={false} // Read-only by default
                        className={clsx(
                            "prose-sm w-full !max-w-none focus:outline-none pointer-events-none", // pointer-events-none to prevent interaction
                            // Only apply prose-invert (white text) for Answer/Assistant bubbles
                            "dark:prose-invert",
                            // Ensure Question text remains dark even in dark mode (on white bg)
                            // We use !important and deep selectors to override global .ProseMirror styles
                            isQuestion
                                ? ""
                                : "",
                            "[&_p]:m-0 [&_p]:leading-normal"
                        )}
                    />
                </div>
            </div>

            {/* Context Menu */}
            {/* Context Menu */}
            {showContextMenu && createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[9999]"
                        onClick={() => setShowContextMenu(false)}
                        onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(false); }}
                    />
                    <div
                        className="fixed z-[9999] material-panel border-white/10 shadow-xl rounded-lg py-1 min-w-[120px]"
                        style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
                    >
                        <button
                            className="w-full text-left px-4 py-2 text-sm"
                            style={{ color: 'var(--text-primary)' }}
                            onClick={openFocusMode}
                        >
                            Edit Message
                        </button>
                        <button
                            className="w-full text-left px-4 py-2 text-sm text-red-400"
                            onClick={async () => {
                                setShowContextMenu(false);
                                const confirmed = await confirm({
                                    title: 'Delete Message',
                                    description: 'Delete this message? This cannot be undone.',
                                    confirmText: 'Delete',
                                    variant: 'destructive'
                                });
                                if (confirmed) {
                                    onDelete(message.id);
                                }
                            }}
                        >
                            Delete
                        </button>
                    </div>
                </>,
                document.body
            )}

            {isFocused && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="material-glass w-full max-w-3xl h-[80vh] rounded-xl flex flex-col overflow-hidden m-4 shadow-2xl">
                        <div className="flex items-center justify-between p-4 border-b border-(--glass-border) bg-(--glass-bg-subtle)">
                            <span className="font-semibold text-(--text-primary)">Wait, let me cook...</span>
                            <button
                                onClick={() => setIsFocused(false)}
                                className="p-2 hover:bg-(--glass-bg-subtle) rounded-lg transition-colors text-(--text-secondary) hover:text-(--text-primary)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-transparent">
                            <Editor
                                content={draftContent}
                                editable={true}
                                onChange={setDraftContent}
                                className="prose prose-sm max-w-none focus:outline-none min-h-full text-(--text-primary) [&_.ProseMirror]:text-(--text-primary) [&_p]:text-(--text-primary) [&_h1]:text-(--text-primary) [&_h2]:text-(--text-primary) [&_h3]:text-(--text-primary) [&_ul]:text-(--text-primary) [&_ol]:text-(--text-primary) [&_strong]:text-(--text-primary)"
                            />
                        </div>
                        <div className="p-4 border-t border-(--glass-border) bg-(--glass-bg-subtle)/30 flex justify-end gap-2">
                            <button
                                onClick={() => setIsFocused(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--glass-bg-subtle) transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    onUpdate(message.id, draftContent);
                                    setIsFocused(false);
                                }}
                                className="px-6 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg"
                                style={{
                                    backgroundColor: 'var(--text-primary)',
                                    color: 'var(--bg-base)'
                                }}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}, (prev, next) => {
    // Custom comparison to ensure strict equality check
    return (
        prev.message.id === next.message.id &&
        prev.message.content === next.message.content &&
        prev.message.role === next.message.role &&
        // Handlers are stable references, so strict equality is fine
        prev.onUpdate === next.onUpdate &&
        prev.onDelete === next.onDelete
    );
});
