import { ExternalLink, Edit2, Trash2, Archive, Calendar, Link as LinkIcon, FileText, Folder } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import type { KnowledgeItem } from '@/pos/lib/types';
import { extractDomain, detectUrlType, formatReviewDate } from '@/lib/kb-utils';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ConfirmDialog';

interface KnowledgeItemCardProps {
    item: KnowledgeItem;
    onEdit: (item: KnowledgeItem) => void;
    onDelete: (id: string) => void;
    onUpdateStatus: (id: string, status: string) => void;
    isHighlighted?: boolean;
}

export function KnowledgeItemCard({ item, onEdit, onDelete, onUpdateStatus, isHighlighted }: KnowledgeItemCardProps) {
    const { confirm } = useConfirmDialog();
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isHighlighted && cardRef.current) {
            cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isHighlighted]);
    
    const getTypeIcon = () => {
        // Use first tag to determine icon
        const firstTag = item.tags[0]?.toLowerCase() || '';
        if (firstTag.includes('link') || firstTag.includes('website')) {
            return <LinkIcon className="w-4 h-4" />;
        }
        if (firstTag.includes('problem') || firstTag.includes('coding')) {
            return <FileText className="w-4 h-4" />;
        }
        if (firstTag.includes('quest') || firstTag.includes('project')) {
            return <Folder className="w-4 h-4" />;
        }
        return <FileText className="w-4 h-4" />;
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

    const isDailyCapture = item.tags.includes('daily-capture');
    const dailyCaptureUrls = isDailyCapture && item.metadata?.urls 
        ? (Array.isArray(item.metadata.urls) ? item.metadata.urls : [])
        : [];

    const renderDailyCaptureContent = () => {
        if (!isDailyCapture || dailyCaptureUrls.length === 0) return null;

        return (
            <div className="space-y-2">
                {dailyCaptureUrls.map((urlData: any, idx: number) => {
                    // Support both old shape (activity_title) and new shape (source_title/source_type)
                    const sourceLabel = urlData.source_title || urlData.activity_title || 'Unknown';
                    const sourceType = urlData.source_type || 'activity';
                    const sourceContext = urlData.source_context || urlData.detected_in || '';

                    return (
                        <div
                            key={idx}
                            className="p-2 rounded-lg border"
                            style={{
                                background: 'var(--glass-bg-subtle)',
                                borderColor: 'var(--glass-border)',
                            }}
                        >
                            <div className="flex items-start gap-2">
                                <div className="flex-1 min-w-0">
                                    <div
                                        onClick={() => invoke('open_link', { url: urlData.url })}
                                        className="text-sm font-medium truncate cursor-pointer hover:opacity-80"
                                        style={{ color: 'var(--color-accent-primary)' }}
                                    >
                                        {urlData.url}
                                    </div>
                                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                        {sourceType} · {sourceLabel}{sourceContext ? ` (${sourceContext})` : ''}
                                    </div>
                                    {urlData.url_type && urlData.url_type !== 'generic' && urlData.url_type !== 'other' && (
                                        <div
                                            className="text-xs mt-1 inline-block px-1.5 py-0.5 rounded"
                                            style={{
                                                background: `${getTypeColor()}15`,
                                                color: getTypeColor(),
                                            }}
                                        >
                                            {urlData.url_type}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => invoke('open_link', { url: urlData.url })}
                                    className="flex-shrink-0 p-1 rounded hover:bg-secondary"
                                >
                                    <ExternalLink className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div
            ref={cardRef}
            className={`group relative overflow-hidden transition-all duration-300 hover:shadow-lg ${
                isHighlighted ? 'animate-blink-border' : ''
            }`}
            style={{
                background: 'var(--glass-bg)',
                border: isHighlighted ? '2px solid var(--color-accent-primary)' : '1px solid var(--glass-border)',
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
                            {/* Display all tags as badges with wrapping */}
                            <div className="flex flex-wrap gap-1 mb-1">
                                {item.tags.map((tag, idx) => (
                                    <div
                                        key={idx}
                                        className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded whitespace-nowrap"
                                        style={{
                                            background: `${getTypeColor()}15`,
                                            color: getTypeColor(),
                                        }}
                                    >
                                        {tag}
                                    </div>
                                ))}
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
                {/* Daily Capture Special Rendering */}
                {isDailyCapture ? (
                    <>
                        <div className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                            {dailyCaptureUrls.length} link{dailyCaptureUrls.length !== 1 ? 's' : ''} captured
                        </div>
                        {renderDailyCaptureContent()}
                    </>
                ) : (
                    <>
                        {/* Preview with clickable links */}
                        <div
                            className="text-sm mb-3"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {renderContentWithLinks(item.content)}
                        </div>
                    </>
                )}

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
                    {isDailyCapture && dailyCaptureUrls.length > 0 ? (
                        <Button
                            size="sm"
                            onClick={() => {
                                dailyCaptureUrls.forEach((urlData: any) => {
                                    invoke('open_link', { url: urlData.url });
                                });
                            }}
                            className="flex items-center gap-1"
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <ExternalLink className="w-3 h-3" />
                            Open All ({dailyCaptureUrls.length})
                        </Button>
                    ) : hasUrl() && (
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
