"use client"

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { motion } from "framer-motion"
import { Eraser, History, PenLine, X } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { useGameStore } from "@/store/game-store"
import { useFocusTrap } from "@/lib/accessibility"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { formatGameCalendarDate, gameCalendarDate } from "@/lib/game-calendar"
import { formatCurrency } from "@/lib/utils-extended"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { TeamLogoImage } from "@/components/ui/asset-images"
import { RELEASE_LABEL, releaseClauseFee } from "@/engine/contract-clauses"
import type { SigningSignature } from "@/engine/moments"
import type { MarketStanding } from "@/engine/transfer-hype"
import { formatWeeksAsYears, type NegotiationState } from "./useNegotiation"

const PAD_W = 360
const PAD_H = 120
/** Ink needed (path length in pad units) before a signature counts. */
const MIN_INK = 70
const INK = "#1d2b64"
const PAPER = "#f4efe4"
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif"
const SCRIPT = "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Snell Roundhand', cursive"
const LAST_SIGNATURE_KEY = "esm:last-signature"

const money = (n: number) => formatCurrency(Math.round(n), "$", false)

type Point = [number, number]

/** Smooth SVG path through each stroke (midpoint quadratic curves). */
function strokesToPath(strokes: Point[][]): string {
    const f = (n: number) => Math.round(n * 10) / 10
    return strokes.map(pts => {
        if (pts.length === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}l0.1 0`
        let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
        for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i][0] + pts[i + 1][0]) / 2
            const my = (pts[i][1] + pts[i + 1][1]) / 2
            d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`
        }
        const last = pts[pts.length - 1]
        return `${d}L${f(last[0])} ${f(last[1])}`
    }).join("")
}

function inkLength(strokes: Point[][]): number {
    let total = 0
    for (const pts of strokes) for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    return total
}

function readLastSignature(): SigningSignature | null {
    try {
        const raw = window.localStorage.getItem(LAST_SIGNATURE_KEY)
        const v = raw ? JSON.parse(raw) as SigningSignature : null
        return v && typeof v.d === "string" && v.d.length > 0 ? v : null
    } catch { return null }
}
function writeLastSignature(sig: SigningSignature): void {
    try { window.localStorage.setItem(LAST_SIGNATURE_KEY, JSON.stringify(sig)) } catch { /* convenience only */ }
}

