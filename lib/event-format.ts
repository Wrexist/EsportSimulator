/**
 * Shared event-formatting helpers.
 *
 * Extracted from app/desktop/page.tsx so the desktop inbox AND the dashboard
 * Action Center render event titles identically (one source of truth — the
 * two copies were a drift hazard).
 */

import type { GameEventSaveData } from "@/engine/save-types"

/**
 * Human-readable title for an event, by type. Pure — depends only on the
 * event itself.
 */
export function getEventTitle(event: GameEventSaveData): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data shape varies by type
    const data = event.data as any
    const type = event.type as string
    switch (type) {
        case "CONTRACT": return "Contract Expiry"
        case "MORALE": return "Internal Morale"
        case "INJURY": return data.fatigue ? "Fatigue Warning" : "Medical Report"
        case "FINANCE": return "Finance Dept"
        case "win_streak": return "Performance"
        case "loss_streak": return "Performance"
        case "TRANSFER_OFFER": return "Transfer Offer"
        case "TRANSFER_WINDOW": return "Transfer Market"
        case "ROSTER_UPDATE": return "Roster News"
        case "AI_SIGNING": return "New Signing"
        case "AI_TRANSFER": return "Transfer Alert"
        case "RETIREMENT": return "Retirement News"
        case "JOB_OFFER": return "Job Offer"
        case "CAREER_UPDATE": return "Career Update"
        case "MILESTONE": return "🏆 Milestone"
        case "TOURNAMENT": return "Tournament"
        case "MEDIA":
            if (data?.proAwards) {
                return `🏆 Pro Top 20 of ${data.proAwards.year}`
            }
            return data.title || "Media Update"
        default: return data.title || "Notification"
    }
}

/**
 * An event is a "pending decision" the player must resolve when it carries
 * unresolved `choices` (each with an effects bundle that `resolveEventChoice`
 * applies). Offers (job/transfer) have their own richer accept/decline flow
 * and are intentionally excluded here so the inline resolver never mishandles
 * them.
 */
export function isPendingDecisionEvent(event: GameEventSaveData): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- choices/selectedChoiceId are runtime-only fields
    const e = event as any
    if (!Array.isArray(e.choices) || e.choices.length === 0) return false
    if (e.selectedChoiceId !== undefined) return false
    const type = event.type as string
    if (type === "JOB_OFFER" || type === "TRANSFER_OFFER") return false
    // CONTRACT events with a TRANSFER_OFFER action go through acceptTransferOffer.
    if (type === "CONTRACT" && e.data?.action === "TRANSFER_OFFER") return false
    return e.choices.every((c: any) => c && c.effects)
}
