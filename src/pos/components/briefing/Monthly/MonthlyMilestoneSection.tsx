import { useMemo } from 'react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyBriefingResponse } from '../../../lib/types';
import { resolveCssVar, EmptyChart } from '../BriefingCharts';
import { getLocalDateString } from '../../../lib/time';

interface Props {
    data: MonthlyBriefingResponse;
}

export function MonthlyMilestoneSection({ data }: Props) {
    const successColor = resolveCssVar('var(--pos-success-text)');
    const errorColor = resolveCssVar('var(--pos-error-text)');
    const infoColor = resolveCssVar('var(--pos-info-text)');

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
                    infoColor={infoColor}
                />
            ))}
        </div>
    );
}

interface MilestoneCardProps {
    ms: MonthlyBriefingResponse['milestoneProgress'][number];
    successColor: string;
    errorColor: string;
    infoColor: string;
}

function MilestoneCard({ ms, successColor, errorColor, infoColor }: MilestoneCardProps) {
    const todayStr = getLocalDateString();

    // Build per-day chart data with 3 series:
    // actual    = what was logged that day
    // expected  = flat daily target (dailyAmount)
    // required  = dailyAmount + accumulated debt up to that day
    const chartData = useMemo(() => {
        const dailyMap = new Map(ms.dailyValues.map(([d, v]) => [d, v]));
        const cumExpMap = new Map(ms.cumulativeExpected.map(([d, v]) => [d, v]));
        const cumActMap = new Map(ms.cumulativeActual.map(([d, v]) => [d, v]));

        return ms.cumulativeActual.map(([date]) => {
            const dayLabel = date.slice(8); // "01".."31"
            const actual = dailyMap.get(date) ?? 0;
            const cumAct = cumActMap.get(date) ?? 0;
            const cumExp = cumExpMap.get(date) ?? 0;
            // Debt = how far behind cumulatively; required = base + debt
            const debt = Math.max(0, cumExp - cumAct);
            const required = ms.dailyAmount + debt;
            const isFuture = date > todayStr;
            return {
                date,
                day: dayLabel,
                actual: isFuture ? null : actual,
                expected: ms.dailyAmount,
                required: isFuture ? null : required,
            };
        });
    }, [ms, todayStr]);

    // Compare cumulative at today (or last available day) for status badge
    const todayIdx = ms.cumulativeActual.findIndex(([d]) => d === todayStr);
    const compareIdx = todayIdx >= 0 ? todayIdx : ms.cumulativeActual.length - 1;
    const lastActual = ms.cumulativeActual[compareIdx]?.[1] ?? 0;
    const lastExpected = ms.cumulativeExpected[compareIdx]?.[1] ?? 0;
    const isAhead = lastActual >= lastExpected;

    // Left axis: actual + expected — domain anchored to dailyAmount so both lines are visible
    const leftMax = Math.max(
        ms.dailyAmount * 2,
        ...chartData.map(d => d.actual ?? 0),
    );
    // Right axis: required — its own scale so it doesn't crush the left lines
    const rightMax = Math.max(
        ms.dailyAmount * 2,
        ...chartData.map(d => d.required ?? 0),
    );

    return (
        <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{ms.targetMetric}</CardTitle>
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span>{lastActual} / {ms.targetValue}{ms.unit ? ` ${ms.unit}` : ''}</span>
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
                <div className="flex items-center gap-4 mt-1">
                    <LegendDot color={successColor} label="Actual" />
                    <LegendDot color={infoColor} label={`Expected (${ms.dailyAmount}${ms.unit ? ` ${ms.unit}` : ''}/day)`} dashed />
                    <LegendDot color={errorColor} label="Required (incl. debt) →" />
                </div>
            </CardHeader>
            <CardContent className="pb-4 px-4">
                <ResponsiveContainer width="100%" height={130}>
                    <LineChart data={chartData} margin={{ left: 0, right: 36, top: 4, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border-color)" strokeOpacity={0.3} />
                        <XAxis
                            dataKey="day"
                            tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
                            axisLine={false}
                            tickLine={false}
                            interval={6}
                        />
                        {/* Left axis: actual + expected */}
                        <YAxis
                            yAxisId="left"
                            domain={[0, leftMax]}
                            tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
                            axisLine={false}
                            tickLine={false}
                            width={32}
                        />
                        {/* Right axis: required (debt-inflated) */}
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            domain={[0, rightMax]}
                            tick={{ fontSize: 9, fill: errorColor }}
                            axisLine={false}
                            tickLine={false}
                            width={32}
                        />
                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                const unit = ms.unit ? ` ${ms.unit}` : '';
                                return (
                                    <div
                                        className="rounded px-2 py-1.5 text-xs border"
                                        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                                    >
                                        <p className="font-medium mb-0.5">Day {label}</p>
                                        {payload.map((p, i) =>
                                            p.value != null ? (
                                                <p key={i} style={{ color: p.color }}>
                                                    {p.name}: {p.value}{unit}
                                                </p>
                                            ) : null
                                        )}
                                    </div>
                                );
                            }}
                        />
                        {/* Expected flat line */}
                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="expected"
                            name="Expected"
                            stroke={infoColor}
                            strokeWidth={1}
                            strokeDasharray="4 2"
                            dot={false}
                            connectNulls
                        />
                        {/* Actual daily input */}
                        <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="actual"
                            name="Actual"
                            stroke={successColor}
                            strokeWidth={2}
                            dot={{ r: 2, fill: successColor }}
                            connectNulls={false}
                        />
                        {/* Required = base + debt, on its own axis */}
                        <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="required"
                            name="Required"
                            stroke={errorColor}
                            strokeWidth={1.5}
                            strokeDasharray="3 2"
                            dot={false}
                            connectNulls={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
    return (
        <div className="flex items-center gap-1">
            <svg width="16" height="8">
                <line
                    x1="0" y1="4" x2="16" y2="4"
                    stroke={color}
                    strokeWidth="2"
                    strokeDasharray={dashed ? '4 2' : undefined}
                />
            </svg>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
        </div>
    );
}
