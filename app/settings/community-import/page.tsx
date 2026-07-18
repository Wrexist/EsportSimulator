"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
    ArrowLeft, Database, FileUp, Trash2, CheckCircle2, AlertCircle,
    Store, RefreshCw, ExternalLink, Download, Users,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/lib/toast"
import {
    modExists,
    writeModFile,
    clearMod,
    getModPath,
    validateModPayload,
    workshopAvailable,
    listWorkshopMods,
    getActiveMod,
    setActiveMod,
    openWorkshop,
} from "@/engine/mod-loader"
import type { WorkshopModItem, ActiveModPointer } from "@/types/electron-window"

type Status = { kind: "ok"; msg: string } | { kind: "err"; msg: string } | null

export default function CommunityImportPage() {
    const { toast } = useToast()
    const [installed, setInstalled] = useState<boolean>(false)
    const [modPath, setModPath] = useState<string | null>(null)
    const [pasted, setPasted] = useState<string>("")
    const [status, setStatus] = useState<Status>(null)
    const [busy, setBusy] = useState<boolean>(false)
    const [electronAvailable, setElectronAvailable] = useState<boolean>(true)

    // Steam Workshop
    const [wsAvailable, setWsAvailable] = useState<boolean>(false)
    const [wsMods, setWsMods] = useState<WorkshopModItem[]>([])
    const [active, setActive] = useState<ActiveModPointer>({ source: "community" })
    const [wsBusy, setWsBusy] = useState<boolean>(false)

    const loadWorkshop = useCallback(async () => {
        const [avail, mods, act] = await Promise.all([
            workshopAvailable(),
            listWorkshopMods(),
            getActiveMod(),
        ])
        setWsAvailable(avail)
        // Surface our real-data overlays first; keep other subscriptions visible too.
        setWsMods([...mods].sort((a, b) => Number(b.isEmMod) - Number(a.isEmMod)))
        setActive(act)
    }, [])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const hasElectron =
                typeof window !== "undefined" && !!(window as any).electron?.mods
            if (!cancelled) setElectronAvailable(hasElectron)
            if (hasElectron) {
                const [exists, p] = await Promise.all([modExists(), getModPath()])
                if (!cancelled) {
                    setInstalled(exists)
                    setModPath(p)
                }
                await loadWorkshop()
            }
        })()
        return () => {
            cancelled = true
        }
    }, [loadWorkshop])

    const activateWorkshop = async (id: string) => {
        setWsBusy(true)
        try {
            const ok = await setActiveMod({ source: "workshop", workshopId: id })
            if (ok) {
                setStatus({ kind: "ok", msg: "Workshop mod activated. Start a new career to apply real teams." })
                toast({ title: "Workshop mod activated" })
                await loadWorkshop()
            } else {
                setStatus({ kind: "err", msg: "Could not activate that Workshop item." })
            }
        } finally {
            setWsBusy(false)
        }
    }

    const switchToCommunitySource = async () => {
        setWsBusy(true)
        try {
            const ok = await setActiveMod({ source: "community" })
            if (ok) {
                setStatus({ kind: "ok", msg: "Switched to your imported database. Start a new career to apply." })
                await loadWorkshop()
            }
        } finally {
            setWsBusy(false)
        }
    }

    const applyPayload = async (raw: string) => {
        setStatus(null)
        setBusy(true)
        try {
            let parsed: unknown
            try {
                parsed = JSON.parse(raw)
            } catch {
                setStatus({ kind: "err", msg: "Invalid JSON — paste a valid object." })
                return
            }
            const result = validateModPayload(parsed)
            if (!result.ok) {
                setStatus({ kind: "err", msg: result.error })
                return
            }

            // Write each section to its own file so mod-loader can cleanly merge.
            const writes: Array<Promise<boolean>> = []
            if (result.value.players) {
                writes.push(writeModFile("players.json", JSON.stringify(result.value.players, null, 2)))
            }
            if (result.value.teams) {
                writes.push(writeModFile("teams.json", JSON.stringify(result.value.teams, null, 2)))
            }
            if (result.value.tournaments) {
                writes.push(writeModFile("tournaments.json", JSON.stringify(result.value.tournaments, null, 2)))
            }
            writes.push(
                writeModFile(
                    "manifest.json",
                    JSON.stringify({ importedAt: new Date().toISOString() }, null, 2)
                )
            )
            const results = await Promise.all(writes)
            if (results.every(Boolean)) {
                setInstalled(true)
                // Make the imported db the live source (a previously-activated
                // Workshop mod would otherwise shadow it). Don't report success if
                // activation failed, or a stale Workshop mod stays live under a
                // "community database applied" message.
                const activated = await setActiveMod({ source: "community" })
                await loadWorkshop()
                if (!activated) {
                    setStatus({ kind: "err", msg: "Database was written, but could not be activated. Try again from the list below." })
                    return
                }
                setStatus({
                    kind: "ok",
                    msg: "Community database installed. Start a new career to apply.",
                })
                toast({ title: "Community database installed" })
                setPasted("")
            } else {
                setStatus({ kind: "err", msg: "Write failed. Check write permissions on userData." })
            }
        } finally {
            setBusy(false)
        }
    }

    const onFile = async (file: File) => {
        const txt = await file.text()
        await applyPayload(txt)
    }

    const onRemove = async () => {
        setBusy(true)
        try {
            const ok = await clearMod()
            if (ok) {
                setInstalled(false)
                setStatus({
                    kind: "ok",
                    msg: "Community database removed. Start a new career to revert.",
                })
                toast({ title: "Community database removed" })
            } else {
                setStatus({ kind: "err", msg: "Failed to remove files." })
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <div className="mb-6">
                <Link href="/settings">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Settings
                    </Button>
                </Link>
            </div>

            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <Database className="h-6 w-6" />
                    <h1 className="text-2xl font-bold">Import Community Database</h1>
                    {installed && (
                        <Badge variant="secondary" className="ml-2">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                        </Badge>
                    )}
                </div>
                <p className="text-muted-foreground">
                    Replace the default roster data with a community-supplied JSON database.
                    Files are stored locally on your machine and never included in the game build.
                </p>
            </div>

            {!electronAvailable && (
                <Card className="mb-6 border-yellow-600/40">
                    <CardHeader>
                        <CardTitle className="text-yellow-600 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Desktop-only feature
                        </CardTitle>
                        <CardDescription>
                            Community database import is available in the desktop build. Launch the
                            game via the Electron app to use this feature.
                        </CardDescription>
                    </CardHeader>
                </Card>
            )}

            {electronAvailable && (
                <Card className="mb-6">
                    <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="flex items-center gap-2">
                                <Store className="h-5 w-5" /> Steam Workshop
                                {active.source === "workshop" && (
                                    <Badge variant="secondary" className="ml-1">
                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                                    </Badge>
                                )}
                            </CardTitle>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={wsBusy}
                                    onClick={() => void loadWorkshop()}>
                                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                                </Button>
                                <Button variant="outline" size="sm"
                                    onClick={() => void openWorkshop()}>
                                    <ExternalLink className="h-4 w-4 mr-1" /> Browse
                                </Button>
                            </div>
                        </div>
                        <CardDescription>
                            Subscribe to a real-data mod on the Workshop to play with real team
                            names, logos and player portraits. Your subscribed mods appear here —
                            activate one, then start a new career.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {!wsAvailable && (
                            <p className="text-sm text-muted-foreground">
                                Steam isn&apos;t connected right now, so subscribed mods can&apos;t be
                                listed. Launch through Steam to manage Workshop mods.
                            </p>
                        )}

                        {wsAvailable && wsMods.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                No subscribed mods found. Click <strong>Browse</strong> to find real-data
                                mods on the Workshop, subscribe, then hit <strong>Refresh</strong>.
                            </p>
                        )}

                        {wsMods.map((m) => {
                            const isActive = active.source === "workshop" && active.workshopId === m.id
                            return (
                                <div key={m.id}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium truncate">{m.title}</span>
                                            {m.isEmMod && <Badge variant="outline">Real data</Badge>}
                                            {isActive && (
                                                <Badge variant="secondary">
                                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                                                </Badge>
                                            )}
                                            {!m.installed && <Badge variant="outline">Downloading…</Badge>}
                                            {m.needsUpdate && <Badge variant="outline">Update pending</Badge>}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                                            {typeof m.teams === "number" && (
                                                <span className="flex items-center gap-1">
                                                    <Database className="h-3 w-3" /> {m.teams} teams
                                                </span>
                                            )}
                                            {typeof m.players === "number" && (
                                                <span className="flex items-center gap-1">
                                                    <Users className="h-3 w-3" /> {m.players} players
                                                </span>
                                            )}
                                            {m.author && <span>by {m.author}</span>}
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        {isActive ? (
                                            <Button variant="ghost" size="sm" disabled={wsBusy}
                                                onClick={() => void switchToCommunitySource()}>
                                                Deactivate
                                            </Button>
                                        ) : (
                                            <Button size="sm" disabled={wsBusy || !m.installed || !m.isEmMod}
                                                onClick={() => void activateWorkshop(m.id)}>
                                                <Download className="h-4 w-4 mr-1" /> Activate
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </CardContent>
                </Card>
            )}

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileUp className="h-5 w-5" /> Upload JSON file
                    </CardTitle>
                    <CardDescription>
                        Accepts a JSON file with optional <code>players</code>,{" "}
                        <code>teams</code>, and <code>tournaments</code> arrays.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <input
                        type="file"
                        accept="application/json,.json"
                        disabled={busy || !electronAvailable}
                        onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void onFile(f)
                            e.target.value = ""
                        }}
                        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                    />
                </CardContent>
            </Card>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Paste JSON</CardTitle>
                    <CardDescription>
                        Paste a JSON object below and click Import.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Textarea
                        value={pasted}
                        onChange={(e) => setPasted(e.target.value)}
                        disabled={busy || !electronAvailable}
                        rows={10}
                        placeholder='{ "players": [...], "teams": [...] }'
                        className="font-mono text-xs"
                    />
                    <div className="flex gap-2">
                        <Button
                            onClick={() => void applyPayload(pasted)}
                            disabled={busy || !pasted.trim() || !electronAvailable}
                        >
                            Import
                        </Button>
                        {installed && (
                            <Button
                                variant="destructive"
                                onClick={() => void onRemove()}
                                disabled={busy}
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remove Community Database
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {status && (
                <Card
                    className={
                        status.kind === "ok"
                            ? "border-green-600/40"
                            : "border-red-600/40"
                    }
                >
                    <CardContent className="py-4 flex items-center gap-2">
                        {status.kind === "ok" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                            <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-sm">{status.msg}</span>
                    </CardContent>
                </Card>
            )}

            {modPath && (
                <p className="text-xs text-muted-foreground mt-6">
                    Files are stored in <code className="break-all">{modPath}</code>.
                </p>
            )}
        </div>
    )
}
