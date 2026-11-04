"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import { IS_DEMO } from "@/lib/edition"
import { cleanMajorShare, DISCORD_INVITE_URL, DISCORD_MAJOR_CHANNEL, hasCommunityDiscord } from "@/lib/community"
import type { MajorWinShare, MajorWinShareResult } from "@/types/electron-window"

type Status = "idle" | "sending" | MajorWinShareResult

/**
 * "Announce in Discord" on a Major title. Nothing is sent unless the player
 * presses it; the line under the button says exactly what gets posted.
 * Hidden in the browser build, the demo, offline Steam, or before the
 * community relay is configured.
 */
export function ShareMajorToDiscord({ share, delay = 0 }: { share: MajorWinShare; delay?: number }) {
    const [available, setAvailable] = useState(false)
    const [status, setStatus] = useState<Status>("idle")

    useEffect(() => {
        let live = true
        if (IS_DEMO || !hasCommunityDiscord()) return
        const community = typeof window !== "undefined" ? window.electron?.community : undefined
        community?.canShare().then(ok => { if (live) setAvailable(ok === true) }).catch(() => {})
        return () => { live = false }
    }, [])

    if (!available) return null

    const send = async () => {
        const clean = cleanMajorShare(share)
        if (!clean) { setStatus("unavailable"); return }
        setStatus("sending")
        try {
            setStatus(await window.electron.community!.shareMajorWin(clean))
        } catch {
            setStatus("failed")
        }
    }

    const posted = status === "posted"
    const note = posted
        ? t("share.posted", { channel: DISCORD_MAJOR_CHANNEL })
        : status === "limited" ? t("share.limited")
        : status === "failed" ? t("share.failed")
        : status === "unavailable" ? t("share.unavailable")
        : t("share.note", { channel: DISCORD_MAJOR_CHANNEL })

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay }}
            className="mt-6 flex flex-col items-center gap-2"
        >
            <div className="flex items-center gap-3">
                {!posted && (
                    <Button variant="outline" onClick={send} disabled={status === "sending"}>
                        {status === "sending" ? t("share.posting") : status === "failed" || status === "unavailable" ? t("share.retry") : t("share.announce")}
                    </Button>
                )}
                <Button variant="link" asChild>
                    <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">{posted ? t("share.see") : t("share.join")}</a>
                </Button>
            </div>
            <p role="status" className="text-xs text-ink-3">{note}</p>
        </motion.div>
    )
}
