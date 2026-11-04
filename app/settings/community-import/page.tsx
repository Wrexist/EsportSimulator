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
import { t, tn } from "@/lib/i18n"
import { Trans } from "@/lib/trans"

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
                setStatus({ kind: "ok", msg: t("ci.wsActivated") })
                toast({ title: t("ci.wsActivatedToast") })
                await loadWorkshop()
            } else {
                setStatus({ kind: "err", msg: t("ci.wsActivateFailed") })
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
                setStatus({ kind: "ok", msg: source === "none" ? t("ci.baseSelected") : t("ci.importedSelected") })
                await loadWorkshop()
            } else { setStatus({ kind: "err", msg: t("ci.switchFailed") }) }
        } catch { setStatus({ kind: "err", msg: t("ci.switchFailed") }) }
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
                if (!response.ok) throw new Error(t("ci.baseLoadFailed"))
                return response.json()
            }))
            const data = result.value
            const referenceError = validateModReferences(mergeSnapshot(base[0], data.players), mergeSnapshot(base[1], data.teams), mergeSnapshot(base[2], data.tournaments))
            if (referenceError) { setStatus({ kind: "err", msg: referenceError }); return }
            setPreview({ text: raw, counts: [tn("ci.players", data.players?.length || 0), tn("ci.teams", data.teams?.length || 0), tn("ci.tournaments", data.tournaments?.length || 0)].join(" / "), author: typeof data.manifest?.author === "string" ? data.manifest.author : t("ci.noAuthor") })
        } catch (error) {
            setStatus({ kind: "err", msg: error instanceof Error ? error.message : t("ci.previewFailed") })
        } finally { setBusy(false) }
    }
    const installPreview = async () => {
        if (!preview) return
        setBusy(true)
        try {
            if (!await window.electron?.mods?.install(preview.text)) throw new Error(t("ci.installFailedKept"))
            setInstalled(true)
            if (!await setActiveMod({ source: "community" })) throw new Error(t("ci.installedNotActive"))
            setPreview(null); setPasted(""); await loadWorkshop()
            setStatus({ kind: "ok", msg: t("ci.installed") })
        } catch (error) { setStatus({ kind: "err", msg: error instanceof Error ? error.message : t("ci.installFailed") }) }
        finally { setBusy(false) }
    }
    const restorePrevious = async () => {
        setBusy(true)
        try {
            if (!await window.electron?.mods?.restore()) throw new Error(t("ci.restoreNone"))
            if (!await setActiveMod({ source: "community" })) throw new Error(t("ci.restoredNotActive"))
            await loadWorkshop(); setInstalled(await modExists())
            setStatus({ kind: "ok", msg: t("ci.restored") })
        } catch (error) { setStatus({ kind: "err", msg: error instanceof Error ? error.message : t("ci.restoreFailed") }) }
        finally { setBusy(false) }
    }
    const onFile = async (file: File) => {
        if (file.size > MAX_MOD_BYTES) { setPreview(null); setStatus({ kind: "err", msg: t("ci.tooBig") }); return }
        try { await applyPayload(await file.text()) }
        catch { setStatus({ kind: "err", msg: t("ci.readFailed") }) }
    }

    const onRemove = async () => {
        setBusy(true)
        try {
            const ok = await clearMod()
            if (ok) {
                setInstalled(false)
                setStatus({
                    kind: "ok",
                    msg: t("ci.removed"),
                })
                toast({ title: t("ci.removedToast") })
            } else {
                setStatus({ kind: "err", msg: t("ci.removeFailed") })
            }
        } finally {
            setBusy(false)
        }
    }


    return (
        <div className="mx-auto max-w-[960px] space-y-4 pb-16">
            <ScreenHeader
                eyebrow={t("settings.title")}
                title={t("ci.title")}
                subtitle={t("ci.subtitle")}
                aside={
                    <>
                        {installed && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-positive"><CheckCircle2 size={14} /> {t("ci.available")}</span>}
                        <Button asChild variant="ghost" className="gap-2"><Link href="/settings"><ArrowLeft size={16} /> {t("settings.title")}</Link></Button>
                    </>
                }
            />

            {!electronAvailable && (
                <Panel>
                    <p className="flex items-start gap-2 text-sm text-ink-2">
                        <AlertCircle size={16} className="mt-0.5 shrink-0 text-caution" />
                        {t("ci.desktopOnly")}
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
                    title={<span className="flex items-center gap-2">Steam Workshop {active.source === "workshop" && <span className="text-xs font-semibold text-positive">{t("ci.active")}</span>}</span>}
                    actions={
                        <>
                            <Button variant="ghost" size="sm" disabled={wsBusy} onClick={() => void loadWorkshop()} className="gap-1.5"><RefreshCw size={13} /> {t("ci.refresh")}</Button>
                            <Button variant="outline" size="sm" disabled={!wsAvailable} onClick={() => void openWorkshop()} className="gap-1.5"><ExternalLink size={13} /> {t("ci.browse")}</Button>
                        </>
                    }
                    padded={false}
                >
                    <p className="px-4 pt-3 text-xs text-ink-3">{t("ci.wsHint")}</p>
                    {!wsAvailable && <p className="px-4 py-3 text-sm text-ink-3">{t("ci.noSteam")}</p>}
                    {wsAvailable && wsMods.length === 0 && <p className="px-4 py-3 text-sm text-ink-3">{t("ci.noMods")}</p>}
                    {wsMods.length > 0 && (
                        <ul className="mt-2 divide-y divide-line border-t border-line">
                            {wsMods.map((m) => {
                                const isActive = active.source === "workshop" && active.workshopId === m.id
                                return (
                                    <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="flex flex-wrap items-center gap-2 text-sm">
                                                <span className="truncate font-semibold text-ink-1">{m.title}</span>
                                                {m.isEmMod && <span className="text-xs text-ink-3">{t("ci.schema")}</span>}
                                                {isActive && <span className="text-xs font-semibold text-positive">{t("ci.active")}</span>}
                                                {!m.installed && <span className="text-xs text-ink-3">{t("ci.downloading")}</span>}
                                                {m.needsUpdate && <span className="text-xs text-caution">{t("ci.updatePending")}</span>}
                                            </p>
                                            <p className="mt-0.5 flex items-center gap-3 text-xs text-ink-3">
                                                {typeof m.teams === "number" && <span>{tn("ci.teams", m.teams)}</span>}
                                                {typeof m.players === "number" && <span className="inline-flex items-center gap-1"><Users size={12} /> {tn("ci.players", m.players)}</span>}
                                                {m.author && <span>{t("ci.by", { author: m.author })}</span>}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            {isActive ? (
                                                <>
                                                    <Button variant="outline" size="sm" disabled={wsBusy || !m.installed || !m.isEmMod || m.needsUpdate} onClick={() => void activateWorkshop(m.id)}>{t("ci.useInstalled")}</Button>
                                                    <Button variant="ghost" size="sm" disabled={wsBusy} onClick={() => void switchToCommunitySource()}>{t("ci.deactivate")}</Button>
                                                </>
                                            ) : (
                                                <Button variant="outline" size="sm" disabled={wsBusy || !m.installed || !m.isEmMod || m.needsUpdate} onClick={() => void activateWorkshop(m.id)} className="gap-1.5">
                                                    <Download size={13} /> {t("ci.activate")}
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

            <Panel title={t("ci.import")} padded={false}>
                <div className="divide-y divide-line">
                    {electronAvailable && (
                        <div className="flex items-center justify-between gap-6 px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold text-ink-1">{t("ci.folder")}</p>
                                <p className="text-xs text-ink-3">{t("ci.folderHint")}</p>
                            </div>
                            <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
                                setBusy(true)
                                try {
                                    const text = await window.electron?.mods?.readFolder()
                                    if (text) await applyPayload(text)
                                    else setStatus({ kind: "err", msg: t("ci.noFolder") })
                                } finally { setBusy(false) }
                            }} className="gap-1.5"><FolderOpen size={13} /> {t("ci.chooseFolder")}</Button>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-6 px-4 py-3">
                        <div>
                            <label htmlFor="community-json-file" className="text-sm font-semibold text-ink-1">{t("ci.jsonFile")}</label>
                            <p className="text-xs text-ink-3"><Trans k="ci.jsonHint" tags={{ c: txt => <code>{txt}</code> }} /></p>
                        </div>
                        <input
                            id="community-json-file"
                            aria-label={t("ci.selectJson")}
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
                            <label htmlFor="community-json-paste" className="text-sm font-semibold text-ink-1">{t("ci.paste")}</label>
                            <p className="text-xs text-ink-3">{t("ci.pasteHint")}</p>
                        </div>
                        <Textarea
                            id="community-json-paste"
                            aria-label={t("ci.jsonAria")}
                            maxLength={MAX_MOD_BYTES}
                            value={pasted}
                            onChange={(e) => setPasted(e.target.value)}
                            disabled={busy || !electronAvailable}
                            rows={8}
                            placeholder='{ "players": [...], "teams": [...] }'
                            className="font-mono text-xs"
                        />
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => void applyPayload(pasted)} disabled={busy || !pasted.trim() || !electronAvailable}>{t("ci.preview")}</Button>
                            {installed && (
                                <Button variant="ghost" onClick={() => void onRemove()} disabled={busy} className="gap-1.5 text-negative!">
                                    <Trash2 size={14} /> {t("ci.remove")}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </Panel>

            {preview && (
                <Panel title={t("ci.review")} actions={<span className="text-xs tabular-nums text-ink-3">{preview.counts}</span>}>
                    <p className="text-sm text-ink-1">{preview.author}</p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-3">{t("ci.reviewHint")}</p>
                    <div className="mt-4 flex gap-2">
                        <Button disabled={busy} onClick={() => void installPreview()}>{t("ci.install")}</Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>{t("ci.cancel")}</Button>
                    </div>
                </Panel>
            )}

            {electronAvailable && (
                <Panel title={t("ci.forNew")} padded={false}>
                    <div className="flex flex-wrap gap-2 px-4 py-3">
                        <Button variant="outline" size="sm" disabled={busy || wsBusy} onClick={() => void switchToCommunitySource("none")}>{t("ci.useBase")}</Button>
                        <Button variant="outline" size="sm" disabled={busy || wsBusy} onClick={() => void switchToCommunitySource("community")}>{t("ci.useImported")}</Button>
                        <Button variant="ghost" size="sm" disabled={busy || wsBusy} onClick={() => void restorePrevious()}>{t("ci.restorePrev")}</Button>
                    </div>
                    {modPath && <p className="border-t border-line px-4 py-2 text-xs text-ink-3">{t("ci.storedIn")} <code className="break-all">{modPath}</code></p>}
                </Panel>
            )}
        </div>
    )
}
