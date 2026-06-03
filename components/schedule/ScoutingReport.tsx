"use client"

import { Search, AlertCircle, Crosshair, Brain, Users, Trophy } from "lucide-react"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { cn } from "@/lib/utils"
import { clutchRateFraction } from "@/lib/utils-extended"

interface ScoutingReportProps {
    opponent: TeamSaveData
    opponentRoster: PlayerSaveData[]
}

interface Tendency {
    icon: typeof Crosshair
    title: string
    body: string
    tone: "red" | "amber" | "blue" | "emerald" | "violet"
}

/**
 * Pre-match scouting report. Auto-generates 2-4 narrative tendency cards
 * by analyzing the opponent's roster shape against league norms. Stops
 * the pre-match screen from feeling like a flat scoreboard.
 *
 * All findings are derived from PlayerSaveData / TeamSaveData fields that
 * already exist — no new schema, no separate analysis pipeline. Each
 * tendency only renders when the relevant signal is strong enough to be
 * a story (not "they have an AWP" — every team has an AWP).
 */
function deriveTendencies(opponent: TeamSaveData, roster: PlayerSaveData[]): Tendency[] {
    if (roster.length === 0) return []

    const tendencies: Tendency[] = []
    const active = roster.slice(0, 5)
    const evaluations = active.map(p => ({ player: p, ovr: evaluatePlayer(p).overallRating }))
    const sorted = [...evaluations].sort((a, b) => b.ovr - a.ovr)

    // ─── Star-power asymmetry ─────────────────────────────────────────────
    if (sorted.length >= 5) {
        const star = sorted[0]
        const median = sorted[2].ovr
        if (star.ovr - median >= 12) {
            tendencies.push({
                icon: Crosshair,
                title: "Star-Heavy",
                body: `${star.player.nickname} is the engine — averaging ${star.player.avgRating.toFixed(2)} rating with the next-best teammate ${(star.ovr - median).toFixed(0)} points behind. Shut them down and the lineup loses its shape.`,
                tone: "red",
            })
        }
    }

    // ─── AWP threat ───────────────────────────────────────────────────────
    const awper = active.find(p => p.role === "AWPER" || p.secondaryRole === "AWPER")
    if (awper && awper.awp >= 80) {
        tendencies.push({
            icon: Crosshair,
            title: "Premier AWP",
            body: `${awper.nickname} is a legitimate sniper threat (AWP ${awper.awp}). Expect them to hold long angles on T-side as well as CT — they pick rather than wait.`,
            tone: "amber",
        })
    }

    // ─── IGL-led / Tactical ───────────────────────────────────────────────
    const igl = active.find(p => p.role === "IGL" || p.secondaryRole === "IGL")
    if (igl && igl.leader >= 75) {
        tendencies.push({
            icon: Brain,
            title: "Tactical Read",
            body: `${igl.nickname} runs the comms (Leadership ${igl.leader}). Their mid-round decision-making is the team's biggest force multiplier — expect crisp executes and clean fakes.`,
            tone: "violet",
        })
    }

    // ─── Aggressive / Entry-heavy ─────────────────────────────────────────
    const entry = active.find(p => p.role === "ENTRY_FRAGGER" || p.secondaryRole === "ENTRY_FRAGGER")
    if (entry && entry.skill >= 78 && entry.reaction >= 78) {
        tendencies.push({
            icon: Crosshair,
            title: "Hard Entry",
            body: `${entry.nickname} opens up sites with first-bullet pressure. Their early-round trades will dictate the round economy — don't let them get free picks at default angles.`,
            tone: "red",
        })
    }

    // ─── Veteran experience ───────────────────────────────────────────────
    const averageAge = active.reduce((sum, p) => sum + p.age, 0) / active.length
    const totalMVPs = active.reduce((sum, p) => sum + (p.totalMVPs || 0), 0)
    if (averageAge >= 27) {
        tendencies.push({
            icon: Trophy,
            title: "Veteran Squad",
            body: `Average age ${averageAge.toFixed(0)} with ${totalMVPs} tournament MVPs between them. They've seen this scenario before — expect composure under match-point pressure.`,
            tone: "emerald",
        })
    } else if (averageAge <= 21 && roster.some(p => p.potential >= 85)) {
        tendencies.push({
            icon: Brain,
            title: "Young Up-and-Comers",
            body: `Average age ${averageAge.toFixed(0)} with at least one high-potential prospect on the roster. Inexperience cuts both ways — they'll throw hero plays at the wrong moments, but the upside is real.`,
            tone: "blue",
        })
    }

    // ─── Clutch danger ────────────────────────────────────────────────────
    const clutchers = active.filter(p => clutchRateFraction(p.clutchSuccessRate) >= 0.35)
    if (clutchers.length >= 2) {
        tendencies.push({
            icon: Trophy,
            title: "Clutch DNA",
            body: `${clutchers.length} players on this roster win 1vX situations at a 35%+ clip. Round-deciders don't go their way by accident — be careful in 2v3 / 3v4 trades.`,
            tone: "amber",
        })
    }

    // ─── Cohesion / chemistry signal ──────────────────────────────────────
    const chemistry = opponent.chemistry
    if (typeof chemistry === "number" && chemistry >= 80) {
        tendencies.push({
            icon: Users,
            title: "Cohesive Unit",
            body: `Team chemistry sits at ${chemistry}/100 — the lineup has been together long enough to feel one another's reads. They trade fast and don't peek twice.`,
            tone: "emerald",
        })
    } else if (typeof chemistry === "number" && chemistry < 50) {
        tendencies.push({
            icon: AlertCircle,
            title: "Fragmented Roster",
            body: `Team chemistry is only ${chemistry}/100 — a recent shake-up means rotations aren't yet automatic. Punish slow trades and stretched setups.`,
            tone: "amber",
        })
    }

    return tendencies.slice(0, 4)
}

