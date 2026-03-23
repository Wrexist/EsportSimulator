import fs from "node:fs"
import path from "node:path"

type TournamentTier = "S_TIER" | "A_TIER" | "B_TIER" | "C_TIER" | "QUALIFIER"
type TournamentFormat = "bracket" | "league" | "swiss" | "double_elim" | "gsl"

interface TournamentDefinition {
    id: string
    name: string
    tier: TournamentTier
    format: TournamentFormat
    slots: number
    startWeek: number
    duration: number
    qualifierFor?: string
    qualifierSlots?: number
}

interface ValidationIssue {
    severity: "ERROR" | "WARN"
    message: string
}

const CALENDAR_PATH = path.resolve(process.cwd(), "data", "tournaments.json")

const HIGH_TIER: TournamentTier[] = ["S_TIER", "A_TIER"]
const WEEKLY_HIGH_TIER_CAP = 3

function readCalendar(): TournamentDefinition[] {
    const raw = fs.readFileSync(CALENDAR_PATH, "utf8")
    return JSON.parse(raw) as TournamentDefinition[]
}

function getWeekRange(def: TournamentDefinition): number[] {
    const range: number[] = []
    const safeDuration = Math.max(1, def.duration || 1)
    for (let i = 0; i < safeDuration; i++) {
        const week = ((def.startWeek - 1 + i) % 52) + 1
        range.push(week)
    }
    return range
}

function validate(calendar: TournamentDefinition[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const byId = new Map(calendar.map(def => [def.id, def]))

    const highTierByWeek = new Map<number, TournamentDefinition[]>()
    for (const def of calendar) {
        if (!HIGH_TIER.includes(def.tier)) continue
        for (const week of getWeekRange(def)) {
            const bucket = highTierByWeek.get(week) || []
            bucket.push(def)
            highTierByWeek.set(week, bucket)
        }
    }

    for (const [week, defs] of highTierByWeek.entries()) {
        if (defs.length > WEEKLY_HIGH_TIER_CAP) {
            issues.push({
                severity: "ERROR",
                message: `Week ${week} has ${defs.length} high-tier overlaps (cap ${WEEKLY_HIGH_TIER_CAP})`,
            })
        }
    }

    for (const def of calendar) {
        if (def.format === "swiss" && def.duration < 2) {
            issues.push({
                severity: "ERROR",
                message: `${def.id} uses swiss format with duration ${def.duration}. Minimum is 2 weeks.`,
            })
        }
        if (def.format === "league" && def.duration < 3) {
            issues.push({
                severity: "WARN",
                message: `${def.id} uses league format with duration ${def.duration}. Consider 3+ weeks for pacing.`,
            })
        }
    }

    const qualifiersByTarget = new Map<string, TournamentDefinition[]>()
    for (const def of calendar) {
        if (!def.qualifierFor) continue
        const bucket = qualifiersByTarget.get(def.qualifierFor) || []
        bucket.push(def)
        qualifiersByTarget.set(def.qualifierFor, bucket)
    }

    for (const [targetId, qualifiers] of qualifiersByTarget.entries()) {
        const target = byId.get(targetId)
        if (!target) {
            issues.push({
                severity: "ERROR",
                message: `Qualifier target missing: ${targetId}`,
            })
            continue
        }

        const promotedSlots = qualifiers.reduce((sum, qualifier) => sum + Math.max(0, qualifier.qualifierSlots || 0), 0)
        if (promotedSlots > target.slots) {
            issues.push({
                severity: "ERROR",
                message: `Slot overflow into ${target.id}: qualifiers promote ${promotedSlots} for ${target.slots} slots`,
            })
        }

        qualifiers.forEach(qualifier => {
            let leadTime = target.startWeek - qualifier.startWeek
            if (leadTime < 0) leadTime += 52
            if (leadTime < 1) {
                issues.push({
                    severity: "ERROR",
                    message: `${qualifier.id} starts too close to ${target.id} (lead ${leadTime} week)`,
                })
            } else if (leadTime < 2) {
                issues.push({
                    severity: "WARN",
                    message: `${qualifier.id} should ideally start 2-3 weeks before ${target.id} (lead ${leadTime})`,
                })
            }
        })
    }

    return issues
}

function main(): void {
    const calendar = readCalendar()
    const issues = validate(calendar)

    const errors = issues.filter(issue => issue.severity === "ERROR")
    const warnings = issues.filter(issue => issue.severity === "WARN")

    warnings.forEach(issue => {
        console.warn(`[calendar:${issue.severity}] ${issue.message}`)
    })
    errors.forEach(issue => {
        console.error(`[calendar:${issue.severity}] ${issue.message}`)
    })

    if (errors.length > 0) {
        process.exitCode = 1
        return
    }

    console.log(`Calendar validation passed (${warnings.length} warning${warnings.length === 1 ? "" : "s"})`)
}

main()
