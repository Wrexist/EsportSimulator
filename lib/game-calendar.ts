import { intlLocale } from './i18n'

/** Saved game days are offsets from the career epoch, independent of local DST. */
export function gameCalendarDate(start: string, week: number, day = 0): Date {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + (week - 1) * 7 + day)
    return date
}

export function formatGameCalendarDate(date: Date, options: Intl.DateTimeFormatOptions): string {
    // The interface language picks the month and weekday names and their order.
    return date.toLocaleDateString(intlLocale(), { ...options, timeZone: 'UTC' })
}

/** A span of game days, e.g. "Jan 31 – Feb 6, 2027", in the interface language. */
export function formatGameCalendarRange(start: Date, end: Date, options: Intl.DateTimeFormatOptions): string {
    const format = new Intl.DateTimeFormat(intlLocale(), { ...options, timeZone: 'UTC' })
    if (typeof format.formatRange === 'function') return format.formatRange(start, end)
    return `${format.format(start)} – ${format.format(end)}`
}
