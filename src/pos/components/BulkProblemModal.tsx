import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { X, Link2, CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface BulkProblemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface BulkAddResult {
    addedCount: number;
    skippedCount: number;
    errors: string[];
}

export function BulkProblemModal({ isOpen, onClose, onSuccess }: BulkProblemModalProps) {
    const [urlsText, setUrlsText] = useState('');
    const [action, setAction] = useState<'SaveToLadder' | 'GoalForToday'>('SaveToLadder');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<BulkAddResult | null>(null);

    const handleSubmit = async () => {
        const urls = urlsText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (urls.length === 0) {
            toast.error('Please enter at least one URL');
            return;
        }

        setIsSubmitting(true);
        setResult(null);

        try {
            const response = await invoke<BulkAddResult>('bulk_add_problems', {
                req: {
                    urls,
                    action,
                },
            });

            setResult(response);

            if (response.addedCount > 0) {
                toast.success(`Added ${response.addedCount} problem(s)`);
                onSuccess();
            }

            if (response.errors.length > 0) {
                toast.warning(`${response.skippedCount} problem(s) skipped`);
            }
        } catch (err) {
            toast.error('Failed to add problems', { description: String(err) });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setUrlsText('');
        setAction('SaveToLadder');
        setResult(null);
        onClose();
    };

    const urlCount = urlsText.split('\n').filter(line => line.trim().length > 0).length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
            <div className="rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto material-glass border shadow-xl">
                <div className="p-6 border-b flex justify-between items-center sticky top-0 z-10 backdrop-blur-xl bg-background/80" style={{ borderColor: 'var(--border-color)' }}>
                    <div>
                        <h3 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                            Bulk Add Problems
                        </h3>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                            Add multiple Codeforces or LeetCode problems at once
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {/* URL Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                            Problem URLs (one per line)
                        </label>
                        <textarea
                            value={urlsText}
                            onChange={(e) => setUrlsText(e.target.value)}
                            placeholder="https://codeforces.com/problemset/problem/1234/A&#10;https://leetcode.com/problems/two-sum/&#10;https://codeforces.com/contest/1234/problem/B"
                            className="w-full px-4 py-3 rounded-xl h-48 resize-none focus:ring-2 focus:ring-blue-500/50 bg-secondary border border-border font-mono text-sm"
                            style={{ color: 'var(--text-primary)' }}
                        />
                        <div className="flex items-center justify-between">
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                Supports Codeforces and LeetCode URLs
                            </p>
                            <p className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                                {urlCount} URL{urlCount !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>

                    {/* Action Selection */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                            Action
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setAction('SaveToLadder')}
                                className={clsx(
                                    'p-4 rounded-xl border-2 transition-all text-left',
                                    action === 'SaveToLadder'
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-border bg-secondary hover:bg-secondary/80'
                                )}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Link2 className="w-5 h-5" style={{ color: action === 'SaveToLadder' ? 'var(--pos-info-text)' : 'var(--text-secondary)' }} />
                                    <span className="font-bold" style={{ color: action === 'SaveToLadder' ? 'var(--pos-info-text)' : 'var(--text-primary)' }}>
                                        Save to Ladder
                                    </span>
                                </div>
                                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                    Add to "My Practice Ladder" for later
                                </p>
                            </button>

                            <button
                                onClick={() => setAction('GoalForToday')}
                                className={clsx(
                                    'p-4 rounded-xl border-2 transition-all text-left',
                                    action === 'GoalForToday'
                                        ? 'border-green-500 bg-green-500/10'
                                        : 'border-border bg-secondary hover:bg-secondary/80'
                                )}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="w-5 h-5" style={{ color: action === 'GoalForToday' ? 'var(--pos-success-text)' : 'var(--text-secondary)' }} />
                                    <span className="font-bold" style={{ color: action === 'GoalForToday' ? 'var(--pos-success-text)' : 'var(--text-primary)' }}>
                                        Goal for Today
                                    </span>
                                </div>
                                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                    Add to ladder + create today's goals
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* Results */}
                    {result && (
                        <div className="rounded-xl p-4 space-y-3 bg-secondary/50 border" style={{ borderColor: 'var(--border-color)' }}>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>Results</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--pos-success-text)' }} />
                                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                        Added: <span className="font-bold">{result.addedCount}</span>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" style={{ color: 'var(--pos-warning-text)' }} />
                                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                        Skipped: <span className="font-bold">{result.skippedCount}</span>
                                    </span>
                                </div>
                            </div>
                            {result.errors.length > 0 && (
                                <div className="mt-3 space-y-1">
                                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                                        Errors
                                    </p>
                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                        {result.errors.map((err, idx) => (
                                            <p key={idx} className="text-xs font-mono" style={{ color: 'var(--pos-error-text)' }}>
                                                {err}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t flex justify-end gap-3 sticky bottom-0 backdrop-blur-xl bg-background/80" style={{ borderColor: 'var(--border-color)' }}>
                    <button
                        onClick={handleClose}
                        className="px-5 py-2.5 font-medium rounded-xl hover:bg-secondary/80 transition-colors text-muted-foreground"
                    >
                        {result ? 'Close' : 'Cancel'}
                    </button>
                    {!result && (
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || urlCount === 0}
                            className="px-7 py-2.5 font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] bg-primary text-primary-foreground"
                        >
                            {isSubmitting ? 'Adding...' : `Add ${urlCount} Problem${urlCount !== 1 ? 's' : ''}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
