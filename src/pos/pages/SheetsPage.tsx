import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Navbar } from '../components/Navbar';
import { formatDateDDMMYYYY, formatTime } from '../lib/time';
import type { Submission } from '../lib/types';
import { Loader } from '@/components/Loader';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export function SheetsPage() {
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [verdictFilter, setVerdictFilter] = useState<string>('Accepted');

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
                    description: `LC: ${lcData.newSubmissions ?? 0}, CF: ${cfData.newSubmissions ?? 0}`
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
            if (sub.rating < 1200) return 'text-foreground opacity-60';
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
        return 'text-foreground opacity-60';
    };

    // Client-side filtering (O(n))
    const filteredSubmissions = useMemo(() => {
        return submissions.filter(sub => {
            const platformMatch = platformFilter === 'all' || sub.platform === platformFilter;
            const verdictMatch = verdictFilter === 'all' || sub.verdict === verdictFilter;
            return platformMatch && verdictMatch;
        });
    }, [submissions, platformFilter, verdictFilter]);

    // Extract unique verdicts for dropdown
    const uniqueVerdicts = useMemo(() => {
        const verdicts = new Set(submissions.map(s => s.verdict).filter(Boolean));
        return Array.from(verdicts).sort();
    }, [submissions]);

    return (
        <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'sheets' }]} />
            <div className="max-w-[1400px] mx-auto space-y-6 p-8 flex-1 overflow-auto">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Submission Sheets</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <Select value={platformFilter} onValueChange={setPlatformFilter}>
                            <SelectTrigger className="w-[140px] material-glass-subtle border-none text-sm">
                                <SelectValue placeholder="Platform" />
                            </SelectTrigger>
                            <SelectContent className="material-glass">
                                <SelectItem value="all">All Platforms</SelectItem>
                                <SelectItem value="leetcode">LeetCode</SelectItem>
                                <SelectItem value="codeforces">Codeforces</SelectItem>
                                <SelectItem value="github">GitHub</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={verdictFilter} onValueChange={setVerdictFilter}>
                            <SelectTrigger className="w-[140px] material-glass-subtle border-none text-sm">
                                <SelectValue placeholder="Verdict" />
                            </SelectTrigger>
                            <SelectContent className="material-glass">
                                <SelectItem value="all">All Verdicts</SelectItem>
                                {uniqueVerdicts.map(verdict => (
                                    <SelectItem key={verdict} value={verdict}>{verdict}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="px-3 py-1 rounded border text-sm text-foreground opacity-70 font-mono" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                            Total: <span className="text-foreground">{filteredSubmissions.length}</span>
                        </div>
                        <Button
                            onClick={fetchSubmissions}
                            disabled={loading}
                            variant="outline"
                            className="border text-foreground opacity-70 transition-colors"
                            style={{ borderColor: 'var(--border-color)' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            {loading ? (
                                <Loader />
                            ) : (
                                'Refresh'
                            )}
                        </Button>
                        <Button
                            onClick={syncAll}
                            disabled={syncing}
                            style={{
                                backgroundColor: 'var(--btn-primary-bg)',
                                color: 'var(--btn-primary-text)'
                            }}
                            className="hover:opacity-90"
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

                <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-b border-border backdrop-blur-sm">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground opacity-70 uppercase tracking-wider">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground opacity-70 uppercase tracking-wider">Platform</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground opacity-70 uppercase tracking-wider">Problem</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground opacity-70 uppercase tracking-wider">Diff / Rating</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground opacity-70 uppercase tracking-wider">Tags</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground opacity-70 uppercase tracking-wider">Submitted</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground opacity-70 uppercase tracking-wider">Verdict</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-foreground opacity-70 uppercase tracking-wider">Lang</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {filteredSubmissions.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-foreground opacity-60">
                                            {loading ? (
                                                <div className="flex justify-center">
                                                    <Loader />
                                                </div>
                                            ) : submissions.length === 0 ? 'No submissions found' : 'No submissions match filters'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSubmissions.map((sub, index) => (
                                        <tr key={sub.problemId} className="hover:bg-muted/50 transition-colors border-b border-border/50">
                                            <td className="px-4 py-3 text-xs text-foreground opacity-60 font-mono">
                                                {index + 1}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-mono border" style={{
                                                    backgroundColor: sub.platform === 'leetcode' ? 'var(--pos-warning-bg)' : sub.platform === 'github' ? 'var(--pos-success-bg)' : 'var(--pos-info-bg)',
                                                    color: sub.platform === 'leetcode' ? 'var(--pos-warning-text)' : sub.platform === 'github' ? 'var(--pos-success-text)' : 'var(--pos-info-text)',
                                                    borderColor: sub.platform === 'leetcode' ? 'var(--pos-warning-border)' : sub.platform === 'github' ? 'var(--pos-success-border)' : 'var(--pos-info-border)'
                                                }}>
                                                    {sub.platform === 'leetcode' ? 'LC' : sub.platform === 'github' ? 'GH' : 'CF'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-foreground text-sm">{sub.problemTitle}</div>
                                                <div className="text-[10px] text-foreground opacity-60 font-mono">{sub.problemId}</div>
                                            </td>
                                            <td className={`px-4 py-3 text-xs font-bold ${getDifficultyColor(sub)}`}>
                                                {sub.difficulty || sub.rating || '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {sub.tags && sub.tags.length > 0 ? (
                                                        sub.tags.slice(0, 3).map((tag: string) => (
                                                            <span key={tag} className="text-[10px] px-1.5 py-0.5 text-secondary-foreground rounded border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                                                                {tag}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-foreground opacity-60 text-[10px]">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-foreground opacity-70 tabular-nums">
                                                <div className="flex flex-col gap-1">
                                                    {sub.allTimestamps?.map((t: string, i: number) => (
                                                        <div
                                                            key={i}
                                                            className="whitespace-nowrap"
                                                            style={{
                                                                color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                                fontWeight: i === 0 ? 500 : 400,
                                                                opacity: i === 0 ? 1 : 0.75
                                                            }}
                                                        >
                                                            {formatDateDDMMYYYY(new Date(t))} {formatTime(new Date(t))}
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                <span style={{ color: sub.verdict === 'Accepted' ? 'var(--pos-success-text)' : 'var(--pos-error-text)' }}>
                                                    {sub.verdict}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-foreground opacity-70 font-mono">
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
