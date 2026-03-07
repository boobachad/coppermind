import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeItem, DuplicateCheckResult, KnowledgeLink } from '@/pos/lib/types';
import { parseTemporalKeywords } from '@/lib/kb-utils';
import { formatDateDDMMYYYY } from '@/pos/lib/time';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EntityLinkTextarea } from '@/lib/entity-linking/components/EntityLinkTextarea';
import { parseReferences } from '@/lib/entity-linking/core/parser';

interface KnowledgeItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingItem?: KnowledgeItem | null;
}

export function KnowledgeItemModal({ isOpen, onClose, onSuccess, editingItem }: KnowledgeItemModalProps) {
    const [itemType, setItemType] = useState<string>('');
    const [source, setSource] = useState<string>('Manual');
    const [content, setContent] = useState('');
    const [status, setStatus] = useState<string>('Inbox');
    const [linkedKbItemIds, setLinkedKbItemIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult | null>(null);
    const [kbItems, setKbItems] = useState<KnowledgeItem[]>([]);
    const [loadingKbItems, setLoadingKbItems] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadKbItems();
            if (editingItem) {
                loadExistingLinks(editingItem.id);
            }
        }
    }, [isOpen, editingItem]);

    const loadKbItems = async () => {
        setLoadingKbItems(true);
        try {
            const items = await invoke<KnowledgeItem[]>('get_knowledge_items', {
                filters: null
            });
            setKbItems(items.filter(item => item.id !== editingItem?.id)); // Exclude self
        } catch (err) {
            console.error('Failed to load KB items:', err);
        } finally {
            setLoadingKbItems(false);
        }
    };

    const loadExistingLinks = async (itemId: string) => {
        try {
            // Fetch links where this item is the source
            const links = await invoke<KnowledgeLink[]>(
                'get_knowledge_links',
                { itemId, direction: 'outgoing' }
            );
            
            // Extract target IDs
            const linkedIds = links.map(link => link.targetId);
            setLinkedKbItemIds(linkedIds);
        } catch (err) {
            console.error('Failed to load existing links:', err);
        }
    };

    useEffect(() => {
        if (editingItem) {
            setItemType(editingItem.tags.join(', '));
            setSource(editingItem.source);
            setContent(editingItem.content);
            setStatus(editingItem.status);
        } else {
            resetForm();
        }
    }, [editingItem, isOpen]);

    const isDailyCapture = editingItem?.tags.includes('daily-capture');
    const dailyCaptureUrls = isDailyCapture && editingItem?.metadata?.urls 
        ? (Array.isArray(editingItem.metadata.urls) ? editingItem.metadata.urls : [])
        : [];

    const resetForm = () => {
        setItemType('');
        setSource('Manual');
        setContent('');
        setStatus('Inbox');
        setLinkedKbItemIds([]);
        setDuplicateCheck(null);
    };

    const checkForDuplicates = async (text: string) => {
        if (!text.trim()) return;

        try {
            const result = await invoke<DuplicateCheckResult>('check_knowledge_duplicates', {
                content: text
            });
            
            if (result.isDuplicate) {
                setDuplicateCheck(result);
            } else {
                setDuplicateCheck(null);
            }
        } catch (err) {
            console.error('Duplicate check failed:', err);
        }
    };

    const handleContentChange = (value: string) => {
        setContent(value);
        
        // Debounced duplicate check for any content with URLs
        const timer = setTimeout(() => {
            checkForDuplicates(value);
        }, 500);
        return () => clearTimeout(timer);
    };

    const handleSubmit = async () => {
        if (!content.trim()) {
            toast.error('Content is required');
            return;
        }

        if (!itemType.trim()) {
            toast.error('Tags are required');
            return;
        }

        // Parse comma-separated tags
        const tagsArray = itemType.split(',').map(t => t.trim()).filter(Boolean);
        if (tagsArray.length === 0) {
            toast.error('At least one tag is required');
            return;
        }

        setLoading(true);
        try {
            let itemId: string;
            
            if (editingItem) {
                // Update existing item
                await invoke('update_knowledge_item', {
                    id: editingItem.id,
                    req: {
                        tags: tagsArray,
                        content: content.trim(),
                        status,
                    }
                });
                itemId = editingItem.id;
                toast.success('Knowledge item updated');
            } else {
                // Create new item
                const result = await invoke<KnowledgeItem>('create_knowledge_item', {
                    req: {
                        tags: tagsArray,
                        source,
                        content: content.trim(),
                        status,
                        metadata: null,
                        nextReviewDate: null,
                    }
                });
                itemId = result.id;
                toast.success('Knowledge item created');
                
                // Check for temporal keywords and auto-schedule
                const temporal = parseTemporalKeywords(content);
                if (temporal) {
                    toast.success(`Detected: ${temporal.keyword}`, {
                        description: `Would schedule for ${formatDateDDMMYYYY(temporal.date)}`
                    });
                }
            }
            
            // Parse cross-references from content and update registry
            const parsedRefs = parseReferences(content);
            if (parsedRefs.length > 0) {
                try {
                    await invoke('update_reference_registry', {
                        sourceEntityType: 'kb',
                        sourceEntityId: itemId,
                        sourceField: 'content',
                        textContent: content.trim(),
                    });
                } catch (err) {
                    console.error('Failed to update cross-references:', err);
                    // Non-fatal: continue even if cross-reference update fails
                }
            }
            
            // Create KB item links (legacy support)
            for (const targetId of linkedKbItemIds) {
                try {
                    await invoke('create_knowledge_link', {
                        req: {
                            sourceId: itemId,
                            targetId,
                            linkType: 'related'
                        }
                    });
                } catch (err) {
                    console.error(`Failed to create link to ${targetId}:`, err);
                }
            }
            
            onSuccess();
        } catch (err) {
            const errorMsg = err && typeof err === 'object' && 'message' in err
                ? String(err.message)
                : String(err);
            console.error('Failed to save KB item:', err);
            toast.error('Failed to save item', { description: errorMsg });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="sm:max-w-[600px]"
                style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    backdropFilter: 'blur(16px)',
                }}
            >
                <DialogHeader>
                    <DialogTitle style={{ color: 'var(--text-primary)' }}>
                        {editingItem ? 'Edit Knowledge Item' : 'Create Knowledge Item'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Tags Input (Comma-separated) */}
                    <div>
                        <label
                            className="block text-sm font-medium mb-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Tags
                        </label>
                        <Input
                            type="text"
                            placeholder="thinking, space, inspiration"
                            value={itemType}
                            onChange={(e) => setItemType(e.target.value)}
                            style={{
                                background: 'var(--glass-bg-subtle)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)',
                            }}
                        />
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                            Separate multiple tags with commas
                        </p>
                    </div>

                    {/* Content - Special handling for daily-capture */}
                    {isDailyCapture ? (
                        <div>
                            <label
                                className="block text-sm font-medium mb-2"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                Captured URLs ({dailyCaptureUrls.length})
                            </label>
                            <div
                                className="p-3 rounded-lg border max-h-[300px] overflow-y-auto space-y-2"
                                style={{
                                    background: 'var(--glass-bg-subtle)',
                                    borderColor: 'var(--glass-border)',
                                }}
                            >
                                {dailyCaptureUrls.length === 0 ? (
                                    <div className="text-sm text-center py-4" style={{ color: 'var(--text-tertiary)' }}>
                                        No URLs captured
                                    </div>
                                ) : (
                                    dailyCaptureUrls.map((urlData: any, idx: number) => (
                                        <div
                                            key={idx}
                                            className="p-2 rounded border"
                                            style={{
                                                background: 'var(--glass-bg)',
                                                borderColor: 'var(--glass-border)',
                                            }}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div
                                                        className="text-sm font-medium truncate cursor-pointer hover:opacity-80"
                                                        style={{ color: 'var(--color-accent-primary)' }}
                                                        onClick={() => invoke('open_link', { url: urlData.url })}
                                                    >
                                                        {urlData.url}
                                                    </div>
                                                    <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                                        From: {urlData.activity_title} ({urlData.activity_category})
                                                    </div>
                                                    {urlData.url_type && urlData.url_type !== 'generic' && urlData.url_type !== 'other' && (
                                                        <div
                                                            className="text-xs mt-1 inline-block px-1.5 py-0.5 rounded"
                                                            style={{
                                                                background: 'var(--color-accent-primary)15',
                                                                color: 'var(--color-accent-primary)',
                                                            }}
                                                        >
                                                            {urlData.url_type}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
                                Daily capture items are automatically generated from activity logs. URLs cannot be edited manually.
                            </p>
                        </div>
                    ) : (
                        <div>
                            <label
                                className="block text-sm font-medium mb-2"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                Content
                            </label>
                            <EntityLinkTextarea
                                value={content}
                                onChange={handleContentChange}
                                placeholder="Type [[note:my-note]] or [[journal:2024-03-06]] to create links..."
                                rows={6}
                                style={{
                                    background: 'var(--glass-bg-subtle)',
                                    border: '1px solid var(--glass-border)',
                                }}
                            />
                            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                                Use [[entity:identifier]] syntax to link (e.g., [[note:my-note]], [[journal:2024-03-06]], [[goal:project-name]])
                            </p>
                        </div>
                    )}

                    {/* Duplicate Warning */}
                    {duplicateCheck && duplicateCheck.isDuplicate && (
                        <div
                            className="p-3 rounded flex items-start gap-2"
                            style={{
                                background: 'var(--color-warning)15',
                                border: '1px solid var(--color-warning)30',
                            }}
                        >
                            <AlertTriangle
                                className="w-4 h-4 flex-shrink-0 mt-0.5"
                                style={{ color: 'var(--color-warning)' }}
                            />
                            <div className="flex-1">
                                <div
                                    className="text-sm font-medium mb-1"
                                    style={{ color: 'var(--color-warning)' }}
                                >
                                    Duplicate URL Found
                                </div>
                                <div
                                    className="text-xs mb-2"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    This URL exists in {duplicateCheck.existingItems.length} item(s):
                                </div>
                                {duplicateCheck.existingItems.slice(0, 3).map((item) => (
                                    <div
                                        key={item.id}
                                        className="text-xs p-2 rounded mb-1 cursor-pointer hover:opacity-80"
                                        style={{
                                            background: 'var(--glass-bg)',
                                            border: '1px solid var(--glass-border)',
                                            color: 'var(--text-primary)',
                                        }}
                                        onClick={() => {
                                            // Navigate to existing item
                                            onClose();
                                            // TODO: Implement navigation to item
                                            toast.info(`Item: ${item.tags.join(', ')} - ${item.content.slice(0, 50)}...`);
                                        }}
                                    >
                                        <span style={{ color: 'var(--color-accent-primary)' }}>
                                            {item.tags.join(', ')}
                                        </span>
                                        {' • '}
                                        {item.content.slice(0, 60)}...
                                    </div>
                                ))}
                                {duplicateCheck.existingItems.length > 3 && (
                                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                        +{duplicateCheck.existingItems.length - 3} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Linked KB Items */}
                    <div>
                        <label
                            className="block text-sm font-medium mb-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Link to KB Items (Optional)
                        </label>
                        <Select 
                            value="none"
                            onValueChange={(val) => {
                                if (val !== 'none' && !linkedKbItemIds.includes(val)) {
                                    setLinkedKbItemIds([...linkedKbItemIds, val]);
                                }
                            }}
                            disabled={loadingKbItems}
                        >
                            <SelectTrigger
                                style={{
                                    background: 'var(--glass-bg-subtle)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                <SelectValue placeholder={loadingKbItems ? "Loading..." : "Add KB item link"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Select item...</SelectItem>
                                {kbItems.filter(item => !linkedKbItemIds.includes(item.id)).map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {item.tags.join(', ')}: {item.content.slice(0, 50)}...
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {linkedKbItemIds.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {linkedKbItemIds.map(id => {
                                    const item = kbItems.find(i => i.id === id);
                                    return item ? (
                                        <span
                                            key={id}
                                            className="text-xs px-2 py-1 rounded flex items-center gap-1"
                                            style={{
                                                background: 'var(--glass-bg)',
                                                border: '1px solid var(--glass-border)',
                                                color: 'var(--text-primary)',
                                            }}
                                        >
                                            {item.tags.join(', ')}: {item.content.slice(0, 30)}...
                                            <button
                                                onClick={() => setLinkedKbItemIds(linkedKbItemIds.filter(i => i !== id))}
                                                className="ml-1 hover:opacity-70"
                                                style={{ color: 'var(--color-error)' }}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ) : null;
                                })}
                            </div>
                        )}
                    </div>

                    {/* Status */}
                    <div>
                        <label
                            className="block text-sm font-medium mb-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Status
                        </label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger
                                style={{
                                    background: 'var(--glass-bg-subtle)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-primary)',
                                }}
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Inbox">Inbox</SelectItem>
                                <SelectItem value="Planned">Planned</SelectItem>
                                <SelectItem value="Completed">Completed</SelectItem>
                                <SelectItem value="Archived">Archived</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button
                            onClick={onClose}
                            disabled={loading}
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={loading}
                            style={{
                                background: 'var(--btn-primary-bg)',
                                color: 'var(--btn-primary-text)',
                            }}
                        >
                            {loading ? 'Saving...' : editingItem ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
