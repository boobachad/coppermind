import { useMemo } from 'react';
import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, BarChart, LineChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { YearlyBriefingResponse } from '../../../lib/types';
import {
    rollupToChartData, rollingAverage, linearRegression, formatMinutes,
} from '../../../lib/briefing-utils';
import { resolveCssVar, ChartTooltip, StatCard, EmptyChart } from '../BriefingCharts';
import { ActivityHeatmap } from '../../ActivityHeatmap';
import { YearlySubmissionsSection } from './YearlySubmissionsSection';
import { YearlyRetroSection } from './YearlyRetroSection';
import { YearlyAnalysisSection } from './YearlyAnalysisSection';

interface Props {
    data: YearlyBriefingResponse;
}

interface BarShapeProps {
    fill?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    aboveAvg?: boolean;
    delta?: number;
}

export function YearlyBriefingView({ data }: Props) {
    const successColor = resolveCssVar('var(--pos-success-text)');
    const errorColor = resolveCssVar('var(--pos-error-text)');
    const infoColor = resolveCssVar('var(--pos-info-text)');
    const warningColor = resolveCssVar('var(--pos-warning-text)');

    const totals = data.yearlyTotals;

    // monthly productive hours + 3-month rolling average
    const productiveHoursData = useMemo(() => {
        const raw = rollupToChartData(data.monthlyRollups, 'productiveMinutes');
        const values = raw.map(d => d.value);
        const avg = values.reduce((s, v) => s + v, 0) / (values.length || 1);
        const rolling = rollingAverage(values, 3);
        return raw.map((d, i) => ({
            month: d.month,
            hours: Math.round(d.value / 60),
            rollingAvg: Math.round(rolling[i]! / 60),
            aboveAvg: d.value >= avg,
        }));
    }, [data.monthlyRollups]);

    // goal completion rate + linear regression overlay
    const completionData = useMemo(() => {
        const raw = rollupToChartData(data.monthlyRollups, 'completionRate');
        const points: [number, number][] = raw.map((d, i) => [i, d.value]);
        const { slope, intercept } = linearRegression(points);
        return raw.map((d, i) => ({
            month: d.month,
            rate: Math.round(d.value * 100),
            trend: Math.round((slope * i + intercept) * 100),
        }));
    }, [data.monthlyRollups]);

    // debt net delta per month
    const debtData = useMemo(() =>
        rollupToChartData(data.monthlyRollups, 'debtNetDelta').map(d => ({
            month: d.month,
            delta: d.value,
        })),
        [data.monthlyRollups],
    );

    // Category colors for yearly breakdown list
    const categoryColors = [
        'var(--pos-success-text)', 'var(--pos-info-text)', 'var(--pos-warning-text)',
        'var(--pos-error-text)', 'var(--text-secondary)',
    ];

    return (
        <div className="space-y-6">
            {/* Hero stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard label="Productive Hours" value={Math.round(totals.totalProductiveHours)} color={successColor} />
                <StatCard label="Goals Completed" value={totals.totalGoalsCompleted} color={successColor} />
                <StatCard label="Problems Solved" value={totals.totalProblemsSolved} />
                <StatCard label="Pages Read" value={totals.totalPagesRead} color={infoColor} />
                <StatCard label="KB Items" value={totals.totalKbItems} />
                <StatCard
                    label="Avg Completion"
                    value={`${Math.round(totals.avgCompletionRate * 100)}%`}
                    color={totals.avgCompletionRate >= 0.7 ? successColor : warningColor}
                />
            </div>

            {/* Full year activity heatmap */}
            <ActivityHeatmap year={data.year} />

            {/* Monthly productive hours + rolling average */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Monthly Productive Hours</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {productiveHoursData.every(d => d.hours === 0)
                        ? <EmptyChart message="No activity logged this year" />
                        : (
                            <ResponsiveContainer width="100%" height={140}>
                                <ComposedChart data={productiveHoursData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                                    <CartesianGrid stroke="var(--border-color)" strokeOpacity={0.3} />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<ChartTooltip unit="h" />} />
                                    <Bar dataKey="hours" name="Hours"
                                        shape={(props: BarShapeProps) => (
                                            <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={props.aboveAvg ? successColor : infoColor} opacity={0.8} />
                                        )}
                                    />
                                    <Line type="monotone" dataKey="rollingAvg" name="3-mo avg" stroke={warningColor} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )
                    }
                </CardContent>
            </Card>

            {/* Goal completion rate trend */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Goal Completion Rate Trend</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {completionData.every(d => d.rate === 0)
                        ? <EmptyChart />
                        : (
                            <ResponsiveContainer width="100%" height={120}>
                                <LineChart data={completionData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                                    <CartesianGrid stroke="var(--border-color)" strokeOpacity={0.3} />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                                    <Tooltip content={<ChartTooltip unit="%" />} />
                                    <Line type="monotone" dataKey="rate" name="Completion" stroke={successColor} strokeWidth={2} dot={{ r: 3, fill: successColor }} />
                                    <Line type="monotone" dataKey="trend" name="Trend" stroke={warningColor} strokeWidth={1} dot={false} strokeDasharray="4 2" />
                                </LineChart>
                            </ResponsiveContainer>
                        )
                    }
                </CardContent>
            </Card>

            {/* Debt net delta per month */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Debt Net Delta per Month</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={debtData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                            <Bar dataKey="delta" name="Delta" radius={[3, 3, 0, 0]} maxBarSize={28}
                                shape={(props: BarShapeProps) => {
                                    const delta = typeof props.delta === 'number' ? props.delta : 0;
                                    return <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={delta > 0 ? errorColor : successColor} rx={3} ry={3} />;
                                }}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Category time allocation */}
            {data.categoryYearlyTotals.length > 0 && (
                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">Time by Category (Year)</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <div className="space-y-2">
                            {data.categoryYearlyTotals.slice(0, 8).map((cat, i) => (
                                <div key={cat.category} className="flex items-center gap-2">
                                    <div
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: resolveCssVar(categoryColors[i % categoryColors.length]!) }}
                                    />
                                    <span className="text-xs uppercase flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                                        {cat.category.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-xs font-mono shrink-0" style={{ color: 'var(--text-primary)' }}>
                                        {formatMinutes(cat.minutes)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Submissions */}
            <YearlySubmissionsSection data={data} />

            {/* Retro */}
            <YearlyRetroSection data={data} />

            {/* Reading + analysis */}
            <YearlyAnalysisSection data={data} />
        </div>
    );
}
