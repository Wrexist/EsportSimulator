import type { GameSave } from './save-types'
import { captainId } from './personality'
import { eventText } from '@/lib/news-ref'

/** Small, situation-driven decisions. One open decision and at least eight weeks between them. */
export function generateCareerDecision(save: GameSave): void {
    if (save.gameOverReason) return
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team) return
    // An unanswered one past its deadline was settled with its default at the
    // start of the tick (engine/decision-deadlines.ts).
    const previous = save.eventsLog.filter(e => e.id.startsWith('career_decision_') && e.data.teamId === team.id)
    if (previous.some(e => e.week > save.currentWeek - 8 || (!e.selectedChoiceId && !e.data.isWithdrawn))) return
    const roster = save.players.filter(p => team.rosterIds.includes(p.id) && !p.isRetired)
    const low = [...roster].sort((a, b) => a.morale - b.morale || a.id.localeCompare(b.id))[0]
    const tired = [...roster].sort((a, b) => b.fatigue - a.fatigue || a.id.localeCompare(b.id))[0]
    const recent = save.completedMatches.filter(m => m.week <= save.currentWeek && m.week >= save.currentWeek - 4 && (m.homeTeamId === team.id || m.awayTeamId === team.id))
    const story = low && low.morale < 40 ? {
        key: 'confidence', player: low, ...eventText({ key: 'cdec.support.t', params: { name: low.nickname } }, { key: 'cdec.support.m', params: { name: low.nickname } }),
        choices: [{ id: 'support', text: 'Support session: $500, morale +8, loyalty +2', ref: { key: 'cdec.c.support' }, effects: { money: -500, morale: 8, loyalty: 2 } }, { id: 'talk', text: 'Private conversation: morale +3', ref: { key: 'cdec.c.private' }, effects: { morale: 3 } }],
    } : tired && tired.fatigue > 70 ? {
        key: 'recovery', player: tired, ...eventText({ key: 'cdec.tired.t', params: { name: tired.nickname } }, { key: 'cdec.tired.m', params: { name: tired.nickname } }),
        choices: [{ id: 'recovery', text: 'Recovery session: $750, fatigue -10', ref: { key: 'cdec.c.recovery' }, effects: { money: -750, fatigue: -10 } }, { id: 'talk', text: 'Check in: morale +2', ref: { key: 'cdec.c.checkIn' }, effects: { morale: 2 } }],
    } : recent.length >= 3 && recent.slice(-3).every(m => m.result.winnerId === team.id) ? {
        // Phase 5.2: the captain is the manager's pick (default: highest leader stat), not roster[0].
        key: 'momentum', player: roster.find(p => p.id === captainId(team, id => roster.find(r => r.id === id))) ?? roster[0], ...eventText({ key: 'cdec.momentum.t', params: { club: team.name } }, { key: 'cdec.momentum.m' }),
        choices: [{ id: 'team', text: 'Team session: $1,000, chemistry +3', ref: { key: 'cdec.c.team' }, effects: { money: -1000, chemistry: 3 } }, { id: 'praise', text: 'Praise the captain: morale +2', ref: { key: 'cdec.c.praise' }, effects: { morale: 2 } }],
    } : undefined
    if (!story?.player) return
    const id = `career_decision_${team.id}_${save.currentWeek}_${story.key}`
    save.eventsLog.push({ id, type: 'CAREER_UPDATE', week: save.currentWeek, acknowledged: false,
        data: { teamId: team.id, playerId: story.player.id, title: story.title, message: story.message, titleRef: story.titleRef, messageRef: story.messageRef, deadlineWeek: save.currentWeek + 2 }, choices: story.choices })
}
