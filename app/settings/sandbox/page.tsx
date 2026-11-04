"use client"

/**
 * Sandbox editor (C9): edit one career's money, players, contracts and
 * names. Only reachable once the editor is on for the loaded career
 * (Settings → Saves); every change goes through engine/sandbox.ts.
 */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useShallow } from "zustand/react/shallow"
import { FlaskConical } from "lucide-react"
import { useGameStore } from "@/store/game-store"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/lib/toast"
import { formatCurrency } from "@/lib/utils-extended"
import { SANDBOX_ATTRIBUTES, type SandboxAttribute, type SandboxEdit } from "@/engine/sandbox"
import { t, tn } from "@/lib/i18n"

const SB_OWN = new Set(["form", "morale", "fatigue", "potential"])
const attrName = (k: SandboxAttribute) => SB_OWN.has(k) ? t(`sb.attr.${k}`) : t(`attr.${k}`)
const GROUP_KEY: Record<string, string> = { Aim: "sb.group.aim", Mind: "sb.group.mind", "Body and condition": "sb.group.body" }

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block min-w-0">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</span>
        {children}
    </label>
)

export default function SandboxPage() {
    const { toast } = useToast()
    const { sandbox, teams, players, contracts, playerTeamId, currentWeek, sandboxEdit } = useGameStore(useShallow(s => ({
        sandbox: s.sandbox, teams: s.teams, players: s.players, contracts: s.contracts,
        playerTeamId: s.playerTeamId, currentWeek: s.currentWeek, sandboxEdit: s.sandboxEdit,
    })))
    const [teamId, setTeamId] = useState<string>(playerTeamId ?? "")
    // The career can finish loading after the first render (opening this page directly).
    useEffect(() => { if (playerTeamId && !teams.some(tm => tm.id === teamId)) setTeamId(playerTeamId) }, [playerTeamId, teams, teamId])
    const team = teams.find(t => t.id === teamId)
    const roster = useMemo(() => (team?.rosterIds ?? []).map(id => players.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p), [team, players])
    const [playerId, setPlayerId] = useState<string>("")
    const player = players.find(p => p.id === playerId)
    const contract = contracts.find(c => c.playerId === playerId && c.endWeek > currentWeek)

    const [money, setMoney] = useState("")
    const [teamName, setTeamName] = useState("")
    const [tag, setTag] = useState("")
    const [attrs, setAttrs] = useState<Partial<Record<SandboxAttribute, string>>>({})
    const [age, setAge] = useState("")
    const [nickname, setNickname] = useState("")
    const [realName, setRealName] = useState("")
    const [wage, setWage] = useState("")
    const [endWeek, setEndWeek] = useState("")

    useEffect(() => {
        setMoney(team ? String(Math.round(team.budget)) : "")
        setTeamName(team?.name ?? "")
        setTag(team?.shortName ?? "")
        if (!roster.some(p => p.id === playerId)) setPlayerId(roster[0]?.id ?? "")
    }, [team, roster, playerId])
    useEffect(() => {
        if (!player) return
        const next: Partial<Record<SandboxAttribute, string>> = {}
        for (const [, keys] of SANDBOX_ATTRIBUTES) for (const k of keys) next[k] = String(Math.round((player as unknown as Record<string, number>)[k] ?? 0))
        setAttrs(next)
        setAge(String(player.age))
        setNickname(player.nickname)
        setRealName(player.name ?? "")
    }, [player])
    useEffect(() => {
        setWage(contract ? String(contract.salaryPerWeek) : "")
        setEndWeek(contract ? String(contract.endWeek) : "")
    }, [contract])

    const run = (edit: SandboxEdit) => {
        const r = sandboxEdit(edit)
        if (r.ok) toast({ title: t("sb.saved"), description: r.what })
        else toast({ title: t("sb.notChanged"), description: r.reason, variant: "destructive" })
    }

    // START-21: with no career loaded there is nothing to turn on yet.
    const careerLoaded = useGameStore(s => s.isInitialized && !!s.playerTeamId)
    if (!careerLoaded) {
        return (
            <div className="mx-auto max-w-[900px] space-y-4 py-10">
                <ScreenHeader eyebrow={t("settings.eyebrow")} title={t("settings.sandbox")} subtitle={t("settings.sandboxNoCareer")} />
                <div className="flex gap-2">
                    <Button asChild variant="outline"><Link href="/load-game">{t("lg.title")}</Link></Button>
                    <Button asChild variant="ghost"><Link href="/settings">{t("settings.title")}</Link></Button>
                </div>
            </div>
        )
    }

    if (!sandbox) {
        return (
            <div className="mx-auto max-w-[900px] space-y-4 py-10">
                <ScreenHeader eyebrow={t("settings.title")} title={t("sb.title")} subtitle={t("sb.off")} />
                <p className="text-sm text-ink-2">{t("sb.offHint")}</p>
                <Button asChild variant="outline"><Link href="/settings">{t("sb.back")}</Link></Button>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-[1280px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={t("sb.eyebrow")}
                title={t("sb.title")}
                subtitle={tn("sb.onSince", sandbox.edits, { week: sandbox.enabledWeek })}
                leading={<span className="flex h-14 w-14 items-center justify-center rounded-lg border border-caution/50 bg-caution/10 text-caution"><FlaskConical size={26} /></span>}
                aside={<Button asChild variant="outline"><Link href="/settings">{t("settings.title")}</Link></Button>}
            />

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-4">
                    <Panel title={t("sb.club")}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label={t("sb.club")}>
                                <Select value={teamId} onValueChange={setTeamId}>
                                    <SelectTrigger className="h-10" aria-label={t("sb.clubToEdit")}><SelectValue>{team?.name ?? t("sb.pickClub")}</SelectValue></SelectTrigger>
                                    <SelectContent>
                                        {[...teams].sort((a, b) => (a.id === playerTeamId ? -1 : b.id === playerTeamId ? 1 : a.name.localeCompare(b.name))).map(tm => (
                                            <SelectItem key={tm.id} value={tm.id}>{tm.id === playerTeamId ? t("sb.yourClub", { name: tm.name }) : tm.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <div className="flex items-end gap-2">
                                <Field label={t("sb.money", { amount: formatCurrency(team?.budget ?? 0, "$", false) })}>
                                    <Input inputMode="numeric" value={money} onChange={e => setMoney(e.target.value)} aria-label={t("sb.clubMoney")} />
                                </Field>
                                <Button variant="outline" onClick={() => run({ kind: "money", teamId, budget: Number(money) })}>{t("sb.set")}</Button>
                            </div>
                            <div className="flex items-end gap-2 md:col-span-2">
                                <Field label={t("sb.clubName")}><Input value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={40} aria-label={t("sb.clubName")} /></Field>
                                <div className="w-28 shrink-0"><Field label={t("sb.tag")}><Input value={tag} onChange={e => setTag(e.target.value)} maxLength={5} aria-label={t("sb.clubTag")} /></Field></div>
                                <Button variant="outline" onClick={() => run({ kind: "team", teamId, name: teamName, shortName: tag })}>{t("sb.rename")}</Button>
                            </div>
                        </div>
                    </Panel>

                    <Panel title={t("sb.player")}>
                        {roster.length === 0 ? <p className="text-sm text-ink-3">{t("sb.noPlayers")}</p> : (
                            <div className="space-y-5">
                                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px]">
                                    <Field label={t("sb.player")}>
                                        <Select value={playerId} onValueChange={setPlayerId}>
                                            <SelectTrigger className="h-10" aria-label={t("sb.playerToEdit")}><SelectValue>{player?.nickname ?? t("sb.pickPlayer")}</SelectValue></SelectTrigger>
                                            <SelectContent>{roster.map(p => <SelectItem key={p.id} value={p.id}>{p.nickname}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </Field>
                                    <Field label={t("sb.nickname")}><Input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={24} aria-label={t("sb.nickname")} /></Field>
                                    <Field label={t("sb.age")}><Input inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} aria-label={t("sb.age")} /></Field>
                                    <div className="md:col-span-3"><Field label={t("sb.fullName")}><Input value={realName} onChange={e => setRealName(e.target.value)} maxLength={48} aria-label={t("sb.fullName")} /></Field></div>
                                </div>
                                {SANDBOX_ATTRIBUTES.map(([group, keys]) => (
                                    <div key={group}>
                                        <p className="mb-2 text-xs font-semibold text-ink-2">{t(GROUP_KEY[group])}</p>
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                            {keys.map(k => (
                                                <Field key={k} label={attrName(k)}>
                                                    <Input inputMode="numeric" value={attrs[k] ?? ""} onChange={e => setAttrs(a => ({ ...a, [k]: e.target.value }))} aria-label={attrName(k)} />
                                                </Field>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <div className="flex justify-end">
                                    <Button onClick={() => run({
                                        kind: "player", playerId,
                                        attributes: Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== "" && v !== undefined).map(([k, v]) => [k, Number(v)])) as Partial<Record<SandboxAttribute, number>>,
                                        age: Number(age), nickname, name: realName,
                                    })}>{t("sb.savePlayer")}</Button>
                                </div>
                                <div className="border-t border-line pt-4">
                                    <p className="mb-2 text-xs font-semibold text-ink-2">{t("sb.contract")}</p>
                                    {contract ? (
                                        <div className="flex flex-wrap items-end gap-3">
                                            <div className="w-44"><Field label={t("sb.wage")}><Input inputMode="numeric" value={wage} onChange={e => setWage(e.target.value)} aria-label={t("sb.wage")} /></Field></div>
                                            <div className="w-36"><Field label={t("sb.endsWeek", { week: currentWeek })}><Input inputMode="numeric" value={endWeek} onChange={e => setEndWeek(e.target.value)} aria-label={t("sb.endWeekAria")} /></Field></div>
                                            <Button variant="outline" onClick={() => run({ kind: "contract", playerId, salaryPerWeek: Number(wage), endWeek: Number(endWeek) })}>{t("sb.saveContract")}</Button>
                                        </div>
                                    ) : <p className="text-sm text-ink-3">{t("sb.noContract")}</p>}
                                </div>
                            </div>
                        )}
                    </Panel>
                </div>

                <Panel title={t("sb.log")} padded={false}>
                    {sandbox.log.length ? (
                        <ul className="divide-y divide-line" data-testid="sandbox-log">
                            {sandbox.log.map((l, i) => <li key={i} className="px-4 py-2 text-xs text-ink-2"><span className="tabular-nums text-ink-3">{t("common.weekShort", { n: l.week })}</span> · {l.what}</li>)}
                        </ul>
                    ) : <p className="px-4 py-6 text-sm text-ink-3">{t("sb.logEmpty")}</p>}
                </Panel>
            </div>
        </div>
    )
}
