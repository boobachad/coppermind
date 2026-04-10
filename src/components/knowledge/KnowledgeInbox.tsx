import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, Filter, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeItem, KnowledgeItemFilters } from '@/pos/lib/types';
import { KnowledgeItemCard } from './KnowledgeItemCard';
import { KnowledgeItemModal } from './KnowledgeItemModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface KnowledgeInboxProps {
    highlightItemId?: string | null;
}

export function KnowledgeInbox({ highlightItemId }: KnowledgeInboxProps) {
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('Inbox');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [backfilling, setBackfilling] = useState(false);

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const filters: KnowledgeItemFilters = {};
            
            if (statusFilter !== 'all') {
                filters.status = statusFilter;
            }
            if (typeFilter !== 'all') {
                filters.itemType = typeFilter;
            }
            if (searchQuery.trim()) {
                filters.search = searchQuery.trim();
            }

            const result = await invoke<KnowledgeItem[]>('get_knowledge_items', { filters });
            
            setItems(result);
            
            // Extract unique tags from ALL items for the tag filter dropdown
            const tagsSet = new Set<string>();
            result.forEach(item => {
                item.tags.forEach(tag => tagsSet.add(tag));
            });
            setAvailableTags(Array.from(tagsSet).sort());
        } catch (err) {
            toast.error('Failed to load knowledge items', { description: String(err) });
        } finally {
            setLoading(false);
        }
    }, [statusFilter, typeFilter, searchQuery]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const handleCreateNew = () => {
        setEditingItem(null);
        setIsModalOpen(true);
    };

    const handleEdit = (item: KnowledgeItem) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await invoke('delete_knowledge_item', { id });
            toast.success('Knowledge item deleted');
            loadItems();
        } catch (err) {
            toast.error('Failed to delete item', { description: String(err) });
        }
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setEditingItem(null);
    };

    const handleModalSuccess = () => {
        handleModalClose();
        loadItems();
    };

    const handleUpdateStatus = async (id: string, newStatus: string) => {
        try {
            await invoke('update_knowledge_item', {
                id,
                req: { status: newStatus }
            });
            toast.success('Status updated');
            loadItems();
        } catch (err) {
            toast.error('Failed to update status', { description: String(err) });
        }
    };

    const handleBackfill = async () => {
        setBackfilling(true);
        try {
            const result = await invoke<{ datesProcessed: number; urlsCaptured: number; dates: string[] }>(
                'backfill_activity_urls'
            );
            if (result.datesProcessed === 0) {
                toast.info('Nothing to backfill', { description: 'No activities with URLs found.' });
            } else {
                toast.success(
                    `Backfill complete`,
                    { description: `${result.urlsCaptured} links across ${result.datesProcessed} days` }
                );
            }
            loadItems();
        } catch (err) {
            toast.error('Backfill failed', { description: String(err) });
        } finally {
            setBackfilling(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header with glassmorphism */}
            <div
                className="sticky top-0 z-10 p-6"
                style={{
                    background: 'var(--glass-bg)',
                    borderBottom: '1px solid var(--glass-border)',
                    backdropFilter: 'blur(12px)',
                }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h1
                        className="text-2xl font-bold tracking-tight"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        Knowledge Inbox
                    </h1>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleBackfill}
                        disabled={backfilling}
                        className="p-2 rounded-lg transition-all duration-200 hover:scale-110 disabled:opacity-50"
                        style={{ backgroundColor: 'var(--glass-bg-subtle)', color: 'var(--text-primary)' }}
                        title="Backfill links from all past activities"
                    >
                        <RefreshCw className={`w-4 h-4 ${backfilling ? 'animate-spin' : ''}`} />
                    </button>
                    <Button
                        onClick={handleCreateNew}
                        className="flex items-center gap-2"
                        style={{
                            background: 'var(--btn-primary-bg)',
                            color: 'var(--btn-primary-text)',
                        }}
                    >
                        <Plus className="w-4 h-4" />
                        Add Item
                    </Button>
                </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                            style={{ color: 'var(--text-tertiary)' }}
                        />
                        <Input
                            type="text"
                            placeholder="Search knowledge items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                            style={{
                                background: 'var(--glass-bg-subtle)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>

                    {/* Status Filter */}
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger
                            className="w-[160px]"
                            style={{
                                background: 'var(--glass-bg-subtle)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="Inbox">Inbox</SelectItem>
                            <SelectItem value="Planned">Planned</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                            <SelectItem value="Archived">Archived</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Tag Filter */}
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger
                            className="w-[160px]"
                            style={{
                                background: 'var(--glass-bg-subtle)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Tags</SelectItem>
                            {availableTags.map(tag => (
                                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Items Grid */}
            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div
                            className="text-lg"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Loading...
                        </div>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64">
                        <div
                            className="text-lg mb-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            No items found
                        </div>
                        <div
                            className="text-sm"
                            style={{ color: 'var(--text-tertiary)' }}
                        >
                            {searchQuery || statusFilter !== 'Inbox' || typeFilter !== 'all'
                                ? 'Try adjusting your filters'
                                : 'Click "Add Item" to create your first knowledge item'}
                        </div>
                    </div>
                ) : (
                    <div className="columns-1 md:columns-2 lg:columns-3 gap-4">
                        {items.map((item) => (
                            <div key={item.id} className="break-inside-avoid mb-4 inline-block w-full">
                                <KnowledgeItemCard
                                    item={item}
                                    onEdit={handleEdit}
                                    onDelete={handleDelete}
                                    onUpdateStatus={handleUpdateStatus}
                                    isHighlighted={highlightItemId === item.id}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            <KnowledgeItemModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                onSuccess={handleModalSuccess}
                editingItem={editingItem}
            />
        </div>
    );
}
