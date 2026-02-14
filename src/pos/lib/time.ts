// ─── Date Formatting ────────────────────────────────────────────

export function formatDateDDMMYYYY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

export function formatTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatSlotTime(slotIndex: number): string {
    const totalMinutes = slotIndex * 30;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getDayName(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function getLocalDateString(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localDate = new Date(now.getTime() - offset);
    return localDate.toISOString().split('T')[0];
}

// ─── Activity Time Utilities ────────────────────────────────────
// CRITICAL: Backend stores UTC, frontend displays local time
// Always use these functions for consistency across Grid/DailyPage

/**
 * Convert local Date to UTC ISO string for backend storage
 * Input: Local time Date object (e.g., 00:00 in UTC+5:30)
 * Output: UTC ISO string (e.g., "2026-02-11T18:30:00.000Z")
 * 
 * The Date object is already in local time, .toISOString() converts to UTC
 */
export function formatLocalAsUTC(localDate: Date): string {
    const iso = localDate.toISOString();
    console.log('[formatLocalAsUTC]', {
        localTime: `${localDate.getHours()}:${localDate.getMinutes()}`,
        localString: localDate.toString(),
        utcISO: iso,
        utcTime: `${localDate.getUTCHours()}:${localDate.getUTCMinutes()}`
    });
    return iso;
}

/**
 * Parse activity ISO timestamp to local Date object
 * Backend sends UTC strings like "2026-02-11T18:30:00Z"
 * This converts to local timezone: 18:30 UTC → 00:00 UTC+5:30
 */
export function parseActivityTime(isoString: string): Date {
    const date = new Date(isoString);
    console.log('[parseActivityTime]', {
        utcISO: isoString,
        localTime: `${date.getHours()}:${date.getMinutes()}`,
        localString: date.toString()
    });
    return date;
}

/**
 * Get activity duration in minutes
 */
export function getActivityDuration(startTime: string, endTime: string): number {
    const start = parseActivityTime(startTime).getTime();
    const end = parseActivityTime(endTime).getTime();
    return Math.round((end - start) / 60000);
}

/**
 * Check if activity overlaps with a time slot
 * Used by Grid and DailyPage for slot coloring
 */
export function activityOverlapsSlot(
    activityStartTime: string,
    activityEndTime: string,
    slotStart: Date,
    slotEnd: Date
): boolean {
    const actStart = parseActivityTime(activityStartTime);
    const actEnd = parseActivityTime(activityEndTime);
    return actStart < slotEnd && actEnd > slotStart;
}

/**
 * Format activity time for display (HH:MM format)
 */
export function formatActivityTime(isoString: string): string {
    return formatTime(parseActivityTime(isoString));
}
