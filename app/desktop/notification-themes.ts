/**
 * Notification theming used by the desktop mail/event dialog.
 *
 * Extracted out of `app/desktop/page.tsx` so the page component is no longer
 * carrying ~30 lines of pure colour-mapping config. The dialog re-renders on
 * every selectedEventId change; keeping these as a module-level constant
 * avoids re-creating the themes object inside a useCallback closure each
 * time, and lets future event surfaces reuse the same palette without
 * importing the page.
 */

export type NotificationSound = "success" | "notification" | "error"

export interface NotificationTheme {
    gradient: string
    borderColor: string
    iconColor: string
    iconBg: string
    sound: NotificationSound
}

const THEMES: Record<string, NotificationTheme> = {
    JOB_OFFER:       { gradient: "from-emerald-500/30 via-emerald-600/20 to-transparent", borderColor: "border-emerald-500/40", iconColor: "text-emerald-400", iconBg: "bg-emerald-500/20", sound: "success" },
    TRANSFER_OFFER:  { gradient: "from-blue-500/30 via-cyan-500/20 to-transparent",       borderColor: "border-blue-500/40",    iconColor: "text-blue-400",    iconBg: "bg-blue-500/20",    sound: "notification" },
    INJURY:          { gradient: "from-red-500/30 via-rose-600/20 to-transparent",        borderColor: "border-red-500/40",     iconColor: "text-red-400",     iconBg: "bg-red-500/20",     sound: "error" },
    CAREER_UPDATE:   { gradient: "from-amber-500/30 via-yellow-500/20 to-transparent",    borderColor: "border-amber-500/40",   iconColor: "text-amber-400",   iconBg: "bg-amber-500/20",   sound: "success" },
    TOURNAMENT:      { gradient: "from-purple-500/30 via-violet-500/20 to-transparent",   borderColor: "border-purple-500/40",  iconColor: "text-purple-400",  iconBg: "bg-purple-500/20",  sound: "notification" },
    ROSTER_UPDATE:   { gradient: "from-indigo-500/30 via-blue-500/20 to-transparent",     borderColor: "border-indigo-500/40",  iconColor: "text-indigo-400",  iconBg: "bg-indigo-500/20",  sound: "notification" },
    AI_SIGNING:      { gradient: "from-indigo-500/30 via-blue-500/20 to-transparent",     borderColor: "border-indigo-500/40",  iconColor: "text-indigo-400",  iconBg: "bg-indigo-500/20",  sound: "notification" },
    AI_TRANSFER:     { gradient: "from-indigo-500/30 via-blue-500/20 to-transparent",     borderColor: "border-indigo-500/40",  iconColor: "text-indigo-400",  iconBg: "bg-indigo-500/20",  sound: "notification" },
    MEDIA:           { gradient: "from-amber-500/30 via-orange-500/20 to-transparent",    borderColor: "border-amber-500/40",   iconColor: "text-amber-400",   iconBg: "bg-amber-500/20",   sound: "notification" },
}

const DEFAULT_THEME: NotificationTheme = {
    gradient: "from-cyan-500/30 via-blue-500/20 to-transparent",
    borderColor: "border-cyan-500/40",
    iconColor: "text-cyan-400",
    iconBg: "bg-cyan-500/20",
    sound: "notification",
}

export function getNotificationTheme(type: string): NotificationTheme {
    return THEMES[type] || DEFAULT_THEME
}
