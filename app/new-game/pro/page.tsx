"use client"
import { t } from "@/lib/i18n"

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

const KNOWN_REGIONS = new Set(["EU", "CIS", "BR", "NA", "ASIA", "MENA", "OCE"])
const regionLabel = (r: string | undefined) => r && KNOWN_REGIONS.has(r) ? t(`pro.region.${r}`) : (r ?? "")

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
            .catch(err => { debug.error("Pro career: teams failed", err); toast.error(t("pro.err.load"), { description: t("pro.err.loadBody") }) })
    }, [])

    /** Amateur clubs (ranked below the semi-pro tier) by region. */
    const amateurs = useMemo(() => {
        const ranked = [...(teams ?? [])].sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0))
        const out = new Map<string, SnapshotTeam[]>()
        ranked.forEach((tm, i) => {
            if (calculateTeamTier(i + 1) !== "AMATEUR" || (tm.rosterIds?.length ?? 0) < 5) return
            const r = tm.region ?? "EU"
            out.set(r, [...(out.get(r) ?? []), tm])
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
            toast.error(t("pro.err.start"), { description: t("pro.err.startBody") })
            startingRef.current = false
            setBusy(false)
        }
    }

    return (
        <div className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col gap-5 bg-ink px-8 py-6">
            <ScreenHeader
                eyebrow={t("pro.eyebrow")}
                title={t("pro.title")}
                subtitle={t("pro.subtitle")}
                aside={<Button asChild variant="ghost" className="gap-2"><Link href="/new-game"><ArrowLeft size={16} /> {t("ng.back")}</Link></Button>}
            />

            <div className="grid gap-5 md:grid-cols-2">
                <Panel title={t("pro.yourPlayer")}>
                    <label htmlFor="pro-nick" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("pro.nickname")}</label>
                    <Input id="pro-nick" value={nickname} maxLength={24} onChange={e => setNickname(e.target.value)} placeholder={t("pro.nickPlaceholder")} className="mt-1 h-11" autoFocus />
                    <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("pro.role")}</p>
                    <div className="mt-1 grid gap-1.5" role="radiogroup" aria-label={t("pro.role")}>
                        {PRO_ROLES.map(r => (
                            <button key={r.role} type="button" role="radio" aria-checked={role === r.role} onClick={() => setRole(r.role)}
                                className={cn("flex items-start gap-3 rounded border px-3 py-2 text-left", role === r.role ? "border-gold bg-raised" : "border-line hover:bg-raised")}>
                                <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", role === r.role ? "border-gold bg-gold text-ink" : "border-line-strong")}>
                                    {role === r.role && <Check size={11} />}
                                </span>
                                <span>
                                    <span className="block text-sm font-semibold text-ink-1">{t(`market.role.${r.role}`)}</span>
                                    <span className="block text-xs text-ink-3">{t(`pro.hint.${r.role}`)}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </Panel>

                <Panel title={t("pro.offers")} actions={<Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setDeal(d => d + 1)} disabled={!teams}><RefreshCw size={13} /> {t("pro.otherClubs")}</Button>}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("pro.region")}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {regions.map(r => (
                            <Button key={r} size="sm" variant={region === r ? "default" : "outline"} onClick={() => setRegion(r)}>{regionLabel(r)}</Button>
                        ))}
                    </div>
                    <p className="mt-4 text-sm text-ink-2">{t("pro.offersBody")}</p>
                    {!teams ? (
                        <p className="mt-3 flex items-center gap-2 text-sm text-ink-3"><Loader2 size={14} className="animate-spin" /> {t("ng.loadingClubs")}</p>
                    ) : (
                        <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label={t("pro.club")}>
                            {offers.map(tm => (
                                <button key={tm.id} type="button" role="radio" aria-checked={clubId === tm.id} onClick={() => setClubId(tm.id)}
                                    className={cn("flex items-center gap-3 rounded border px-3 py-2 text-left", clubId === tm.id ? "border-gold bg-raised" : "border-line hover:bg-raised")}>
                                    <TeamLogoImage src={tm.logoPath} alt="" size={32} team={tm as never} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-ink-1">{tm.name}</span>
                                        <span className="block text-xs text-ink-3">{regionLabel(tm.region)} · {t("pro.amateur")}</span>
                                    </span>
                                    {clubId === tm.id && <Check size={16} className="text-gold" />}
                                </button>
                            ))}
                        </div>
                    )}
                </Panel>
            </div>

            <div className="flex items-center justify-end gap-3">
                {!nameOk && <span className="text-xs text-ink-3">{t("pro.nickShort")}</span>}
                <Button onClick={start} disabled={!nameOk || !clubId || busy} className="h-11 px-6">
                    {busy ? <><Loader2 size={16} className="animate-spin" /> {t("pro.signing")}</> : t("pro.sign")}
                </Button>
            </div>
        </div>
    )
}
