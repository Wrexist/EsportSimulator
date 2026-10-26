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
import { ATTRIBUTE_LABEL, SANDBOX_ATTRIBUTES, type SandboxAttribute, type SandboxEdit } from "@/engine/sandbox"

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
    useEffect(() => { if (playerTeamId && !teams.some(t => t.id === teamId)) setTeamId(playerTeamId) }, [playerTeamId, teams, teamId])
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
        if (r.ok) toast({ title: "Saved", description: r.what })
        else toast({ title: "Not changed", description: r.reason, variant: "destructive" })
    }

    if (!sandbox) {
        return (
            <div className="mx-auto max-w-[900px] space-y-4 py-10">
                <ScreenHeader eyebrow="Settings" title="Sandbox editor" subtitle="The sandbox editor is off for this career." />
                <p className="text-sm text-ink-2">Turn it on under Settings → Saves. It is permanent for the career and switches its achievements off.</p>
                <Button asChild variant="outline"><Link href="/settings">Back to settings</Link></Button>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-[1280px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow="Settings · Sandbox"
                title="Sandbox editor"
                subtitle={`On since week ${sandbox.enabledWeek}. ${sandbox.edits} edit${sandbox.edits === 1 ? "" : "s"} so far. This career earns no achievements, Steam stats or leaderboard scores.`}
                leading={<span className="flex h-14 w-14 items-center justify-center rounded-lg border border-caution/50 bg-caution/10 text-caution"><FlaskConical size={26} /></span>}
                aside={<Button asChild variant="outline"><Link href="/settings">Settings</Link></Button>}
            />

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-4">
                    <Panel title="Club">
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Club">
                                <Select value={teamId} onValueChange={setTeamId}>
                                    <SelectTrigger className="h-10" aria-label="Club to edit"><SelectValue>{team?.name ?? "Pick a club"}</SelectValue></SelectTrigger>
                                    <SelectContent>
                                        {[...teams].sort((a, b) => (a.id === playerTeamId ? -1 : b.id === playerTeamId ? 1 : a.name.localeCompare(b.name))).map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name}{t.id === playerTeamId ? " (your club)" : ""}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <div className="flex items-end gap-2">
                                <Field label={`Money (now ${formatCurrency(team?.budget ?? 0, "$", false)})`}>
                                    <Input inputMode="numeric" value={money} onChange={e => setMoney(e.target.value)} aria-label="Club money" />
                                </Field>
                                <Button variant="outline" onClick={() => run({ kind: "money", teamId, budget: Number(money) })}>Set</Button>
                            </div>
                            <div className="flex items-end gap-2 md:col-span-2">
                                <Field label="Club name"><Input value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={40} aria-label="Club name" /></Field>
                                <div className="w-28 shrink-0"><Field label="Tag"><Input value={tag} onChange={e => setTag(e.target.value)} maxLength={5} aria-label="Club tag" /></Field></div>
                                <Button variant="outline" onClick={() => run({ kind: "team", teamId, name: teamName, shortName: tag })}>Rename</Button>
                            </div>
                        </div>
                    </Panel>

                    <Panel title="Player">
                        {roster.length === 0 ? <p className="text-sm text-ink-3">This club has no players.</p> : (
                            <div className="space-y-5">
                                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px]">
                                    <Field label="Player">
                                        <Select value={playerId} onValueChange={setPlayerId}>
                                            <SelectTrigger className="h-10" aria-label="Player to edit"><SelectValue>{player?.nickname ?? "Pick a player"}</SelectValue></SelectTrigger>
                                            <SelectContent>{roster.map(p => <SelectItem key={p.id} value={p.id}>{p.nickname}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </Field>
                                    <Field label="Nickname"><Input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={24} aria-label="Nickname" /></Field>
                                    <Field label="Age"><Input inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} aria-label="Age" /></Field>
                                    <div className="md:col-span-3"><Field label="Full name"><Input value={realName} onChange={e => setRealName(e.target.value)} maxLength={48} aria-label="Full name" /></Field></div>
                                </div>
                                {SANDBOX_ATTRIBUTES.map(([group, keys]) => (
                                    <div key={group}>
                                        <p className="mb-2 text-xs font-semibold text-ink-2">{group}</p>
                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                                            {keys.map(k => (
                                                <Field key={k} label={ATTRIBUTE_LABEL[k]}>
                                                    <Input inputMode="numeric" value={attrs[k] ?? ""} onChange={e => setAttrs(a => ({ ...a, [k]: e.target.value }))} aria-label={ATTRIBUTE_LABEL[k]} />
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
                                    })}>Save player</Button>
                                </div>
                                <div className="border-t border-line pt-4">
                                    <p className="mb-2 text-xs font-semibold text-ink-2">Contract</p>
                                    {contract ? (
                                        <div className="flex flex-wrap items-end gap-3">
                                            <div className="w-44"><Field label="Wage per week"><Input inputMode="numeric" value={wage} onChange={e => setWage(e.target.value)} aria-label="Wage per week" /></Field></div>
                                            <div className="w-36"><Field label={`Ends week (now ${currentWeek})`}><Input inputMode="numeric" value={endWeek} onChange={e => setEndWeek(e.target.value)} aria-label="Contract end week" /></Field></div>
                                            <Button variant="outline" onClick={() => run({ kind: "contract", playerId, salaryPerWeek: Number(wage), endWeek: Number(endWeek) })}>Save contract</Button>
                                        </div>
                                    ) : <p className="text-sm text-ink-3">No running contract.</p>}
                                </div>
                            </div>
                        )}
                    </Panel>
                </div>

                <Panel title="Edit log" padded={false}>
                    {sandbox.log.length ? (
                        <ul className="divide-y divide-line" data-testid="sandbox-log">
                            {sandbox.log.map((l, i) => <li key={i} className="px-4 py-2 text-xs text-ink-2"><span className="tabular-nums text-ink-3">W{l.week}</span> · {l.what}</li>)}
                        </ul>
                    ) : <p className="px-4 py-6 text-sm text-ink-3">Edits appear here.</p>}
                </Panel>
            </div>
        </div>
    )
}
