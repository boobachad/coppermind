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

/** Format ISO date string (YYYY-MM-DD) to DD/MM/YYYY without timezone conversion */
export function formatISODateDDMMYYYY(isoDate: string): string {
    const [year, month, day] = isoDate.split('T')[0].split('-');
    return `${day}/${month}/${year}`;
}

/** Format ISO date string (YYYY-MM-DD) to "Mon DD/MM/YYYY" with day name prefix */
export function formatISODateDDMMYYYYWithDay(isoDate: string): string {
    const clean = isoDate.split('T')[0];
    const [year, month, day] = clean.split('-');
    const date = new Date(`${clean}T00:00:00`);
    const dayName = DAYS_SHORT[date.getDay()];
    return `${dayName} ${day}/${month}/${year}`;
}

/** Format month string (YYYY-MM) to "Month YYYY" */
export function formatMonthDisplay(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    return `${MONTHS_LONG[month - 1]} ${year}`;
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
    // CRITICAL: Date methods like getFullYear(), getMonth(), getDate() 
    // automatically convert to LOCAL timezone, even if Date object is UTC
    // This matches the activities pattern exactly
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ─── Goal Date Utilities (Date-Only, No Time) ──────────────────
// Goals use date-only format (YYYY-MM-DD), never timestamps

/**
 * Parse goal due date string to Date object
 * Input: "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS..." (backend may send either)
 * Output: Date object in local timezone at midnight
 */
export function parseGoalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
}

/**
 * Format Date object to goal date string (YYYY-MM-DD)
 * Input: Date object
 * Output: "YYYY-MM-DD" string for backend
 */
export function formatGoalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

/**
 * Create UTC date boundaries for a given YYYY-MM-DD date string
 * Returns start and end ISO strings for the full day in UTC
 */
export function getDayBoundariesUTC(dateStr: string): { start: string; end: string } {
    return {
        start: `${dateStr}T00:00:00Z`,
        end: `${dateStr}T23:59:59Z`
    };
}

/**
 * Create Date objects for time slots in LOCAL timezone
 * Input: YYYY-MM-DD date string and slot index (0-47)
 * Output: { start: Date, end: Date } in local timezone
 * 
 * CRITICAL: Must match parseActivityTime behavior (local timezone)
 * Activities are stored as timestamptz and converted to local by parseActivityTime
 */
export function getSlotBoundaries(dateStr: string, slotIndex: number): { start: Date; end: Date } {
    const startMinutes = slotIndex * 30;
    const endMinutes = startMinutes + 30;
    
    const startHours = Math.floor(startMinutes / 60);
    const startMins = startMinutes % 60;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    
    // Parse as local time by omitting 'Z' suffix
    // This creates Date in local timezone matching parseActivityTime
    return {
        start: new Date(`${dateStr}T${String(startHours).padStart(2, '0')}:${String(startMins).padStart(2, '0')}:00`),
        end: new Date(`${dateStr}T${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00`)
    };
}
