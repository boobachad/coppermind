import React from 'react';
import type { Activity } from '../lib/types';

interface TimeSlotProps {
    activities: Activity[];
    segments?: { width: number; color: string }[];
    backgroundColor: string;
    isCurrentTimeSlot: boolean;
    onClick: () => void;
    className?: string;
    showTooltip?: boolean;
    borderRadius?: string;
}

// CSS variable color tokens for each flag
const FLAG_COLORS = {
    productive: 'var(--pos-success-border)',
    goal:       'var(--pos-goal-accent)',
    milestone:  'var(--pos-milestone-accent)',
} as const;

type FlagKey = keyof typeof FLAG_COLORS;

// Build a conic-gradient string that splits the ring evenly among active flags.
// Returns empty string if no flags are active.
function buildConicGradient(flags: FlagKey[]): string {
    if (flags.length === 0) return '';
    const step = 360 / flags.length;
    const stops = flags.flatMap((flag, i) => {
        const color = FLAG_COLORS[flag];
        const start = i * step;
        const end = (i + 1) * step;
        return [`${color} ${start}deg`, `${color} ${end}deg`];
    });
    return `conic-gradient(${stops.join(', ')})`;
}

// Returns the box-shadow string for the outer ring (hover or current-time).
// Spread 4px so it sits just outside the inner conic ring (which is 2px padding).
function outerRingShadow(isCurrentTimeSlot: boolean): string {
    const color = isCurrentTimeSlot
        ? 'var(--pos-today-border)'
        : 'var(--glass-border-highlight)';
    return `0 0 0 4px ${color}`;
}

export interface SlotRingResult {
    // CSS background for the ring wrapper (conic-gradient or empty)
    ringBackground: string;
    // Whether to show the ring wrapper at all
    hasRing: boolean;
    // Outer box-shadow — only on hover or current-time slot
    outerShadow: string;
}

// Main ring builder — replaces buildRings + ringsToBoxShadow.
// One ring (conic-gradient split by active flags).
// Outer ring only on hover or current-time slot.
export function buildSlotRing(
    isCurrentTimeSlot: boolean,
    hasMilestone: boolean,
    hasGoal: boolean,
    hasProductive: boolean,
    isHovered: boolean = false
): SlotRingResult {
    const activeFlags: FlagKey[] = [];
    if (hasProductive) activeFlags.push('productive');
    if (hasGoal)       activeFlags.push('goal');
    if (hasMilestone)  activeFlags.push('milestone');

    const ringBackground = buildConicGradient(activeFlags);
    const hasRing = activeFlags.length > 0;
    const showOuter = isCurrentTimeSlot || isHovered;
    const outer = showOuter ? outerRingShadow(isCurrentTimeSlot) : '';

    return { ringBackground, hasRing, outerShadow: outer };
}

// Legacy exports kept for any remaining callers — delegates to buildSlotRing
export function buildRings(
    isCurrentTimeSlot: boolean,
    hasMilestone: boolean,
    hasGoal: boolean,
    hasProductive: boolean
) {
    return buildSlotRing(isCurrentTimeSlot, hasMilestone, hasGoal, hasProductive);
}
export function ringsToBoxShadow(_rings: unknown): string { return ''; }

export function TimeSlot({
    activities,
    segments,
    backgroundColor,
    isCurrentTimeSlot,
    onClick,
    className = '',
    showTooltip = true,
    borderRadius = '2px',
}: TimeSlotProps) {
    const [isHovered, setIsHovered] = React.useState(false);

    const hasProductive = activities.some(a => a.isProductive);
    const hasGoal = activities.some(a => a.goalIds && a.goalIds.length > 0);
    const hasMilestone = activities.some(a => a.milestoneId);

    const { ringBackground, hasRing, outerShadow } = buildSlotRing(
        isCurrentTimeSlot, hasMilestone, hasGoal, hasProductive, isHovered
    );

    const inner = (
        <div
            className={`cursor-pointer transition-opacity relative group w-full h-full ${className}`}
            style={{
                background: segments ? 'transparent' : backgroundColor,
                borderRadius,
                boxShadow: outerShadow || undefined,
            }}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {segments && (
                <div className="absolute inset-0 flex h-full w-full overflow-hidden" style={{ borderRadius }}>
                    {segments.map((seg, idx) => (
                        <div key={idx} style={{ width: `${seg.width}%`, background: seg.color }} className="h-full" />
                    ))}
                </div>
            )}
            {showTooltip && activities.length > 0 && (
                <div
                    className="hidden group-hover:block absolute z-20 -top-8 left-1/2 -translate-x-1/2 backdrop-blur border text-foreground text-[10px] px-2 py-1 rounded-md whitespace-nowrap pointer-events-none shadow-xl"
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
                >
                    {activities.length} activity{activities.length > 1 ? 'ies' : ''}
                </div>
            )}
        </div>
    );

    // Wrap with conic ring layer when flags are active
    if (hasRing) {
        return (
            <div
                style={{
                    padding: '2px',
                    borderRadius,
                    background: ringBackground,
                }}
            >
                {inner}
            </div>
        );
    }

    return inner;
}
