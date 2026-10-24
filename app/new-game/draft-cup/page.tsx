"use client"

/**
 * G7: Draft Cup setup and draft. Name the side and pick a difficulty, then
 * draft one player per role from a random pool under the points budget.
 * The world the pool came from is handed to initializeNewGame as is.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { ArrowLeft, Check, Loader2, RefreshCw } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { loadCareerDraft, clearCareerDraft } from "@/lib/new-career-draft"
import { buildDraftCupWorld } from "@/lib/draft-cup-world"
import {
    buildDraftPool, clubStrength, draftSpent, pickCupField,
    DRAFT_BUDGET, DRAFT_CUP_DIFFICULTIES, DRAFT_CUP_DIFFICULTY, DRAFT_REROLLS, DRAFT_ROLE_LABEL, DRAFT_ROLES,
    type DraftCupDifficulty, type DraftOption, type DraftPool, type DraftRole,
} from "@/engine/draft-cup"
import type { DraftCupSetup } from "@/engine/draft-cup-setup"
import { generateSeed } from "@/engine/rng"
import type { GameSave } from "@/engine/save-types"
import { PRESET_COLORS } from "@/types/team-creator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlayerPortrait, TeamLogoImage } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { toast } from "@/lib/toast"
import { debug } from "@/lib/debug-logger"
import { cn } from "@/lib/utils"

const SWATCHES = PRESET_COLORS.slice(0, 8)
const DUEL_HINT = "Duel rating: aim plus weapon skill for the role, the number the match engine plays gunfights on. Prices follow it."

type Picks = Partial<Record<DraftRole, DraftOption>>

export default function DraftCupPage() {
    const router = useRouter()
    const { initializeNewGame } = useGameStore(useShallow(s => ({ initializeNewGame: s.initializeNewGame })))

    const [managerName, setManagerName] = useState("")
    const [teamName, setTeamName] = useState("Draft Five")
    const [shortName, setShortName] = useState("DRF")
    const [swatch, setSwatch] = useState(0)
    const [difficulty, setDifficulty] = useState<DraftCupDifficulty>("pro")
    const [step, setStep] = useState<"setup" | "draft">("setup")
    const [world, setWorld] = useState<GameSave | null>(null)
    const [opponentIds, setOpponentIds] = useState<string[]>([])
    const [pool, setPool] = useState<DraftPool | null>(null)
    const [picks, setPicks] = useState<Picks>({})
    const [rerolls, setRerolls] = useState(DRAFT_REROLLS)
    const [busy, setBusy] = useState<null | "world" | "start">(null)
    const startingRef = useRef(false)

    useEffect(() => { setManagerName(loadCareerDraft()?.managerName ?? "") }, [])

    const playersById = useMemo(() => new Map((world?.players ?? []).map(p => [p.id, p])), [world])
    const teamsById = useMemo(() => new Map((world?.teams ?? []).map(t => [t.id, t])), [world])
    const pickList = DRAFT_ROLES.map(r => picks[r]).filter((o): o is DraftOption => !!o)
    const spent = draftSpent(pickList)
    const left = DRAFT_BUDGET - spent
    const complete = pickList.length === DRAFT_ROLES.length && spent <= DRAFT_BUDGET
    const nameOk = managerName.trim().length >= 2 && teamName.trim().length >= 2 && shortName.trim().length >= 2
    const colors = SWATCHES[swatch]
    const fieldStrength = opponentIds.length
        ? opponentIds.reduce((s, id) => s + clubStrength(teamsById.get(id)!, playersById as never), 0) / opponentIds.length
        : 0
    const fiveStrength = pickList.length ? pickList.reduce((s, o) => s + o.duel, 0) / pickList.length : 0

    const deal = (w: GameSave, diff: DraftCupDifficulty) => {
        const byId = new Map(w.players.map(p => [p.id, p]))
        const field = pickCupField(w.teams, byId as never, diff, generateSeed())
        setOpponentIds(field)
        setPool(buildDraftPool(w.players, w.teams, field, generateSeed()))
        setPicks({})
        setRerolls(DRAFT_REROLLS)
    }

    const startDraft = async () => {
        if (!nameOk || busy) return
        setBusy("world")
        try {
            const w = world ?? await buildDraftCupWorld()
            setWorld(w)
            deal(w, difficulty)
            setStep("draft")
        } catch (err) {
            debug.error("Draft Cup world failed:", err)
            toast.error("Could not load the game data", { description: "Retry in a moment." })
        } finally {
            setBusy(null)
        }
    }

    const reroll = () => {
        if (!world || rerolls <= 0) return
        setPool(buildDraftPool(world.players, world.teams, opponentIds, generateSeed()))
        setPicks({})
        setRerolls(r => r - 1)
    }

    const choose = (option: DraftOption) => {
        setPicks(prev => {
            if (prev[option.role]?.playerId === option.playerId) { const next = { ...prev }; delete next[option.role]; return next }
            return { ...prev, [option.role]: option }
        })
    }

    const startCup = async () => {
        if (!world || !complete || startingRef.current) return
        startingRef.current = true
        setBusy("start")
        const setup: DraftCupSetup = {
            teamName: teamName.trim(),
            shortName: shortName.trim(),
            primaryColor: colors.primary,
            secondaryColor: colors.secondary,
            difficulty,
            budget: DRAFT_BUDGET,
            picks: DRAFT_ROLES.map(role => ({ playerId: picks[role]!.playerId, role, price: picks[role]!.price })),
            opponentIds,
        }
        try {
            await initializeNewGame(managerName.trim(), world.playerTeamId, undefined, { draftCup: { world: structuredClone(world), setup } })
            if (useGameStore.getState().error) throw Error(useGameStore.getState().error!)
            clearCareerDraft()
            router.push("/")
        } catch (err) {
            debug.error("Draft Cup start failed:", err)
            toast.error("Could not start the Draft Cup", { description: "Your draft is kept. Try again." })
            startingRef.current = false
            setBusy(null)
        }
    }

    if (step === "setup") {
        return (
            <div className="mx-auto flex min-h-dvh w-full max-w-[880px] flex-col gap-6 bg-ink px-8 py-8">
                <Link href="/new-game" className="inline-flex w-fit items-center gap-2 rounded-sm text-sm font-medium text-ink-3 hover:text-ink-1">
                    <ArrowLeft size={16} /> New game
                </Link>
                <ScreenHeader eyebrow="Draft Cup · Step 1 of 2" title="Draft Cup"
                    subtitle={`Draft five players under a ${DRAFT_BUDGET}-point budget, then win three knockout matches in a row: best of three, with a best-of-five grand final. One loss ends the run.`} />

                <Panel title="Your side">
                    <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                        <label className="space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Manager name</span>
                            <Input value={managerName} maxLength={32} onChange={e => setManagerName(e.target.value)} placeholder="Your name" className="h-10" />
                        </label>
                        <div />
                        <label className="space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Team name</span>
                            <Input value={teamName} maxLength={28} onChange={e => setTeamName(e.target.value)} className="h-10" />
                        </label>
                        <label className="space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Tag</span>
                            <Input value={shortName} maxLength={5} onChange={e => setShortName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className="h-10 uppercase" />
                        </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Colours</span>
                        <div role="radiogroup" aria-label="Team colours" className="flex flex-wrap gap-2">
                            {SWATCHES.map((c, i) => (
                                <button key={c.primary} type="button" role="radio" aria-checked={i === swatch} aria-label={`Colour ${i + 1}`} onClick={() => setSwatch(i)}
                                    className={cn("h-8 w-8 rounded-full border-2 transition-transform", i === swatch ? "scale-110 border-ink-1" : "border-transparent hover:scale-105")}
                                    style={{ background: `linear-gradient(135deg, ${c.primary} 50%, ${c.secondary} 50%)` }} />
                            ))}
                        </div>
                    </div>
                </Panel>

                <Panel title="Difficulty">
                    <div role="radiogroup" aria-label="Difficulty" className="grid gap-3 sm:grid-cols-3">
                        {DRAFT_CUP_DIFFICULTIES.map(d => {
                            const info = DRAFT_CUP_DIFFICULTY[d]
                            const on = d === difficulty
                            return (
                                <button key={d} type="button" role="radio" aria-checked={on} onClick={() => setDifficulty(d)}
                                    className={cn("rounded-md border p-3 text-left transition-colors", on ? "border-gold bg-raised" : "border-line hover:border-ink-3")}>
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span className="font-display text-xl font-bold uppercase tracking-[0.02em] text-ink-1">{info.label}</span>
                                        <span className="text-xs tabular-nums text-ink-3">score ×{info.scoreMultiplier}</span>
                                    </span>
                                    <span className="mt-1 block text-xs leading-relaxed text-ink-2">{info.hint}</span>
                                </button>
                            )
                        })}
                    </div>
                </Panel>

                <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-ink-3">The run uses its own save, next to your careers.</p>
                    <Button onClick={startDraft} disabled={!nameOk || !!busy} aria-busy={busy === "world" || undefined} className="h-12 px-6 font-display text-xl font-bold tracking-[0.04em]">
                        {busy === "world" ? <><Loader2 className="animate-spin" /> Building the pool…</> : "START THE DRAFT"}
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto flex h-dvh w-full max-w-[1680px] flex-col gap-4 bg-ink px-8 py-6">
            <ScreenHeader eyebrow={`Draft Cup · Step 2 of 2 · ${DRAFT_CUP_DIFFICULTY[difficulty].label}`} title="The draft"
                subtitle="One player per role. Cheap picks leave room for a star, and every point left over adds to your run score."
                aside={
                    <>
                        <Button variant="ghost" onClick={() => setStep("setup")} className="gap-2"><ArrowLeft size={16} /> Back</Button>
                        <Button variant="outline" onClick={reroll} disabled={rerolls <= 0} className="gap-2">
                            <RefreshCw size={15} /> New pool ({rerolls} left)
                        </Button>
                    </>
                } />

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
                    {pool && DRAFT_ROLES.map(role => (
                        <Panel key={role} title={DRAFT_ROLE_LABEL[role]} padded={false}
                            actions={picks[role] ? <span className="text-xs font-semibold text-gold">{picks[role]!.nickname}</span> : <span className="text-xs text-ink-3">Pick one</span>}>
                            <ul className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3 2xl:grid-cols-6">
                                {pool[role].map(o => {
                                    const p = playersById.get(o.playerId)
                                    const selected = picks[role]?.playerId === o.playerId
                                    const room = left + (picks[role]?.price ?? 0)
                                    const affordable = o.price <= room
                                    const club = o.fromTeamId ? teamsById.get(o.fromTeamId) : undefined
                                    return (
                                        <li key={o.playerId}>
                                            <button type="button" onClick={() => (affordable || selected) && choose(o)} aria-pressed={selected} aria-disabled={!affordable && !selected}
                                                title={!affordable && !selected ? `Over budget: needs ${o.price - room} more point${o.price - room === 1 ? "" : "s"}` : undefined}
                                                className={cn("flex h-full w-full flex-col gap-2 rounded-md border p-2.5 text-left transition-colors",
                                                    selected ? "border-gold bg-raised" : "border-line hover:border-ink-3",
                                                    !affordable && !selected && "cursor-not-allowed opacity-45 hover:border-line")}>
                                                <span className="flex items-center gap-2">
                                                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded bg-raised">
                                                        <PlayerPortrait src={p?.portraitPath} seed={o.playerId} alt={o.nickname} size={36} />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-semibold text-ink-1">{o.nickname}</span>
                                                        <span className="flex items-center gap-1 text-xs text-ink-3">
                                                            {p?.nationality && <CountryFlag country={p.nationality} size={11} />} {p?.age}
                                                        </span>
                                                    </span>
                                                    {selected && <Check size={16} className="ml-auto shrink-0 text-gold" aria-hidden="true" />}
                                                </span>
                                                <span className="truncate text-xs text-ink-3">{club?.name ?? "Free agent"}</span>
                                                <span className="mt-auto flex items-end justify-between gap-2">
                                                    <span title={DUEL_HINT}>
                                                        <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">Duel</span>
                                                        <span className="font-display text-2xl font-bold leading-none tabular-nums text-ink-1">{o.duel}</span>
                                                        <span className="ml-1.5 text-[11px] tabular-nums text-ink-3">OVR {o.overall}</span>
                                                    </span>
                                                    <span className={cn("rounded px-1.5 py-0.5 text-sm font-bold tabular-nums", selected ? "bg-gold text-ink" : "bg-raised text-ink-1")}>{o.price}</span>
                                                </span>
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </Panel>
                    ))}
                </div>

                <aside className="flex min-h-0 flex-col gap-4">
                    <Panel title={teamName} actions={<span className="text-xs text-ink-3">{shortName}</span>}>
                        <div>
                            <div className="flex items-baseline justify-between">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Budget</span>
                                <span className={cn("font-display text-2xl font-bold tabular-nums", left < 0 ? "text-negative" : "text-ink-1")}>{spent} / {DRAFT_BUDGET}</span>
                            </div>
                            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised" role="meter" aria-label="Draft points spent" aria-valuemin={0} aria-valuemax={DRAFT_BUDGET} aria-valuenow={spent}>
                                <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.min(100, (spent / DRAFT_BUDGET) * 100)}%` }} />
                            </div>
                        </div>
                        <ul className="mt-4 space-y-1.5">
                            {DRAFT_ROLES.map(role => (
                                <li key={role} className="flex items-center justify-between gap-2 text-sm">
                                    <span className="text-ink-3">{DRAFT_ROLE_LABEL[role]}</span>
                                    {picks[role]
                                        ? <span className="flex items-center gap-2 font-semibold text-ink-1">{picks[role]!.nickname}<span className="tabular-nums text-ink-3">{picks[role]!.price}</span></span>
                                        : <span className="text-ink-3">–</span>}
                                </li>
                            ))}
                        </ul>
                        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">
                            Your five: duel {fiveStrength ? fiveStrength.toFixed(0) : "–"}. Opponents average {fieldStrength.toFixed(0)}, and they have played together longer than your side.
                        </p>
                    </Panel>

                    <Panel title="Opponents" padded={false} className="min-h-0 flex-1 overflow-hidden" bodyClassName="max-h-full overflow-y-auto">
                        <ul>
                            {opponentIds.map(id => {
                                const t = teamsById.get(id)
                                if (!t) return null
                                return (
                                    <li key={id} className="flex h-10 items-center gap-2.5 border-b border-line px-4 last:border-b-0">
                                        <TeamLogoImage src={t.logoPath} alt="" size={20} />
                                        <span className="min-w-0 flex-1 truncate text-sm text-ink-1">{t.name}</span>
                                        <span className="text-xs tabular-nums text-ink-3" title={DUEL_HINT}>{clubStrength(t, playersById as never).toFixed(0)}</span>
                                    </li>
                                )
                            })}
                        </ul>
                    </Panel>

                    <Button onClick={startCup} disabled={!complete || !!busy} aria-busy={busy === "start" || undefined} className="h-12 w-full font-display text-xl font-bold tracking-[0.04em]">
                        {busy === "start" ? <><Loader2 className="animate-spin" /> Starting…</> : complete ? "START THE CUP" : `PICK ${DRAFT_ROLES.length - pickList.length} MORE`}
                    </Button>
                </aside>
            </div>
        </div>
    )
}
