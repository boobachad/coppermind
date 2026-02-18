import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Book, Sparkles } from 'lucide-react';
import { ContextItem } from '../../pos/lib/types';

interface GoalResourcesProps {
    goalId: string;
}

export function GoalResources({ goalId }: GoalResourcesProps) {
    const [resources, setResources] = useState<ContextItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const loadResources = useCallback(async () => {
        setLoading(true);
        try {
            const result = await invoke<ContextItem[]>('get_context_for_goal', {
                goalId,
            });
            setResources(result);
        } catch (err) {
            console.error('Failed to load resources:', err);
            setResources([]);
        } finally {
            setLoading(false);
        }
    }, [goalId]);

    useEffect(() => {
        if (expanded) {
            loadResources();
        }
    }, [goalId, expanded, loadResources]);

    return (
        <div className="mt-3">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm transition-colors hover:underline"
                style={{ color: 'var(--text-secondary)' }}
            >
                <Sparkles className="w-4 h-4" />
                <span>{expanded ? 'Hide' : 'Show'} Resources for this Task</span>
            </button>

            {expanded && (
                <div className="mt-3 space-y-2">
                    {loading ? (
                        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading resources...</div>
                    ) : resources.length > 0 ? (
                        resources.map((resource) => (
                            <div
                                key={resource.id}
                                className="p-3 rounded-lg border transition-all duration-200 hover:scale-[1.01]"
                                style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)' }}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-2 flex-1">
                                        <Book className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--color-accent-primary)' }} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                                {resource.title || 'Untitled'}
                                            </p>
                                            <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                                                {resource.content.substring(0, 80)}...
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--glass-bg)', color: 'var(--text-tertiary)' }}>
                                                    {resource.itemType}
                                                </span>
                                                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                                    {Math.round(resource.relevanceScore * 100)}% match
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <a
                                        href={resource.content}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-1.5 rounded-lg text-xs transition-all duration-200 hover:scale-105 flex-shrink-0"
                                        style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
                                    >
                                        Open
                                    </a>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-4 rounded-lg text-center text-sm border" style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}>
                            No relevant resources found. Add items to your Knowledge Base!
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
