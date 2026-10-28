/**
 * Community Discord. The invite opens in the browser (electron/external-links
 * allows discord.gg); Major posts go through the relay in
 * electron/community-share.js. Empty invite = no Discord UI anywhere.
 */
import type { MajorWinShare } from "@/types/electron-window"

export const DISCORD_INVITE_URL = "https://discord.gg/urpvaTjbKC"

export const DISCORD_MAJOR_CHANNEL = "#major-winners"

export const hasCommunityDiscord = () => /^https:\/\/discord\.gg\/[A-Za-z0-9-]+$/.test(DISCORD_INVITE_URL)

const cap = (v: string | null | undefined, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

/** Fits a share to the IPC contract (electron/ipc-policy.js): capped names, "2-1" scores, sane season. */
export function cleanMajorShare(share: MajorWinShare): MajorWinShare | null {
    const teamName = cap(share.teamName, 64)
    const tournamentName = cap(share.tournamentName, 96)
    if (!teamName || !tournamentName) return null
    const season = Number.isInteger(share.season) && share.season! >= 1 && share.season! <= 999 ? share.season! : null
    return {
        managerName: cap(share.managerName, 64),
        teamName,
        tournamentName,
        opponentName: cap(share.opponentName, 64),
        finalScore: typeof share.finalScore === "string" && /^\d{1,2}-\d{1,2}$/.test(share.finalScore) ? share.finalScore : null,
        season,
    }
}
