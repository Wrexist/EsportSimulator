/** Saved game days are offsets from the career epoch, independent of local DST. */
export function gameCalendarDate(start: string, week: number, day = 0): Date {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + (week - 1) * 7 + day)
    return date
}

export function formatGameCalendarDate(date: Date, options: Intl.DateTimeFormatOptions): string {
    return date.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
}
