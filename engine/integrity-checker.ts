import { GameSave } from "./save-types"
import { Player, Team } from "@/types"

export interface IntegrityIssue {
    type: "STAT" | "FINANCE" | "ROSTER" | "MATCH" | "DATA"
    message: string
    severity: "HIGH" | "MEDIUM" | "LOW"
    entityId?: string
}

export class IntegrityChecker {
    static check(save: GameSave): IntegrityIssue[] {
        const issues: IntegrityIssue[] = []

        // 1. Player Stats Checks
        save.players.forEach(player => {
            // `< 0 || > 100` is false for NaN, so a non-finite skill would
            // otherwise slip through this check entirely.
            if (!Number.isFinite(player.skill) || player.skill < 0 || player.skill > 100) {
                issues.push({ type: "STAT", message: `Player ${player.nickname} (${player.id}) has invalid skill: ${player.skill}`, severity: "HIGH", entityId: player.id })
            }
            if (player.morale < 0 || player.morale > 100) {
                issues.push({ type: "STAT", message: `Player ${player.nickname} (${player.id}) has invalid morale: ${player.morale}`, severity: "MEDIUM", entityId: player.id })
            }
            if (player.fatigue < 0 || player.fatigue > 100) {
                issues.push({ type: "STAT", message: `Player ${player.nickname} (${player.id}) has invalid fatigue: ${player.fatigue}`, severity: "MEDIUM", entityId: player.id })
            }
        })

        // 2. Roster Checks
        save.teams.forEach(team => {
            // Check roster size
            if (team.rosterIds.length < 5) {
                issues.push({ type: "ROSTER", message: `Team ${team.name} (${team.id}) has incomplete roster: ${team.rosterIds.length} players`, severity: "HIGH", entityId: team.id })
            }

            // Check roster integrity (ids exist)
            team.rosterIds.forEach(id => {
                if (!save.players.find(p => p.id === id)) {
                    issues.push({ type: "ROSTER", message: `Team ${team.name} has phantom player ID: ${id}`, severity: "HIGH", entityId: team.id })
                }
            })

            // Check budget. The non-finite case is checked first — every
            // numeric comparison against NaN is false, so a corrupt budget
            // would otherwise pass silently.
            if (!Number.isFinite(team.budget)) {
                issues.push({ type: "FINANCE", message: `Team ${team.name} (${team.id}) has a non-finite budget`, severity: "HIGH", entityId: team.id })
            } else if (team.budget < 0 && team.budget > -500000) {
                issues.push({ type: "FINANCE", message: `Team ${team.name} is in debt: $${team.budget}`, severity: "MEDIUM", entityId: team.id })
            } else if (team.budget < -1000000) {
                issues.push({ type: "FINANCE", message: `Team ${team.name} is bankrupt? $${team.budget}`, severity: "HIGH", entityId: team.id })
            }
        })

        // 2b. Cross-roster integrity — a player must not be on two rosters.
        const rosterMembership = new Map<string, string[]>()
        save.teams.forEach(team => {
            team.rosterIds.forEach(id => {
                const owners = rosterMembership.get(id) ?? []
                owners.push(team.id)
                rosterMembership.set(id, owners)
            })
        })
        rosterMembership.forEach((teamIds, playerId) => {
            if (teamIds.length > 1) {
                issues.push({ type: "ROSTER", message: `Player ${playerId} appears on multiple rosters: ${teamIds.join(", ")}`, severity: "HIGH", entityId: playerId })
            }
        })

        // 2c. Contract sanity — end must come after start, salary finite.
        save.contracts.forEach(c => {
            if (c.endWeek <= c.startWeek) {
                issues.push({ type: "DATA", message: `Contract for player ${c.playerId} on team ${c.teamId} ends (${c.endWeek}) on or before it starts (${c.startWeek})`, severity: "MEDIUM", entityId: c.playerId })
            }
            if (!Number.isFinite(c.salaryPerWeek)) {
                issues.push({ type: "FINANCE", message: `Contract for player ${c.playerId} has a non-finite weekly salary`, severity: "HIGH", entityId: c.playerId })
            }
        })

        // 3. Match Checks
        const scheduledIds = new Set(save.scheduledMatches.map(m => m.id))
        const completedIds = new Set(save.completedMatches.map(m => m.id))

        if (scheduledIds.size !== save.scheduledMatches.length) {
            issues.push({ type: "MATCH", message: "Duplicate scheduled match IDs detected", severity: "HIGH" })
        }
        if (completedIds.size !== save.completedMatches.length) {
            issues.push({ type: "MATCH", message: "Duplicate completed match IDs detected", severity: "HIGH" })
        }

        // Overlap check
        save.scheduledMatches.forEach(m => {
            if (completedIds.has(m.id)) {
                issues.push({ type: "MATCH", message: `Match ${m.id} exists in both Schedule and Completed`, severity: "HIGH", entityId: m.id })
            }
        })

        // Completed-match score sanity — scores must be finite & non-negative.
        save.completedMatches.forEach(m => {
            const r = m.result
            if (!r) return
            if (!Number.isFinite(r.homeScore) || !Number.isFinite(r.awayScore) || r.homeScore < 0 || r.awayScore < 0) {
                issues.push({ type: "MATCH", message: `Completed match ${m.id} has an invalid score: ${r.homeScore}-${r.awayScore}`, severity: "HIGH", entityId: m.id })
            }
        })

        // 4. Finance Ledger Integrity
        // Check running balance consistency for Player Team (most important)
        // Group by team
        const teamLedgers: Record<string, typeof save.financeLedger> = {}
        save.financeLedger.forEach(entry => {
            if (!teamLedgers[entry.teamId]) teamLedgers[entry.teamId] = []
            teamLedgers[entry.teamId].push(entry)
        })

        Object.keys(teamLedgers).forEach(teamId => {
            const entries = teamLedgers[teamId]//.sort((a,b) => a.week - b.week) // Assuming order is chronological push
            // We can't verify balance strictly without initial balance knowledge, but we can verify steps if balance is absolute?
            // "balance: number" in ledger usually means "Balance AFTER transaction".
            // So Entry N Balance = Entry N-1 Balance + Amount (+/-).

            for (let i = 1; i < entries.length; i++) {
                const prev = entries[i - 1]
                const curr = entries[i]
                const typeMod = curr.type === "INCOME" ? 1 : -1
                const expected = prev.balance + (curr.amount * typeMod)

                // Allow float inaccuracy? Use EPSILON
                if (Math.abs(curr.balance - expected) > 1) {
                    issues.push({ type: "FINANCE", message: `Ledger mismatch for Team ${teamId} at week ${curr.week}. Prev: ${prev.balance}, Amt: ${curr.amount}, New: ${curr.balance}, Exp: ${expected}`, severity: "MEDIUM", entityId: teamId })
                }
            }

            // Check final ledger balance vs current team budget
            const lastEntry = entries[entries.length - 1]
            const team = save.teams.find(t => t.id === teamId)
            if (team && lastEntry) {
                if (Math.abs(team.budget - lastEntry.balance) > 1) {
                    // This might happen if budget modified outside ledger? (Should not happen in strict system)
                    issues.push({ type: "FINANCE", message: `Budget desync for ${team.name}. Budget: ${team.budget}, Ledger: ${lastEntry.balance}`, severity: "HIGH", entityId: team.id })
                }
            }
        })

        return issues
    }
}
