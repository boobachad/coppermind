import { useMemo } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, LineChart, Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyBriefingResponse } from '../../../lib/types';
import { formatMinutes } from '../../../lib/briefing-utils';
import { resolveCssVar, ChartTooltip, StatCard, EmptyChart } from '../BriefingCharts';
import { getActivityColor } from '../../../lib/config';
import { MonthlyMilestoneSection } from './MonthlyMilestoneSection';
import { MonthlySubmissionsSection } from './MonthlySubmissionsSection';
import { MonthlyKbSection } from './MonthlyKbSection';
import { MonthlyReadingSection } from './MonthlyReadingSection';
import { MonthlyRetroSection } from './MonthlyRetroSection';

interface Props {
    data: MonthlyBriefingResponse;
}

export function MonthlyBriefingView({ data }: Props) {
    // Summary cards
    const completionRate = data.totalGoalsCreated > 0
        ? Math.round((data.totalGoalsCompleted / data.totalGoalsCreated) * 100)
        : 0;

    // Activity heatmap data (day → productive minutes)
    const heatmapData = useMemo(() =>
        data.dailyActivityStats.map(s => ({ date: s.date, value: s.productiveMinutes })),
        [data.dailyActivityStats],
    );

    // Weekly stacked bar
    const weeklyBarData = useMemo(() =>
        data.weeklyGoalStats.map(w => ({
            week: `W${w.weekNum}`,
            created: w.goalsCreated,
            completed: w.goalsCompleted,
            debt: w.goalsDebt,
        })),
        [data.weeklyGoalStats],
    );

    // Category donut
    const categoryData = useMemo(() =>
        data.categoryTotals.map(c => ({
            name: c.category.replace(/_/g, ' '),
            value: c.minutes,
            fill: resolveCssVar(getActivityColor(c.category)),
        })),
        [data.categoryTotals],
    );

    // Hourly density
    const hourlyData = useMemo(() =>
        data.hourlyDensity.map(h => ({ hour: `${String(h.hour).padStart(2, '0')}`, count: h.count })),
        [data.hourlyDensity],
    );

    // Weekly completion rate line
    const completionLineData = useMemo(() =>
        data.weeklyGoalStats.map(w => ({
            week: `W${w.weekNum}`,
            rate: Math.round(w.completionRate * 100),
        })),
        [data.weeklyGoalStats],
    );

    const successColor = resolveCssVar('var(--pos-success-text)');
    const errorColor = resolveCssVar('var(--pos-error-text)');
    const infoColor = resolveCssVar('var(--pos-info-text)');

    return (
        <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Productive Hours" value={formatMinutes(data.totalProductiveMinutes)} color={successColor} />
                <StatCard label="Goal Completion" value={`${completionRate}%`} color={completionRate >= 70 ? successColor : errorColor} />
                <StatCard label="Active Days" value={`${data.daysWithActivity} / ${data.dailyActivityStats.length}`} />
                <StatCard label="Longest Streak" value={`${data.longestStreak}d`} />
                <StatCard label="Goals Created" value={data.totalGoalsCreated} />
                <StatCard label="Goals Completed" value={data.totalGoalsCompleted} color={successColor} />
                <StatCard label="Debt Created" value={data.totalDebtCreated} color={data.totalDebtCreated > 0 ? errorColor : successColor} />
                <StatCard label="Verified" value={data.totalGoalsVerified} color={infoColor} />
            </div>

            {/* Daily activity heatmap (mini calendar) */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Daily Activity</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {heatmapData.every(d => d.value === 0)
                        ? <EmptyChart message="No activity logged this month" />
                        : (
                            <ResponsiveContainer width="100%" height={80}>
                                <BarChart data={heatmapData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                                    <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
                                    <YAxis hide />
                                    <Tooltip content={<ChartTooltip unit="m" />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                                    <Bar dataKey="value" name="Productive" fill={successColor} radius={[2, 2, 0, 0]} maxBarSize={14} />
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    }
                </CardContent>
            </Card>

            {/* Weekly goal bar */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Weekly Goals</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {weeklyBarData.length === 0
                        ? <EmptyChart />
                        : (
                            <ResponsiveContainer width="100%" height={140}>
                                <BarChart data={weeklyBarData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                                    <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                                    <Bar dataKey="completed" name="Completed" stackId="a" fill={successColor} radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="debt" name="Debt" stackId="a" fill={errorColor} radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        )
                    }
                </CardContent>
            </Card>

            {/* Category breakdown */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Time by Category</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {categoryData.length === 0
                        ? <EmptyChart />
                        : (
                            <div className="flex gap-4 items-center">
                                <ResponsiveContainer width={140} height={140}>
                                    <PieChart>
                                        <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} strokeWidth={2} stroke="var(--bg-secondary)" />
                                        <Tooltip content={<ChartTooltip unit="m" />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="flex-1 space-y-1 overflow-hidden">
                                    {categoryData.slice(0, 8).map(entry => (
                                        <div key={entry.name} className="flex items-center gap-2 min-w-0">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
                                            <span className="text-[10px] uppercase truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{entry.name}</span>
                                            <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-primary)' }}>{formatMinutes(entry.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    }
                </CardContent>
            </Card>

            {/* Peak hours */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Peak Productivity Hours</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <ResponsiveContainer width="100%" height={90}>
                        <BarChart data={hourlyData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                            <XAxis dataKey="hour" tick={{ fontSize: 9, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} interval={3} />
                            <YAxis hide />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                            <Bar dataKey="count" name="Activities" fill={infoColor} radius={[2, 2, 0, 0]} maxBarSize={18} opacity={0.85} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Weekly completion rate */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Weekly Completion Rate</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    {completionLineData.length === 0
                        ? <EmptyChart />
                        : (
                            <ResponsiveContainer width="100%" height={100}>
                                <LineChart data={completionLineData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                                    <CartesianGrid stroke="var(--border-color)" strokeOpacity={0.3} />
                                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                                    <Tooltip content={<ChartTooltip unit="%" />} />
                                    <Line type="monotone" dataKey="rate" name="Completion" stroke={successColor} strokeWidth={2} dot={{ fill: successColor, r: 3 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )
                    }
                </CardContent>
            </Card>

            {/* Milestone progress */}
            <MonthlyMilestoneSection data={data} />

            {/* Submissions */}
            <MonthlySubmissionsSection data={data} />

            {/* Knowledge base */}
            <MonthlyKbSection data={data} />

            {/*  Reading */}
            <MonthlyReadingSection data={data} />

            {/*  Retrospective */}
            <MonthlyRetroSection data={data} />
        </div>
    );
}
