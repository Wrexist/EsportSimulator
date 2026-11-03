/**
 * Booked activities keep the English name they were booked with in the save.
 * These helpers show the known ones in the active language; anything else is
 * shown as stored.
 */
import { t } from "@/lib/i18n"
import type { ActivitySaveData } from "@/engine/save-types"
import { MEETING_TYPES } from "./staff-meetings"

const STORED_NAME_KEY: Record<string, string> = {
    "Local Bootcamp": "sch.boot.LOCAL",
    "International Bootcamp": "sch.boot.INTERNATIONAL",
    "Team Building Retreat": "sch.boot.RETREAT",
    "Social Media Push": "sch.mkt.SOCIAL",
    "Sponsorship Drive": "sch.mkt.SPONSORSHIP",
    "Influencer Collab Tour": "sch.mkt.INFLUENCER",
    ...Object.fromEntries(MEETING_TYPES.map(m => [m.name, `sch.meet.${m.id}`])),
}

/** A booked activity's name in the active language. */
export function activityName(name: string | null | undefined): string {
    if (!name) return ""
    const key = STORED_NAME_KEY[name]
    if (!key) return name
    const text = t(key)
    return text === key ? name : text
}

/** A booked activity's description: the option's own text when it is a known one. */
export function activityDescription(name: string | null | undefined, description: string | null | undefined): string {
    const key = name ? STORED_NAME_KEY[name] : undefined
    if (!key) return description || ""
    const text = t(`${key}.desc`)
    return text === `${key}.desc` ? description || "" : text
}

const KIND_TYPES = ["REST", "BOOTCAMP", "TRAVEL", "MEDIA", "STAFF_MEETING", "MARKETING"]
/** The kind of activity ("Bootcamp", "Staff meeting", …). */
export function activityKind(type: ActivitySaveData["type"]): string {
    return KIND_TYPES.includes(type) ? t(`sch.kind.${type}`) : type
}
