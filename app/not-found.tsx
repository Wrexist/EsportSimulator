"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Home } from 'lucide-react'
import { t } from '@/lib/i18n'
import { useGameStore } from '@/store/game-store'

export default function NotFound() {
    // Inside a career the way back is Home, not the main menu (CROSSCUT-09).
    // Gated on mount so the server render matches the first client render.
    const inCareer = useGameStore(state => !!state.saveId && !!state.playerTeamId)
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])
    const career = mounted && inCareer
    return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center p-8 text-ink-1">
            <div className="w-full max-w-md rounded-[10px] border border-line-strong bg-panel p-8 text-center">
                <p className="font-display text-6xl font-bold leading-none tabular-nums text-ink-3">404</p>
                <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">{t("nf.kicker")}</p>
                <h1 className="mb-3 font-display text-3xl font-bold uppercase leading-none">{t("nf.title")}</h1>
                <p className="mb-6 text-sm leading-relaxed text-ink-2">
                    {career ? t("nf.bodyCareer") : t("nf.body")}
                </p>
                {/* Client navigation keeps the career in memory: a full reload would drop unsaved progress (START-31). */}
                <Link
                    href={career ? "/" : "/main-menu"}
                    className="inline-flex h-10 items-center gap-2 rounded border border-gold bg-gold px-5 text-sm font-semibold text-gold-on transition-colors hover:border-gold-hover hover:bg-gold-hover"
                >
                    <Home size={15} aria-hidden="true" />
                    {career ? t("shell.backHome") : t("nf.back")}
                </Link>
            </div>
        </div>
    )
}
