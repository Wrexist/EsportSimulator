"use client"

import { useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/lib/toast"
import {
    ARCHETYPE_INFO, PROMISE_LABEL,
    canBeMentored, canMentor, captainDefeatShield, captainId, defaultCaptainId, getArchetype,
} from "@/engine/personality"
import { PERSONALITY_TUNING } from "@/lib/balance-tuning"
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"

const AUTO = "__auto__"

/**
 * Captain, mentors and open promises for the managed club. Every line states
 * the effect the engine applies (engine/personality.ts).
 */
export function DressingRoomPanel({ team }: { team: TeamSaveData }) {
    const { players, currentWeek, setCaptain, assignMentor, endMentorship } = useGameStore(useShallow(s => ({
        players: s.players,
        currentWeek: s.currentWeek,
        setCaptain: s.setCaptain,
        assignMentor: s.assignMentor,
        endMentorship: s.endMentorship,
    })))
    const roster = useMemo(() => {
        const byId = new Map(players.map(p => [p.id, p]))
        return team.rosterIds.map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)
    }, [players, team.rosterIds])
    const lookup = (id: string) => roster.find(p => p.id === id)

    const captain = captainId(team, lookup)
    const captainPlayer = captain ? lookup(captain) : undefined
    const autoCaptain = defaultCaptainId(team, lookup)
    const picked = team.dressingRoom?.captainId && team.rosterIds.includes(team.dressingRoom.captainId) ? team.dressingRoom.captainId : AUTO
    const shield = captainPlayer ? Math.round(captainDefeatShield(captainPlayer) * 100) : 0

    const pairs = team.dressingRoom?.mentorships ?? []
    const mentors = roster.filter(p => canMentor(p) && !pairs.some(m => m.mentorId === p.id))
    const mentees = roster.filter(p => canBeMentored(p) && !pairs.some(m => m.menteeId === p.id))
    const [mentorId, setMentorId] = useState<string>("")
    const [menteeId, setMenteeId] = useState<string>("")
    const promises = roster.filter(p => p.personality?.promise)
    const mentorBonus = Math.round((PERSONALITY_TUNING.MENTOR_TRAINING - 1) * 100)

    return (
        <Panel title="Dressing room" padded={false}>
            <section className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Captain</h3>
                    <Select value={picked} onValueChange={v => {
                        const r = setCaptain(v === AUTO ? null : v)
                        if (r.success) toast.success(r.message)
                        else toast.error(r.message)
                    }}>
                        <SelectTrigger className="h-8 w-[190px] text-sm" aria-label="Captain">
                            <SelectValue>{picked === AUTO ? `Auto · ${lookup(autoCaptain ?? "")?.nickname ?? "—"}` : lookup(picked)?.nickname}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={AUTO}>Auto (highest leadership)</SelectItem>
                            {roster.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.nickname} · leader {Math.round(p.leader ?? 0)} · {ARCHETYPE_INFO[getArchetype(p)].label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <p className="text-xs leading-relaxed text-ink-3">
                    {captainPlayer
                        ? <>When <span className="font-semibold text-ink-1">{captainPlayer.nickname}</span> plays, defeats cost the lineup <span className="font-semibold text-ink-1">{shield}%</span> less morale (leader stat ÷ {PERSONALITY_TUNING.CAPTAIN_LEADER_DIVISOR}{getArchetype(captainPlayer) === "LEADER" ? `, +${Math.round(PERSONALITY_TUNING.CAPTAIN_LEADER_BONUS * 100)}% as a Leader` : ""}, max {Math.round(PERSONALITY_TUNING.CAPTAIN_MAX_SHIELD * 100)}%).</>
                        : "No captain."}
                </p>
            </section>

            <section className="space-y-2 border-t border-line px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Mentors</h3>
                <p className="text-xs leading-relaxed text-ink-3">
                    A Leader or Professional aged {PERSONALITY_TUNING.MENTOR_MIN_AGE}+ mentors one player aged {PERSONALITY_TUNING.MENTEE_MAX_AGE} or younger: +{mentorBonus}% training gains while both are in the squad. Ends when either leaves or the youngster turns {PERSONALITY_TUNING.MENTEE_MAX_AGE + 1}.
                </p>
                {pairs.length > 0 && (
                    <ul className="divide-y divide-line rounded-md border border-line">
                        {pairs.map(m => (
                            <li key={m.menteeId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                <span className="min-w-0 truncate text-ink-1">{lookup(m.mentorId)?.nickname ?? "?"} <span className="text-ink-3">→</span> {lookup(m.menteeId)?.nickname ?? "?"}</span>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => endMentorship(m.menteeId)}>End</Button>
                            </li>
                        ))}
                    </ul>
                )}
                {mentors.length > 0 && mentees.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={mentorId} onValueChange={setMentorId}>
                            <SelectTrigger className="h-8 w-[130px] text-sm" aria-label="Mentor"><SelectValue placeholder="Mentor" /></SelectTrigger>
                            <SelectContent>{mentors.map(p => <SelectItem key={p.id} value={p.id}>{p.nickname} ({p.age})</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={menteeId} onValueChange={setMenteeId}>
                            <SelectTrigger className="h-8 w-[130px] text-sm" aria-label="Mentee"><SelectValue placeholder="Youngster" /></SelectTrigger>
                            <SelectContent>{mentees.map(p => <SelectItem key={p.id} value={p.id}>{p.nickname} ({p.age})</SelectItem>)}</SelectContent>
                        </Select>
                        <Button size="sm" className="h-8 px-3 text-xs" disabled={!mentorId || !menteeId} onClick={() => {
                            const r = assignMentor(mentorId, menteeId)
                            if (!r.success) toast.error(r.message)
                            setMentorId(""); setMenteeId("")
                        }}>Assign</Button>
                    </div>
                ) : (
                    <p className="text-xs text-ink-3">{mentors.length === 0 ? "No eligible mentor in the squad." : "No player young enough to mentor."}</p>
                )}
            </section>

            {promises.length > 0 && (
                <section className="space-y-1.5 border-t border-line px-4 py-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Promises</h3>
                    <ul className="space-y-1 text-sm">
                        {promises.map(p => {
                            const pr = p.personality!.promise!
                            return (
                                <li key={p.id} className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-ink-1">{p.nickname}: “{PROMISE_LABEL[pr.kind].promise}”</span>
                                    <span className="shrink-0 text-xs tabular-nums text-ink-3">by week {pr.deadlineWeek} · {Math.max(0, pr.deadlineWeek - currentWeek)}w</span>
                                </li>
                            )
                        })}
                    </ul>
                    <p className="text-xs text-ink-3">Kept: morale +{PERSONALITY_TUNING.PROMISE_KEPT_MORALE}, loyalty +{PERSONALITY_TUNING.PROMISE_KEPT_LOYALTY}. Broken: morale {PERSONALITY_TUNING.PROMISE_BROKEN_MORALE}, loyalty {PERSONALITY_TUNING.PROMISE_BROKEN_LOYALTY}.</p>
                </section>
            )}
        </Panel>
    )
}
