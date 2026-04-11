import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { RepoInfo } from '../lib/types';
import { Loader2, Star, GitFork, GitCommitHorizontal, Globe, Lock, ExternalLink } from 'lucide-react';

interface Props {
    value: string;
    onChange: (v: string) => void;
    /** If true, show commit count input for local paths */
    localCommits?: number | null;
    onLocalCommitsChange?: (n: number | null) => void;
    /** Read-only mode — just display, no editing */
    readOnly?: boolean;
}

/** Parse github.com/owner/repo from a URL string */
function parseGitHubOwnerRepo(url: string): { owner: string; repo: string } | null {
    try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`);
        if (!u.hostname.includes('github.com')) return null;
        const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
        if (parts.length < 2 || !parts[0] || !parts[1]) return null;
        return { owner: parts[0], repo: parts[1] };
    } catch {
        return null;
    }
}

function isLocalPath(url: string): boolean {
    return url.startsWith('/') || url.startsWith('~/') || url.startsWith('./') || url.startsWith('../');
}

function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function ProjectUrlField({ value, onChange, localCommits, onLocalCommitsChange, readOnly = false }: Props) {
    const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
    const [fetching, setFetching] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const parsed = parseGitHubOwnerRepo(value);
    const isLocal = isLocalPath(value);
    const isGitHub = !!parsed;

    const handleFetch = async () => {
        if (!parsed) return;
        setFetching(true);
        setFetchError(null);
        setRepoInfo(null);
        try {
            const info = await invoke<RepoInfo>('fetch_github_repo_info', {
                owner: parsed.owner,
                repo: parsed.repo,
            });
            setRepoInfo(info);
        } catch (e) {
            setFetchError(String(e));
        } finally {
            setFetching(false);
        }
    };

    return (
        <div className="space-y-2">
            {!readOnly && (
                <div className="flex gap-2">
                    <Input
                        value={value}
                        onChange={e => { onChange(e.target.value); setRepoInfo(null); setFetchError(null); }}
                        placeholder="https://github.com/user/repo  or  ~/projects/myapp"
                        className="flex-1"
                    />
                    {isGitHub && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleFetch}
                            disabled={fetching}
                            className="shrink-0"
                            style={{ borderColor: 'var(--glass-border)' }}
                        >
                            {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Fetch'}
                        </Button>
                    )}
                </div>
            )}

            {/* Local path — commit count input */}
            {isLocal && !readOnly && onLocalCommitsChange && (
                <div className="flex items-center gap-2">
                    <GitCommitHorizontal className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    <Input
                        type="number"
                        min={0}
                        value={localCommits ?? ''}
                        onChange={e => onLocalCommitsChange(e.target.value ? parseInt(e.target.value) : null)}
                        placeholder="Commit count (optional)"
                        className="w-48 h-8 text-sm"
                    />
                </div>
            )}

            {/* Local path read-only display */}
            {isLocal && readOnly && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-mono">{value}</span>
                    {localCommits != null && (
                        <span className="flex items-center gap-1">
                            <GitCommitHorizontal className="w-3 h-3" />
                            {localCommits} commits
                        </span>
                    )}
                </div>
            )}

            {/* Fetch error */}
            {fetchError && (
                <p className="text-xs" style={{ color: 'var(--pos-error-text)' }}>{fetchError}</p>
            )}

            {/* GitHub repo info card */}
            {repoInfo && (
                <div className="rounded-lg border p-3 space-y-2"
                    style={{ borderColor: 'var(--glass-border)', backgroundColor: 'var(--glass-bg-subtle)' }}>
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                {repoInfo.isPrivate
                                    ? <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                                    : <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                                }
                                <a href={repoInfo.repoUrl} target="_blank" rel="noreferrer"
                                    className="text-sm font-medium hover:opacity-80 flex items-center gap-1"
                                    style={{ color: 'var(--pos-info-text)' }}>
                                    {repoInfo.fullName}
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                            {repoInfo.description && (
                                <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                                    {repoInfo.description}
                                </p>
                            )}
                        </div>
                        {repoInfo.primaryLanguage && (
                            <span className="text-xs px-2 py-0.5 rounded-full border shrink-0"
                                style={{ borderColor: 'var(--glass-border)', color: 'var(--text-secondary)' }}>
                                {repoInfo.primaryLanguage}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className="flex items-center gap-1">
                            <Star className="w-3 h-3" />{repoInfo.stars}
                        </span>
                        <span className="flex items-center gap-1">
                            <GitFork className="w-3 h-3" />{repoInfo.forks}
                        </span>
                        {repoInfo.totalCommits != null && (
                            <span className="flex items-center gap-1">
                                <GitCommitHorizontal className="w-3 h-3" />{repoInfo.totalCommits} commits
                            </span>
                        )}
                        {repoInfo.lastPush && (
                            <span className="ml-auto">pushed {fmtDate(repoInfo.lastPush)}</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
