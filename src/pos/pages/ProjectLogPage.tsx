import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Navbar } from '../components/Navbar';
import { Loader } from '@/components/Loader';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import type { Activity } from '../lib/types';
import { formatActivityTime } from '../lib/time';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Search, FolderKanban, Calendar, Clock } from 'lucide-react';
import { getActivityColor } from '../lib/config';
import { ProjectUrlField } from '../components/ProjectUrlField';

// Extract project URL from first line of description
function extractProjectUrl(description: string): string | null {
    const firstLine = description.split('\n')[0] ?? '';
    return firstLine.match(/^(https?:\/\/|\/|~\/|\.\/)/) ? firstLine : null;
}

function extractLocalCommits(description: string): number | null {
    const line = description.split('\n').find(l => l.startsWith('commits:'));
    return line ? parseInt(line.slice(8)) || null : null;
}

interface ProjectSummary {
    url: string | null;       // grouping key — null means no URL, grouped by title
    displayName: string;      // URL or title
    totalMinutes: number;
    sessionCount: number;
    lastDate: string;
    activities: Activity[];
}

export function ProjectLogPage() {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    useEffect(() => {
        invoke<Activity[]>('get_project_activities')
            .then(setActivities)
            .catch(e => toast.error('Failed to load project log', { description: String(e) }))
            .finally(() => setLoading(false));
    }, []);

    // Group by URL (first line of description). Activities with no URL group by title.
    const projects = useMemo(() => {
        const map = new Map<string, ProjectSummary>();
        for (const a of activities) {
            const url = extractProjectUrl(a.description ?? '');
            const key = url ?? a.title;
            const dur = (new Date(a.endTime).getTime() - new Date(a.startTime).getTime()) / 60000;
            const existing = map.get(key);
            if (existing) {
                existing.totalMinutes += dur;
                existing.sessionCount += 1;
                if (a.date > existing.lastDate) existing.lastDate = a.date;
                existing.activities.push(a);
            } else {
                map.set(key, {
                    url,
                    displayName: url ?? a.title,
                    totalMinutes: dur,
                    sessionCount: 1,
                    lastDate: a.date,
                    activities: [a],
                });
            }
        }
        return Array.from(map.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    }, [activities]);

    const filtered = useMemo(() => {
        if (!search.trim()) return projects;
        const q = search.toLowerCase();
        return projects.filter(p => p.displayName.toLowerCase().includes(q));
    }, [projects, search]);

    const activeProject = selectedKey ? projects.find(p => p.displayName === selectedKey) : null;

    const fmtHours = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = Math.round(mins % 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const renderUrl = (url: string | null, commits: number | null) => {
        if (!url) return null;
        return (
            <ProjectUrlField
                value={url}
                onChange={() => {}}
                localCommits={commits}
                readOnly
            />
        );
    };

    return (
        <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'projects' }]} />
            <div className="max-w-[1200px] mx-auto w-full p-6 flex-1 overflow-auto space-y-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <FolderKanban className="w-6 h-6" style={{ color: 'var(--pos-activity-development)' }} />
                            Project Log
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">{projects.length} projects · {activities.length} sessions</p>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={e => { setSearch(e.target.value); setSelectedKey(null); }}
                            placeholder="Search projects..."
                            className="pl-9"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12"><Loader /></div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>{search ? 'No projects match that search' : 'No development sessions logged yet'}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Project list */}
                        <div className="md:col-span-1 space-y-2">
                            {filtered.map(p => (
                                <button
                                    key={p.displayName}
                                    onClick={() => setSelectedKey(p.displayName === selectedKey ? null : p.displayName)}
                                    className="w-full text-left p-3 rounded-lg border transition-colors"
                                    style={{
                                        borderColor: selectedKey === p.displayName ? 'var(--pos-activity-development)' : 'var(--border-color)',
                                        backgroundColor: selectedKey === p.displayName ? 'var(--glass-bg-subtle)' : 'var(--bg-secondary)',
                                    }}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getActivityColor('development') }} />
                                        <p className="text-sm font-medium truncate">
                                            {p.url ? p.url.replace(/^https?:\/\//, '').replace(/^(github\.com\/[^/]+\/[^/]+).*/, '$1') : p.displayName}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground pl-4">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {fmtHours(p.totalMinutes)}
                                        </span>
                                        <span>{p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''}</span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground pl-4 mt-0.5">Last: {p.lastDate}</p>
                                </button>
                            ))}
                        </div>

                        {/* Session detail */}
                        <div className="md:col-span-2">
                            {activeProject ? (
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-lg font-semibold truncate">{activeProject.displayName}</h2>
                                            {renderUrl(activeProject.url, (() => {
                                                const a = activeProject.activities.find(x => extractLocalCommits(x.description ?? '') != null);
                                                return a ? extractLocalCommits(a.description ?? '') : null;
                                            })())}
                                        </div>
                                        <span className="text-sm text-muted-foreground shrink-0">{fmtHours(activeProject.totalMinutes)} total</span>
                                    </div>
                                    {activeProject.activities
                                        .sort((a, b) => b.date.localeCompare(a.date))
                                        .map(a => {
                                            // Strip URL prefix and commits line from description for display
                                            const url = extractProjectUrl(a.description ?? '');
                                            const displayDesc = (a.description ?? '')
                                                .split('\n')
                                                .filter((l, i) => !(i === 0 && !!url) && !l.startsWith('commits:'))
                                                .join('\n')
                                                .trim();
                                            return (
                                                <Card key={a.id} className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                                                    <CardContent className="py-3 px-4">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{a.title}</p>
                                                                {displayDesc && (
                                                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{displayDesc}</p>
                                                                )}
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <Link
                                                                    to={`/pos/grid/${a.date}`}
                                                                    className="text-xs text-muted-foreground hover:opacity-80 flex items-center gap-1 justify-end"
                                                                >
                                                                    <Calendar className="w-3 h-3" />
                                                                    {a.date}
                                                                </Link>
                                                                <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                                                                    {formatActivityTime(a.startTime)} – {formatActivityTime(a.endTime)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-full min-h-[200px] text-muted-foreground text-sm">
                                    Select a project to see sessions
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
