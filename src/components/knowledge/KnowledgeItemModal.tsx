import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { KnowledgeItem, DuplicateCheckResult } from '@/pos/lib/types';
import { extractUrls, parseTemporalKeywords } from '@/lib/kb-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface KnowledgeItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editingItem?: KnowledgeItem | null;
}

export function KnowledgeItemModal({ isOpen, onClose, onSuccess, editingItem }: KnowledgeItemModalProps) {
    const [itemType, setItemType] = useState<string>('Link');
    const [source, setSource] = useState<string>('Manual');
    const [content, setContent] = useState('');
    const [status, setStatus] = useState<string>('Inbox');
    const [loading, setLoading] = useState(false);
    const [duplicateCheck, setDuplicateCheck] = useState<DuplicateCheckResult | null>(null);

    useEffect(() => {
        if (editingItem) {
            setItemType(editingItem.itemType);
            setSource(editingItem.source);
            setContent(editingItem.content);
            setStatus(editingItem.status);
        } else {
            resetForm();
        }
    }, [editingItem, isOpen]);

    const resetForm = () => {
        setItemType('Link');
        setSource('Manual');
        setContent('');
        setStatus('Inbox');
        setDuplicateCheck(null);
    };

    const checkForDuplicates = async (text: string) => {
        const urls = extractUrls(text);
        if (urls.length === 0) return;

        try {
            const result = await invoke<DuplicateCheckResult>('check_knowledge_duplicates', {
                content: urls[0] // Check first URL
            });
            
            if (result.isDuplicate) {
                setDuplicateCheck(result);
            }
        } catch (err) {
            console.error('Duplicate check failed:', err);
        }
    };

    const handleContentChange = (value: string) => {
        setContent(value);
        
        // Debounced duplicate check
        if (itemType === 'Link') {
            const timer = setTimeout(() => {
                checkForDuplicates(value);
            }, 500);
            return () => clearTimeout(timer);
        }
    };

    const handleSubmit = async () => {
        if (!content.trim()) {
            toast.error('Content is required');
            return;
        }

        setLoading(true);
        try {
            if (editingItem) {
                // Update existing item
                await invoke('update_knowledge_item', {
                    id: editingItem.id,
                    req: {
                        item_type: itemType,
                        content: content.trim(),
                        status,
                    }
                });
                toast.success('Knowledge item updated');
            } else {
                // Create new item
                await invoke('create_knowledge_item', {
                    req: {
                        item_type: itemType,
                        source,
                        content: content.trim(),
                        status,
                        metadata: null,
                        next_review_date: null,
                    }
                });
                toast.success('Knowledge item created');
                
                // Check for temporal keywords and auto-schedule
                const temporal = parseTemporalKeywords(content);
                if (temporal) {
                    toast.success(`Detected: ${temporal.keyword}`, {
                        description: `Would schedule for ${temporal.date.toLocaleDateString()}`
                    });
                }
            }
            
            onSuccess();
        } catch (err) {
            toast.error('Failed to save item', { description: String(err) });
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

                <div className="space-y-4">
                    {/* Type Selection */}
                    <div>
                        <label
                            className="block text-sm font-medium mb-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Type
                        </label>
                        <Select value={itemType} onValueChange={setItemType}>
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
                                <SelectItem value="Link">Link</SelectItem>
                                <SelectItem value="Problem">Problem</SelectItem>
                                <SelectItem value="NoteRef">Note Reference</SelectItem>
                                <SelectItem value="Quest">Quest</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Content */}
                    <div>
                        <label
                            className="block text-sm font-medium mb-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Content {itemType === 'Link' && '(URL)'}
                        </label>
                        {itemType === 'Link' ? (
                            <Input
                                type="text"
                                placeholder="https://example.com"
                                value={content}
                                onChange={(e) => handleContentChange(e.target.value)}
                                style={{
                                    background: 'var(--glass-bg-subtle)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-primary)',
                                }}
                            />
                        ) : (
                            <Textarea
                                placeholder="Enter content..."
                                value={content}
                                onChange={(e) => handleContentChange(e.target.value)}
                                rows={4}
                                style={{
                                    background: 'var(--glass-bg-subtle)',
                                    border: '1px solid var(--glass-border)',
                                    color: 'var(--text-primary)',
                                }}
                            />
                        )}
                    </div>

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
                                    Duplicate Found
                                </div>
                                <div
                                    className="text-xs"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    This URL already exists in {duplicateCheck.existingItems.length} item(s).
                                    You can still create it if needed.
                                </div>
                            </div>
                        </div>
                    )}

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
