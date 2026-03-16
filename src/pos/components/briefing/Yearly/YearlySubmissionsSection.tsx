import { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    LineChart, Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { YearlyBriefingResponse } from '../../../lib/types';
import { shortMonthLabel } from '../../../lib/briefing-utils';
import { resolveCssVar, ChartTooltip, EmptyChart } from '../BriefingCharts';

interface Props {
    data: YearlyBriefingResponse;
}

export function YearlySubmissionsSection({ data }: Props) {
    const successColor = resolveCssVar('var(--pos-success-text)');
    const infoColor = resolveCssVar('var(--pos-info-text)');

    // Problems solved per month
    const problemsData = useMemo(() =>
        data.monthlyRollups.map(r => ({
            month: shortMonthLabel(r.month),
            solved: r.problemsSolved,
        })),
        [data.monthlyRollups],
    );

    // CF rating progression — [date, rating] pairs
    const ratingData = useMemo(() =>
        data.submissionRatingProgression.map(([date, rating]) => ({
            date: date.slice(5), // MM-DD
            rating,
        })),
        [data.submissionRatingProgression],
    );

    return (
        <div className="space-y-4">
            {/* Problems per month */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Problems Solved per Month</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {problemsData.every(d => d.solved === 0)
                        ? <EmptyChart message="No problems solved this year" />
                        : (
                            <ResponsiveContainer width="100%" height={120}>
                                <BarChart data={problemsData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                    <YAxis hide />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                                    <Bar dataKey="solved" name="Solved" fill={successColor} radius={[3, 3, 0, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    }
                </CardContent>
            </Card>

            {/* CF rating progression — only if data exists */}
            {ratingData.length > 0 && (
                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">Codeforces Rating Progression</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <ResponsiveContainer width="100%" height={120}>
                            <LineChart data={ratingData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                                <CartesianGrid stroke="var(--border-color)" strokeOpacity={0.3} />
                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} interval={Math.floor(ratingData.length / 6)} />
                                <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Line type="monotone" dataKey="rating" name="Rating" stroke={infoColor} strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