/** Draw-your-own signature pad: pointer, pen or touch; the strokes become SVG. */
function SignaturePad({ strokes, setStrokes, disabled }: { strokes: Point[][]; setStrokes: (s: Point[][]) => void; disabled: boolean }) {
    const svgRef = useRef<SVGSVGElement>(null)
    const drawing = useRef(false)
    const live = useRef<Point[][]>(strokes)
    live.current = strokes

    const point = (e: ReactPointerEvent<SVGSVGElement>): Point => {
        const r = svgRef.current!.getBoundingClientRect()
        return [((e.clientX - r.left) / r.width) * PAD_W, ((e.clientY - r.top) / r.height) * PAD_H]
    }
    const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
        if (disabled) return
        e.preventDefault()
        svgRef.current?.setPointerCapture(e.pointerId)
        drawing.current = true
        setStrokes([...live.current, [point(e)]])
    }
    const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
        if (!drawing.current) return
        const p = point(e)
        const all = live.current
        const cur = all[all.length - 1]
        const prev = cur[cur.length - 1]
        if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1.2) return
        setStrokes([...all.slice(0, -1), [...cur, p]])
    }
    const onUp = () => { drawing.current = false }

    return (
        <svg
            ref={svgRef}
            viewBox={`0 0 ${PAD_W} ${PAD_H}`}
            role="img"
            aria-label="Signature pad: draw your signature with the mouse, a pen or a finger"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className={cn("block h-[120px] w-full touch-none select-none", disabled ? "cursor-default" : "cursor-crosshair")}
        >
            <path d={strokesToPath(strokes)} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/**
 * The paper contract. Terms the player agreed to are typed up; the manager
 * draws a signature, the player signs, the seal lands and the deal is done.
 */
export function ContractPaper({ n, standing }: { n: NegotiationState; standing?: MarketStanding }) {
    const reduce = useAppReducedMotion()
    const { gameStartDate, currentWeek, saveId } = useGameStore(useShallow(s => ({ gameStartDate: s.gameStartDate, currentWeek: s.currentWeek, saveId: s.saveId })))
    const [strokes, setStrokes] = useState<Point[][]>([])
    const [saved, setSaved] = useState<SigningSignature | null>(null)
    const [useSaved, setUseSaved] = useState(false)
    const [phase, setPhase] = useState<"draw" | "sealing">("draw")
    const dialogRef = useFocusTrap(true, phase === "draw" ? n.cancelSigning : undefined)

    useEffect(() => { setSaved(readLastSignature()) }, [])

    const deal = n.pendingDeal
    const player = n.playerSave
    const club = n.myTeam
    const ink = useMemo(() => inkLength(strokes), [strokes])
    const signature: SigningSignature | null = useSaved && saved ? saved : ink >= MIN_INK ? { d: strokesToPath(strokes), w: PAD_W, h: PAD_H } : null

    if (!deal || !player || !club || typeof document === "undefined") return null

    const date = (week: number) => gameStartDate ? formatGameCalendarDate(gameCalendarDate(gameStartDate, week), { day: "numeric", month: "long", year: "numeric" }) : `Week ${week}`
    const endWeek = currentWeek + deal.duration
    const release = releaseClauseFee(deal.clauses.release, deal.salary)
    const contractNo = `${String(currentWeek).padStart(3, "0")}-${(player.id + (saveId ?? "")).split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36).toUpperCase().slice(0, 6)}`
    const fullName = player.name && player.name !== player.nickname ? player.name : player.nickname
    const initials = club.name.split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase()
    const elite = standing === "ICON" || standing === "STAR"

    const sign = () => {
        if (!signature || phase !== "draw") return
        if (!useSaved) writeLastSignature(signature)
        setPhase("sealing")
        // The player's pen, then the seal; then the deal is booked.
        setTimeout(() => { n.signContract(signature) }, reduce ? 150 : 2300)
    }

    const terms: { title: string; body: React.ReactNode }[] = [
        { title: "Term", body: <>For {deal.duration} weeks ({formatWeeksAsYears(deal.duration)}), from {date(currentWeek)} until {date(endWeek)}.</> },
        { title: "Wage", body: <>The Club pays the Player <b>{money(deal.salary)}</b> every week of the term.</> },
        n.currentTeam
            ? { title: "Transfer", body: <>The Club pays <b>{money(deal.fee)}</b> to {n.currentTeam.name} for the Player&apos;s registration, due on signing.</> }
            : { title: "Free transfer", body: <>The Player joins as a free agent. No transfer fee is due.</> },
        { title: "Release clause", body: deal.clauses.release === "none" ? <>None. No club may take the Player without the Club&apos;s consent.</> : <>{RELEASE_LABEL[deal.clauses.release]}: any club may pay <b>{money(release)}</b> to take the Player.</> },
        { title: "Bonuses", body: deal.clauses.appearanceBonus > 0 || deal.clauses.titleBonus > 0
            ? <>{deal.clauses.appearanceBonus > 0 && <><b>{money(deal.clauses.appearanceBonus)}</b> per official match played. </>}{deal.clauses.titleBonus > 0 && <><b>{money(deal.clauses.titleBonus)}</b> per title won.</>}</>
            : <>None.</> },
    ]

    return createPortal(
        <div className="fixed inset-0 z-modal flex items-center justify-center overflow-y-auto bg-ink/85 p-4 backdrop-blur-[2px]">
            <motion.div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="contract-title"
                initial={reduce ? false : { opacity: 0, y: 40, rotate: -1.5 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{ duration: reduce ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="relative my-auto w-full max-w-[640px] rounded-[3px] text-[#1a1712] shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] outline-hidden"
                style={{ background: PAPER, fontFamily: SERIF, backgroundImage: "radial-gradient(ellipse at 20% 0%, rgb(255 255 255 / 0.55), transparent 60%), radial-gradient(ellipse at 100% 100%, rgb(120 90 40 / 0.10), transparent 55%)" }}
            >
                {/* Gold foil frame */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-2.5 rounded-[2px] border border-[#b8892c]/70" />
                <div aria-hidden="true" className="pointer-events-none absolute inset-3.5 rounded-[2px] border border-[#b8892c]/35" />
                {/* Watermark */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                    <span className="-rotate-[28deg] whitespace-nowrap text-[88px] font-bold uppercase tracking-[0.2em] text-[#1a1712]/[0.035]">Confidential</span>
                </div>

                {phase === "draw" && (
                    <button onClick={n.cancelSigning} className="absolute right-5 top-5 z-10 rounded p-1.5 text-[#1a1712]/50 transition-colors hover:bg-[#1a1712]/5 hover:text-[#1a1712]" aria-label="Put the contract down">
                        <X size={18} />
                    </button>
                )}

                <div className="relative px-10 pb-8 pt-9 sm:px-12">
                    <header className="flex items-start justify-between gap-4 border-b border-[#1a1712]/20 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[#1a1712]/15 bg-white/60">
                                <TeamLogoImage src={(club as { logoPath?: string }).logoPath} alt={club.name} team={club as never} size={30} />
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-[#1a1712]/60">{club.name}</p>
                                <h2 id="contract-title" className="text-2xl font-bold uppercase tracking-[0.12em]">Player Contract</h2>
                            </div>
                        </div>
                        <div className="text-right text-[11px] leading-relaxed text-[#1a1712]/60">
                            <p>No. {contractNo}</p>
                            <p>{date(currentWeek)}</p>
                            {elite && <p className="mt-0.5 font-bold uppercase tracking-[0.2em] text-[#9a6f16]">{standing === "ICON" ? "Icon terms" : "Star terms"}</p>}
                        </div>
                    </header>

                    <p className="mt-4 text-[13.5px] leading-relaxed">
                        This agreement is made between <b>{club.name}</b> (&ldquo;the Club&rdquo;) and <b>{fullName}</b>, known as <b>&ldquo;{player.nickname}&rdquo;</b> (&ldquo;the Player&rdquo;),
                        who joins the Club&apos;s senior roster on the following terms.
                    </p>

                    <ol className="mt-4 space-y-2 text-[13px] leading-relaxed">
                        {terms.map((t, i) => (
                            <li key={t.title} className="grid grid-cols-[22px_112px_minmax(0,1fr)] gap-x-2">
                                <span className="text-[#1a1712]/50">{i + 1}.</span>
                                <span className="font-bold uppercase tracking-[0.06em] text-[11.5px] leading-[1.6]">{t.title}</span>
                                <span>{t.body}</span>
                            </li>
                        ))}
                    </ol>

                    <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2">
                        {/* Manager */}
                        <div>
                            <div className={cn("relative rounded-[2px] border border-dashed", phase === "draw" ? "border-[#1d2b64]/35 bg-white/40" : "border-transparent")}>
                                {useSaved && saved ? (
                                    <svg viewBox={`0 0 ${saved.w} ${saved.h}`} className="block h-[120px] w-full" aria-label="Your saved signature" role="img">
                                        <path d={saved.d} fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                ) : (
                                    <SignaturePad strokes={strokes} setStrokes={setStrokes} disabled={phase !== "draw"} />
                                )}
                                {phase === "draw" && strokes.length === 0 && !useSaved && (
                                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 text-[13px] italic text-[#1d2b64]/45">
                                        <PenLine size={14} aria-hidden="true" /> Sign here
                                    </span>
                                )}
                            </div>
                            <div className="border-t border-[#1a1712]/60 pt-1 text-[11px] uppercase tracking-[0.14em] text-[#1a1712]/60">For the Club · Manager</div>
                            {phase === "draw" && (
                                <div className="mt-1.5 flex flex-wrap gap-3 text-[11.5px]" style={{ fontFamily: "inherit" }}>
                                    {!useSaved && strokes.length > 0 && (
                                        <button type="button" onClick={() => setStrokes([])} className="inline-flex items-center gap-1 text-[#1a1712]/60 underline-offset-2 hover:text-[#1a1712] hover:underline"><Eraser size={12} aria-hidden="true" />Clear</button>
                                    )}
                                    {saved && !useSaved && (
                                        <button type="button" onClick={() => setUseSaved(true)} className="inline-flex items-center gap-1 text-[#1a1712]/60 underline-offset-2 hover:text-[#1a1712] hover:underline"><History size={12} aria-hidden="true" />Use my last signature</button>
                                    )}
                                    {useSaved && (
                                        <button type="button" onClick={() => setUseSaved(false)} className="inline-flex items-center gap-1 text-[#1a1712]/60 underline-offset-2 hover:text-[#1a1712] hover:underline"><PenLine size={12} aria-hidden="true" />Draw a new one</button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Player */}
                        <div>
                            <div className="relative flex h-[122px] items-end pb-3">
                                {phase === "sealing" && (
                                    <motion.span
                                        initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
                                        animate={{ clipPath: "inset(0 0% 0 0)" }}
                                        transition={{ duration: reduce ? 0 : 1.1, delay: reduce ? 0 : 0.25, ease: "easeInOut" }}
                                        className="block truncate text-[40px] leading-none"
                                        style={{ fontFamily: SCRIPT, color: INK }}
                                    >
                                        {player.nickname}
                                    </motion.span>
                                )}
                                {phase === "sealing" && (
                                    <motion.div
                                        aria-hidden="true"
                                        initial={reduce ? false : { opacity: 0, scale: 2.2, rotate: -30 }}
                                        animate={{ opacity: 1, scale: 1, rotate: -12 }}
                                        transition={{ duration: reduce ? 0 : 0.3, delay: reduce ? 0 : 1.45, ease: [0.2, 1.4, 0.4, 1] }}
                                        className="absolute -right-2 -top-1 flex h-[84px] w-[84px] items-center justify-center rounded-full border-[3px] border-[#8f1d1d] text-center text-[#8f1d1d] shadow-[inset_0_0_0_3px_rgb(143_29_29/0.25)]"
                                        style={{ background: "radial-gradient(circle at 35% 30%, rgb(180 40 40 / 0.20), rgb(143 29 29 / 0.10))" }}
                                    >
                                        <div className="leading-tight">
                                            <p className="text-[9px] font-bold uppercase tracking-[0.18em]">Official</p>
                                            <p className="text-[18px] font-bold">{initials}</p>
                                            <p className="text-[9px] font-bold uppercase tracking-[0.18em]">Signed</p>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                            <div className="border-t border-[#1a1712]/60 pt-1 text-[11px] uppercase tracking-[0.14em] text-[#1a1712]/60">The Player · {player.nickname}</div>
                        </div>
                    </div>

                    <div className="mt-7 flex flex-col items-center gap-2" style={{ fontFamily: "var(--font-sans, inherit)" }}>
                        {phase === "draw" ? (
                            <>
                                <Button className="h-11 min-w-[240px] px-8 text-base" disabled={!signature} onClick={sign}>
                                    Sign the contract
                                </Button>
                                <p className="text-[12px] text-[#1a1712]/55" style={{ fontFamily: SERIF }}>
                                    {signature ? "Your signature completes the deal." : "Draw your signature in the box to sign."}
                                </p>
                            </>
                        ) : (
                            <p role="status" className="text-[13px] italic text-[#1a1712]/70" style={{ fontFamily: SERIF }}>{player.nickname} is signing…</p>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>,
        document.body,
    )
}
