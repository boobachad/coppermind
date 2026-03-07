import { MarkdownRenderer } from './MarkdownRenderer';
import { EntityLinkTextarea } from '@/lib/entity-linking/components/EntityLinkTextarea';
import { Message } from '../lib/types';
import clsx from 'clsx';
import { useState, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { useConfirmDialog } from './ConfirmDialog';

interface MessageBubbleProps {
    message: Message;
    onUpdate: (id: string, content: string) => void;
    onDelete: (id: string) => void;
    onMoveUp?: (id: string) => void;
    onMoveDown?: (id: string) => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, onUpdate, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: MessageBubbleProps) {
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
                    "flex w-full mb-6 group",
                    isQuestion ? "justify-end" : "justify-start"
                )}
            >
                {/* Move buttons for Answer (left side) */}
                {!isQuestion && (
                    <div className="flex flex-col items-center gap-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => onMoveUp?.(message.id)}
                            disabled={!canMoveUp}
                            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Move up"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                        </button>
                        <button
                            onClick={() => onMoveDown?.(message.id)}
                            disabled={!canMoveDown}
                            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Move down"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                    </div>
                )}

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
                    <MarkdownRenderer
                        content={message.content}
                        className="w-full"
                    />
                </div>

                {/* Move buttons for Question (right side) */}
                {isQuestion && (
                    <div className="flex flex-col items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => onMoveUp?.(message.id)}
                            disabled={!canMoveUp}
                            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Move up"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                        </button>
                        <button
                            onClick={() => onMoveDown?.(message.id)}
                            disabled={!canMoveDown}
                            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                            title="Move down"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {showContextMenu && createPortal(
                <>
                    <div
                        className="fixed inset-0 z-9999"
                        onClick={() => setShowContextMenu(false)}
                        onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(false); }}
                    />
                    <div
                        className="fixed z-9999 material-glass shadow-xl rounded-xl py-1 min-w-[120px]"
                        style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
                    >
                        {canMoveUp && onMoveUp && (
                            <button
                                className="w-full text-left px-4 py-2 text-sm hover:bg-(--glass-bg-subtle) transition-colors"
                                style={{ color: 'var(--text-primary)' }}
                                onClick={() => {
                                    setShowContextMenu(false);
                                    onMoveUp(message.id);
                                }}
                            >
                                Move Up
                            </button>
                        )}
                        {canMoveDown && onMoveDown && (
                            <button
                                className="w-full text-left px-4 py-2 text-sm hover:bg-(--glass-bg-subtle) transition-colors"
                                style={{ color: 'var(--text-primary)' }}
                                onClick={() => {
                                    setShowContextMenu(false);
                                    onMoveDown(message.id);
                                }}
                            >
                                Move Down
                            </button>
                        )}
                        <button
                            className="w-full text-left px-4 py-2 text-sm hover:bg-(--glass-bg-subtle) transition-colors"
                            style={{ color: 'var(--text-primary)' }}
                            onClick={openFocusMode}
                        >
                            Edit Message
                        </button>
                        <button
                            className="w-full text-left px-4 py-2 text-sm transition-colors"
                            style={{ color: 'var(--color-error)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-error-subtle)')}
                            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
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
                                className="p-2 hover:bg-(--glass-bg-subtle) rounded-lg transition-colors text-muted-foreground hover:text-(--text-primary)"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden bg-transparent">
                            <EntityLinkTextarea
                                value={draftContent}
                                onChange={setDraftContent}
                                rows={20}
                                className="w-full h-full resize-none border-0 focus:ring-0 p-6"
                                style={{
                                    backgroundColor: 'transparent',
                                    color: 'var(--text-primary)',
                                    fontFamily: 'inherit',
                                    fontSize: '0.875rem',
                                    lineHeight: '1.5',
                                    outline: 'none'
                                }}
                                placeholder="Edit your message..."
                            />
                        </div>
                        <div className="p-4 border-t border-(--glass-border) bg-(--glass-bg-subtle)/30 flex justify-end gap-2">
                            <button
                                onClick={() => setIsFocused(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-(--text-primary) hover:bg-(--glass-bg-subtle) transition-colors"
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
    return (
        prev.message.id === next.message.id &&
        prev.message.content === next.message.content &&
        prev.message.role === next.message.role &&
        prev.onUpdate === next.onUpdate &&
        prev.onDelete === next.onDelete &&
        prev.canMoveUp === next.canMoveUp &&
        prev.canMoveDown === next.canMoveDown &&
        prev.onMoveUp === next.onMoveUp &&
        prev.onMoveDown === next.onMoveDown
    );
});
