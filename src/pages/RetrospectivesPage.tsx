import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Calendar, Plus, Trash2, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { Retrospective, RetrospectiveStats } from '../pos/lib/types';
import { RetrospectiveForm } from '../components/retrospective/RetrospectiveForm';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { formatISODateDDMMYYYY, getLocalDateString } from '../pos/lib/time';

export function RetrospectivesPage() {
    const [retrospectives, setRetrospectives] = useState<Retrospective[]>([]);
    const [stats, setStats] = useState<RetrospectiveStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [periodFilter, setPeriodFilter] = useState<'all' | 'weekly' | 'monthly'>('all');
    const { confirm } = useConfirmDialog();

    const loadRetrospectives = async () => {
        setLoading(true);
        try {
            const data = await invoke<Retrospective[]>('get_retrospectives', {
                periodType: periodFilter === 'all' ? null : periodFilter,
                limit: 50,
            });
            setRetrospectives(data);

            // Load stats for last 90 days
            if (data.length > 0) {
                const today = getLocalDateString();
                const ninetyDaysAgo = new Date(new Date(`${today}T00:00:00Z`).getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const statsData = await invoke<RetrospectiveStats>('get_retrospective_stats', {
                    startDate: `${ninetyDaysAgo}T00:00:00Z`,
                    endDate: `${today}T23:59:59Z`,
                });
                setStats(statsData);
            }
        } catch (err) {
            toast.error('Failed to load retrospectives', { description: String(err) });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRetrospectives();
    }, [periodFilter]);

    const handleDelete = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete Retrospective',
            description: 'Delete this retrospective? This cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'destructive',
        });

        if (!confirmed) return;

        try {
            await invoke('delete_retrospective', { retrospectiveId: id });
            setRetrospectives(retrospectives.filter(r => r.id !== id));
            toast.success('Retrospective deleted');
        } catch (err) {
            toast.error('Failed to delete', { description: String(err) });
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div
                className="sticky top-0 z-10 p-6"
                style={{
                    background: 'var(--glass-bg)',
                    borderBottom: '1px solid var(--glass-border)',
                    backdropFilter: 'blur(12px)',
                }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        Retrospectives
                    </h1>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 hover:scale-105"
                        style={{
                            background: 'var(--btn-primary-bg)',
                            color: 'var(--btn-primary-text)',
                        }}
                    >
                        <Plus className="w-4 h-4" />
                        New Retrospective
                    </button>
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    {(['all', 'weekly', 'monthly'] as const).map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setPeriodFilter(filter)}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                            style={{
                                background: periodFilter === filter ? 'var(--btn-primary-bg)' : 'var(--surface-secondary)',
                                color: periodFilter === filter ? 'var(--btn-primary-text)' : 'var(--text-secondary)',
                            }}
                        >
                            {filter.charAt(0).toUpperCase() + filter.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Dashboard */}
            {stats && (
                <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div
                        className="p-4 rounded-lg"
                        style={{
                            background: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                        }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4" style={{ color: 'var(--color-accent-primary)' }} />
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Avg Energy</span>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {stats.avgEnergy.toFixed(1)}/10
                        </div>
                    </div>

                    <div
                        className="p-4 rounded-lg"
                        style={{
                            background: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                        }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Avg Satisfaction</span>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {stats.avgSatisfaction.toFixed(1)}/10
                        </div>
                    </div>

                    <div
                        className="p-4 rounded-lg"
                        style={{
                            background: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                        }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Calendar className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Deep Work</span>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {stats.totalDeepWorkHours.toFixed(1)}h
                        </div>
                    </div>

                    <div
                        className="p-4 rounded-lg"
                        style={{
                            background: 'var(--glass-bg)',
                            border: '1px solid var(--glass-border)',
                        }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Correlation</span>
                        </div>
                        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                            {(stats.correlation * 100).toFixed(0)}%
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                            Deep work vs satisfaction
                        </div>
                    </div>
                </div>
            )}

            {/* Retrospectives List */}
            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-lg" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
                    </div>
                ) : retrospectives.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64">
                        <Calendar className="w-16 h-16 mb-4 opacity-30" style={{ color: 'var(--text-tertiary)' }} />
                        <div className="text-lg mb-2" style={{ color: 'var(--text-secondary)' }}>No retrospectives yet</div>
                        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                            Click "New Retrospective" to create your first one
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {retrospectives.map((retro) => (
                            <div
                                key={retro.id}
                                className="p-4 rounded-lg transition-all duration-200 hover:scale-[1.01]"
                                style={{
                                    background: 'var(--glass-bg)',
                                    border: '1px solid var(--glass-border)',
                                }}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <div
                                            className="text-xs font-medium uppercase tracking-wider mb-1 px-2 py-0.5 rounded inline-block"
                                            style={{
                                                background: 'var(--color-accent-primary)15',
                                                color: 'var(--color-accent-primary)',
                                            }}
                                        >
                                            {retro.periodType}
                                        </div>
                                        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            {formatISODateDDMMYYYY(retro.periodStart)} - {formatISODateDDMMYYYY(retro.periodEnd)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(retro.id)}
                                        className="p-1.5 rounded-lg transition-all duration-200 hover:scale-110"
                                        style={{
                                            background: 'var(--surface-tertiary)',
                                            color: 'var(--color-error)',
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span style={{ color: 'var(--text-tertiary)' }}>Energy:</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{retro.questionsData.energy}/10</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span style={{ color: 'var(--text-tertiary)' }}>Satisfaction:</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{retro.questionsData.satisfaction}/10</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span style={{ color: 'var(--text-tertiary)' }}>Deep Work:</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{retro.questionsData.deep_work_hours}h</span>
                                    </div>
                                </div>

                                {retro.questionsData.accomplishments && (
                                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-primary)' }}>
                                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                                            Accomplishments
                                        </div>
                                        <div className="text-sm line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>
                                            {retro.questionsData.accomplishments}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Form Modal */}
            {isFormOpen && (
                <RetrospectiveForm
                    onClose={() => setIsFormOpen(false)}
                    onSuccess={() => {
                        setIsFormOpen(false);
                        loadRetrospectives();
                        toast.success('Retrospective created');
                    }}
                />
            )}
        </div>
    );
}