const TONE_CLASSES: Record<Tendency["tone"], { bg: string; ring: string; icon: string; text: string }> = {
    red:     { bg: "bg-red-500/5",     ring: "ring-red-500/25",     icon: "text-red-400",     text: "text-red-100" },
    amber:   { bg: "bg-amber-500/5",   ring: "ring-amber-500/25",   icon: "text-amber-400",   text: "text-amber-100" },
    blue:    { bg: "bg-sky-500/5",     ring: "ring-sky-500/25",     icon: "text-sky-400",     text: "text-sky-100" },
    emerald: { bg: "bg-emerald-500/5", ring: "ring-emerald-500/25", icon: "text-emerald-400", text: "text-emerald-100" },
    violet:  { bg: "bg-violet-500/5",  ring: "ring-violet-500/25",  icon: "text-violet-400",  text: "text-violet-100" },
}

export function ScoutingReport({ opponent, opponentRoster }: ScoutingReportProps) {
    const tendencies = deriveTendencies(opponent, opponentRoster)

    if (tendencies.length === 0) {
        return (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 mb-1">
                    <Search size={14} className="text-white/40" aria-hidden="true" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
                        Scouting Report
                    </p>
                </div>
                <p className="text-xs text-white/55 leading-relaxed">
                    Limited tape on {opponent.name}. Adjust the read mid-match.
                </p>
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-2">
                <Search size={14} className="text-white/60" aria-hidden="true" />
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
                    Scouting Report
                </p>
            </div>
            <div className="space-y-2">
                {tendencies.map((t, idx) => {
                    const cls = TONE_CLASSES[t.tone]
                    const Icon = t.icon
                    return (
                        <div
                            key={idx}
                            className={cn("flex items-start gap-2.5 rounded-lg ring-1 p-2.5", cls.bg, cls.ring)}
                        >
                            <div className={cn("shrink-0 mt-0.5", cls.icon)}>
                                <Icon size={14} aria-hidden="true" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className={cn("text-[10px] font-bold uppercase tracking-[0.2em] mb-0.5", cls.text)}>
                                    {t.title}
                                </p>
                                <p className="text-[11px] text-white/65 leading-relaxed">{t.body}</p>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
