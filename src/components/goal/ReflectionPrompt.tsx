import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { GoalReflection, CreateReflectionInput } from '../../pos/lib/types';
import { X, CheckCircle, Sparkles, Book, Trash2, Plus, Pencil } from 'lucide-react';
import { formatDateDDMMYYYY } from '../../pos/lib/time';
import { useConfirmDialog } from '../ConfirmDialog';
import { toast } from 'sonner';

interface ReflectionPromptProps {
    goalId: string;
    goalText: string;
    onClose: () => void;
    onSaved: () => void;
}

/**
 * Reflection Prompt Component
 * 
 * Shown after completing a high-value goal to capture learnings.
 * Creates a GoalReflection and optionally a KnowledgeItem.
 * 
 * Design: Glassmorphism modal with textarea and KB checkbox.
 */
export function ReflectionPrompt({ goalId, goalText, onClose, onSaved }: ReflectionPromptProps) {
    const [learningText, setLearningText] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!learningText.trim()) {
            setError('Please enter what you learned');
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const input: CreateReflectionInput = {
                goalId,
                learningText: learningText.trim(),
                createKbItem: true, // Always create KB item
            };

            await invoke<GoalReflection>('create_goal_reflection', { input });
            onSaved();
            onClose();
        } catch (err) {
            console.error('Failed to save reflection:', err);
            setError(err instanceof Error ? err.message : 'Failed to save reflection');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--overlay-bg-heavy)' }}>
            <div 
                className="w-full max-w-2xl rounded-xl p-6 shadow-2xl"
                style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                }}
            >
                {/* Header */}
                <div className="mb-6 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-6 h-6" style={{ color: 'var(--color-accent-primary)' }} />
                            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                                What did you learn?
                            </h2>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Reflect on: <span className="font-medium">{goalText}</span>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 transition-all duration-200 hover:scale-110"
                        style={{
                            background: 'var(--surface-secondary)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Learning Text */}
                <div className="mb-4">
                    <label className="block mb-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Your Learning
                    </label>
                    <textarea
                        value={learningText}
                        onChange={(e) => setLearningText(e.target.value)}
                        placeholder="What insights did you gain? What would you do differently next time?"
                        rows={6}
                        className="w-full rounded-lg px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2"
                        style={{
                            background: 'var(--surface-tertiary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                            resize: 'vertical',
                        }}
                        onFocus={(e) => {
                            e.target.style.borderColor = 'var(--color-accent-primary)';
                            e.target.style.boxShadow = '0 0 0 3px var(--color-accent-subtle)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'var(--border-primary)';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                </div>

                {/* Error */}
                {error && (
                    <div 
                        className="mb-4 rounded-lg p-3 text-sm"
                        style={{
                            background: 'var(--color-error-subtle)',
                            border: '1px solid var(--color-error)',
                            color: 'var(--color-error)',
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105"
                        style={{
                            background: 'var(--surface-secondary)',
                            color: 'var(--text-primary)',
                        }}
                    >
                        Skip
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !learningText.trim()}
                        className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: 'var(--btn-primary-bg)',
                            color: 'var(--btn-primary-text)',
                        }}
                    >
                        <CheckCircle className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Save Reflection'}
                    </button>
                </div>
            </div>
        </div>
    );
}

interface ReflectionListProps {
    goalId: string;
}

/**
 * Reflection List Component
 * 
 * Shows all reflections for a goal.
 * Displayed in GoalCard or GoalModal.
 */
export function ReflectionList({ goalId }: ReflectionListProps) {
    const [reflections, setReflections] = useState<GoalReflection[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingReflection, setEditingReflection] = useState<GoalReflection | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const { confirm } = useConfirmDialog();

    const loadReflections = async () => {
        try {
            const data = await invoke<GoalReflection[]>('get_goal_reflections', { goalId });
            setReflections(data);
        } catch (err) {
            console.error('Failed to load reflections:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (reflectionId: string) => {
        const confirmed = await confirm({
            title: 'Delete Reflection',
            description: 'Delete this reflection? This cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'destructive',
        });

        if (!confirmed) return;

        try {
            await invoke('delete_goal_reflection', { reflectionId });
            setReflections(reflections.filter(r => r.id !== reflectionId));
            toast.success('Reflection deleted');
        } catch (err) {
            console.error('Failed to delete reflection:', err);
            toast.error('Failed to delete reflection');
        }
    };

    const handleSaveReflection = async (learningText: string, createKbItem: boolean, reflectionId?: string) => {
        try {
            if (reflectionId) {
                // Update existing
                await invoke('update_goal_reflection', {
                    reflectionId,
                    learningText: learningText.trim(),
                });
                toast.success('Reflection updated');
            } else {
                // Create new - always save to KB
                const input: CreateReflectionInput = {
                    goalId,
                    learningText: learningText.trim(),
                    createKbItem: true,
                };
                await invoke<GoalReflection>('create_goal_reflection', { input });
                toast.success('Reflection created');
            }
            
            setEditingReflection(null);
            setShowCreateForm(false);
            loadReflections();
        } catch (err) {
            console.error('Failed to save reflection:', err);
            toast.error('Failed to save reflection');
        }
    };

    useEffect(() => {
        loadReflections();
    }, [goalId]);

    if (loading) {
        return (
            <div className="text-center py-4">
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading reflections...</p>
            </div>
        );
    }

    if (reflections.length === 0 && !showCreateForm) {
        return (
            <div className="text-center py-6">
                <Book className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>No reflections yet</p>
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105"
                    style={{
                        background: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)',
                    }}
                >
                    <Plus className="w-4 h-4" />
                    Add Reflection
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Add Reflection Button */}
            {!showCreateForm && !editingReflection && (
                <button
                    onClick={() => setShowCreateForm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-[1.01]"
                    style={{
                        background: 'var(--surface-secondary)',
                        border: '1px dashed var(--border-primary)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <Plus className="w-4 h-4" />
                    Add Reflection
                </button>
            )}

            {/* Create Form */}
            {showCreateForm && (
                <ReflectionForm
                    onSave={(text, createKb) => handleSaveReflection(text, createKb)}
                    onCancel={() => setShowCreateForm(false)}
                />
            )}

            {/* Reflections List */}
            {reflections.map((reflection) => (
                editingReflection?.id === reflection.id ? (
                    <ReflectionForm
                        key={reflection.id}
                        initialText={reflection.learningText}
                        onSave={(text) => handleSaveReflection(text, false, reflection.id)}
                        onCancel={() => setEditingReflection(null)}
                    />
                ) : (
                    <div
                        key={reflection.id}
                        className="rounded-lg p-4"
                        style={{
                            background: 'var(--surface-secondary)',
                            border: '1px solid var(--border-primary)',
                        }}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                                <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                                    {reflection.learningText}
                                </p>
                                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                    <span>{formatDateDDMMYYYY(new Date(reflection.createdAt))}</span>
                                    {reflection.kbItemId && (
                                        <span
                                            className="flex items-center gap-1 px-2 py-1 rounded"
                                            style={{
                                                background: 'var(--surface-tertiary)',
                                                color: 'var(--color-accent-primary)',
                                            }}
                                        >
                                            <Book className="w-3 h-3" />
                                            In KB
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setEditingReflection(reflection)}
                                    className="flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 hover:scale-110"
                                    style={{
                                        background: 'var(--surface-tertiary)',
                                        color: 'var(--text-secondary)',
                                    }}
                                    title="Edit reflection"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(reflection.id)}
                                    className="flex-shrink-0 p-1.5 rounded-lg transition-all duration-200 hover:scale-110"
                                    style={{
                                        background: 'var(--surface-tertiary)',
                                        color: 'var(--color-error)',
                                    }}
                                    title="Delete reflection"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )
            ))}
        </div>
    );
}

interface ReflectionFormProps {
    initialText?: string;
    onSave: (text: string, createKbItem: boolean) => void;
    onCancel: () => void;
}

function ReflectionForm({ initialText = '', onSave, onCancel }: ReflectionFormProps) {
    const [text, setText] = useState(initialText);

    return (
        <div
            className="rounded-lg p-4"
            style={{
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border-primary)',
            }}
        >
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What did you learn from this goal?"
                rows={4}
                className="w-full rounded-lg px-3 py-2 text-sm mb-3 transition-all focus:outline-none focus:ring-2"
                style={{
                    background: 'var(--surface-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    resize: 'vertical',
                }}
                autoFocus
            />

            <div className="flex justify-end gap-2">
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                    style={{
                        background: 'var(--surface-tertiary)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    Cancel
                </button>
                <button
                    onClick={() => onSave(text, true)}
                    disabled={!text.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50"
                    style={{
                        background: 'var(--btn-primary-bg)',
                        color: 'var(--btn-primary-text)',
                    }}
                >
                    Save
                </button>
            </div>
        </div>
    );
}
