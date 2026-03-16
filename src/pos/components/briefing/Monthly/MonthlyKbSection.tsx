import { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyBriefingResponse } from '../../../lib/types';
import { resolveCssVar, ChartTooltip, StatCard, EmptyChart } from '../BriefingCharts';

interface Props {
    data: MonthlyBriefingResponse;
}

export function MonthlyKbSection({ data }: Props) {
    const stats = data.kbStats;

    if (stats.itemsAdded === 0) {
        return (
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <EmptyChart message="No KB activity this month" />
                </CardContent>
            </Card>
        );
    }

    const successColor = resolveCssVar('var(--pos-success-text)');
    const errorColor = resolveCssVar('var(--pos-error-text)');
    const infoColor = resolveCssVar('var(--pos-info-text)');

    const inboxDeltaColor = stats.inboxDelta <= 0 ? successColor : errorColor;

    // Source donut
    const sourceData = useMemo(() =>
        stats.bySource.map(([name, value], i) => ({
            name,
            value,
            fill: resolveCssVar([
                'var(--pos-info-text)',
                'var(--pos-success-text)',
                'var(--pos-warning-text)',
                'var(--pos-error-text)',
            ][i % 4] ?? 'var(--pos-info-text)'),
        })),
        [stats.bySource],
    );

    // Top tags bar (horizontal)
    const tagsData = useMemo(() =>
        stats.topTags.slice(0, 10).map(([tag, count]) => ({ tag, count })),
        [stats.topTags],
    );

    return (
        <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Added" value={stats.itemsAdded} color={infoColor} />
                <StatCard label="Reviewed" value={stats.itemsReviewed} />
                <StatCard label="Completed" value={stats.itemsCompleted} color={successColor} />
                <StatCard
                    label="Inbox Delta"
                    value={stats.inboxDelta > 0 ? `+${stats.inboxDelta}` : String(stats.inboxDelta)}
                    color={inboxDeltaColor}
                    sub={stats.inboxDelta <= 0 ? 'shrinking' : 'growing'}
                />
            </div>

            {/* Source donut + top tags */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">By Source</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4 flex justify-center">
                        {sourceData.length === 0
                            ? <EmptyChart />
                            : (
                                <ResponsiveContainer width={140} height={140}>
                                    <PieChart>
                                        <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={60} strokeWidth={2} stroke="var(--bg-secondary)" />
                                        <Tooltip content={<ChartTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )
                        }
                    </CardContent>
                </Card>

                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">Top Tags</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        {tagsData.length === 0
                            ? <EmptyChart />
                            : (
                                <ResponsiveContainer width="100%" height={140}>
                                    <BarChart data={tagsData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                                        <CartesianGrid horizontal={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                                        <XAxis type="number" hide />
                                        <YAxis type="category" dataKey="tag" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={80} />
                                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                                        <Bar dataKey="count" name="Items" fill={infoColor} radius={[0, 3, 3, 0]} maxBarSize={14} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )
                        }
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
