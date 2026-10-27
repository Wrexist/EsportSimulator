"use client"

/**
 * C10: start a pro career. Name your player, pick a role and a region, then
 * take one of three trial contracts from amateur clubs there. The career
 * starts as a normal one at that club and engine/pro-career.ts turns it into
 * a pro career (your player added, the club handed to its staff).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { ArrowLeft, Check, Loader2, RefreshCw } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { loadCareerDraft, clearCareerDraft } from "@/lib/new-career-draft"
import { recordNewCampaign } from "@/engine/manager-career-profile"
import { calculateTeamTier } from "@/engine/tier-system"
import { PRO_ROLES } from "@/engine/pro-career"
import { PlayerRole } from "@/types/enums"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { toast } from "@/lib/toast"
import { debug } from "@/lib/debug-logger"
import { cn } from "@/lib/utils"

interface SnapshotTeam { id: string; name: string; shortName?: string; region?: string; reputation?: number; logoPath?: string; rosterIds?: string[] }

const REGION_LABEL: Record<string, string> = { EU: "Europe", CIS: "CIS", BR: "Brazil", NA: "North America", ASIA: "Asia", MENA: "Middle East", OCE: "Oceania" }
const ROLE_HINT: Record<string, string> = {
    [PlayerRole.RIFLER]: "Takes the most duels. The safest way into a lineup.",
    [PlayerRole.ENTRY_FRAGGER]: "First in on attack. Aggressive, high impact, high risk.",
    [PlayerRole.AWPER]: "The sniper. One per team, so the place is harder to win.",
    [PlayerRole.SUPPORT]: "Utility and trades. Makes the stars look good.",
    [PlayerRole.IGL]: "Calls the rounds. Ages best, but needs a team that trusts him.",
}

export default function ProCareerSetupPage() {
    const router = useRouter()
    const { initializeNewGame, startProCareer } = useGameStore(useShallow(s => ({ initializeNewGame: s.initializeNewGame, startProCareer: s.startProCareer })))
    const [managerName, setManagerName] = useState("")
    const [nickname, setNickname] = useState("")
    const [role, setRole] = useState<PlayerRole>(PlayerRole.RIFLER)
    const [region, setRegion] = useState("EU")
    const [teams, setTeams] = useState<SnapshotTeam[] | null>(null)
    const [deal, setDeal] = useState(0)
    const [clubId, setClubId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const startingRef = useRef(false)

    useEffect(() => { setManagerName(loadCareerDraft()?.managerName ?? "") }, [])
    useEffect(() => {
        fetch("/data/snapshot/teams.json")
            .then(r => { if (!r.ok) throw Error("Game data unavailable"); return r.json() })
            .then((data: SnapshotTeam[]) => setTeams(data))
            .catch(err => { debug.error("Pro career: teams failed", err); toast.error("Could not load the clubs", { description: "Go back and try again." }) })
    }, [])

    /** Amateur clubs (ranked below the semi-pro tier) by region. */
    const amateurs = useMemo(() => {
        const ranked = [...(teams ?? [])].sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0))
        const out = new Map<string, SnapshotTeam[]>()
        ranked.forEach((t, i) => {
            if (calculateTeamTier(i + 1) !== "AMATEUR" || (t.rosterIds?.length ?? 0) < 5) return
            const r = t.region ?? "EU"
            out.set(r, [...(out.get(r) ?? []), t])
        })
        return out
    }, [teams])
    const regions = [...amateurs.keys()].sort((a, b) => (amateurs.get(b)!.length - amateurs.get(a)!.length) || a.localeCompare(b))

    /** Three trial offers from the region, reshuffled on request. */
    const offers = useMemo(() => {
        const pool = [...(amateurs.get(region) ?? [])]
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        return pool.slice(0, 3)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `deal` reshuffles
    }, [amateurs, region, deal])
    useEffect(() => { setClubId(offers[0]?.id ?? null) }, [offers])

    const nameOk = nickname.trim().length >= 2
    const start = async () => {
        if (!nameOk || !clubId || startingRef.current) return
        startingRef.current = true
        setBusy(true)
        try {
            await initializeNewGame(managerName.trim() || nickname.trim(), clubId)
            if (useGameStore.getState().error) throw Error(useGameStore.getState().error!)
            if (!startProCareer({ nickname: nickname.trim(), role })) throw Error("Pro career did not start")
            clearCareerDraft()
            void recordNewCampaign()
            router.push("/")
        } catch (err) {
            debug.error("Pro career start failed:", err)
            toast.error("Could not start the pro career", { description: "Try again." })
            startingRef.current = false
            setBusy(false)
        }
    }

    return (
        <div className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col gap-5 bg-ink px-8 py-6">
            <ScreenHeader
                eyebrow="New career · Pro career"
                title="Start as a pro"
                subtitle="Play as one 17-year-old. The coach picks the five best each week, the staff run the club, and bigger clubs call when you are good enough for their lineup."
                aside={<Button asChild variant="ghost" className="gap-2"><Link href="/new-game"><ArrowLeft size={16} /> Back</Link></Button>}
            />

            <div className="grid gap-5 md:grid-cols-2">
                <Panel title="Your player">
                    <label htmlFor="pro-nick" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Nickname</label>
                    <Input id="pro-nick" value={nickname} maxLength={24} onChange={e => setNickname(e.target.value)} placeholder="Your in-game name" className="mt-1 h-11" autoFocus />
                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Role</p>
                    <div className="mt-1 grid gap-1.5" role="radiogroup" aria-label="Role">
                        {PRO_ROLES.map(r => (
                            <button key={r.role} type="button" role="radio" aria-checked={role === r.role} onClick={() => setRole(r.role)}
                                className={cn("flex items-start gap-3 rounded border px-3 py-2 text-left", role === r.role ? "border-gold bg-raised" : "border-line hover:bg-raised")}>
                                <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", role === r.role ? "border-gold bg-gold text-ink" : "border-line-strong")}>
                                    {role === r.role && <Check size={11} />}
                                </span>
                                <span>
                                    <span className="block text-sm font-semibold text-ink-1">{r.label}</span>
                                    <span className="block text-xs text-ink-3">{ROLE_HINT[r.role]}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </Panel>

                <Panel title="Trial offers" actions={<Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDeal(d => d + 1)} disabled={!teams}><RefreshCw size={13} /> Other clubs</Button>}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Region</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {regions.map(r => (
                            <Button key={r} size="sm" variant={region === r ? "default" : "outline"} onClick={() => setRegion(r)}>{REGION_LABEL[r] ?? r}</Button>
                        ))}
                    </div>
                    <p className="mt-4 text-sm text-ink-2">Three amateur clubs offer you a two-year deal. You start just behind their starters.</p>
                    {!teams ? (
                        <p className="mt-3 flex items-center gap-2 text-sm text-ink-3"><Loader2 size={14} className="animate-spin" /> Loading clubs…</p>
                    ) : (
                        <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label="Club">
                            {offers.map(t => (
                                <button key={t.id} type="button" role="radio" aria-checked={clubId === t.id} onClick={() => setClubId(t.id)}
                                    className={cn("flex items-center gap-3 rounded border px-3 py-2 text-left", clubId === t.id ? "border-gold bg-raised" : "border-line hover:bg-raised")}>
                                    <TeamLogoImage src={t.logoPath} alt="" size={32} team={t as never} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-ink-1">{t.name}</span>
                                        <span className="block text-xs text-ink-3">{REGION_LABEL[t.region ?? ""] ?? t.region} · Amateur</span>
                                    </span>
                                    {clubId === t.id && <Check size={16} className="text-gold" />}
                                </button>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            <div className="flex items-center justify-end gap-3">
                {!nameOk && <span className="text-xs text-ink-3">Pick a nickname of two letters or more.</span>}
                <Button onClick={start} disabled={!nameOk || !clubId || busy} className="h-11 px-6">
                    {busy ? <><Loader2 size={16} className="animate-spin" /> Signing…</> : "Sign and start"}
                </Button>
            </div>
        </div>
    )
}
