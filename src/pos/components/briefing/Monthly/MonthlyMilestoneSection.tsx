import { useMemo } from 'react';
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyBriefingResponse } from '../../../lib/types';
import { resolveCssVar, ChartTooltip, EmptyChart } from '../BriefingCharts';
import { getLocalDateString } from '../../../lib/time';

interface Props {
    data: MonthlyBriefingResponse;
}

export function MonthlyMilestoneSection({ data }: Props) {
    const successColor = resolveCssVar('var(--pos-success-text)');
    const errorColor = resolveCssVar('var(--pos-error-text)');

    if (data.milestoneProgress.length === 0) {
        return (
            <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm font-medium">Milestone Progress</CardTitle>
                </CardHeader>
                <CardContent className="pb-4 px-4">
                    <EmptyChart message="No active milestones this month" />
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {data.milestoneProgress.map(ms => (
                <MilestoneCard
                    key={ms.milestoneId}
                    ms={ms}
                    successColor={successColor}
                    errorColor={errorColor}
                />
            ))}
        </div>
    );
}

interface MilestoneCardProps {
    ms: MonthlyBriefingResponse['milestoneProgress'][number];
    successColor: string;
    errorColor: string;
}

function MilestoneCard({ ms, successColor, errorColor }: MilestoneCardProps) {
    // Merge actual and expected into a single chart series keyed by date
    const chartData = useMemo(() => {
        const expectedMap = new Map(ms.cumulativeExpected.map(([d, v]) => [d, v]));
        return ms.cumulativeActual.map(([date, actual]) => ({
            date: date.slice(8), // day number only
            actual,
            expected: expectedMap.get(date) ?? 0,
        }));
    }, [ms]);

    // Find today's index in the cumulative arrays to compare actual vs expected so far
    const todayStr = getLocalDateString();
    const todayIdx = ms.cumulativeActual.findIndex(([d]) => d === todayStr);
    const compareIdx = todayIdx >= 0 ? todayIdx : ms.cumulativeActual.length - 1;
    const lastActual = ms.cumulativeActual[compareIdx]?.[1] ?? 0;
    const lastExpected = ms.cumulativeExpected[compareIdx]?.[1] ?? 0;
    const isAhead = lastActual >= lastExpected;

    return (
        <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{ms.targetMetric}</CardTitle>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span>{lastActual} / {lastExpected}{ms.unit ? ` ${ms.unit}` : ''}</span>
                        <span
                            className="px-2 py-0.5 rounded-full font-medium"
                            style={{
                                backgroundColor: isAhead ? 'var(--pos-success-bg)' : 'var(--pos-error-bg)',
                                color: isAhead ? 'var(--pos-success-text)' : 'var(--pos-error-text)',
                                border: `1px solid ${isAhead ? 'var(--pos-success-border)' : 'var(--pos-error-border)'}`,
                            }}
                        >
                            {isAhead ? 'On track' : 'Behind'}
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pb-4 px-4">
                <ResponsiveContainer width="100%" height={110}>
                    <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                        <defs>
                            <linearGradient id={`grad-actual-${ms.milestoneId}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={successColor} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={successColor} stopOpacity={0.05} />
                            </linearGradient>
                            <linearGradient id={`grad-expected-${ms.milestoneId}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={errorColor} stopOpacity={0.15} />
                                <stop offset="95%" stopColor={errorColor} stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--border-color)" strokeOpacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} interval={6} />
                        <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip unit={ms.unit ?? ''} />} />
                        <Area type="monotone" dataKey="expected" name="Expected" stroke={errorColor} strokeWidth={1} strokeDasharray="4 2" fill={`url(#grad-expected-${ms.milestoneId})`} />
                        <Area type="monotone" dataKey="actual" name="Actual" stroke={successColor} strokeWidth={2} fill={`url(#grad-actual-${ms.milestoneId})`} />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
