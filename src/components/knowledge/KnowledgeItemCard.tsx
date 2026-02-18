import { ExternalLink, Edit2, Trash2, Archive, Calendar, Link as LinkIcon, FileText, Folder } from 'lucide-react';
import type { KnowledgeItem } from '@/pos/lib/types';
import { generatePreview, extractDomain, detectUrlType, formatReviewDate } from '@/lib/kb-utils';
import { Button } from '@/components/ui/button';

interface KnowledgeItemCardProps {
    item: KnowledgeItem;
    onEdit: (item: KnowledgeItem) => void;
    onDelete: (id: string) => void;
    onUpdateStatus: (id: string, status: string) => void;
}

export function KnowledgeItemCard({ item, onEdit, onDelete, onUpdateStatus }: KnowledgeItemCardProps) {
    const getTypeIcon = () => {
        switch (item.itemType) {
            case 'Link':
                return <LinkIcon className="w-4 h-4" />;
            case 'Problem':
                return <FileText className="w-4 h-4" />;
            case 'Collection':
                return <Folder className="w-4 h-4" />;
            default:
                return <FileText className="w-4 h-4" />;
        }
    };

    const getTypeColor = () => {
        const urlType = item.itemType === 'Link' ? detectUrlType(item.content) : null;
        
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

    const handleOpenLink = () => {
        if (item.itemType === 'Link') {
            window.open(item.content, '_blank');
        }
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
                            {item.itemType === 'Link' && (
                                <div
                                    className="text-xs truncate"
                                    style={{ color: 'var(--text-tertiary)' }}
                                >
                                    {extractDomain(item.content)}
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
                {/* Preview */}
                <div
                    className="text-sm mb-3 line-clamp-3"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {generatePreview(item.content, 120)}
                </div>

                {/* Metadata */}
                {item.metadata && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {typeof item.metadata.title === 'string' && (
                            <div
                                className="text-xs px-2 py-1 rounded"
                                style={{
                                    background: 'var(--glass-bg-subtle)',
                                    color: 'var(--text-tertiary)',
                                }}
                            >
                                {item.metadata.title}
                            </div>
                        )}
                        {Array.isArray(item.metadata.tags) && (
                            <>
                                {item.metadata.tags.slice(0, 3).map((tag, idx) => {
                                    if (typeof tag !== 'string') return null;
                                    return (
                                        <div
                                            key={idx}
                                            className="text-xs px-2 py-1 rounded"
                                            style={{
                                                background: 'var(--color-accent-primary)15',
                                                color: 'var(--color-accent-primary)',
                                            }}
                                        >
                                            {tag}
                                        </div>
                                    );
                                })}
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
                    {item.itemType === 'Link' && (
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
                            Open
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
                        onClick={() => {
                            if (confirm('Delete this item?')) {
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

            {/* Hover Overlay - using semantic variable */}
            <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{
                    background: 'linear-gradient(135deg, var(--glass-bg-subtle) 0%, transparent 100%)',
                }}
            />
        </div>
    );
}
