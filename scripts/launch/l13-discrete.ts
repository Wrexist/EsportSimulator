import type { TeamResult } from '../../engine/spatial/team-simulation'
/** Exclude continuous coordinates/angles while comparing authoritative decisions across runtimes. */
export function discreteTeamReplay(r: TeamResult) {
    return { outcome: r.outcome, reason: r.reason, events: r.events.map(({ point, ...e }) => e), frames: r.frames.map(f => ({ tick: f.tick, plans: f.plans, bomb: { state: f.bomb.state, carrier: f.bomb.carrier, site: f.bomb.site, plantedTick: f.bomb.plantedTick, progress: f.bomb.progress, actor: f.bomb.actor }, actors: f.actors.map(a => ({ id: a.id, health: a.health, armor: a.armor, ammo: a.ammo, intent: a.intent, reason: a.reason, blindUntil: a.blindUntil, inventory: a.inventory, contacts: a.contacts.map(({ point, ...c }) => c) })), reports: { T: f.reports.T.map(({ point, ...c }) => c), CT: f.reports.CT.map(({ point, ...c }) => c) } })) }
}
