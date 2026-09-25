import type { GameSave } from '../../engine/save-types'

export function distribution(values: number[]) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
    const quantile = (q: number) => {
        if (!sorted.length) return null
        const position = (sorted.length - 1) * q, low = Math.floor(position)
        return sorted[low] + (sorted[Math.ceil(position)] - sorted[low]) * (position - low)
    }
    return { n: values.length, finite: sorted.length, min: sorted[0] ?? null, p10: quantile(.1), median: quantile(.5), p90: quantile(.9), max: sorted.at(-1) ?? null }
}

export function nonfinitePaths(value: unknown, path = 'save'): string[] {
    if (typeof value === 'number') return Number.isFinite(value) ? [] : [`nonfinite:${path}`]
    if (!value || typeof value !== 'object') return []
    return Object.entries(value).flatMap(([key, child]) => nonfinitePaths(child, `${path}.${key}`))
}

/** Failures are retained before serialization can turn NaN into null. */
export function balanceIssues(save: GameSave): string[] {
    const issues: string[] = [], players = new Map(save.players.map(p => [p.id, p]))
    if (players.size !== save.players.length) issues.push('duplicate-player-record')
    const owners = new Map<string, string>()
    const own = (id: string, owner: string) => {
        if (owners.has(id)) issues.push(`duplicate-ownership:${id}:${owners.get(id)}:${owner}`)
        owners.set(id, owner)
        if (!players.has(id) || players.get(id)!.isRetired) issues.push(`invalid-owned-player:${id}`)
    }
    for (const team of save.teams) {
        if (!Number.isFinite(team.budget)) issues.push(`nonfinite-budget:${team.id}`)
        for (const id of team.rosterIds) own(id, team.id)
        for (const id of team.youthAcademyIds || []) own(id, `${team.id}:youth`)
        for (const player of team.managementState?.academyPlayers || []) own(player.playerId, `${team.id}:academy`)
    }
    for (const player of save.academyPlayers || []) own(player.playerId, 'managed-academy')
    for (const id of save.academyPendingProspects || []) own(id, 'pending-academy')
    const active = new Set<string>()
    for (const contract of save.contracts.filter(c => c.startWeek <= save.currentWeek && c.endWeek > save.currentWeek)) {
        if (active.has(contract.playerId)) issues.push(`duplicate-active-contract:${contract.playerId}`)
        active.add(contract.playerId)
        if (!Number.isFinite(contract.salaryPerWeek) || contract.salaryPerWeek < 0) issues.push(`invalid-wage:${contract.playerId}`)
        if (!save.teams.find(t => t.id === contract.teamId)?.rosterIds.includes(contract.playerId)) issues.push(`contract-owner-mismatch:${contract.playerId}`)
    }
    for (const team of save.teams) for (const id of team.rosterIds) if (!active.has(id)) issues.push(`uncontracted-senior:${id}`)
    for (const player of save.players) for (const key of ['skill', 'potential', 'rifle', 'tactic', 'fatigue', 'morale', 'energy'] as const) {
        const value = player[key]
        if (!Number.isFinite(value) || value < 0 || value > 100) issues.push(`invalid-stat:${player.id}:${key}:${value}`)
    }
    const ledger = (save.financeLedger || []).map(entry => entry.id)
    if (new Set(ledger).size !== ledger.length) issues.push('duplicate-ledger-id')
    return issues
}

export function balanceSnapshot(save: GameSave) {
    const alive = save.players.filter(p => !p.isRetired)
    return {
        week: save.currentWeek, managedCash: save.teams.find(t => t.id === save.playerTeamId)?.budget,
        players: save.players.length, retired: save.players.length - alive.length,
        budgets: distribution(save.teams.map(t => t.budget)), insolvent: save.teams.filter(t => t.financialState === 'INSOLVENT').length,
        shortRosters: save.teams.filter(t => t.rosterIds.length < 5).map(t => t.id),
        skill: distribution(alive.map(p => p.skill)), fatigue: distribution(alive.map(p => p.fatigue)),
        injuries: alive.filter(p => p.injury).length,
        wages: distribution(save.contracts.filter(c => c.endWeek > save.currentWeek).map(c => c.salaryPerWeek)),
        sponsors: distribution(save.teams.map(t => (t.sponsors || []).reduce((sum, sponsor) => sum + sponsor.weeklyPayout, 0))),
        elo: distribution(save.teams.map(t => t.elo ?? 0)),
    }
}
