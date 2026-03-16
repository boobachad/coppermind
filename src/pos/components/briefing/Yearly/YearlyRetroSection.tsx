import { useMemo } from 'react';
import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { YearlyBriefingResponse } from '../../../lib/types';
import { shortMonthLabel } from '../../../lib/briefing-utils';
import { resolveCssVar, ChartTooltip, EmptyChart } from '../BriefingCharts';

interface Props {
    data: YearlyBriefingResponse;
}

export function YearlyRetroSection({ data }: Props) {
    const successColor = resolveCssVar('var(--pos-success-text)');
    const infoColor = resolveCssVar('var(--pos-info-text)');
    const warningColor = resolveCssVar('var(--pos-warning-text)');

    const chartData = useMemo(() =>
        data.monthlyRollups.map(r => ({
            month: shortMonthLabel(r.month),
            energy: r.energy,
            satisfaction: r.satisfaction,
            deepWork: r.deepWorkHours,
        })),
        [data.monthlyRollups],
    );

    // Only render if at least 2 months have retro data
    const retroMonths = data.monthlyRollups.filter(r => r.energy !== null);
    if (retroMonths.length < 2) return null;

    return (
        <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium">Energy, Satisfaction & Deep Work</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
                {chartData.length === 0
                    ? <EmptyChart />
                    : (
                        <ResponsiveContainer width="100%" height={160}>
                            <ComposedChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                                <CartesianGrid stroke="var(--border-color)" strokeOpacity={0.3} />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                {/* Left axis: energy + satisfaction (0–10) */}
                                <YAxis yAxisId="score" domain={[0, 10]} tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                {/* Right axis: deep work hours */}
                                <YAxis yAxisId="hours" orientation="right" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 10, color: 'var(--text-secondary)' }} />
                                <Bar yAxisId="hours" dataKey="deepWork" name="Deep Work (h)" fill={infoColor} opacity={0.4} maxBarSize={20} />
                                <Line yAxisId="score" type="monotone" dataKey="energy" name="Energy" stroke={successColor} strokeWidth={2} dot={{ r: 3, fill: successColor }} connectNulls />
                                <Line yAxisId="score" type="monotone" dataKey="satisfaction" name="Satisfaction" stroke={warningColor} strokeWidth={2} dot={{ r: 3, fill: warningColor }} connectNulls />
                            </ComposedChart>
                        </ResponsiveContainer>
                    )
                }
            </CardContent>
        </Card>
    );
}
