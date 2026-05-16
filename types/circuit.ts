export type EntryPolicyKind =
    | "OPEN_QUALIFIER"
    | "CLOSED_QUALIFIER"
    | "DIRECT_INVITE"
    | "RANKING_INVITE"
    | "POINTS_INVITE"
    | "LEAGUE_SLOT"

export interface EntryPolicy {
    kind: EntryPolicyKind
    requiredRanking?: number
    requiredPoints?: number
    requiredLeagueTier?: "S_TIER" | "A_TIER" | "B_TIER"
}

export interface StageTemplate {
    id: string
    name: string
    order: number
    startWeekOffset?: number
    durationWeeks?: number
    maxTeams?: number
    format?: "bracket" | "league" | "swiss" | "double_elim"
    terminal?: boolean
}

export interface QualificationLink {
    sourceSeriesId: string
    sourceStageId?: string
    targetSeriesId: string
    targetStageId?: string
    promotedSlots: number
    overflowPolicy?: "DROP_LOWEST" | "IGNORE_EXCESS"
}

export interface CircuitSeriesDefinition {
    seriesId: string
    name: string
    shortName: string
    tier: string
    region: string
    format: "bracket" | "league" | "swiss" | "double_elim"
    slots: number
    entryPolicy: EntryPolicy
    stageTemplates?: StageTemplate[]
    qualificationLinks?: QualificationLink[]
}

export interface CircuitInstance {
    seriesId: string
    instanceId: string
    seasonNumber: number
    startWeek: number
    endWeek: number
    stages?: StageTemplate[]
}
