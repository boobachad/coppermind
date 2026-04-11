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
import { Search, UtensilsCrossed, Calendar } from 'lucide-react';

export function FoodLogPage() {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        invoke<Activity[]>('get_food_activities')
            .then(setActivities)
            .catch(e => toast.error('Failed to load food log', { description: String(e) }))
            .finally(() => setLoading(false));
    }, []);

    // Aggregate: item frequency across all logs
    const itemFrequency = useMemo(() => {
        const freq: Record<string, number> = {};
        for (const a of activities) {
            for (const raw of (a.foodItems ?? [])) {
                const name = raw.split('|')[0].toLowerCase();
                freq[name] = (freq[name] ?? 0) + 1;
            }
        }
        return Object.entries(freq).sort((a, b) => b[1] - a[1]);
    }, [activities]);

    const filtered = useMemo(() => {
        if (!search.trim()) return activities;
        const q = search.toLowerCase();
        return activities.filter(a =>
            a.title.toLowerCase().includes(q) ||
            (a.foodItems ?? []).some(raw => raw.split('|')[0].toLowerCase().includes(q))
        );
    }, [activities, search]);

    // Group by date
    const grouped = useMemo(() => {
        const map = new Map<string, Activity[]>();
        for (const a of filtered) {
            const list = map.get(a.date) ?? [];
            list.push(a);
            map.set(a.date, list);
        }
        return map;
    }, [filtered]);

    const dates = Array.from(grouped.keys());

    return (
        <div className="h-full flex flex-col text-foreground" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <Navbar breadcrumbItems={[{ label: 'pos', href: '/pos' }, { label: 'food log' }]} />
            <div className="max-w-[1200px] mx-auto w-full p-6 flex-1 overflow-auto space-y-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <UtensilsCrossed className="w-6 h-6" style={{ color: 'var(--pos-activity-food)' }} />
                            Food Log
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">{activities.length} entries</p>
                    </div>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search food items..."
                            className="pl-9"
                        />
                    </div>
                </div>

                {/* Top items */}
                {itemFrequency.length > 0 && (
                    <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                        <CardContent className="pt-4 pb-3 px-4">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Most Frequent</p>
                            <div className="flex flex-wrap gap-2">
                                {itemFrequency.slice(0, 20).map(([item, count]) => (
                                    <button
                                        key={item}
                                        onClick={() => setSearch(item)}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors hover:opacity-80"
                                        style={{ backgroundColor: 'var(--glass-bg-subtle)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}
                                    >
                                        <span className="capitalize">{item}</span>
                                        <span className="opacity-50 font-mono">{count}×</span>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {loading ? (
                    <div className="flex justify-center py-12"><Loader /></div>
                ) : dates.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p>{search ? 'No results for that search' : 'No food entries logged yet'}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {dates.map(date => (
                            <div key={date}>
                                <Link
                                    to={`/pos/grid/${date}`}
                                    className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 hover:opacity-80 transition-opacity w-fit"
                                >
                                    <Calendar className="w-3.5 h-3.5" />
                                    {date}
                                </Link>
                                <div className="space-y-1.5">
                                    {(grouped.get(date) ?? []).map(a => (
                                        <Card key={a.id} className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                                            <CardContent className="py-3 px-4">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium truncate">{a.title}</p>
                                                        {(a.foodItems ?? []).length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                                {(a.foodItems ?? []).map((raw, i) => {
                                                                    const [name, qty] = raw.split('|');
                                                                    return (
                                                                        <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border"
                                                                            style={{ backgroundColor: 'var(--glass-bg-subtle)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>
                                                                            <span>{name}</span>
                                                                            {qty && <span className="opacity-50 font-mono">×{qty}</span>}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        {a.description && (
                                                            <p className="text-xs text-muted-foreground mt-1 truncate">{a.description}</p>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground shrink-0 tabular-nums">
                                                        {formatActivityTime(a.startTime)} – {formatActivityTime(a.endTime)}
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
