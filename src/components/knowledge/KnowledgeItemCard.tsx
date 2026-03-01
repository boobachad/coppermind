import { ExternalLink, Edit2, Trash2, Archive, Calendar, Link as LinkIcon, FileText, Folder } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import type { KnowledgeItem } from '@/pos/lib/types';
import { generatePreview, extractDomain, detectUrlType, formatReviewDate } from '@/lib/kb-utils';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ConfirmDialog';

interface KnowledgeItemCardProps {
    item: KnowledgeItem;
    onEdit: (item: KnowledgeItem) => void;
    onDelete: (id: string) => void;
    onUpdateStatus: (id: string, status: string) => void;
}

export function KnowledgeItemCard({ item, onEdit, onDelete, onUpdateStatus }: KnowledgeItemCardProps) {
    const { confirm } = useConfirmDialog();
    
    const getTypeIcon = () => {
        switch (item.itemType) {
            case 'Link':
                return <LinkIcon className="w-4 h-4" />;
            case 'Problem':
                return <FileText className="w-4 h-4" />;
            case 'Quest':
                return <Folder className="w-4 h-4" />;
            default:
                return <FileText className="w-4 h-4" />;
        }
    };

    const getTypeColor = () => {
        // Detect URL type from content
        const urlType = hasUrl() ? detectUrlType(extractFirstUrl() || '') : null;
        
        switch (urlType) {
            case 'leetcode':
                return 'var(--pos-activity-coding-leetcode)';
            case 'codeforces':
                return 'var(--pos-activity-coding-codeforces)';
            case 'github':
                return 'var(--pos-activity-real-projects)';
            case 'docs':
                return 'var(--pos-activity-book)';
            default:
                return 'var(--color-accent-primary)';
        }
    };

    const getStatusColor = () => {
        switch (item.status) {
            case 'Inbox':
                return 'var(--text-tertiary)';
            case 'Planned':
                return 'var(--color-accent-primary)';
            case 'Completed':
                return 'var(--color-success)';
            case 'Archived':
                return 'var(--text-secondary)';
            default:
                return 'var(--text-tertiary)';
        }
    };

    const hasUrl = () => {
        // Check if content contains a URL
        const urlRegex = /https?:\/\/[^\s]+/g;
        return urlRegex.test(item.content);
    };

    const extractAllUrls = () => {
        const urlRegex = /https?:\/\/[^\s]+/g;
        return item.content.match(urlRegex) || [];
    };

    const extractFirstUrl = () => {
        const urls = extractAllUrls();
        return urls.length > 0 ? urls[0] : null;
    };

    const handleOpenLink = () => {
        const urls = extractAllUrls();
        if (urls.length === 0) return;

        // Open all URLs using Tauri command
        urls.forEach(url => {
            invoke('open_link', { url });
        });

        // If multiple URLs, show toast
        if (urls.length > 1) {
            console.log(`Opened ${urls.length} links`);
        }
    };

    const renderContentWithLinks = (content: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = content.split(urlRegex);
        
        return (
            <>
                {parts.map((part, index) => {
                    if (part.match(urlRegex)) {
                        return (
                            <span
                                key={index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    invoke('open_link', { url: part });
                                }}
                                style={{
                                    color: 'var(--color-accent-primary)',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                }}
                                className="hover:opacity-80"
                            >
                                [link]
                            </span>
                        );
                    }
                    return <span key={index}>{part}</span>;
                })}
            </>
        );
    };

    return (
        <div
            className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.002]"
            style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius)',
                backdropFilter: 'blur(12px)',
            }}
        >
            {/* Header */}
            <div className="p-4 border-b" style={{ borderColor: 'var(--glass-border)' }}>
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{
                                background: `${getTypeColor()}15`,
                                color: getTypeColor(),
                            }}
                        >
                            {getTypeIcon()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div
                                className="text-xs font-medium uppercase tracking-wider mb-0.5"
                                style={{ color: getTypeColor() }}
                            >
                                {item.itemType}
                            </div>
                            {hasUrl() && (
                                <div
                                    className="text-xs truncate"
                                    style={{ color: 'var(--text-tertiary)' }}
                                >
                                    {extractDomain(extractFirstUrl() || '')}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Status Badge */}
                    <div
                        className="flex-shrink-0 px-2 py-1 rounded text-xs font-medium"
                        style={{
                            background: `${getStatusColor()}15`,
                            color: getStatusColor(),
                        }}
                    >
                        {item.status}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-4">
                {/* Preview with clickable links */}
                <div
                    className="text-sm mb-3 line-clamp-3"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {renderContentWithLinks(item.content)}
                </div>

                {/* Metadata */}
                {item.metadata && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {item.metadata.title && (
                            <div
                                className="text-xs px-2 py-1 rounded"
                                style={{
                                    background: 'var(--glass-bg-subtle)',
                                    color: 'var(--text-tertiary)',
                                }}
                            >
                                {String(item.metadata.title)}
                            </div>
                        )}
                        {item.metadata.tags && Array.isArray(item.metadata.tags) && (
                            <>
                                {item.metadata.tags.slice(0, 3).map((tag, idx) => (
                                    <div
                                        key={idx}
                                        className="text-xs px-2 py-1 rounded"
                                        style={{
                                            background: 'var(--color-accent-primary)15',
                                            color: 'var(--color-accent-primary)',
                                        }}
                                    >
                                        {String(tag)}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* Review Date */}
                {item.nextReviewDate && (
                    <div
                        className="flex items-center gap-2 text-xs mb-3"
                        style={{ color: 'var(--text-tertiary)' }}
                    >
                        <Calendar className="w-3 h-3" />
                        <span>{formatReviewDate(item.nextReviewDate)}</span>
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {hasUrl() && (
                        <Button
                            size="sm"
                            onClick={handleOpenLink}
                            className="flex items-center gap-1"
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <ExternalLink className="w-3 h-3" />
                            Open {extractAllUrls().length > 1 && `(${extractAllUrls().length})`}
                        </Button>
                    )}
                    
                    <Button
                        size="sm"
                        onClick={() => onEdit(item)}
                        className="flex items-center gap-1"
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        <Edit2 className="w-3 h-3" />
                        Edit
                    </Button>

                    {item.status !== 'Archived' && (
                        <Button
                            size="sm"
                            onClick={() => onUpdateStatus(item.id, 'Archived')}
                            className="flex items-center gap-1"
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <Archive className="w-3 h-3" />
                        </Button>
                    )}

                    <Button
                        size="sm"
                        onClick={async () => {
                            const confirmed = await confirm({
                                title: 'Delete Knowledge Item',
                                description: 'Delete this item? This cannot be undone.',
                                confirmText: 'Delete',
                                cancelText: 'Cancel',
                                variant: 'destructive',
                            });
                            if (confirmed) {
                                onDelete(item.id);
                            }
                        }}
                        className="flex items-center gap-1 ml-auto"
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--color-error)',
                        }}
                    >
                        <Trash2 className="w-3 h-3" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
