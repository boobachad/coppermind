// ─── Date Formatting ────────────────────────────────────────────

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatDateDDMMYYYY(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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
    const date = new Date(dateStr + 'T00:00:00');
    return DAYS_SHORT[date.getDay()];
}

/** Returns 3-letter month abbreviation, e.g. "Jan" */
export function getMonthShort(date: Date): string {
    return MONTHS_SHORT[date.getMonth()];
}

/** Returns "January 2026" style string */
export function formatMonthYear(date: Date): string {
    return `${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
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

    return iso;
}

/**
 * Parse activity ISO timestamp to local Date object
 * Backend sends UTC strings like "2026-02-11T18:30:00Z"
 * This converts to local timezone: 18:30 UTC → 00:00 UTC+5:30
 */
export function parseActivityTime(isoString: string): Date {
    const date = new Date(isoString);
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
