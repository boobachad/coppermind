import type { Activity } from '../lib/types';

interface TimeSlotProps {
    activities: Activity[];
    segments?: { width: number; color: string }[];
    backgroundColor: string;
    isCurrentTimeSlot: boolean;
    onClick: () => void;
    className?: string;
    showTooltip?: boolean;
}

export function TimeSlot({
    activities,
    segments,
    backgroundColor,
    isCurrentTimeSlot,
    onClick,
    className = '',
    showTooltip = true
}: TimeSlotProps) {
    // Check if slot has productive/goal/milestone activities
    const hasProductive = activities.some(a => a.isProductive);
    const hasGoal = activities.some(a => a.goalIds && a.goalIds.length > 0);
    const hasMilestone = activities.some(a => a.milestoneId);
    
    // Determine ring color priority: milestone > goal > productive
    let ringColor = '';
    if (hasMilestone) {
        ringColor = 'var(--pos-milestone-accent)';
    } else if (hasGoal) {
        ringColor = 'var(--pos-goal-accent)';
    } else if (hasProductive) {
        ringColor = 'var(--pos-success-border)';
    }
    
    // Build ring classes
    let ringClass = '';
    if (isCurrentTimeSlot && (hasProductive || hasGoal || hasMilestone)) {
        // Current slot WITH productive/goal: double ring
        ringClass = 'ring-2 ring-offset-2';
    } else if (isCurrentTimeSlot) {
        // Current slot only: single ring with offset
        ringClass = 'ring-2 ring-offset-1';
    } else if (hasProductive && (hasGoal || hasMilestone)) {
        // Non-current with both productive AND goal/milestone: double ring
        ringClass = 'ring-2 ring-offset-2';
    } else if (hasProductive || hasGoal || hasMilestone) {
        // Non-current with single indicator: single ring
        ringClass = 'ring-2 ring-offset-1';
    }
    
    // Determine final ring color
    const finalRingColor = isCurrentTimeSlot ? 'var(--pos-today-border)' : ringColor;

    return (
        <div
            className={`cursor-pointer transition-opacity relative group ${ringClass} ${className}`}
            style={{
                background: segments ? 'transparent' : backgroundColor,
                '--tw-ring-color': finalRingColor,
                '--tw-ring-offset-color': 'var(--bg-secondary)'
            } as React.CSSProperties}
            onClick={onClick}
        >
            {segments && (
                <div className="absolute inset-0 flex h-full w-full overflow-hidden rounded-[2px]">
                    {segments.map((seg, idx) => (
                        <div key={idx} style={{ width: `${seg.width}%`, background: seg.color }} className="h-full" />
                    ))}
                </div>
            )}
            
            {showTooltip && activities.length > 0 && (
                <div className="hidden group-hover:block absolute z-20 -top-8 left-1/2 -translate-x-1/2 backdrop-blur border text-foreground text-[10px] px-2 py-1 rounded-md whitespace-nowrap pointer-events-none shadow-xl" 
                    style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}>
                    {activities.length} activity{activities.length > 1 ? 'ies' : ''}
                </div>
            )}
            
            {/* Inner ring for current slot with productive/goal */}
            {isCurrentTimeSlot && (hasProductive || hasGoal || hasMilestone) && (
                <div 
                    className="absolute inset-0 rounded-[2px] pointer-events-none ring-2 ring-offset-1"
                    style={{
                        '--tw-ring-color': ringColor,
                        '--tw-ring-offset-color': 'var(--bg-secondary)'
                    } as React.CSSProperties}
                />
            )}
        </div>
    );
}
