import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { GitHubRepository, GitHubUserStats } from '../lib/types';
import { Loader } from '../../components/Loader';
import { Navbar } from '../components/Navbar';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function GitHubPage() {
    const [repos, setRepos] = useState<GitHubRepository[]>([]);
    const [userStats, setUserStats] = useState<GitHubUserStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [sortBy, setSortBy] = useState<'commits' | 'stars' | 'updated'>('commits');
    const [languageFilter, setLanguageFilter] = useState<string>('');

    const username = 'boobachad'; // TODO: Get from config

    useEffect(() => {
        loadData();
    }, [sortBy, languageFilter]);

    async function loadData() {
        try {
            setLoading(true);

            const reposData = await invoke<GitHubRepository[]>('get_github_repositories', {
                username,
                language: languageFilter || null,
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
            <div className="flex items-center justify-center h-full">
                <Loader />
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
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="px-3 py-1.5 rounded border"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                        >
                            <option value="commits">Commits</option>
                            <option value="stars">Stars</option>
                            <option value="updated">Recently Updated</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">Language:</label>
                        <select
                            value={languageFilter}
                            onChange={(e) => setLanguageFilter(e.target.value)}
                            className="px-3 py-1.5 rounded border"
                            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
                        >
                            <option value="">All</option>
                            {languages.map(lang => (
                                <option key={lang} value={lang}>{lang}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Repository Cards */}
                {repos.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
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
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
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
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
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
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
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
                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground" style={{ borderColor: 'var(--border-color)' }}>
                    Updated {new Date(repo.repoUpdatedAt).toLocaleDateString()}
                </div>
            )}
        </div>
    );
}
