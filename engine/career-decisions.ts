import type { GameSave } from './save-types'

/** Small, situation-driven decisions. One open decision and at least eight weeks between them. */
export function generateCareerDecision(save: GameSave): void {
    if (save.gameOverReason) return
    const team = save.teams.find(t => t.id === save.playerTeamId)
    if (!team) return
    const previous = save.eventsLog.filter(e => e.id.startsWith('career_decision_') && e.data.teamId === team.id)
    for (const event of previous) {
        if (!event.selectedChoiceId && Number(event.data.deadlineWeek) < save.currentWeek) {
            event.data.isWithdrawn = true
            event.choices = []
        }
    }
    if (previous.some(e => e.week > save.currentWeek - 8 || (!e.selectedChoiceId && !e.data.isWithdrawn))) return
    const roster = save.players.filter(p => team.rosterIds.includes(p.id) && !p.isRetired)
    const low = [...roster].sort((a, b) => a.morale - b.morale || a.id.localeCompare(b.id))[0]
    const tired = [...roster].sort((a, b) => b.fatigue - a.fatigue || a.id.localeCompare(b.id))[0]
    const recent = save.completedMatches.filter(m => m.week <= save.currentWeek && m.week >= save.currentWeek - 4 && (m.homeTeamId === team.id || m.awayTeamId === team.id))
    const story = low && low.morale < 40 ? {
        key: 'confidence', player: low, title: `${low.nickname} needs support`,
        message: 'Confidence is low. Choose a focused support session or a private conversation.',
        choices: [{ id: 'support', text: 'Support session: $500, morale +8, loyalty +2', effects: { money: -500, morale: 8, loyalty: 2 } }, { id: 'talk', text: 'Private conversation: morale +3', effects: { morale: 3 } }],
    } : tired && tired.fatigue > 70 ? {
        key: 'recovery', player: tired, title: `${tired.nickname} is running on empty`,
        message: 'Heavy fatigue is affecting readiness. Extra recovery reduces fatigue now; a conversation only helps morale.',
        choices: [{ id: 'recovery', text: 'Recovery session: $750, fatigue -10', effects: { money: -750, fatigue: -10 } }, { id: 'talk', text: 'Check in: morale +2', effects: { morale: 2 } }],
    } : recent.length >= 3 && recent.slice(-3).every(m => m.result.winnerId === team.id) ? {
        key: 'momentum', player: roster[0], title: `${team.name} has momentum`,
        message: 'Three straight wins give the squad a chance to build trust.',
        choices: [{ id: 'team', text: 'Team session: $1,000, chemistry +3', effects: { money: -1000, chemistry: 3 } }, { id: 'praise', text: 'Praise the captain: morale +2', effects: { morale: 2 } }],
    } : undefined
    if (!story?.player) return
    const id = `career_decision_${team.id}_${save.currentWeek}_${story.key}`
    save.eventsLog.push({ id, type: 'CAREER_UPDATE', week: save.currentWeek, acknowledged: false,
        data: { teamId: team.id, playerId: story.player.id, title: story.title, message: story.message, deadlineWeek: save.currentWeek + 2 }, choices: story.choices })
}
