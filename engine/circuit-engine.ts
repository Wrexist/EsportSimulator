import type { TournamentDefinition } from "@/data/tournament-calendar"
import { QualificationStatus, TournamentSaveData } from "./save-types"

export interface TournamentIdentity {
    seriesId: string
    instanceId: string
    seasonNumber: number
}

export interface QualificationGraphEdge {
    sourceSeriesId: string
    targetSeriesId: string
    promotedSlots: number
}

export interface QualificationGraph {
    edges: QualificationGraphEdge[]
    errors: string[]
}

const SEASON_ID_REGEX = /_s(\d+)$/

export function getSeasonFromWeek(week: number): number {
    return Math.max(1, Math.floor((Math.max(1, week) - 1) / 52) + 1)
}

export function getSeriesIdFromTournamentId(tournamentId: string): string {
    if (!tournamentId) return ""
    return tournamentId.replace(SEASON_ID_REGEX, "")
}

export function getSeasonFromTournamentId(tournamentId: string): number | null {
    const match = tournamentId.match(SEASON_ID_REGEX)
    if (!match) return null
    const parsed = Number.parseInt(match[1], 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function buildInstanceId(seriesId: string, seasonNumber: number): string {
    const safeSeason = Math.max(1, Math.floor(seasonNumber || 1))
    return `${seriesId}_s${safeSeason}`
}

export function resolveTournamentIdentity(tournamentId: string, fallbackWeek?: number): TournamentIdentity {
    const seriesId = getSeriesIdFromTournamentId(tournamentId)
    const seasonFromId = getSeasonFromTournamentId(tournamentId)
    const seasonNumber = seasonFromId ?? getSeasonFromWeek(fallbackWeek ?? 1)
    const instanceId = seasonFromId ? tournamentId : buildInstanceId(seriesId, seasonNumber)
    return {
        seriesId,
        instanceId,
        seasonNumber,
    }
}

export function isSameSeriesSeason(left: TournamentIdentity, right: TournamentIdentity): boolean {
    return left.seriesId === right.seriesId && left.seasonNumber === right.seasonNumber
}

export function isSameSeriesSeasonFromIds(leftId: string, rightId: string, fallbackWeek?: number): boolean {
    const left = resolveTournamentIdentity(leftId, fallbackWeek)
    const right = resolveTournamentIdentity(rightId, fallbackWeek)
    return isSameSeriesSeason(left, right)
}

export function normalizeQualificationStatus(
    row: QualificationStatus,
    fallbackWeek?: number
): QualificationStatus {
    const seriesId = row.seriesId || getSeriesIdFromTournamentId(row.tournamentId)
    const explicitSeason = row.seasonNumber ?? getSeasonFromTournamentId(row.instanceId || row.tournamentId)
    const seasonNumber = explicitSeason ?? (
        typeof fallbackWeek === "number" && Number.isFinite(fallbackWeek)
            ? getSeasonFromWeek(fallbackWeek)
            : undefined
    )
    const instanceId = row.instanceId
        || (typeof seasonNumber === "number" ? buildInstanceId(seriesId, seasonNumber) : row.tournamentId)

    const sourceSeries = row.sourceInstanceId ? getSeriesIdFromTournamentId(row.sourceInstanceId) : undefined
    const sourceSeason = row.sourceInstanceId ? getSeasonFromTournamentId(row.sourceInstanceId) : undefined

    return {
        ...row,
        seriesId,
        seasonNumber,
        instanceId,
        sourceInstanceId: row.sourceInstanceId || (
            sourceSeries && sourceSeason ? buildInstanceId(sourceSeries, sourceSeason) : row.sourceInstanceId
        ),
    }
}

export function normalizeTournamentIdentity(
    tournament: TournamentSaveData,
    fallbackWeek?: number
): TournamentSaveData {
    const identity = resolveTournamentIdentity(tournament.id, fallbackWeek ?? tournament.startWeek)
    return {
        ...tournament,
        seriesId: tournament.seriesId || identity.seriesId,
        seasonNumber: tournament.seasonNumber || identity.seasonNumber,
        instanceId: tournament.instanceId || identity.instanceId,
    }
}

export function isQualificationForTournament(
    qualification: QualificationStatus,
    tournamentId: string,
    fallbackWeek?: number
): boolean {
    const qualificationIdentity = resolveTournamentIdentity(
        qualification.instanceId || qualification.tournamentId,
        fallbackWeek
    )
    const targetSeriesId = getSeriesIdFromTournamentId(tournamentId)
    if (qualificationIdentity.seriesId !== targetSeriesId) return false

    const explicitSeason = getSeasonFromTournamentId(tournamentId)
    if (explicitSeason !== null) {
        return qualificationIdentity.seasonNumber === explicitSeason
    }

    if (typeof fallbackWeek === "number" && Number.isFinite(fallbackWeek)) {
        return qualificationIdentity.seasonNumber === getSeasonFromWeek(fallbackWeek)
    }

    return true
}

export function dedupeQualifications(
    rows: QualificationStatus[],
    fallbackWeek?: number
): QualificationStatus[] {
    const deduped: QualificationStatus[] = []
    const seen = new Set<string>()

    for (let i = rows.length - 1; i >= 0; i--) {
        const normalized = normalizeQualificationStatus(rows[i], fallbackWeek)
        const seasonKey = typeof normalized.seasonNumber === "number"
            ? String(normalized.seasonNumber)
            : "any"
        const key = [
            normalized.teamId,
            normalized.seriesId || getSeriesIdFromTournamentId(normalized.tournamentId),
            seasonKey,
            normalized.status
        ].join(":")

        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(normalized)
    }

    return deduped.reverse()
}

export function buildQualificationGraph(definitions: TournamentDefinition[]): QualificationGraph {
    const edges: QualificationGraphEdge[] = []
    const errors: string[] = []

    const bySeries = new Map(definitions.map(def => [def.id, def]))

    definitions.forEach(def => {
        if (!def.qualifierFor) return
        const target = bySeries.get(def.qualifierFor)
        if (!target) {
            errors.push(`Missing qualifier destination: ${def.id} -> ${def.qualifierFor}`)
            return
        }

        const promotedSlots = Math.max(0, Math.floor(def.qualifierSlots || 0))
        edges.push({
            sourceSeriesId: def.id,
            targetSeriesId: target.id,
            promotedSlots,
        })

        if (promotedSlots > (target.slots || 0)) {
            errors.push(
                `Qualifier overflow: ${def.id} promotes ${promotedSlots} into ${target.id} (${target.slots} slots)`
            )
        }
    })

    return { edges, errors }
}

export function getRegisteredTeamsForSeriesSeason(
    rows: QualificationStatus[],
    seriesId: string,
    seasonNumber: number
): string[] {
    return rows
        .map(row => normalizeQualificationStatus(row))
        .filter(row =>
            (row.seriesId || getSeriesIdFromTournamentId(row.tournamentId)) === seriesId
            && (row.seasonNumber === undefined || row.seasonNumber === seasonNumber)
            && (row.status === "QUALIFIED" || row.status === "REGISTERED" || row.status === "INVITED")
        )
        .map(row => row.teamId)
}
