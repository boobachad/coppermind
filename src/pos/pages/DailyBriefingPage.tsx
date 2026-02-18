import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sun, Target, Book, Clock, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { UnifiedGoal, KnowledgeItem } from '../lib/types';
import { getLocalDateString, formatDateDDMMYYYY } from '../lib/time';
import { Loader } from '@/components/Loader';
import { ReflectionPrompt } from '@/components/goal/ReflectionPrompt';

interface DailyBriefingData {
    keyGoals: UnifiedGoal[];
    suggestedReading: KnowledgeItem[];
    estimatedDeepWork: number;
}

export function DailyBriefingPage() {
    const [briefing, setBriefing] = useState<DailyBriefingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [todayStr] = useState(getLocalDateString());
    const [showReflection, setShowReflection] = useState(false);
    const [completedGoal, setCompletedGoal] = useState<UnifiedGoal | null>(null);

    useEffect(() => {
        loadBriefing();
    }, []);

    const loadBriefing = async () => {
        setLoading(true);
        try {
            // Fetch today's goals
            const goals = await invoke<UnifiedGoal[]>('get_unified_goals', {
                filters: {
                    date: todayStr,
                    completed: false,
                }
            });

            // Sort by priority and urgency
            const sortedGoals = goals
                .filter(g => !g.completed)
                .sort((a, b) => {
                    if (a.urgent && !b.urgent) return -1;
                    if (!a.urgent && b.urgent) return 1;
                    const pMap = { high: 3, medium: 2, low: 1 };
                    return pMap[b.priority as keyof typeof pMap] - pMap[a.priority as keyof typeof pMap];
                })
                .slice(0, 3);

            // Fetch KB items due for review
            const kbItems = await invoke<KnowledgeItem[]>('get_knowledge_items', {
                filters: {
                    status: 'Planned',
                    due_for_review: true,
                }
            });

            const suggestedReading = kbItems.slice(0, 3);

            // Estimate deep work (sum of goal estimated times, default 30min each)
            const estimatedMinutes = sortedGoals.length * 30;

            setBriefing({
                keyGoals: sortedGoals,
                suggestedReading,
                estimatedDeepWork: estimatedMinutes,
            });
        } catch (err) {
            toast.error('Failed to load briefing', { description: String(err) });
        } finally {
            setLoading(false);
        }
    };

    const handleCompleteGoal = async (goal: UnifiedGoal) => {
        try {
            await invoke('update_unified_goal', {
                id: goal.id,
                req: { completed: true }
            });
            toast.success('Goal completed!');
            
            // Show reflection prompt for high-value goals
            if (goal.priority === 'high' || goal.urgent) {
                setCompletedGoal(goal);
                setShowReflection(true);
            } else {
                loadBriefing();
            }
        } catch (err) {
            toast.error('Failed to complete goal', { description: String(err) });
        }
    };

    const handleReflectionComplete = () => {
        setShowReflection(false);
        setCompletedGoal(null);
        loadBriefing();
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <Loader />
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="max-w-4xl mx-auto p-8 space-y-8">
                {/* Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: 'var(--color-accent-primary)' }}>
                        <Sun className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Good Morning
                    </h1>
                    <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                        {formatDateDDMMYYYY(new Date())} - {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
                    </p>
                </div>

                {/* Key Goals */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <Target className="w-6 h-6" style={{ color: 'var(--color-accent-primary)' }} />
                        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                            3 Key Goals
                        </h2>
                    </div>

                    {briefing && briefing.keyGoals.length > 0 ? (
                        <div className="space-y-3">
                            {briefing.keyGoals.map((goal, idx) => (
                                <div
                                    key={goal.id}
                                    className="p-4 rounded-xl border transition-all duration-200 hover:scale-[1.01]"
                                    style={{
                                        backgroundColor: 'var(--glass-bg)',
                                        borderColor: 'var(--glass-border)',
                                    }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3 flex-1">
                                            <div
                                                className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold"
                                                style={{
                                                    backgroundColor: 'var(--color-accent-primary)',
                                                    color: 'white',
                                                }}
                                            >
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                                    {goal.text}
                                                </p>
                                                {goal.metrics && goal.metrics.length > 0 && (
                                                    <div className="flex gap-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                                                        {goal.metrics.map((metric, midx) => (
                                                            <span key={midx}>
                                                                {metric.label}: {metric.current}/{metric.target}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 mt-2 text-xs">
                                                    {goal.urgent && (
                                                        <span
                                                            className="px-2 py-1 rounded-full font-medium"
                                                            style={{
                                                                backgroundColor: 'var(--color-error)',
                                                                color: 'white',
                                                            }}
                                                        >
                                                            Urgent
                                                        </span>
                                                    )}
                                                    <span
                                                        className="px-2 py-1 rounded-full capitalize"
                                                        style={{
                                                            backgroundColor: 'var(--surface-secondary)',
                                                            color: 'var(--text-secondary)',
                                                        }}
                                                    >
                                                        {goal.priority}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleCompleteGoal(goal)}
                                            className="px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105"
                                            style={{
                                                backgroundColor: 'var(--btn-primary-bg)',
                                                color: 'var(--btn-primary-text)',
                                            }}
                                        >
                                            Complete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            className="p-8 rounded-xl text-center border"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: 'var(--border-primary)',
                            }}
                        >
                            <p style={{ color: 'var(--text-secondary)' }}>
                                No goals for today. Create some to get started!
                            </p>
                        </div>
                    )}
                </section>

                {/* Estimated Deep Work */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <Clock className="w-6 h-6" style={{ color: 'var(--color-accent-primary)' }} />
                        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Estimated Deep Work
                        </h2>
                    </div>

                    <div
                        className="p-6 rounded-xl border text-center"
                        style={{
                            backgroundColor: 'var(--glass-bg)',
                            borderColor: 'var(--glass-border)',
                        }}
                    >
                        <div className="text-5xl font-bold mb-2" style={{ color: 'var(--color-accent-primary)' }}>
                            {briefing ? Math.floor(briefing.estimatedDeepWork / 60) : 0}h {briefing ? briefing.estimatedDeepWork % 60 : 0}m
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Based on {briefing?.keyGoals.length || 0} key goals (~30min each)
                        </p>
                    </div>
                </section>

                {/* Suggested Reading */}
                <section>
                    <div className="flex items-center gap-3 mb-4">
                        <Book className="w-6 h-6" style={{ color: 'var(--color-accent-primary)' }} />
                        <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Suggested Reading
                        </h2>
                    </div>

                    {briefing && briefing.suggestedReading.length > 0 ? (
                        <div className="space-y-3">
                            {briefing.suggestedReading.map((item) => (
                                <div
                                    key={item.id}
                                    className="p-4 rounded-xl border transition-all duration-200 hover:scale-[1.01]"
                                    style={{
                                        backgroundColor: 'var(--glass-bg)',
                                        borderColor: 'var(--glass-border)',
                                    }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                                                {(item.metadata && typeof item.metadata.title === 'string') ? item.metadata.title : 'Untitled'}
                                            </p>
                                            <p className="text-sm mb-2" style={{ color: 'var(--text-tertiary)' }}>
                                                {item.content.substring(0, 60)}...
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                                    style={{
                                                        backgroundColor: 'var(--surface-secondary)',
                                                        color: 'var(--text-secondary)',
                                                    }}
                                                >
                                                    {item.itemType}
                                                </span>
                                                {item.metadata && item.metadata.tags && item.metadata.tags.length > 0 && (
                                                    <span
                                                        className="px-2 py-1 rounded-full text-xs"
                                                        style={{
                                                            backgroundColor: 'var(--surface-secondary)',
                                                            color: 'var(--text-tertiary)',
                                                        }}
                                                    >
                                                        {item.metadata.tags[0]}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <a
                                            href={item.content}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105"
                                            style={{
                                                backgroundColor: 'var(--btn-primary-bg)',
                                                color: 'var(--btn-primary-text)',
                                            }}
                                        >
                                            Open
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div
                            className="p-8 rounded-xl text-center border"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: 'var(--border-primary)',
                            }}
                        >
                            <p style={{ color: 'var(--text-secondary)' }}>
                                No reading suggestions. Add items to your Knowledge Base!
                            </p>
                        </div>
                    )}
                </section>

                {/* Motivational Message */}
                <section
                    className="p-6 rounded-xl border text-center"
                    style={{
                        backgroundColor: 'var(--glass-bg)',
                        borderColor: 'var(--glass-border)',
                    }}
                >
                    <TrendingUp className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--color-success)' }} />
                    <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
                        Make Today Count!
                    </p>
                    <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
                        Focus on progress, not perfection. Every small step matters.
                    </p>
                </section>
            </div>

            {/* Reflection Prompt */}
            {showReflection && completedGoal && (
                <ReflectionPrompt
                    goalId={completedGoal.id}
                    goalText={completedGoal.text}
                    onClose={() => setShowReflection(false)}
                    onSaved={handleReflectionComplete}
                />
            )}
        </div>
    );
}
