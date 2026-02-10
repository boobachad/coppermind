import { Editor } from './Editor';
import { Message } from '../lib/types';
import clsx from 'clsx';
import { useState, useEffect, memo } from 'react';
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
                        "rounded-2xl px-5 py-3 shadow-sm text-sm overflow-hidden max-w-[90%] inline-block", // inline-block for content sizing
                        isQuestion
                            ? "bg-themed-surface border border-themed-border rounded-tr-sm"
                            : "bg-transparent border border-themed-border rounded-tl-sm"
                    )}>
                    <Editor
                        content={message.content}
                        editable={false} // Read-only by default
                        className={clsx(
                            "prose-sm w-full !max-w-none focus:outline-none pointer-events-none", // pointer-events-none to prevent interaction
                            // Only apply prose-invert (white text) for Answer/Assistant bubbles
                            !isQuestion && "dark:prose-invert",
                            // Ensure Question text remains dark even in dark mode (on white bg)
                            // We use !important and deep selectors to override global .ProseMirror styles
                            isQuestion
                                ? "text-themed-text-primary"
                                : "text-themed-text-primary",
                            "[&_p]:m-0 [&_p]:leading-normal"
                        )}
                    />
                </div>
            </div>

            {/* Context Menu */}
            {showContextMenu && (
                <div
                    className="fixed z-50 bg-themed-surface border border-themed-border shadow-lg rounded-lg py-1 min-w-[120px]"
                    style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
                >
                    <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-themed-bg text-themed-text-primary"
                        onClick={openFocusMode}
                    >
                        Edit Message
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 text-sm hover:bg-themed-bg text-red-600 dark:text-red-400"
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
            )}

            {isFocused && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-themed-surface w-full max-w-3xl h-[80vh] rounded-xl shadow-2xl flex flex-col overflow-hidden m-4">
                        <div className="flex items-center justify-between p-4 border-b border-themed-border">
                            <span className="font-semibold text-themed-text-primary">Wait, let me cook...</span>
                            <button
                                onClick={() => setIsFocused(false)}
                                className="p-1 hover:bg-themed-bg rounded-md"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-8">
                            <Editor
                                content={draftContent}
                                editable={true}
                                onChange={setDraftContent}
                                className="prose dark:prose-invert max-w-none focus:outline-none min-h-full px-8 py-4"
                            />
                        </div>
                        <div className="p-4 border-t border-themed-border bg-themed-bg/50 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    onUpdate(message.id, draftContent);
                                    setIsFocused(false);
                                }}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
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
