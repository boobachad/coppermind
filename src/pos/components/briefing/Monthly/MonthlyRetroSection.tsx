import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyBriefingResponse } from '../../../lib/types';
import { formatMinutes } from '../../../lib/briefing-utils';
import { resolveCssVar, StatCard } from '../BriefingCharts';

interface Props {
    data: MonthlyBriefingResponse;
}

export function MonthlyRetroSection({ data }: Props) {
    if (!data.retrospective) return null;

    const retro = data.retrospective;
    const successColor = resolveCssVar('var(--pos-success-text)');
    const infoColor = resolveCssVar('var(--pos-info-text)');

    // Energy/satisfaction color: green ≥7, yellow ≥5, red <5
    const scoreColor = (v: number) =>
        v >= 7 ? successColor : v >= 5 ? resolveCssVar('var(--pos-warning-text)') : resolveCssVar('var(--pos-error-text)');

    return (
        <div className="space-y-4">
            {/* Score cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Energy" value={`${retro.energy}/10`} color={scoreColor(retro.energy)} />
                <StatCard label="Satisfaction" value={`${retro.satisfaction}/10`} color={scoreColor(retro.satisfaction)} />
                <StatCard label="Deep Work" value={`${retro.deepWorkHours}h`} color={infoColor} />
                <StatCard label="Productive" value={formatMinutes(data.totalProductiveMinutes)} />
            </div>

            {/* Accomplishments */}
            {retro.accomplishments && (
                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">Accomplishments</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                            {retro.accomplishments}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Challenges */}
            {retro.challenges && (
                <Card className="border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm font-medium">Challenges</CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                            {retro.challenges}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
