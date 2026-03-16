import { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { YearlyBriefingResponse } from '../../../lib/types';
import { shortMonthLabel } from '../../../lib/briefing-utils';
import { resolveCssVar, ChartTooltip, StatCard, EmptyChart } from '../BriefingCharts';

interface Props {
    data: YearlyBriefingResponse;
}

export function YearlyAnalysisSection({ data }: Props) {
    const infoColor = resolveCssVar('var(--pos-info-text)');
    const successColor = resolveCssVar('var(--pos-success-text)');

    // Reading velocity — pages per month
    const readingData = useMemo(() =>
        data.monthlyRollups.map(r => ({
            month: shortMonthLabel(r.month),
            pages: r.pagesRead,
        })),
        [data.monthlyRollups],
    );

    // Best month by goal completion rate
    const bestByCompletion = useMemo(() => {
        const best = data.monthlyRollups.reduce(
            (acc, r) => (r.completionRate > acc.completionRate ? r : acc),
            data.monthlyRollups[0] ?? { month: '', completionRate: 0 },
        );
        return best.month ? shortMonthLabel(best.month) : '—';
    }, [data.monthlyRollups]);

    return (
        <div className="space-y-4">
            {/* Reading velocity */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Reading Velocity (pages/month)</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {readingData.every(d => d.pages === 0)
                        ? <EmptyChart message="No reading logged this year" />
                        : (
                            <ResponsiveContainer width="100%" height={110}>
                                <BarChart data={readingData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                    <YAxis hide />
                                    <Tooltip content={<ChartTooltip unit=" pages" />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                                    <Bar dataKey="pages" name="Pages" fill={infoColor} radius={[3, 3, 0, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    }
                </CardContent>
            </Card>

            {/* Best/worst analysis cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                    label="Best Month (hours)"
                    value={data.bestMonth ? shortMonthLabel(data.bestMonth) : '—'}
                    color={successColor}
                />
                <StatCard
                    label="Best Month (goals)"
                    value={bestByCompletion}
                    color={successColor}
                />
                <StatCard
                    label="Longest Streak"
                    value={`${data.longestStreakDays}d`}
                    sub={data.longestStreakStart ? `from ${data.longestStreakStart.slice(5)}` : undefined}
                />
                <StatCard
                    label="Active Days"
                    value={data.totalActiveDays}
                />
            </div>
        </div>
    );
}
