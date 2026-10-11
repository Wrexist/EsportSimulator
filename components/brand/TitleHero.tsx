"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { TITLE_HERO_LAYOUT as L } from "./title-hero-layout"
import styles from "./brand.module.css"

/** Max parallax shift in px at the window edge: background, table. */
const DEPTH = { background: { x: 6, y: 4 }, table: { x: 14, y: 9 } }

const tableBox = {
    left: `${L.table.left}%`,
    top: `${L.table.top}%`,
    width: `${L.table.width}%`,
    height: `${L.table.height}%`,
}
const tableTopClip = `polygon(${L.tableTop.map(p => `${p.x}% ${p.y}%`).join(", ")})`
const pingBox = {
    left: `${L.ping.x}%`,
    top: `${L.ping.y}%`,
    width: `${L.ping.size}%`,
    transform: `translate(-50%, -50%) matrix(${L.ping.matrix.join(", ")}, 0, 0)`,
}

/**
 * Title-screen key art: project-made layers pre-rendered by
 * scripts/key-art/render-key-art.ts (graphite stage + a baked radar map on a
 * tilted broadcast table). Live motion is cheap on purpose — a light sweep
 * across the table every ~8 s, a radar ping on site A, and a subtle pointer
 * parallax — and all of it is off under reduced motion.
 */
export function TitleHero({ className }: { className?: string }) {
    const reducedMotion = useAppReducedMotion()
    // The server (and first client render) draw the static variant; motion starts after mount,
    // so reduced-motion users never see a frame of it and hydration always matches.
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const reduced = !mounted || reducedMotion
    const backgroundRef = useRef<HTMLDivElement>(null)
    const tableRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const bg = backgroundRef.current
        const table = tableRef.current
        if (reduced || !bg || !table) return
        const target = { x: 0, y: 0 }
        const current = { x: 0, y: 0 }
        let raf = 0
        const apply = () => {
            bg.style.transform = `translate3d(${(-current.x * DEPTH.background.x).toFixed(2)}px, ${(-current.y * DEPTH.background.y).toFixed(2)}px, 0) scale(1.025)`
            table.style.transform = `translate3d(${(-current.x * DEPTH.table.x).toFixed(2)}px, ${(-current.y * DEPTH.table.y).toFixed(2)}px, 0)`
        }
        // Ease toward the pointer, then stop: no frames are spent while the pointer rests.
        const step = () => {
            current.x += (target.x - current.x) * 0.08
            current.y += (target.y - current.y) * 0.08
            apply()
            raf = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) > 0.002 ? requestAnimationFrame(step) : 0
        }
        const onMove = (e: PointerEvent) => {
            target.x = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth) * 2 - 1))
            target.y = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight) * 2 - 1))
            if (!raf) raf = requestAnimationFrame(step)
        }
        window.addEventListener("pointermove", onMove, { passive: true })
        return () => {
            window.removeEventListener("pointermove", onMove)
            if (raf) cancelAnimationFrame(raf)
            bg.style.transform = ""
            table.style.transform = ""
        }
    }, [reduced])

    return (
        <div aria-hidden="true" className={cn(styles.hero, className)} data-motion={reduced ? "reduced" : "full"}>
            <div className={styles.stage}>
                <div ref={backgroundRef} className={cn(styles.layer, styles.background, !reduced && styles.moving)}>
                    <Image src={L.stage.src} alt="" fill priority sizes="100vw" draggable={false} />
                </div>
                <div ref={tableRef} className={cn(styles.table, !reduced && styles.moving)} style={tableBox}>
                    <Image src={L.table.src} alt="" fill priority sizes="50vw" draggable={false} />
                    {!reduced && (
                        <div className={styles.sweepClip} style={{ clipPath: tableTopClip }}>
                            <div className={styles.sweep} />
                        </div>
                    )}
                    <div className={styles.ping} style={pingBox}>
                        {reduced ? (
                            <span className={styles.ringStatic} />
                        ) : (
                            <>
                                <span className={styles.ring} />
                                <span className={styles.ring} />
                            </>
                        )}
                        <span className={styles.pingCore} />
                    </div>
                </div>
            </div>
            <div className={cn(styles.layer, styles.scanlines)} />
            <div className={cn(styles.layer, styles.vignette)} />
            <div className={cn(styles.layer, styles.menuShade)} />
        </div>
    )
}
