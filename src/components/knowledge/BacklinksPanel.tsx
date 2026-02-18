import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link2, ArrowRight, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeItem, KnowledgeLink } from '@/pos/lib/types';
import { Button } from '@/components/ui/button';
import { generatePreview } from '@/lib/kb-utils';

interface BacklinksPanelProps {
    itemId: string;
    onItemClick?: (itemId: string) => void;
}

export function BacklinksPanel({ itemId, onItemClick }: BacklinksPanelProps) {
    const [incomingLinks, setIncomingLinks] = useState<KnowledgeItem[]>([]);
    const [outgoingLinks, setOutgoingLinks] = useState<KnowledgeItem[]>([]);
    const [loading, setLoading] = useState(true);

    const loadBacklinks = useCallback(async () => {
        setLoading(true);
        try {
            // Get all links for this item
            const links = await invoke<KnowledgeLink[]>('get_knowledge_links', { itemId });
            
            // Separate incoming and outgoing
            const incomingIds = links
                .filter(link => link.targetId === itemId)
                .map(link => link.sourceId);
            
            const outgoingIds = links
                .filter(link => link.sourceId === itemId)
                .map(link => link.targetId);
            
            // Fetch items for these IDs
            if (incomingIds.length > 0 || outgoingIds.length > 0) {
                const allItems = await invoke<KnowledgeItem[]>('get_knowledge_items', { filters: {} });
                
                setIncomingLinks(allItems.filter(item => incomingIds.includes(item.id)));
                setOutgoingLinks(allItems.filter(item => outgoingIds.includes(item.id)));
            } else {
                setIncomingLinks([]);
                setOutgoingLinks([]);
            }
        } catch (err) {
            toast.error('Failed to load backlinks', { description: String(err) });
        } finally {
            setLoading(false);
        }
    }, [itemId]);

    useEffect(() => {
        loadBacklinks();
    }, [itemId, loadBacklinks]);

    const handleRemoveLink = async () => {
        try {
            // Note: Delete link command to be implemented in next phase
            toast.info('Remove link functionality coming soon');
        } catch (err) {
            toast.error('Failed to remove link', { description: String(err) });
        }
    };

    const renderLinkItem = (item: KnowledgeItem, direction: 'incoming' | 'outgoing') => (
        <div
            key={item.id}
            className="group p-3 rounded transition-all hover:shadow-md cursor-pointer"
            style={{
                background: 'var(--glass-bg-subtle)',
                border: '1px solid var(--glass-border)',
            }}
            onClick={() => onItemClick?.(item.id)}
        >
            <div className="flex items-start gap-2">
                <div className="flex-shrink-0 mt-1">
                    {direction === 'incoming' ? (
                        <ArrowRight
                            className="w-4 h-4 rotate-180"
                            style={{ color: 'var(--color-accent-primary)' }}
                        />
                    ) : (
                        <ArrowRight
                            className="w-4 h-4"
                            style={{ color: 'var(--color-success)' }}
                        />
                    )}
                </div>
                
                <div className="flex-1 min-w-0">
                    <div
                        className="text-sm font-medium mb-1 truncate"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {item.itemType}
                    </div>
                    <div
                        className="text-xs line-clamp-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {generatePreview(item.content, 80)}
                    </div>
                </div>

                <Button
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveLink();
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-tertiary)',
                    }}
                >
                    <X className="w-3 h-3" />
                </Button>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div
                className="p-4 border-b"
                style={{
                    background: 'var(--glass-bg)',
                    borderColor: 'var(--glass-border)',
                }}
            >
                <div className="flex items-center justify-between mb-2">
                    <h3
                        className="text-lg font-semibold flex items-center gap-2"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <Link2 className="w-5 h-5" />
                        Backlinks
                    </h3>
                    <Button
                        size="sm"
                        onClick={() => toast.info('Add link UI coming soon')}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Link
                    </Button>
                </div>
                <div
                    className="text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                >
                    {incomingLinks.length + outgoingLinks.length} total links
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div
                        className="text-center py-8"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Loading...
                    </div>
                ) : (
                    <>
                        {/* Incoming Links */}
                        {incomingLinks.length > 0 && (
                            <div>
                                <div
                                    className="text-sm font-medium mb-2"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    Referenced by ({incomingLinks.length})
                                </div>
                                <div className="space-y-2">
                                    {incomingLinks.map(item => renderLinkItem(item, 'incoming'))}
                                </div>
                            </div>
                        )}

                        {/* Outgoing Links */}
                        {outgoingLinks.length > 0 && (
                            <div>
                                <div
                                    className="text-sm font-medium mb-2"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    References ({outgoingLinks.length})
                                </div>
                                <div className="space-y-2">
                                    {outgoingLinks.map(item => renderLinkItem(item, 'outgoing'))}
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {incomingLinks.length === 0 && outgoingLinks.length === 0 && (
                            <div
                                className="text-center py-8"
                                style={{ color: 'var(--text-tertiary)' }}
                            >
                                <Link2 className="w-12 h-12 mx-auto mb-2 opacity-30" />
                                <div className="text-sm">No links yet</div>
                                <div className="text-xs mt-1">
                                    Click "Add Link" to create connections
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
