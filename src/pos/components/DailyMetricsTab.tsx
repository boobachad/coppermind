import { useMemo } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getActivityColor } from '../lib/config';
import { getActivityDuration, parseActivityTime } from '../lib/time';
import type { Activity } from '../lib/types';

interface Props {
    activities: Activity[];
    metrics: {
        totalMinutes: number;
        productiveMinutes: number;
        goalDirectedMinutes: number;
    };
    debtTime: number;
}

// Resolve a CSS variable to its computed hex/rgb value at runtime
function resolveCssVar(varStr: string): string {
    if (typeof window === 'undefined') return '#94a3b8';
    const match = varStr.match(/var\((--[^)]+)\)/);
    if (!match) return varStr;
    return getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim() || '#94a3b8';
}

interface TooltipPayloadItem {
    name: string;
    value: number;
    payload?: { fill?: string };
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string;
}

const ChartTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
        <div
            className="rounded px-2 py-1.5 text-xs border"
            style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
            }}
        >
            {label && <p className="font-medium mb-0.5">{label}</p>}
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.payload?.fill || 'var(--text-primary)' }}>
                    {p.name}: {p.value}m
                </p>
            ))}
        </div>
    );
};

export function DailyMetricsTab({ activities, metrics, debtTime }: Props) {
    // Category breakdown for donut + horizontal bar
    const categoryData = useMemo(() => {
        const map: Record<string, number> = {};
        for (const act of activities) {
            const dur = getActivityDuration(act.startTime, act.endTime);
            map[act.category] = (map[act.category] || 0) + dur;
        }
        return Object.entries(map)
            .map(([category, minutes]) => ({
                category,
                minutes,
                label: category.replace(/_/g, ' '),
                fill: resolveCssVar(getActivityColor(category)),
            }))
            .sort((a, b) => b.minutes - a.minutes);
    }, [activities]);

    // Radial stacked: productive / unproductive / goal-directed as % of 1440
    const radialData = useMemo(() => {
        const productiveOnly = Math.max(metrics.productiveMinutes - metrics.goalDirectedMinutes, 0);
        const unproductive = Math.max(metrics.totalMinutes - metrics.productiveMinutes, 0);
        return [
            {
                name: 'Goal-Directed',
                value: Math.round((metrics.goalDirectedMinutes / 1440) * 100),
                fill: resolveCssVar('var(--pos-warning-text)'),
            },
            {
                name: 'Productive (non-goal)',
                value: Math.round((productiveOnly / 1440) * 100),
                fill: resolveCssVar('var(--pos-success-text)'),
            },
            {
                name: 'Unproductive',
                value: Math.round((unproductive / 1440) * 100),
                fill: resolveCssVar('var(--pos-info-text)'),
            },
            {
                name: 'Debt',
                value: Math.round((debtTime / 1440) * 100),
                fill: resolveCssVar('var(--pos-error-text)'),
            },
        ];
    }, [metrics, debtTime]);

    // Hourly density: group activities into 24 hour buckets
    const hourlyData = useMemo(() => {
        const buckets: number[] = Array(24).fill(0);
        for (const act of activities) {
            const start = parseActivityTime(act.startTime);
            const end = parseActivityTime(act.endTime);
            const startH = start.getHours();
            const endH = Math.min(end.getHours() + (end.getMinutes() > 0 ? 1 : 0), 23);
            if (endH < startH) {
                // Activity spans midnight: increment startH..23 then 0..endH
                for (let h = startH; h <= 23; h++) buckets[h] += 1;
                for (let h = 0; h <= endH; h++) buckets[h] += 1;
            } else {
                for (let h = startH; h <= endH; h++) buckets[h] += 1;
            }
        }
        return buckets.map((count, h) => ({
            hour: `${h.toString().padStart(2, '0')}`,
            count,
        }));
    }, [activities]);

    const totalLogged = metrics.totalMinutes;
    const productivePct = totalLogged > 0 ? Math.round((metrics.productiveMinutes / totalLogged) * 100) : 0;

    if (activities.length === 0) {
        return (
            <div className="flex items-center justify-center h-40">
                <p className="text-xs text-muted-foreground">No activities logged — nothing to visualize</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Stat cards row */}
            <div className="grid grid-cols-4 gap-2">
                <Card className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <CardContent className="pt-4 pb-2 px-4">
                        <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Total Logged</p>
                        <p className="text-xl font-bold" style={{ color: 'var(--pos-info-text)' }}>{totalLogged}m</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{Math.round((totalLogged / 1440) * 100)}% of day</p>
                    </CardContent>
                </Card>
                <Card className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <CardContent className="pt-4 pb-2 px-4">
                        <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Productive</p>
                        <p className="text-xl font-bold" style={{ color: 'var(--pos-success-text)' }}>{metrics.productiveMinutes}m</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{productivePct}% of logged</p>
                    </CardContent>
                </Card>
                <Card className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <CardContent className="pt-4 pb-2 px-4">
                        <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Goal-Directed</p>
                        <p className="text-xl font-bold" style={{ color: 'var(--pos-warning-text)' }}>{metrics.goalDirectedMinutes}m</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            {metrics.productiveMinutes > 0 ? Math.round((metrics.goalDirectedMinutes / metrics.productiveMinutes) * 100) : 0}% of productive
                        </p>
                    </CardContent>
                </Card>
                <Card className="border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    <CardContent className="pt-4 pb-2 px-4">
                        <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Debt Time</p>
                        <p className="text-xl font-bold" style={{ color: 'var(--pos-error-text)' }}>{debtTime}m</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{Math.round((debtTime / 1440) * 100)}% unaccounted</p>
                    </CardContent>
                </Card>
            </div>

            {/* Row 1: Donut + Radial */}
            <div className="grid grid-cols-2 gap-4">
                {/* Donut: category breakdown */}
                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <div className="flex gap-4 items-center">
                            <ResponsiveContainer width={160} height={160}>
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        dataKey="minutes"
                                        nameKey="label"
                                        innerRadius={45}
                                        outerRadius={72}
                                        strokeWidth={2}
                                        stroke="var(--bg-secondary)"
                                    >
                                        {categoryData.map((entry, i) => (
                                            <Cell key={i} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Legend */}
                            <div className="flex-1 space-y-1 overflow-hidden">
                                {categoryData.slice(0, 8).map((entry) => (
                                    <div key={entry.category} className="flex items-center gap-2 min-w-0">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                                        <span className="text-[10px] uppercase truncate text-muted-foreground flex-1">{entry.label}</span>
                                        <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-primary)' }}>{entry.minutes}m</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Radial: day composition */}
                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">Day Composition (% of 24h)</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <div className="flex gap-4 items-center">
                            <ResponsiveContainer width={160} height={160}>
                                <RadialBarChart
                                    innerRadius={20}
                                    outerRadius={72}
                                    data={radialData}
                                    startAngle={90}
                                    endAngle={-270}
                                >
                                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                    <RadialBar
                                        dataKey="value"
                                        cornerRadius={4}
                                        background={{ fill: 'var(--bg-tertiary)' }}
                                    >
                                        {radialData.map((entry, i) => (
                                            <Cell key={i} fill={entry.fill} />
                                        ))}
                                    </RadialBar>
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0].payload as typeof radialData[0];
                                            return (
                                                <div className="rounded px-2 py-1.5 text-xs border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                                                    <p style={{ color: d.fill }}>{d.name}: {d.value}%</p>
                                                </div>
                                            );
                                        }}
                                    />
                                </RadialBarChart>
                            </ResponsiveContainer>
                            <div className="flex-1 space-y-1.5">
                                {radialData.map((entry) => (
                                    <div key={entry.name} className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                                        <span className="text-[10px] text-muted-foreground flex-1">{entry.name}</span>
                                        <span className="text-[10px] font-mono font-bold" style={{ color: entry.fill }}>{entry.value}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 2: Horizontal bar (top categories) */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Time by Category</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <ResponsiveContainer width="100%" height={Math.max(categoryData.length * 28, 80)}>
                        <BarChart
                            data={categoryData}
                            layout="vertical"
                            margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
                        >
                            <CartesianGrid horizontal={false} stroke="var(--border-color)" strokeOpacity={0.4} />
                            <XAxis
                                type="number"
                                dataKey="minutes"
                                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v) => `${v}m`}
                            />
                            <YAxis
                                type="category"
                                dataKey="label"
                                tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                                tickLine={false}
                                axisLine={false}
                                width={90}
                            />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                            <Bar dataKey="minutes" radius={[0, 3, 3, 0]} maxBarSize={16}>
                                {categoryData.map((entry, i) => (
                                    <Cell key={i} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Row 3: Hourly activity density */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Hourly Activity Density</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={hourlyData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                            <XAxis
                                dataKey="hour"
                                tick={{ fontSize: 9, fill: 'var(--text-secondary)' }}
                                tickLine={false}
                                axisLine={false}
                                interval={3}
                            />
                            <YAxis hide />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    return (
                                        <div className="rounded px-2 py-1 text-xs border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                                            <p>{label}:00 — {payload[0].value} activities</p>
                                        </div>
                                    );
                                }}
                                cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }}
                            />
                            <Bar
                                dataKey="count"
                                fill="var(--pos-info-text)"
                                radius={[2, 2, 0, 0]}
                                maxBarSize={20}
                                opacity={0.8}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
