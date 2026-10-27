"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
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
        ? `Posted in ${DISCORD_MAJOR_CHANNEL}.`
        : status === "limited" ? "You have shared a lot today. Try again later."
        : status === "failed" ? "Could not post right now. Check your connection and try again."
        : status === "unavailable" ? "Sharing is not available right now."
        : `Posts your manager name, club and final to ${DISCORD_MAJOR_CHANNEL} in the community Discord.`

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
                        {status === "sending" ? "Posting…" : status === "failed" || status === "unavailable" ? "Try again" : "Announce in Discord"}
                    </Button>
                )}
                <Button variant="link" asChild>
                    <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">{posted ? "See it in Discord" : "Join the Discord"}</a>
                </Button>
            </div>
            <p role="status" className="text-xs text-ink-3">{note}</p>
        </motion.div>
    )
}
