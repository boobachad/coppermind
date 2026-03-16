// Shared chart primitives for all briefing views

// Resolve a CSS variable to its computed value at runtime
export function resolveCssVar(varStr: string): string {
    if (typeof window === 'undefined') return '#94a3b8';
    const match = varStr.match(/var\((--[^)]+)\)/);
    if (!match) return varStr;
    return getComputedStyle(document.documentElement).getPropertyValue(match[1]!).trim() || '#94a3b8';
}

interface TooltipPayloadItem {
    name: string;
    value: number;
    payload?: { fill?: string; color?: string };
    color?: string;
}

interface ChartTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string;
    unit?: string;
}

export function ChartTooltip({ active, payload, label, unit = '' }: ChartTooltipProps) {
    if (!active || !payload?.length) return null;
    return (
        <div
            className="rounded px-2 py-1.5 text-xs border"
            style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
            }}
        >
            {label && <p className="font-medium mb-0.5">{label}</p>}
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.color ?? p.payload?.fill ?? 'var(--text-primary)' }}>
                    {p.name}: {p.value}{unit}
                </p>
            ))}
        </div>
    );
}

interface StatCardProps {
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
}

export function StatCard({ label, value, sub, color }: StatCardProps) {
    return (
        <div
            className="p-4 rounded-lg border"
            style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)' }}
        >
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</p>
            <p className="text-2xl font-bold" style={{ color: color ?? 'var(--text-primary)' }}>
                {value}
            </p>
            {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{sub}</p>}
        </div>
    );
}

interface EmptyChartProps {
    message?: string;
}

export function EmptyChart({ message = 'No data' }: EmptyChartProps) {
    return (
        <div className="flex items-center justify-center h-24">
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{message}</p>
        </div>
    );
}

interface SectionHeaderProps {
    title: string;
}

export function SectionHeader({ title }: SectionHeaderProps) {
    return (
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            {title}
        </h2>
    );
}
