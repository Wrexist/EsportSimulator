"use client"

/**
 * MODES-01: in an active pro career the club's staff run the club. The pro
 * can't spend its money or change its squad, staff, academy, sponsors or
 * facilities, whichever screen or shortcut calls the action. (The staff's
 * own delegated chores, such as contract renewals and scouting missions,
 * still run.)
 */

import { liveText } from "@/lib/i18n"
import { isProActive, type ProCareerState } from "@/engine/pro-career"

export function proRunsNoClub(state: { proCareer?: ProCareerState | null }): boolean {
    return isProActive({ proCareer: state.proCareer ?? undefined })
}

export function proStaffRunRefusal(): { success: false; message: string } {
    return { success: false, message: liveText({ key: "lv.proStaffRun" }) }
}
