import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

// Get user's timezone
function getUserTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Convert UTC timestamp to local timezone
export function utcToLocal(utcDate: Date): Date {
    return toZonedTime(utcDate, getUserTimezone());
}

// Format UTC date for display in local timezone
export function formatLocal(
    utcDate: Date,
    formatStr: string = 'yyyy-MM-dd HH:mm:ss'
): string {
    return formatInTimeZone(utcDate, getUserTimezone(), formatStr);
}

// Format date as DD/MM/YYYY (user requirement)
export function formatDateDDMMYYYY(utcDate: Date): string {
    return formatInTimeZone(utcDate, getUserTimezone(), 'dd/MM/yyyy');
}

// Format time as HH:mm
export function formatTime(utcDate: Date): string {
    return formatInTimeZone(utcDate, getUserTimezone(), 'HH:mm');
}

// Get local date string (YYYY-MM-DD) from user's perspective
export function getLocalDateString(date: Date = new Date()): string {
    return formatInTimeZone(date, getUserTimezone(), 'yyyy-MM-dd');
}

// Parse user input (local time) to UTC for DB storage
export function localToUTC(localDate: Date): Date {
    return new Date(localDate.toISOString());
}
