import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { GoalReflection, CreateReflectionInput } from '../../pos/lib/types';
import { X, CheckCircle, Sparkles, Book } from 'lucide-react';

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
    const [createKbItem, setCreateKbItem] = useState(true);
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
                createKbItem,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0, 0, 0, 0.6)' }}>
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
                            e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
                        }}
                        onBlur={(e) => {
                            e.target.style.borderColor = 'var(--border-primary)';
                            e.target.style.boxShadow = 'none';
                        }}
                    />
                </div>

                {/* KB Item Checkbox */}
                <div className="mb-6">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={createKbItem}
                            onChange={(e) => setCreateKbItem(e.target.checked)}
                            className="w-4 h-4 rounded cursor-pointer"
                            style={{
                                accentColor: 'var(--color-accent-primary)',
                            }}
                        />
                        <div className="flex items-center gap-2">
                            <Book className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                Save to Knowledge Base
                            </span>
                        </div>
                    </label>
                    <p className="ml-7 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        Creates a knowledge item for future reference
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div 
                        className="mb-4 rounded-lg p-3 text-sm"
                        style={{
                            background: 'rgba(239, 68, 68, 0.1)',
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

    useState(() => {
        loadReflections();
    });

    if (loading) {
        return (
            <div className="text-center py-4">
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading reflections...</p>
            </div>
        );
    }

    if (reflections.length === 0) {
        return (
            <div className="text-center py-6">
                <Book className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No reflections yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {reflections.map((reflection) => (
                <div
                    key={reflection.id}
                    className="rounded-lg p-4"
                    style={{
                        background: 'var(--surface-secondary)',
                        border: '1px solid var(--border-primary)',
                    }}
                >
                    <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                        {reflection.learningText}
                    </p>
                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        <span>{new Date(reflection.createdAt).toLocaleDateString()}</span>
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
            ))}
        </div>
    );
}
