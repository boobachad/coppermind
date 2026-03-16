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

const DIFFICULTY_COLORS: Record<string, string> = {
    Easy: 'var(--pos-success-text)',
    Medium: 'var(--pos-warning-text)',
    Hard: 'var(--pos-error-text)',
};

const VERDICT_COLORS: Record<string, string> = {
    Accepted: 'var(--pos-success-text)',
    'Wrong Answer': 'var(--pos-error-text)',
    'Time Limit Exceeded': 'var(--pos-warning-text)',
};

export function MonthlySubmissionsSection({ data }: Props) {
    const stats = data.submissionStats;

    if (stats.total === 0) {
        return (
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Submissions</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <EmptyChart message="No submissions this month" />
                </CardContent>
            </Card>
        );
    }

    const acceptanceRate = stats.total > 0 ? Math.round((stats.accepted / stats.total) * 100) : 0;
    const successColor = resolveCssVar('var(--pos-success-text)');
    const errorColor = resolveCssVar('var(--pos-error-text)');

    // Problems by week bar data
    const weeklyData = useMemo(() =>
        stats.byWeek.map(([wk, count]) => ({ week: `W${wk}`, count })),
        [stats.byWeek],
    );

    // Difficulty donut
    const difficultyData = useMemo(() =>
        stats.byDifficulty.map(([name, value]) => ({
            name,
            value,
            fill: resolveCssVar(DIFFICULTY_COLORS[name] ?? 'var(--pos-info-text)'),
        })),
        [stats.byDifficulty],
    );

    // Verdict bar
    const verdictData = useMemo(() =>
        stats.byVerdict.map(([name, value]) => ({
            name: name.length > 12 ? name.slice(0, 12) + '…' : name,
            fullName: name,
            value,
            fill: resolveCssVar(VERDICT_COLORS[name] ?? 'var(--pos-info-text)'),
        })),
        [stats.byVerdict],
    );

    // Platform donut
    const platformData = useMemo(() =>
        stats.byPlatform.map(([name, value]) => ({
            name,
            value,
            fill: resolveCssVar(name === 'Codeforces' ? 'var(--pos-info-text)' : 'var(--pos-warning-text)'),
        })),
        [stats.byPlatform],
    );

    return (
        <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total" value={stats.total} />
                <StatCard label="Accepted" value={stats.accepted} color={successColor} />
                <StatCard label="Acceptance" value={`${acceptanceRate}%`} color={acceptanceRate >= 50 ? successColor : errorColor} />
            </div>

            {/* Problems by week */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Problems by Week</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={weeklyData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                            <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                            <Bar dataKey="count" name="Problems" fill={successColor} radius={[3, 3, 0, 0]} maxBarSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Difficulty + Platform donuts */}
            <div className="grid grid-cols-2 gap-4">
                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">By Difficulty</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4 flex justify-center">
                        <ResponsiveContainer width={120} height={120}>
                            <PieChart>
                                <Pie data={difficultyData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={52} strokeWidth={2} stroke="var(--bg-secondary)" />
                                <Tooltip content={<ChartTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">By Platform</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4 flex justify-center">
                        <ResponsiveContainer width={120} height={120}>
                            <PieChart>
                                <Pie data={platformData} dataKey="value" nameKey="name" innerRadius={32} outerRadius={52} strokeWidth={2} stroke="var(--bg-secondary)" />
                                <Tooltip content={<ChartTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Verdict breakdown */}
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Verdict Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <ResponsiveContainer width="100%" height={100}>
                        <BarChart data={verdictData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                            <CartesianGrid horizontal={false} stroke="var(--border-color)" strokeOpacity={0.3} />
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={90} />
                            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--bg-tertiary)', opacity: 0.4 }} />
                            <Bar dataKey="value" name="Count" radius={[0, 3, 3, 0]} maxBarSize={18}
                                shape={(props: { fill?: string; x?: number; y?: number; width?: number; height?: number }) => (
                                    <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={props.fill} rx={3} ry={3} />
                                )}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
