import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitHubRepository, GitHubUserStats } from '../lib/types';
import { Loader } from '../../components/Loader';
import { Navbar } from '../components/Navbar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { formatDateDDMMYYYY } from '../lib/time';

export default function GitHubPage() {
    const [repos, setRepos] = useState<GitHubRepository[]>([]);
    const [userStats, setUserStats] = useState<GitHubUserStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [sortBy, setSortBy] = useState<'commits' | 'stars' | 'updated'>('commits');
    const [languageFilter, setLanguageFilter] = useState<string>('all');
    const [username, setUsername] = useState<string | null>(null);

    useEffect(() => {
        // Load GitHub username from config first, then fetch data
        invoke<{ githubUsername: string | null }>('get_pos_config')
            .then((cfg) => {
                setUsername(cfg.githubUsername);
            })
            .catch((err) => {
                console.error('Failed to load config:', err);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (username !== null) {
            loadData();
        }
    }, [username, sortBy, languageFilter]);

    async function loadData() {
        if (!username) {
            toast.error('GitHub username not configured', { description: 'Set GITHUB_USERNAME in your environment.' });
            setLoading(false);
            return;
        }
        try {
            setLoading(true);

            const reposData = await invoke<GitHubRepository[]>('get_github_repositories', {
                username,
                language: languageFilter === 'all' ? null : languageFilter,
                minCommits: null,
                sortBy,
                limit: 100,
            });

            setRepos(reposData);

            // Try to fetch user stats, but don't fail if they don't exist yet
            try {
                const statsData = await invoke<GitHubUserStats>('get_github_user_stats', { username });
                setUserStats(statsData);
            } catch (statsErr) {
                console.warn('User stats not available yet:', statsErr);
                setUserStats(null);
            }
        } catch (err: any) {
            const errorMsg = err?.message || err?.toString() || 'Unknown error occurred';
            toast.error('Failed to load repositories', { description: errorMsg });
            console.error('Load data error:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSync() {
        try {
            setSyncing(true);
            await invoke('scrape_github');
            toast.success('GitHub sync complete');
            // Reload data to get updated stats
            await loadData();
        } catch (err: any) {
            const errorMsg = err?.message || err?.toString() || 'Unknown error occurred';
            toast.error('Sync failed', { description: errorMsg });
            console.error('Sync error:', err);
        } finally {
            setSyncing(false);
        }
    }

    if (loading) {
        return (
            <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'github' }]} />
                <div className="flex items-center justify-center flex-1">
                    <Loader />
                </div>
            </div>
        );
    }

    const languages = Array.from(new Set(repos.map(r => r.primaryLanguage).filter(Boolean))) as string[];

    return (
        <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'github' }]} />
            
            <div className="max-w-[1400px] mx-auto space-y-6 p-8 flex-1 overflow-auto">
                {/* Header with Sync Button */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold">GitHub Repositories</h1>
                    <Button
                        onClick={handleSync}
                        disabled={syncing}
                        className="gap-2"
                    >
                        {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
                        {syncing ? 'Syncing...' : 'Sync GitHub'}
                    </Button>
                </div>

                {/* User Stats Dashboard */}
                {userStats && (
                    <div className="p-6 rounded-lg border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                        <h2 className="text-lg font-semibold mb-4">Overview</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard label="Repositories" value={userStats.totalRepos} />
                            <StatCard label="Commits" value={userStats.totalCommits} />
                            <StatCard label="Pull Requests" value={userStats.totalPrs} />
                            <StatCard label="Issues" value={userStats.totalIssues} />
                            <StatCard label="Reviews" value={userStats.totalReviews} />
                            <StatCard label="Stars Received" value={userStats.totalStarsReceived} />
                            <StatCard label="Current Streak" value={`${userStats.currentStreakDays} days`} />
                            <StatCard label="Longest Streak" value={`${userStats.longestStreakDays} days`} />
                        </div>
                    </div>
                )}

                {/* Filters */}
                <div className="flex items-center gap-4 p-4 rounded-lg border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">Sort by:</label>
                        <Select value={sortBy} onValueChange={(value) => setSortBy(value as any)}>
                            <SelectTrigger className="w-[180px] border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="material-glass">
                                <SelectItem value="commits">Commits</SelectItem>
                                <SelectItem value="stars">Stars</SelectItem>
                                <SelectItem value="updated">Recently Updated</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">Language:</label>
                        <Select value={languageFilter} onValueChange={setLanguageFilter}>
                            <SelectTrigger className="w-[180px] border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
                                <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent className="material-glass">
                                <SelectItem value="all">All</SelectItem>
                                {languages.map(lang => (
                                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Repository Cards */}
                {repos.length === 0 ? (
                    <div className="text-center py-12 text-foreground opacity-60">
                        No repositories found. Click "Sync GitHub" to fetch data.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {repos.map(repo => (
                            <RepoCard key={repo.id} repo={repo} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="p-4 rounded border" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}>
            <div className="text-xs text-foreground opacity-60 mb-1">{label}</div>
            <div className="text-2xl font-semibold">{value}</div>
        </div>
    );
}

function RepoCard({ repo }: { repo: GitHubRepository }) {
    return (
        <div className="p-4 rounded-lg border hover:border-primary transition-colors" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                    <a
                        href={repo.repoUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium truncate block"
                    >
                        {repo.fullName}
                    </a>
                    {repo.description && (
                        <p className="text-sm text-foreground opacity-70 mt-1 line-clamp-2">
                            {repo.description}
                        </p>
                    )}
                </div>
                {repo.isPrivate && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-500 rounded">
                        Private
                    </span>
                )}
            </div>

            {/* Language */}
            {repo.primaryLanguage && (
                <div className="flex items-center gap-2 mb-3">
                    <span className="w-3 h-3 rounded-full bg-primary"></span>
                    <span className="text-sm">{repo.primaryLanguage}</span>
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-sm text-foreground opacity-70">
                <div className="flex items-center gap-1">
                    <span>💻</span>
                    <span>{repo.totalCommits} commits</span>
                </div>
                <div className="flex items-center gap-1">
                    <span>⭐</span>
                    <span>{repo.stars} stars</span>
                </div>
                <div className="flex items-center gap-1">
                    <span>🔀</span>
                    <span>{repo.totalPrs} PRs</span>
                </div>
                <div className="flex items-center gap-1">
                    <span>🍴</span>
                    <span>{repo.forks} forks</span>
                </div>
            </div>

            {/* Footer */}
            {repo.repoUpdatedAt && (
                <div className="mt-3 pt-3 border-t text-xs text-foreground opacity-60" style={{ borderColor: 'var(--border-color)' }}>
                    Updated {formatDateDDMMYYYY(new Date(repo.repoUpdatedAt))}
                </div>
            )}
        </div>
    );
}
