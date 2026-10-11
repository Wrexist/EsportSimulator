"use client"

/**
 * Dressing-room slice (Phase 5.2): the managed club's captain and mentors.
 *
 *   - setCaptain — the manager's captain (null = the default, the highest
 *     leader stat on the roster). The captain, when he plays, spares the
 *     lineup part of a defeat's morale loss (engine/personality.ts).
 *   - assignMentor — a veteran (age ≥ MENTOR_MIN_AGE, Leader or
 *     Professional) mentors one player aged ≤ MENTEE_MAX_AGE: extra
 *     training gain through the weekly training processor.
 *   - endMentorship — ends a pairing.
 *
 * Only the managed club can be changed through these actions.
 */

import type { SliceCreator } from "@/store/types"
import { canBeMentored, canMentor } from "@/engine/personality"

export interface DressingRoomActions {
    setCaptain: (playerId: string | null) => { success: boolean; message: string }
    assignMentor: (mentorId: string, menteeId: string) => { success: boolean; message: string }
    endMentorship: (menteeId: string) => void
}

export const createDressingRoomSlice: SliceCreator<DressingRoomActions> = (set, get) => ({
    setCaptain: (playerId) => {
        let outcome = { success: false, message: "No club to manage." }
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return
            if (playerId === null) {
                if (team.dressingRoom) delete team.dressingRoom.captainId
                outcome = { success: true, message: "Captaincy goes to the highest leader stat." }
                return
            }
            const player = state.players.find(p => p.id === playerId)
            if (!player || player.isRetired || !team.rosterIds.includes(playerId)) {
                outcome = { success: false, message: "Only a player in your squad can be captain." }
                return
            }
            team.dressingRoom = { ...(team.dressingRoom ?? {}), captainId: playerId }
            outcome = { success: true, message: `${player.nickname} is your captain.` }
        })
        return outcome
    },

    assignMentor: (mentorId, menteeId) => {
        let outcome = { success: false, message: "No club to manage." }
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return
            const mentor = state.players.find(p => p.id === mentorId)
            const mentee = state.players.find(p => p.id === menteeId)
            if (!mentor || !mentee || mentorId === menteeId || !team.rosterIds.includes(mentorId) || !team.rosterIds.includes(menteeId)) {
                outcome = { success: false, message: "Both players must be in your squad." }
                return
            }
            if (!canMentor(mentor)) {
                outcome = { success: false, message: `${mentor.nickname} can't mentor: needs to be a Leader or Professional aged 27+.` }
                return
            }
            if (!canBeMentored(mentee)) {
                outcome = { success: false, message: `${mentee.nickname} is too old to be mentored.` }
                return
            }
            const pairs = (team.dressingRoom?.mentorships ?? []).filter(m => m.mentorId !== mentorId && m.menteeId !== menteeId)
            pairs.push({ mentorId, menteeId, sinceWeek: state.currentWeek })
            team.dressingRoom = { ...(team.dressingRoom ?? {}), mentorships: pairs }
            outcome = { success: true, message: `${mentor.nickname} now mentors ${mentee.nickname}.` }
        })
        if (outcome.success) get().addToast({ message: outcome.message, type: "info" })
        return outcome
    },

    endMentorship: (menteeId) => {
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team?.dressingRoom?.mentorships) return
            team.dressingRoom.mentorships = team.dressingRoom.mentorships.filter(m => m.menteeId !== menteeId)
        })
    },
})
