import { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyBriefingResponse } from '../../../lib/types';
import { formatMinutes } from '../../../lib/briefing-utils';
import { resolveCssVar, ChartTooltip, StatCard, EmptyChart } from '../BriefingCharts';

interface Props {
    data: MonthlyBriefingResponse;
}

export function MonthlyReadingSection({ data }: Props) {
    const stats = data.readingStats;

    if (stats.totalPages === 0) {
        return (
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Reading</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <EmptyChart message="No reading logged this month" />
                </CardContent>
            </Card>
        );
    }

    const infoColor = resolveCssVar('var(--pos-info-text)');

    // Pages per day bar data — use day number as label
    const pagesData = useMemo(() =>
        stats.pagesPerDay.map(([date, pages]) => ({
            day: date.split('-')[2],
            pages,
        })),
        [stats.pagesPerDay],
    );

    return (
        <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Pages" value={stats.totalPages} color={infoColor} />
                <StatCard label="Sessions" value={stats.sessions} />
                <StatCard label="Books Active" value={stats.booksActive} />
                <StatCard label="Time" value={formatMinutes(stats.totalMinutes)} />
            </div>

            {/* Pages per day bar */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Pages per Day</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {pagesData.length === 0
                        ? <EmptyChart />
                        : (
                            <ResponsiveContainer width="100%" height={100}>
                                <BarChart data={pagesData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                                    <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} interval={4} />
                                    <YAxis hide />
                                    <Tooltip content={<ChartTooltip unit=" pages" />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                                    <Bar dataKey="pages" name="Pages" fill={infoColor} radius={[2, 2, 0, 0]} maxBarSize={14} />
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    }
                </CardContent>
            </Card>
        </div>
    );
}
