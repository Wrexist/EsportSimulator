import type { Side } from './team-model'
import type { TeamFrame, TeamEvent } from './team-simulation'

export function teamView(frame: TeamFrame, events: TeamEvent[], side: Side | 'world') {
    const privateEvents = new Set(['intent', 'plan', 'report', 'stale-report', 'route-blocked', 'spacing-wait', 'spacing-yield', 'utility-commit', 'utility-held', 'cover-angle', 'recovery-screen-wait', 'recovery-screen-ready', 'recovery-screen-cancelled', 'shot', 'reload', 'bomb-dropped', 'bomb-picked-up'])
    return {
        actors: frame.actors.filter(a => side === 'world' || a.side === side).map(a => side === 'world' ? a : { ...a, contacts: [] }),
        contacts: side === 'world' ? [] : frame.reports[side],
        plans: side === 'world' ? Object.entries(frame.plans) : [[side, frame.plans[side]]] as const,
        bomb: side === 'world' || side === 'T' || !['carried', 'dropped'].includes(frame.bomb.state) ? frame.bomb : null,
        events: events.filter(e => e.tick <= frame.tick && (side === 'world' || e.side === side && privateEvents.has(e.type) || !e.side && ['planted', 'defused', 'exploded', 'round-timeout'].includes(e.type))),
    }
}
