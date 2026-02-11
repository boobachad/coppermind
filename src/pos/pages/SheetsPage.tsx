import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Navbar } from '../components/Navbar';
import { formatDateDDMMYYYY, formatTime } from '../lib/time';
import type { Submission } from '../lib/types';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function SheetsPage() {
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        fetchSubmissions();
    }, []);

    const fetchSubmissions = async () => {
        setLoading(true);
        try {
            const rawData = await invoke<Submission[]>('get_submissions');

            const groupedMap = new Map<string, any>();

            rawData.forEach((sub) => {
                const key = `${sub.platform}-${sub.problemId}`;
                const existing = groupedMap.get(key);

                if (!existing) {
                    groupedMap.set(key, {
                        ...sub,
                        allTimestamps: [sub.submittedTime]
                    });
                } else {
                    existing.allTimestamps.push(sub.submittedTime);

                    if (new Date(sub.submittedTime).getTime() > new Date(existing.submittedTime).getTime()) {
                        existing.submittedTime = sub.submittedTime;
                        existing.verdict = sub.verdict;
                        existing.language = sub.language;
                        existing.rating = sub.rating;
                        existing.difficulty = sub.difficulty;
                        existing.tags = sub.tags;
                    }
                }
            });

            const groupedSubmissions = Array.from(groupedMap.values()).map(sub => ({
                ...sub,
                allTimestamps: sub.allTimestamps.sort((a: string, b: string) =>
                    new Date(b).getTime() - new Date(a).getTime()
                )
            }));

            groupedSubmissions.sort((a, b) => new Date(b.submittedTime).getTime() - new Date(a.submittedTime).getTime());

            setSubmissions(groupedSubmissions);
        } catch (error) {
            toast.error('Failed to fetch submissions', { description: String(error) });
        } finally {
            setLoading(false);
        }
    };

    const syncAll = async () => {
        setSyncing(true);
        try {
            // Sequential to avoid memory corruption from concurrent HTTP clients
            const lcData = await invoke<{ platform: string; newSubmissions: number; totalSubmissions: number }>('scrape_leetcode')
                .catch((err) => {
                    toast.error('LeetCode sync failed', { description: String(err) });
                    return { platform: 'leetcode', newSubmissions: 0, totalSubmissions: 0 };
                });
            
            const cfData = await invoke<{ platform: string; newSubmissions: number; totalSubmissions: number }>('scrape_codeforces')
                .catch((err) => {
                    toast.error('Codeforces sync failed', { description: String(err) });
                    return { platform: 'codeforces', newSubmissions: 0, totalSubmissions: 0 };
                });

            const totalNew = (lcData.newSubmissions ?? 0) + (cfData.newSubmissions ?? 0);
            
            if (totalNew > 0) {
                toast.success('Sync complete', {
                    description: `LC: ${lcData.newSubmissions ?? 0} new, CF: ${cfData.newSubmissions ?? 0} new`
                });
            } else {
                toast.info('No new submissions found');
            }
            
            await fetchSubmissions();
        } catch (error) {
            toast.error('Sync failed', { description: String(error) });
        } finally {
            setSyncing(false);
        }
    };

    const getDifficultyColor = (sub: any) => {
        if (sub.platform === 'codeforces' && sub.rating) {
            if (sub.rating < 1200) return 'text-muted-foreground';
            if (sub.rating < 1400) return 'text-green-500';
            if (sub.rating < 1600) return 'text-cyan-500';
            if (sub.rating < 1900) return 'text-blue-500';
            if (sub.rating < 2100) return 'text-violet-500';
            return 'text-orange-500';
        }
        if (sub.platform === 'leetcode' && sub.difficulty) {
            if (sub.difficulty === 'Easy') return 'text-green-500';
            if (sub.difficulty === 'Medium') return 'text-yellow-500';
            if (sub.difficulty === 'Hard') return 'text-red-500';
        }
        return 'text-muted-foreground';
    };

    return (
        <div className="h-full flex flex-col bg-background text-foreground">
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'sheets' }]} />
            <div className="max-w-[1400px] mx-auto space-y-6 p-8 flex-1 overflow-auto">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Submission Sheets</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 rounded bg-secondary border border-border text-sm text-muted-foreground font-mono">
                            Total: <span className="text-foreground">{submissions.length}</span>
                        </div>
                        <Button
                            onClick={fetchSubmissions}
                            disabled={loading}
                            variant="outline"
                            className="border-border text-muted-foreground hover:bg-secondary"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                'Refresh'
                            )}
                        </Button>
                        <Button
                            onClick={syncAll}
                            disabled={syncing}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {syncing ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Syncing...
                                </>
                            ) : (
                                'Sync Everything'
                            )}
                        </Button>
                    </div>
                </div>

                <div className="border border-border rounded-lg overflow-hidden bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-b border-border backdrop-blur-sm">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Platform</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Problem</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Diff / Rating</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Submitted</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Verdict</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Lang</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {submissions.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                                            {loading ? 'Loading submissions...' : 'No submissions found'}
                                        </td>
                                    </tr>
                                ) : (
                                    submissions.map((sub, index) => (
                                        <tr key={sub.problemId} className="hover:bg-muted/50 transition-colors border-b border-border/50">
                                            <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                                                {index + 1}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-mono border" style={{
                                                    backgroundColor: sub.platform === 'leetcode' ? 'var(--pos-warning-bg)' : 'var(--pos-info-bg)',
                                                    color: sub.platform === 'leetcode' ? 'var(--pos-warning-text)' : 'var(--pos-info-text)',
                                                    borderColor: sub.platform === 'leetcode' ? 'var(--pos-warning-border)' : 'var(--pos-info-border)'
                                                }}>
                                                    {sub.platform === 'leetcode' ? 'LC' : 'CF'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-foreground text-sm">{sub.problemTitle}</div>
                                                <div className="text-[10px] text-muted-foreground font-mono">{sub.problemId}</div>
                                            </td>
                                            <td className={`px-4 py-3 text-xs font-bold ${getDifficultyColor(sub)}`}>
                                                {sub.difficulty || sub.rating || '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {sub.tags && sub.tags.length > 0 ? (
                                                        sub.tags.slice(0, 3).map((tag: string) => (
                                                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded border border-border/50">
                                                                {tag}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-muted-foreground text-[10px]">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                                                <div className="flex flex-col gap-1">
                                                    {sub.allTimestamps?.map((t: string, i: number) => (
                                                        <div key={i} className={i === 0 ? "text-foreground font-medium" : "text-muted-foreground/70"}>
                                                            {formatDateDDMMYYYY(new Date(t))} <span className="text-[10px] ml-1 opacity-70">{formatTime(new Date(t))}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                <span style={{ color: sub.verdict === 'Accepted' ? 'var(--pos-success-text)' : 'var(--pos-error-text)' }}>
                                                    {sub.verdict}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                                                {sub.language}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
