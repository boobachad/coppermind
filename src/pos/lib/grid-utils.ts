import type { Activity } from './types';

/**
 * Calculate partial fill for activities that start/end mid-slot
 * @param slotStart - Start of the 30-min slot
 * @param slotEnd - End of the 30-min slot
 * @param activityStart - Activity start time
 * @param activityEnd - Activity end time
 * @returns Object with startPercent and widthPercent for CSS positioning
 */
export function calculateSlotFill(
    slotStart: Date,
    slotEnd: Date,
    activityStart: Date,
    activityEnd: Date
): { startPercent: number; widthPercent: number } {
    const slotDuration = slotEnd.getTime() - slotStart.getTime();

    // Calculate overlap
    const overlapStart = Math.max(slotStart.getTime(), activityStart.getTime());
    const overlapEnd = Math.min(slotEnd.getTime(), activityEnd.getTime());

    // If no overlap, return zero
    if (overlapStart >= overlapEnd) {
        return { startPercent: 0, widthPercent: 0 };
    }

    const startPercent = ((overlapStart - slotStart.getTime()) / slotDuration) * 100;
    const widthPercent = ((overlapEnd - overlapStart) / slotDuration) * 100;

    return { startPercent, widthPercent };
}

/**
 * Get all activities that overlap with a given time slot
 */
export function getSlotActivities(
    activities: Activity[],
    slotStart: Date,
    slotEnd: Date
): Activity[] {
    return activities.filter((activity) => {
        const actStart = new Date(activity.startTime);
        const actEnd = new Date(activity.endTime);

        // Check if there's any overlap
        return actStart < slotEnd && actEnd > slotStart;
    });
}

/**
 * Generate 48 time slots for a 24-hour period
 * @param date - Date string (YYYY-MM-DD)
 * @returns Array of {start, end} Date objects for each 30-min slot
 */
export function generate48Slots(date: string): Array<{ start: Date; end: Date; label: string }> {
    const slots = [];
    const baseDate = new Date(`${date}T00:00:00Z`); // UTC midnight

    for (let i = 0; i < 48; i++) {
        const start = new Date(baseDate.getTime() + i * 30 * 60 * 1000);
        const end = new Date(start.getTime() + 30 * 60 * 1000);

        const hours = String(Math.floor(i / 2)).padStart(2, '0');
        const mins = i % 2 === 0 ? '00' : '30';
        const label = `${hours}:${mins}`;

        slots.push({ start, end, label });
    }

    return slots;
}
