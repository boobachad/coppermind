import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Link2, ArrowRight, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeItem, KnowledgeLink } from '@/pos/lib/types';
import { Button } from '@/components/ui/button';
import { generatePreview } from '@/lib/kb-utils';

interface BacklinksPanelProps {
    itemId: string;
    onItemClick?: (item: KnowledgeItem) => void;
}

export function BacklinksPanel({ itemId, onItemClick }: BacklinksPanelProps) {
    const [incomingLinks, setIncomingLinks] = useState<KnowledgeItem[]>([]);
    const [outgoingLinks, setOutgoingLinks] = useState<KnowledgeItem[]>([]);
    const [rawLinks, setRawLinks] = useState<KnowledgeLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [targetId, setTargetId] = useState('');
    const [linkType, setLinkType] = useState<'related' | 'blocks' | 'requires'>('related');
    const [adding, setAdding] = useState(false);

    const loadBacklinks = useCallback(async () => {
        setLoading(true);
        try {
            // Use get_backlinks command for bidirectional query
            const links = await invoke<KnowledgeLink[]>('get_backlinks', { itemId });
            setRawLinks(links);
            
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

    const handleRemoveLink = async (linkId: string) => {
        try {
            await invoke('delete_knowledge_link', { linkId });
            toast.success('Link removed');
            await loadBacklinks();
        } catch (err) {
            toast.error('Failed to remove link', { description: String(err) });
        }
    };

    const handleAddLink = async () => {
        if (!targetId.trim()) return;
        setAdding(true);
        try {
            await invoke('create_knowledge_link', {
                req: { sourceId: itemId, targetId: targetId.trim(), linkType },
            });
            toast.success('Link created');
            setTargetId('');
            setShowAddForm(false);
            await loadBacklinks();
        } catch (err) {
            toast.error('Failed to create link', { description: String(err) });
        } finally {
            setAdding(false);
        }
    };

    const renderLinkItem = (item: KnowledgeItem, direction: 'incoming' | 'outgoing') => {
        const link = rawLinks.find(l =>
            direction === 'incoming' ? l.sourceId === item.id : l.targetId === item.id
        );
        
        const getLinkTypeBadge = (type: string) => {
            const badges = {
                related: { label: 'Related', color: 'var(--pos-info-text)', bg: 'var(--pos-info-bg)' },
                blocks: { label: 'Blocks', color: 'var(--pos-error-text)', bg: 'var(--pos-error-bg)' },
                requires: { label: 'Requires', color: 'var(--pos-warning-text)', bg: 'var(--pos-warning-bg)' },
            };
            return badges[type as keyof typeof badges] || badges.related;
        };
        
        const badge = link ? getLinkTypeBadge(link.linkType) : null;
        
        return (
        <div
            key={item.id}
            className="group p-3 rounded transition-all hover:shadow-md cursor-pointer"
            style={{
                background: 'var(--glass-bg-subtle)',
                border: '1px solid var(--glass-border)',
            }}
            onClick={() => onItemClick?.(item)}
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
                    <div className="flex items-center gap-2 mb-1">
                        <div
                            className="text-sm font-medium truncate"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            {item.itemType}
                        </div>
                        {badge && (
                            <span
                                className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                                style={{ color: badge.color, background: badge.bg }}
                            >
                                {badge.label}
                            </span>
                        )}
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
                        if (link) handleRemoveLink(link.id);
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
    };

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
                        onClick={() => setShowAddForm((v) => !v)}
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

            {/* Add Link Form */}
            {showAddForm && (
                <div
                    className="p-3 border-b space-y-2"
                    style={{ background: 'var(--surface-secondary)', borderColor: 'var(--glass-border)' }}
                >
                    <input
                        type="text"
                        placeholder="Target item ID"
                        value={targetId}
                        onChange={(e) => setTargetId(e.target.value)}
                        className="w-full px-2 py-1 rounded text-sm"
                        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                    />
                    <select
                        value={linkType}
                        onChange={(e) => setLinkType(e.target.value as 'related' | 'blocks' | 'requires')}
                        className="w-full px-2 py-1 rounded text-sm"
                        style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}
                    >
                        <option value="related">Related</option>
                        <option value="blocks">Blocks</option>
                        <option value="requires">Requires</option>
                    </select>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={handleAddLink} disabled={adding || !targetId.trim()}
                            style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', flex: 1 }}>
                            {adding ? 'Adding…' : 'Create Link'}
                        </Button>
                        <Button size="sm" onClick={() => setShowAddForm(false)}
                            style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)' }}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

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
