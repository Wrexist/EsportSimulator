"use client"

/**
 * Moments slice (Phase 5 stream 5.4a): the queue of full-screen moments
 * (engine/moments.ts) and the actions the UI uses on it.
 *
 * The queue is career state: it is saved with the career (build-save-snapshot)
 * and restored by loadGame, so a moment decided in a week tick survives a
 * reload. The MomentHost shows the head of the queue one at a time and calls
 * dismissMoment; Continue stops while anything is queued (lib/advance-stops).
 */

import {
    dismissMoment as dismissFrom,
    hasMomentKey,
    markMomentKey,
    queueMoment,
    type Moment,
    type MomentHolder,
    type SigningMoment,
    type SigningSignature,
} from "@/engine/moments"
import { evaluatePlayer } from "@/engine/player-evaluation"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { bestFiveOvr, marketStandings } from "@/engine/transfer-hype"

/** A completed signing, as the negotiation hands it to the reveal. */
export interface SigningInput {
    playerId: string
    fee: number
    salaryPerWeek: number
    contractEndWeek: number
    fromTeamId: string | null
    /** Up to three AI clubs that were in the race for him, and how many there were. */
    rivalNames?: string[]
    rivalCount?: number
    /** The manager's roster before the deal (for the best-five change). */
    rosterBefore?: string[]
    /** The signature the manager drew on the contract. */
    signature?: SigningSignature
}

export interface MomentsState {
    /** Moments waiting to be shown, oldest first (saved). */
    momentQueue: Moment[]
    /** Keys already delivered (saved, bounded). */
    seenMomentKeys: string[]
}

export interface MomentsActions {
    /** Queue a moment (ignored when its key was queued or delivered before). */
    enqueueMoment: (moment: Moment) => boolean
    /** The head moment was shown: remove it and remember its key. */
    dismissMoment: (key: string) => void
    /** Record a one-off beat that is not queued (e.g. a match intro) as delivered. */
    markMomentSeen: (key: string) => void
    /** The manager signed a player through a negotiation: queue the reveal. */
    queueSigningMoment: (signing: SigningInput) => boolean
}

/** What the slice needs from the rest of the store. */
interface MomentsHost extends MomentHolder {
    saveId: string | null
    isInitialized: boolean
    currentWeek: number
    playerTeamId: string | null
    players: PlayerSaveData[]
    teams: TeamSaveData[]
    pendingCelebration?: unknown
    saveGame: () => Promise<void>
}

type Store = MomentsHost & MomentsState & MomentsActions
type SetFn = (partial: Partial<Store> | ((draft: Store) => void)) => void

export const initialMomentsState: MomentsState = {
    momentQueue: [],
    seenMomentKeys: [],
}

/** A signature longer than this is not kept with the moment (saves stay small). */
const MAX_SIGNATURE_CHARS = 12_000

/** Rating at or above which a signing gets the big reveal (the game's "blockbuster" rule). */
export const BIG_SIGNING_RATING = 85

/** Build the signing moment from the career as it is right after the deal. */
export function buildSigningMoment(
    state: Pick<Store, "currentWeek" | "playerTeamId" | "players" | "teams">,
    signing: SigningInput,
): SigningMoment | null {
    const player = state.players.find(p => p.id === signing.playerId)
    if (!player || !state.playerTeamId) return null
    const fromTeam = signing.fromTeamId && signing.fromTeamId !== "FA" ? state.teams.find(t => t.id === signing.fromTeamId) : undefined
    let rating = player.skill ?? 0
    try { rating = evaluatePlayer(player).overallRating } catch { /* keep the raw skill */ }
    const fee = Math.max(0, Math.round(signing.fee))
    let standing: SigningMoment["standing"]
    let squad: SigningMoment["squad"]
    try {
        standing = marketStandings(state.players, state.currentWeek).get(player.id)
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (myTeam && signing.rosterBefore) {
            const before = bestFiveOvr(signing.rosterBefore.filter(id => id !== player.id), state.players)
            const after = bestFiveOvr(myTeam.rosterIds, state.players)
            if (before != null && after != null) squad = { before, after }
        }
    } catch { /* the reveal works without them */ }
    const rivalNames = (signing.rivalNames ?? []).slice(0, 3)
    return {
        key: `signing:${player.id}:${state.currentWeek}`,
        kind: "signing",
        week: state.currentWeek,
        playerId: player.id,
        fee,
        salaryPerWeek: Math.max(0, Math.round(signing.salaryPerWeek)),
        contractEndWeek: signing.contractEndWeek,
        fromTeamName: fromTeam?.name ?? null,
        rating,
        big: rating >= BIG_SIGNING_RATING,
        ...(standing ? { standing } : {}),
        ...(rivalNames.length > 0 ? { rivalNames, rivalCount: Math.max(rivalNames.length, signing.rivalCount ?? 0) } : {}),
        ...(squad ? { squad } : {}),
        ...(signing.signature && signing.signature.d.length <= MAX_SIGNATURE_CHARS ? { signature: signing.signature } : {}),
    }
}

export const createMomentsSlice = (set: SetFn, get: () => Store): MomentsActions => {
    /** Persist a delivered moment so a reload never shows it again. */
    const persist = () => {
        const s = get()
        if (s.saveId && s.isInitialized) void s.saveGame().catch(() => { /* surfaced by saveGame */ })
    }
    return {
        enqueueMoment: (moment) => {
            if (hasMomentKey(get(), moment.key)) return false
            let added = false
            set(draft => { added = queueMoment(draft, moment) })
            return added
        },

        dismissMoment: (key) => {
            const legacy = get().pendingCelebration
            set(draft => {
                dismissFrom(draft, key)
                // A legacy celebration is shown as a title moment; clear it with it.
                if (legacy && key.startsWith("title:")) draft.pendingCelebration = null
            })
            persist()
        },

        markMomentSeen: (key) => {
            if (get().seenMomentKeys?.includes(key)) return
            set(draft => { markMomentKey(draft, key) })
        },

        queueSigningMoment: (signing) => {
            const moment = buildSigningMoment(get(), signing)
            if (!moment) return false
            return get().enqueueMoment(moment)
        },
    }
}
