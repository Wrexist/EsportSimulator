"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
    ArrowLeft, Trash2, CheckCircle2, AlertCircle,
    RefreshCw, ExternalLink, Download, Users, FolderOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { cn } from "@/lib/utils"
import { useToast } from "@/lib/toast"
import {
    modExists,
    clearMod,
    getModPath,
    workshopAvailable,
    listWorkshopMods,
    getActiveMod,
    setActiveMod,
    openWorkshop,
} from "@/engine/mod-loader"
import type { WorkshopModItem, ActiveModPointer } from "@/types/electron-window"

import { MAX_MOD_BYTES, parseModContent, validateModReferences } from "@/electron/mod-content"
import { mergeSnapshot } from "@/engine/mod-loader"

type Status = { kind: "ok"; msg: string } | { kind: "err"; msg: string } | null

export default function CommunityImportPage() {
    const { toast } = useToast()
    const [installed, setInstalled] = useState<boolean>(false)
    const [modPath, setModPath] = useState<string | null>(null)
    const [pasted, setPasted] = useState<string>("")
    const [status, setStatus] = useState<Status>(null)
    const [busy, setBusy] = useState<boolean>(false)
    const [electronAvailable, setElectronAvailable] = useState<boolean>(false)

    const [preview, setPreview] = useState<{ text: string; counts: string; author: string } | null>(null)

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
                typeof window !== "undefined" && !!window.electron?.mods
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
                setStatus({ kind: "ok", msg: "Workshop mod activated. Start a new career to use its database." })
                toast({ title: "Workshop mod activated" })
                await loadWorkshop()
            } else {
                setStatus({ kind: "err", msg: "Could not activate that Workshop item." })
            }
        } finally {
            setWsBusy(false)
        }
    }

    const switchToCommunitySource = async (source: "community" | "none" = "none") => {
        setWsBusy(true)
        try {
            const ok = await setActiveMod({ source })
            if (ok) {
                setStatus({ kind: "ok", msg: source === "none" ? "Base game selected for new careers. Existing careers are unchanged." : "Imported database selected for new careers." })
                await loadWorkshop()
            } else { setStatus({ kind: "err", msg: "Could not change the active database." }) }
        } catch { setStatus({ kind: "err", msg: "Could not change the active database." }) }
        finally { setWsBusy(false) }
    }

    const applyPayload = async (raw: string) => {
        setStatus(null)
        setPreview(null)
        setBusy(true)
        try {
            const result = parseModContent(raw)
            if (!result.ok) { setStatus({ kind: "err", msg: result.error }); return }
            const base = await Promise.all(["players", "teams", "tournaments"].map(async name => {
                const response = await fetch(`/data/snapshot/${name}.json`)
                if (!response.ok) throw new Error("Could not load the base database for validation")
                return response.json()
            }))
            const data = result.value
            const referenceError = validateModReferences(mergeSnapshot(base[0], data.players), mergeSnapshot(base[1], data.teams), mergeSnapshot(base[2], data.tournaments))
            if (referenceError) { setStatus({ kind: "err", msg: referenceError }); return }
            setPreview({ text: raw, counts: `${data.players?.length || 0} players / ${data.teams?.length || 0} teams / ${data.tournaments?.length || 0} tournaments`, author: typeof data.manifest?.author === "string" ? data.manifest.author : "Author not supplied" })
        } catch (error) {
            setStatus({ kind: "err", msg: error instanceof Error ? error.message : "Could not preview database" })
        } finally { setBusy(false) }
    }
    const installPreview = async () => {
        if (!preview) return
        setBusy(true)
        try {
            if (!await window.electron?.mods?.install(preview.text)) throw new Error("Installation failed. The previous database is retained.")
            setInstalled(true)
            if (!await setActiveMod({ source: "community" })) throw new Error("Database installed but not activated. Select imported database below.")
            setPreview(null); setPasted(""); await loadWorkshop()
            setStatus({ kind: "ok", msg: "Database installed for new careers. A backup of the previous import is available." })
        } catch (error) { setStatus({ kind: "err", msg: error instanceof Error ? error.message : "Installation failed" }) }
        finally { setBusy(false) }
    }
    const restorePrevious = async () => {
        setBusy(true)
        try {
            if (!await window.electron?.mods?.restore()) throw new Error("No valid previous import could be restored.")
            if (!await setActiveMod({ source: "community" })) throw new Error("Restored, but activation failed. Select imported database below.")
            await loadWorkshop(); setInstalled(await modExists())
            setStatus({ kind: "ok", msg: "Previous database restored for new careers." })
        } catch (error) { setStatus({ kind: "err", msg: error instanceof Error ? error.message : "Restore failed" }) }
        finally { setBusy(false) }
    }
    const onFile = async (file: File) => {
        if (file.size > MAX_MOD_BYTES) { setPreview(null); setStatus({ kind: "err", msg: "Database exceeds 16 MiB" }); return }
        try { await applyPayload(await file.text()) }
        catch { setStatus({ kind: "err", msg: "File could not be read" }) }
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
        <div className="mx-auto max-w-[960px] space-y-4 pb-16">
            <ScreenHeader
                eyebrow="Settings"
                title="Community database"
                subtitle="Replace the default roster data with a community database or a Steam Workshop mod. Files stay on this machine and only affect new careers."
                aside={
                    <>
                        {installed && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-positive"><CheckCircle2 size={14} /> Imported database available</span>}
                        <Button asChild variant="ghost" className="gap-2"><Link href="/settings"><ArrowLeft size={16} /> Settings</Link></Button>
                    </>
                }
            />

            {!electronAvailable && (
                <Panel>
                    <p className="flex items-start gap-2 text-sm text-ink-2">
                        <AlertCircle size={16} className="mt-0.5 shrink-0 text-caution" />
                        Community databases and Workshop mods work in the desktop app only.
                    </p>
                </Panel>
            )}

            {status && (
                <div className={cn("flex items-center gap-2 rounded-md border px-4 py-3 text-sm text-ink-1", status.kind === "ok" ? "border-positive/30" : "border-negative/40")}>
                    {status.kind === "ok" ? <CheckCircle2 size={16} className="shrink-0 text-positive" /> : <AlertCircle size={16} className="shrink-0 text-negative" />}
                    <span role="status">{status.msg}</span>
                </div>
            )}

            {electronAvailable && (
                <Panel
                    title={<span className="flex items-center gap-2">Steam Workshop {active.source === "workshop" && <span className="text-xs font-semibold text-positive">Active</span>}</span>}
                    actions={
                        <>
                            <Button variant="ghost" size="sm" disabled={wsBusy} onClick={() => void loadWorkshop()} className="gap-1.5"><RefreshCw size={13} /> Refresh</Button>
                            <Button variant="outline" size="sm" disabled={!wsAvailable} onClick={() => void openWorkshop()} className="gap-1.5"><ExternalLink size={13} /> Browse</Button>
                        </>
                    }
                    padded={false}
                >
                    <p className="px-4 pt-3 text-xs text-ink-3">Subscribe to a database mod on the Workshop, activate it here, then start a new career.</p>
                    {!wsAvailable && <p className="px-4 py-3 text-sm text-ink-3">Steam isn&apos;t connected, so subscriptions can&apos;t be listed. Launch through Steam to manage Workshop mods.</p>}
                    {wsAvailable && wsMods.length === 0 && <p className="px-4 py-3 text-sm text-ink-3">No subscribed mods. Browse the Workshop, subscribe, then refresh.</p>}
                    {wsMods.length > 0 && (
                        <ul className="mt-2 divide-y divide-line border-t border-line">
                            {wsMods.map((m) => {
                                const isActive = active.source === "workshop" && active.workshopId === m.id
                                return (
                                    <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="flex flex-wrap items-center gap-2 text-sm">
                                                <span className="truncate font-semibold text-ink-1">{m.title}</span>
                                                {m.isEmMod && <span className="text-xs text-ink-3">Database schema 1</span>}
                                                {isActive && <span className="text-xs font-semibold text-positive">Active</span>}
                                                {!m.installed && <span className="text-xs text-ink-3">Downloading…</span>}
                                                {m.needsUpdate && <span className="text-xs text-caution">Update pending</span>}
                                            </p>
                                            <p className="mt-0.5 flex items-center gap-3 text-xs text-ink-3">
                                                {typeof m.teams === "number" && <span>{m.teams} teams</span>}
                                                {typeof m.players === "number" && <span className="inline-flex items-center gap-1"><Users size={12} /> {m.players} players</span>}
                                                {m.author && <span>by {m.author}</span>}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            {isActive ? (
                                                <>
                                                    <Button variant="outline" size="sm" disabled={wsBusy || !m.installed || !m.isEmMod || m.needsUpdate} onClick={() => void activateWorkshop(m.id)}>Use installed version</Button>
                                                    <Button variant="ghost" size="sm" disabled={wsBusy} onClick={() => void switchToCommunitySource()}>Deactivate</Button>
                                                </>
                                            ) : (
                                                <Button variant="outline" size="sm" disabled={wsBusy || !m.installed || !m.isEmMod || m.needsUpdate} onClick={() => void activateWorkshop(m.id)} className="gap-1.5">
                                                    <Download size={13} /> Activate
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </Panel>
            )}

            <Panel title="Import a database" padded={false}>
                <div className="divide-y divide-line">
                    {electronAvailable && (
                        <div className="flex items-center justify-between gap-6 px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-ink-1">Mod folder with images</p>
                                <p className="text-xs text-ink-3">Choose the unpacked mod folder. PNG, JPEG and WebP images are kept locally so careers keep their portraits when you switch mods.</p>
                            </div>
                            <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
                                setBusy(true)
                                try {
                                    const text = await window.electron?.mods?.readFolder()
                                    if (text) await applyPayload(text)
                                    else setStatus({ kind: "err", msg: "No valid folder selected. The folder must contain database JSON and all referenced PNG, JPEG or WebP images." })
                                } finally { setBusy(false) }
                            }} className="gap-1.5"><FolderOpen size={13} /> Choose folder</Button>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-6 px-4 py-3">
                        <div>
                            <label htmlFor="community-json-file" className="text-sm font-semibold text-ink-1">JSON file</label>
                            <p className="text-xs text-ink-3">Optional <code>players</code>, <code>teams</code> and <code>tournaments</code> arrays. Imported tournaments are stored, but the career calendar still uses the built-in competitions.</p>
                        </div>
                        <input
                            id="community-json-file"
                            aria-label="Select community database JSON"
                            type="file"
                            accept="application/json,.json"
                            disabled={busy || !electronAvailable}
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) void onFile(f)
                                e.target.value = ""
                            }}
                            className="block w-60 shrink-0 text-xs text-ink-3 file:mr-3 file:h-8 file:rounded-md file:border file:border-line file:bg-raised file:px-3 file:text-xs file:font-semibold file:text-ink-1 hover:file:bg-hover disabled:opacity-40"
                        />
                    </div>
                    <div className="space-y-3 px-4 py-3">
                        <div>
                            <label htmlFor="community-json-paste" className="text-sm font-semibold text-ink-1">Paste JSON</label>
                            <p className="text-xs text-ink-3">Up to 16 MiB. No ZIP files or scripts.</p>
                        </div>
                        <Textarea
                            id="community-json-paste"
                            aria-label="Community database JSON"
                            maxLength={MAX_MOD_BYTES}
                            value={pasted}
                            onChange={(e) => setPasted(e.target.value)}
                            disabled={busy || !electronAvailable}
                            rows={8}
                            placeholder='{ "players": [...], "teams": [...] }'
                            className="font-mono text-xs"
                        />
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => void applyPayload(pasted)} disabled={busy || !pasted.trim() || !electronAvailable}>Preview import</Button>
                            {installed && (
                                <Button variant="ghost" onClick={() => void onRemove()} disabled={busy} className="gap-1.5 text-negative!">
                                    <Trash2 size={14} /> Remove imported database
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </Panel>

            {preview && (
                <Panel title="Review database" actions={<span className="text-xs tabular-nums text-ink-3">{preview.counts}</span>}>
                    <p className="text-sm text-ink-1">{preview.author}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-3">Matching IDs replace base entries; new IDs are added. This replaces the whole previous import. Existing careers keep their data. JSON alone can&apos;t bring new images; use the folder import for those.</p>
                    <div className="mt-4 flex gap-2">
                        <Button disabled={busy} onClick={() => void installPreview()}>Install database</Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button>
                    </div>
                </Panel>
            )}

            {electronAvailable && (
                <Panel title="Database for new careers" padded={false}>
                    <div className="flex flex-wrap gap-2 px-4 py-3">
                        <Button variant="outline" size="sm" disabled={busy || wsBusy} onClick={() => void switchToCommunitySource("none")}>Use base game</Button>
                        <Button variant="outline" size="sm" disabled={busy || wsBusy} onClick={() => void switchToCommunitySource("community")}>Use imported database</Button>
                        <Button variant="ghost" size="sm" disabled={busy || wsBusy} onClick={() => void restorePrevious()}>Restore previous import</Button>
                    </div>
                    {modPath && <p className="border-t border-line px-4 py-2 text-xs text-ink-3">Stored in <code className="break-all">{modPath}</code></p>}
                </Panel>
            )}
        </div>
    )
}
