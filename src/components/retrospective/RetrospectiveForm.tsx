import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Retrospective, CreateRetrospectiveInput, RetrospectiveQuestions } from '../../pos/lib/types';
import { Calendar, TrendingUp, Zap, CheckCircle, X } from 'lucide-react';

interface RetrospectiveFormProps {
    onClose: () => void;
    onSuccess: (retro: Retrospective) => void;
    periodType?: 'weekly' | 'monthly';
}

export const RetrospectiveForm: React.FC<RetrospectiveFormProps> = ({
    onClose,
    onSuccess,
    periodType = 'weekly',
}) => {
    const [formData, setFormData] = useState<CreateRetrospectiveInput>({
        periodType,
        periodStart: '',
        periodEnd: '',
        questionsData: {
            energy: 5,
            satisfaction: 5,
            deep_work_hours: 0,
            accomplishments: '',
            challenges: '',
            improvements: '',
            goals_next_period: '',
        },
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const result = await invoke<Retrospective>('create_retrospective', {
                input: formData,
            });
            onSuccess(result);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create retrospective');
        } finally {
            setIsSubmitting(false);
        }
    };

    const updateQuestion = (key: keyof RetrospectiveQuestions, value: number | string) => {
        setFormData({
            ...formData,
            questionsData: {
                ...formData.questionsData,
                [key]: value,
            },
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'var(--overlay-bg)' }}>
            <div
                className="w-full max-w-2xl rounded-xl p-6 max-h-[90vh] overflow-y-auto"
                style={{
                    backgroundColor: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    backdropFilter: 'blur(10px)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div
                            className="p-2 rounded-lg"
                            style={{
                                backgroundColor: 'var(--color-accent-primary)',
                                color: 'white',
                            }}
                        >
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {formData.periodType === 'weekly' ? 'Weekly' : 'Monthly'} Retrospective
                            </h2>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Reflect on your progress and plan ahead
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg transition-colors"
                        style={{
                            color: 'var(--text-tertiary)',
                        }}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Period Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                Period Start
                            </label>
                            <input
                                type="date"
                                required
                                value={formData.periodStart.split('T')[0] || ''}
                                onChange={(e) => setFormData({ ...formData, periodStart: new Date(e.target.value).toISOString() })}
                                className="w-full px-3 py-2 rounded-lg border"
                                style={{
                                    backgroundColor: 'var(--surface-secondary)',
                                    borderColor: 'var(--border-secondary)',
                                    color: 'var(--text-primary)',
                                }}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                                Period End
                            </label>
                            <input
                                type="date"
                                required
                                value={formData.periodEnd.split('T')[0] || ''}
                                onChange={(e) => setFormData({ ...formData, periodEnd: new Date(e.target.value).toISOString() })}
                                className="w-full px-3 py-2 rounded-lg border"
                                style={{
                                    backgroundColor: 'var(--surface-secondary)',
                                    borderColor: 'var(--border-secondary)',
                                    color: 'var(--text-primary)',
                                }}
                            />
                        </div>
                    </div>

                    {/* Energy Level (1-10) */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <Zap className="w-4 h-4" style={{ color: 'var(--color-accent-primary)' }} />
                            Energy Level: {formData.questionsData.energy}/10
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            value={formData.questionsData.energy}
                            onChange={(e) => updateQuestion('energy', parseInt(e.target.value))}
                            className="w-full"
                            style={{
                                accentColor: 'var(--color-accent-primary)',
                            }}
                        />
                    </div>

                    {/* Satisfaction (1-10) */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                            Satisfaction: {formData.questionsData.satisfaction}/10
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            value={formData.questionsData.satisfaction}
                            onChange={(e) => updateQuestion('satisfaction', parseInt(e.target.value))}
                            className="w-full"
                            style={{
                                accentColor: 'var(--color-success)',
                            }}
                        />
                    </div>

                    {/* Deep Work Hours */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                            Deep Work Hours
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={formData.questionsData.deep_work_hours}
                            onChange={(e) => updateQuestion('deep_work_hours', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: 'var(--border-secondary)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>

                    {/* Accomplishments */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                            Accomplishments
                        </label>
                        <textarea
                            rows={3}
                            value={formData.questionsData.accomplishments || ''}
                            onChange={(e) => updateQuestion('accomplishments', e.target.value)}
                            placeholder="What did you achieve?"
                            className="w-full px-3 py-2 rounded-lg border resize-none"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: 'var(--border-secondary)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>

                    {/* Challenges */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                            Challenges
                        </label>
                        <textarea
                            rows={3}
                            value={formData.questionsData.challenges || ''}
                            onChange={(e) => updateQuestion('challenges', e.target.value)}
                            placeholder="What obstacles did you face?"
                            className="w-full px-3 py-2 rounded-lg border resize-none"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: 'var(--border-secondary)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>

                    {/* Improvements */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                            Areas for Improvement
                        </label>
                        <textarea
                            rows={3}
                            value={formData.questionsData.improvements || ''}
                            onChange={(e) => updateQuestion('improvements', e.target.value)}
                            placeholder="What can you improve?"
                            className="w-full px-3 py-2 rounded-lg border resize-none"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: 'var(--border-secondary)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>

                    {/* Goals Next Period */}
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                            Goals for Next {formData.periodType === 'weekly' ? 'Week' : 'Month'}
                        </label>
                        <textarea
                            rows={3}
                            value={formData.questionsData.goals_next_period || ''}
                            onChange={(e) => updateQuestion('goals_next_period', e.target.value)}
                            placeholder="What do you want to accomplish?"
                            className="w-full px-3 py-2 rounded-lg border resize-none"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                borderColor: 'var(--border-secondary)',
                                color: 'var(--text-primary)',
                            }}
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--color-error-subtle)', color: 'var(--color-error)' }}>
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg font-medium transition-colors"
                            style={{
                                backgroundColor: 'var(--surface-secondary)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
                            style={{
                                backgroundColor: 'var(--btn-primary-bg)',
                                color: 'var(--btn-primary-text)',
                                opacity: isSubmitting ? 0.5 : 1,
                            }}
                        >
                            <CheckCircle className="w-4 h-4" />
                            {isSubmitting ? 'Saving...' : 'Save Retrospective'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
