"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import type { TeamSaveData } from "@/engine/save-types"
import type { ReviewPageId, ReviewPlayer, ReviewStoryBeat, ReviewTrophy, SeasonReviewView, StoryTone } from "@/lib/season-review-view"
import { weekOfSeasonLabel } from "@/lib/season-review-view"
import { trophyArtFor } from "@/lib/trophy-art"
import { useAppReducedMotion } from "@/lib/reduced-motion"
import { cn } from "@/lib/utils"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { CountryFlag } from "@/components/ui/CountryFlag"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { tokens } from "@/src/design/tokens"
import { MomentFacts, MomentOverline, MomentRule, useReveal, type MomentFact } from "../MomentFrame"

const EASE = [...tokens.motion.easeOutExpo] as [number, number, number, number]

/** What every page reads: the review and the clubs (for crests). */
export interface ReviewContextValue {
    view: SeasonReviewView
    teamOf: (id: string) => TeamSaveData | undefined
    /** A page with a running reveal registers how to finish it at once (Enter finishes before it advances). */
    setFinisher: (owner: ReviewPageId, finish: (() => void) | null) => void
}

export const ReviewContext = createContext<ReviewContextValue | null>(null)
function useReview(): ReviewContextValue {
    const ctx = useContext(ReviewContext)
    if (!ctx) throw new Error("Season review page outside its sequence")
    return ctx
}

const rating2 = (n: number) => n.toFixed(2)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const TONE_TEXT: Record<StoryTone, string> = { gold: "text-gold", positive: "text-positive", negative: "text-negative", neutral: "text-ink-1" }
const TONE_DOT: Record<StoryTone, string> = { gold: "bg-gold", positive: "bg-positive", negative: "bg-negative", neutral: "bg-ink-3" }

/** Page heading: overline, headline (the dialog's name) and one quiet line. */
function PageHead({ id, overline, title, sub, className }: { id: string; overline: ReactNode; title: ReactNode; sub?: ReactNode; className?: string }) {
    const reveal = useReveal()
    return (
        <div className={cn("flex flex-col items-center text-center", className)}>
            <motion.div {...reveal(0)}><MomentOverline>{overline}</MomentOverline></motion.div>
            <motion.h2 {...reveal(0.08, 20)} id={id} className="mt-3 max-w-5xl font-display text-[clamp(44px,5vw,84px)] font-extrabold uppercase leading-[0.88] text-ink-1">
                {title}
            </motion.h2>
            {sub && <motion.p {...reveal(0.2)} className="mt-3 max-w-3xl text-base text-ink-2">{sub}</motion.p>}
        </div>
    )
}

function Card({ children, className, highlight }: { children: ReactNode; className?: string; highlight?: boolean }) {
    return <div className={cn("rounded-lg border bg-panel/90 p-5 text-left", highlight ? "border-gold/60" : "border-line", className)}>{children}</div>
}

function CardLabel({ children }: { children: ReactNode }) {
    return <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</p>
}

function TrophyImage({ kind, size, className, title }: { kind: ReviewTrophy["art"] | "award"; size: number; className?: string; title?: string }) {
    const art = trophyArtFor(kind)
    return <Image src={art.src} alt={title ?? art.label} title={title} width={size} height={size} className={cn("shrink-0 object-contain", className)} />
}

// ---------------------------------------------------------------- 1. your season

function ResultLine({ label, result, tone }: { label: string; result?: SeasonReviewView["club"]["biggestWin"]; tone: "positive" | "negative" }) {
    return (
        <div>
            <CardLabel>{label}</CardLabel>
            {result ? (
                <>
                    <p className="mt-1 flex items-baseline gap-2">
                        <span className={cn("font-display text-[30px] font-bold leading-none tabular-nums", tone === "positive" ? "text-positive" : "text-negative")}>{result.score || `${tone === "positive" ? "+" : "−"}${result.margin}`}</span>
                        <span className="truncate text-sm text-ink-1">vs {result.opponentName}</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-3">{tone === "positive" ? "+" : "−"}{plural(result.margin, "round")} · {weekOfSeasonLabel(result.week)}{result.map ? ` · ${result.map}` : ""}</p>
                </>
            ) : <p className="mt-1 text-sm text-ink-3">None this season</p>}
        </div>
    )
}

export function ClubPage({ headingId }: { headingId: string }) {
    const { view, teamOf } = useReview()
    const reveal = useReveal()
    const club = view.club
    const team = teamOf(club.teamId)
    const majors = club.trophies.filter(t => t.major).length

    const facts: MomentFact[] = []
    if (club.league) facts.push({ label: "League finish", value: club.league.label, hint: `of ${club.league.of} · ${club.league.division}${club.league.split === 2 ? "" : ` · split ${club.league.split}`}` })
    facts.push({ label: "Record", value: `${club.record.wins}–${club.record.losses}`, hint: "Official series won–lost" })
    facts.push({ label: "Titles", value: club.trophies.length, hint: club.trophies.length ? (majors ? plural(majors, "Major") : "Won this season") : "None this season" })
    if (club.tierMove) facts.push({ label: "World tier", value: <span className={club.tierMove.direction === "promoted" ? "text-positive" : "text-negative"}>{club.tierMove.direction === "promoted" ? "Promoted" : "Relegated"}</span>, hint: `${club.tierMove.from} to ${club.tierMove.to}` })
    else if (club.worldTier) facts.push({ label: "World tier", value: club.worldTier, hint: "Held at season end" })

    const best = club.bestPlayer
    const board = club.board
    const boardGood = board && (board.outcome === "EXCEEDED" || board.outcome === "MET")

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-10">
            <motion.div {...reveal(0)} className="mb-5 flex h-24 w-24 items-center justify-center rounded-xl border border-line bg-raised/90">
                <TeamLogoDisplay team={team} size={76} />
            </motion.div>
            <PageHead id={headingId} overline={`Season ${view.season}${view.final ? "" : " so far"} · Your season`} title={club.teamName} />

            {club.trophies.length > 0 && (
                <motion.ul {...reveal(0.3)} className="mt-6 flex max-w-5xl flex-wrap items-end justify-center gap-x-3 gap-y-2" aria-label="Titles won">
                    {club.trophies.map((t, i) => (
                        <li key={`${t.name}-${i}`} className="flex flex-col items-center">
                            <TrophyImage kind={t.art} size={t.major ? 92 : 72} title={`${t.name} (${weekOfSeasonLabel(t.week)})`} className="drop-shadow-lg" />
                        </li>
                    ))}
                </motion.ul>
            )}

            <MomentRule className="mt-6" delay={0.35} />
            <motion.div {...reveal(0.45)} className="mt-6 w-full max-w-5xl">
                <MomentFacts facts={facts} />
            </motion.div>

            <motion.div {...reveal(0.6)} className="mt-5 grid w-full max-w-5xl grid-cols-3 gap-4">
                <Card highlight={!!best}>
                    <CardLabel>Best player</CardLabel>
                    {best ? (
                        <div className="mt-2 flex items-center gap-3">
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-line bg-raised">
                                <PlayerPortrait src={best.portraitPath} seed={best.playerId} alt={best.name} fill className="object-cover object-top" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate font-display text-[28px] font-bold uppercase leading-none text-ink-1">{best.name}</p>
                                <p className="mt-1 text-xs text-ink-3"><span className="font-semibold text-ink-1 tabular-nums">{rating2(best.rating)}</span> rating · {plural(best.maps, "map")} · {best.kills}–{best.deaths}</p>
                                <p className="mt-0.5 text-xs text-ink-3">ADR {best.adr.toFixed(1)}{best.mvps > 0 ? ` · ${plural(best.mvps, "match MVP")}` : ""}</p>
                            </div>
                        </div>
                    ) : <p className="mt-2 text-sm text-ink-3">No official maps for the club this season</p>}
                </Card>
                <Card className="space-y-3">
                    <ResultLine label="Biggest win" result={club.biggestWin} tone="positive" />
                    <ResultLine label="Heaviest defeat" result={club.worstLoss} tone="negative" />
                </Card>
                <Card>
                    <CardLabel>Board verdict</CardLabel>
                    {board ? (
                        <>
                            <p className={cn("mt-1 font-display text-[28px] font-bold uppercase leading-none", boardGood ? "text-positive" : "text-negative")}>{board.label}</p>
                            {board.confidence !== undefined && (
                                <p className="mt-1 text-xs text-ink-3">Confidence <span className="font-semibold tabular-nums text-ink-1">{Math.round(board.confidence)}/100</span>{board.delta !== undefined ? ` (${board.delta >= 0 ? "+" : "−"}${Math.abs(Math.round(board.delta))} at the review)` : ""}</p>
                            )}
                            {board.reasons.length > 0 && (
                                <ul className="mt-2 space-y-1 text-xs text-ink-2">
                                    {board.reasons.slice(0, 3).map(r => <li key={r} className="line-clamp-2">{r}</li>)}
                                </ul>
                            )}
                        </>
                    ) : <p className="mt-2 text-sm text-ink-3">The board did not judge this season</p>}
                </Card>
            </motion.div>
        </div>
    )
}

// ---------------------------------------------------------------- 2. awards

/** MVP and rookie of the year: the winner's card and the real numbers that earned it. */
export function AwardPage({ headingId, award }: { headingId: string; award: "mvp" | "rookie" }) {
    const { view, teamOf } = useReview()
    const reveal = useReveal()
    const reduce = useAppReducedMotion()
    const p = (award === "mvp" ? view.awards.mvp : view.awards.rookie)!
    const team = teamOf(p.teamId)
    const big = award === "mvp"
    const inTop20 = award === "rookie" ? view.awards.top20.find(t => t.playerId === p.playerId)?.rank : undefined

    const facts: MomentFact[] = [
        { label: "Rating", value: rating2(p.rating), hint: `Weighted ${rating2(p.score)}` },
        { label: "Maps", value: p.maps, hint: plural(p.rounds, "round") },
        { label: "K/D", value: p.deaths ? (p.kills / p.deaths).toFixed(2) : String(p.kills), hint: `${p.kills} kills, ${p.deaths} deaths` },
        { label: "ADR", value: p.adr.toFixed(1), hint: "Damage a round" },
    ]
    const extras = [
        p.mvps > 0 ? plural(p.mvps, "match MVP") : null,
        p.trophies > 0 ? plural(p.trophies, "title") : null,
        p.majors > 0 ? plural(p.majors, "Major") : null,
        inTop20 ? `#${inTop20} in the Top 20` : null,
    ].filter((x): x is string => !!x)

    return (
        <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-14 px-10 text-left">
            <motion.div
                initial={reduce ? false : { opacity: 0, x: -60, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: reduce ? 0 : 0.8, ease: EASE }}
                className={cn(
                    "relative shrink-0 overflow-hidden rounded-lg border bg-raised",
                    big ? "h-[min(58vh,500px)] w-[min(44vh,380px)] border-gold/70" : "h-[min(50vh,420px)] w-[min(38vh,320px)] border-gold/50",
                    p.ours && "ring-2 ring-gold/40",
                )}
            >
                <PlayerPortrait src={p.portraitPath} alt={p.name} seed={p.playerId} fill className="object-cover object-top" />
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-ink/95 to-transparent" />
                <div className="absolute bottom-4 left-5">
                    <p className="font-display text-[clamp(48px,5vw,72px)] font-extrabold leading-none tabular-nums text-gold">{rating2(p.rating)}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-2">Season rating</p>
                </div>
            </motion.div>

            <div className="min-w-0 max-w-2xl flex-1">
                <motion.div {...reveal(0.2)} className="flex items-center gap-4">
                    <TrophyImage kind="award" size={big ? 72 : 60} className="drop-shadow-lg" />
                    <MomentOverline>Awards ceremony · {award === "mvp" ? "Player of the season" : "Rookie of the year"}</MomentOverline>
                </motion.div>
                <motion.h2 {...reveal(0.32, 22)} id={headingId} className={cn("mt-3 font-display font-extrabold uppercase leading-[0.86] text-ink-1 [overflow-wrap:anywhere]", big ? "text-[clamp(72px,8vw,136px)]" : "text-[clamp(60px,6.6vw,112px)]")}>
                    {p.name}
                </motion.h2>
                <motion.div {...reveal(0.45)} className="mt-4 flex flex-wrap items-center gap-3 text-lg text-ink-2">
                    {p.nationality && <CountryFlag country={p.nationality} size={24} />}
                    {p.realName && <span>{p.realName}</span>}
                    <span className="text-ink-3">· Age {p.age}</span>
                    <RoleTag role={p.role} className="text-[13px]" />
                </motion.div>
                <motion.div {...reveal(0.52)} className="mt-3 flex items-center gap-2.5 text-base text-ink-1">
                    <TeamLogoDisplay team={team} size={26} />
                    <span className="font-semibold">{p.teamName}</span>
                    {p.ours && <span className="rounded-sm border border-gold/50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gold">Your club</span>}
                </motion.div>
                <MomentRule className="mt-6 max-w-none" delay={0.5} />
                <motion.div {...reveal(0.65)} className="mt-6">
                    <MomentFacts facts={facts} />
                </motion.div>
                {extras.length > 0 && (
                    <motion.p {...reveal(0.8)} className="mt-4 text-sm font-semibold text-gold">{extras.join(" · ")}</motion.p>
                )}
                <motion.p {...reveal(0.85)} className="mt-3 text-xs text-ink-3">
                    {award === "mvp"
                        ? `Best season score of ${view.awards.ranked} players with at least ${view.awards.minMaps} official maps; each map counts at its competition's weight.`
                        : `Best ranked player aged 20 or younger, or in his first season of official maps.`}
                </motion.p>
            </div>
        </div>
    )
}

/** Top 20, revealed from #20 to #1 (Enter shows the rest at once). */
export function Top20Page({ headingId }: { headingId: string }) {
    const { view, setFinisher } = useReview()
    const reduce = useAppReducedMotion()
    const rows = view.awards.top20
    const [shown, setShown] = useState(reduce ? rows.length : 0)

    useEffect(() => {
        if (shown >= rows.length) { setFinisher("top20", null); return }
        setFinisher("top20", () => setShown(rows.length))
        const t = setTimeout(() => setShown(n => n + 1), shown === 0 ? 700 : 110)
        return () => clearTimeout(t)
    }, [shown, rows.length, setFinisher])
    useEffect(() => () => setFinisher("top20", null), [setFinisher])

    const ours = rows.filter(r => r.ours).length
    const visible = (r: ReviewPlayer) => (r.rank ?? 99) > rows.length - shown
    const column = (list: ReviewPlayer[]) => (
        <ol className="space-y-1.5">
            {list.map(r => (
                <motion.li
                    key={r.playerId}
                    initial={false}
                    animate={visible(r) ? { opacity: 1, x: 0 } : { opacity: 0, x: -18 }}
                    transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                    aria-hidden={!visible(r)}
                    className={cn(
                        "flex h-[min(5.2vh,50px)] items-center gap-3 rounded-md border px-3",
                        r.ours ? "border-gold/60 bg-gold/10" : "border-line bg-panel/85",
                    )}
                >
                    <span className={cn("w-10 shrink-0 font-display text-[26px] font-extrabold leading-none tabular-nums", (r.rank ?? 99) <= 3 ? "text-gold" : "text-ink-2")}>{r.rank}</span>
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-sm border border-line bg-raised">
                        <PlayerPortrait src={r.portraitPath} seed={r.playerId} alt="" fill className="object-cover object-top" />
                    </div>
                    <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="truncate text-[15px] font-bold text-ink-1">{r.name}</span>
                        {r.nationality && <CountryFlag country={r.nationality} size={14} />}
                        <span className="truncate text-xs text-ink-3">{r.teamName}</span>
                    </div>
                    {r.ours && <span className="shrink-0 rounded-sm border border-gold/50 px-1 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-gold">Yours</span>}
                    <span className="w-14 shrink-0 text-right font-display text-[22px] font-bold leading-none tabular-nums text-ink-1">{rating2(r.rating)}</span>
                </motion.li>
            ))}
        </ol>
    )

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-10">
            <PageHead
                id={headingId}
                overline={`Awards ceremony · Season ${view.season}`}
                title="Top 20 players"
                sub={`Ranked on official maps (at least ${view.awards.minMaps}), each map weighted by its competition.${ours ? ` ${plural(ours, "of your players", "of your players")} made the list.` : ""}`}
            />
            <div className="mt-7 grid w-full grid-cols-2 gap-x-6">
                {column(rows.filter(r => (r.rank ?? 99) <= 10))}
                {column(rows.filter(r => (r.rank ?? 99) > 10))}
            </div>
            <p className="sr-only" aria-live="polite">{shown >= rows.length ? "Top 20 revealed" : ""}</p>
        </div>
    )
}

// ---------------------------------------------------------------- 3. team of the season

export function TeamOfSeasonPage({ headingId }: { headingId: string }) {
    const { view, teamOf } = useReview()
    const reduce = useAppReducedMotion()
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-10">
            <PageHead id={headingId} overline={`Season ${view.season}`} title="Team of the season" sub="The best AWPer, the best IGL and the three best others on the season ranking." />
            <ul className="mt-8 grid w-full grid-cols-5 gap-4">
                {view.teamOfSeason.map((p, i) => (
                    <motion.li
                        key={p.playerId}
                        initial={reduce ? false : { opacity: 0, y: 36 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.25 + i * 0.12, ease: EASE }}
                        className={cn("overflow-hidden rounded-lg border bg-panel/90", p.ours ? "border-gold/70" : "border-line")}
                    >
                        <div className="relative aspect-[4/5] w-full bg-raised">
                            <PlayerPortrait src={p.portraitPath} seed={p.playerId} alt={p.name} fill className="object-cover object-top" />
                            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-ink/95 to-transparent" />
                            <RoleTag role={p.role} className="absolute left-3 top-3 bg-ink/70" />
                            {p.ours && <span className="absolute right-3 top-3 rounded-sm border border-gold/60 bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-gold">Your club</span>}
                            <p className="absolute bottom-3 left-3 font-display text-[40px] font-extrabold leading-none tabular-nums text-gold">{rating2(p.rating)}</p>
                        </div>
                        <div className="px-4 pb-4 pt-3 text-left">
                            <p className="truncate font-display text-[26px] font-bold uppercase leading-none text-ink-1">{p.name}</p>
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
                                <TeamLogoDisplay team={teamOf(p.teamId)} size={16} />
                                <span className="truncate">{p.teamName}</span>
                            </p>
                            <p className="mt-1.5 text-xs text-ink-3">{plural(p.maps, "map")} · ADR {p.adr.toFixed(1)} · {p.kills}–{p.deaths}</p>
                        </div>
                    </motion.li>
                ))}
            </ul>
        </div>
    )
}

// ---------------------------------------------------------------- 4. records

const CHAMPIONS_SHOWN = 8

export function RecordsPage({ headingId }: { headingId: string }) {
    const { view } = useReview()
    const reveal = useReveal()
    const fell = view.records.filter(r => r.allTime).length
    const champions = view.titles.slice(0, CHAMPIONS_SHOWN)
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-10">
            <PageHead
                id={headingId}
                overline={`Season ${view.season}`}
                title="Records of the season"
                sub={fell ? `${plural(fell, "all-time record")} fell this season.` : "Season bests from every official match."}
            />
            <div className={cn("mt-8 grid w-full gap-5", champions.length ? "grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : "grid-cols-1")}>
                <motion.ul {...reveal(0.3)} className="grid grid-cols-2 gap-4">
                    {view.records.map(r => (
                        <li key={r.key}>
                            <Card highlight={r.allTime || r.ours} className="h-full">
                                <div className="flex items-center justify-between gap-2">
                                    <CardLabel>{r.label}</CardLabel>
                                    {r.allTime && <span className="rounded-sm border border-gold/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-gold">All-time record</span>}
                                </div>
                                <p className="mt-2 font-display text-[52px] font-extrabold leading-none tabular-nums text-ink-1">{r.value}</p>
                                <p className={cn("mt-2 truncate text-base font-semibold", r.ours ? "text-gold" : "text-ink-1")}>{r.holder}{r.holder !== r.teamName ? <span className="font-normal text-ink-3"> · {r.teamName}</span> : null}</p>
                                <p className="mt-0.5 truncate text-xs text-ink-3" title={r.detail}>{r.detail}</p>
                            </Card>
                        </li>
                    ))}
                </motion.ul>
                {champions.length > 0 && (
                    <motion.div {...reveal(0.45)}>
                        <Card className="h-full">
                            <CardLabel>Champions of the season</CardLabel>
                            <ul className="mt-3 space-y-2.5">
                                {champions.map((t, i) => (
                                    <li key={`${t.name}-${i}`} className="flex items-center gap-3">
                                        <TrophyImage kind={t.art} size={34} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-ink-1">{t.name}</p>
                                            <p className={cn("truncate text-xs", t.ours ? "font-semibold text-gold" : "text-ink-3")}>{t.teamName}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {view.titles.length > champions.length && <p className="mt-3 text-xs text-ink-3">and {plural(view.titles.length - champions.length, "more title")}</p>}
                        </Card>
                    </motion.div>
                )}
            </div>
        </div>
    )
}

// ---------------------------------------------------------------- 5. story

function Beat({ beat, delay }: { beat: ReviewStoryBeat; delay: number }) {
    const reveal = useReveal()
    return (
        <motion.li {...reveal(delay, 10)} className="grid grid-cols-[92px_14px_minmax(0,1fr)] items-baseline gap-3">
            <span className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{beat.when ?? ""}</span>
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 translate-y-[-1px] rounded-full", TONE_DOT[beat.tone])} />
            <div className="min-w-0">
                <p className={cn("text-base font-semibold leading-snug", TONE_TEXT[beat.tone])}>{beat.title}</p>
                {beat.detail && <p className="text-xs text-ink-3">{beat.detail}</p>}
            </div>
        </motion.li>
    )
}

export function StoryPage({ headingId }: { headingId: string }) {
    const { view } = useReview()
    const reveal = useReveal()
    const story = view.story!
    if (story.source === "storylines") {
        return (
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-10">
                <PageHead id={headingId} overline={`Season ${view.season} · ${view.club.teamName}`} title="Story of the season" />
                <div className={cn("mt-8 grid w-full gap-4", story.arcs.length > 1 ? "grid-cols-2" : "max-w-3xl grid-cols-1")}>
                    {story.arcs.map((arc, i) => (
                        <motion.div key={`${arc.title}-${i}`} {...reveal(0.25 + i * 0.1)}>
                            <Card className="h-full">
                                <p className="font-display text-[28px] font-bold uppercase leading-none text-ink-1">{arc.title}</p>
                                {arc.summary && <p className="mt-2 text-sm text-ink-2">{arc.summary}</p>}
                                {arc.beats.length > 0 && <ol className="mt-4 space-y-2.5">{arc.beats.map((b, j) => <Beat key={j} beat={b} delay={0.35 + i * 0.1 + j * 0.05} />)}</ol>}
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
        )
    }
    const beats = story.arcs[0]?.beats ?? []
    const split = beats.length > 8 ? Math.ceil(beats.length / 2) : beats.length
    const cols = split < beats.length ? [beats.slice(0, split), beats.slice(split)] : [beats]
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-10">
            <PageHead id={headingId} overline={`Season ${view.season} · ${view.club.teamName}`} title="Story of the season" sub="The season as it happened, week by week." />
            <div className={cn("mt-8 grid w-full gap-x-10", cols.length > 1 ? "grid-cols-2" : "max-w-3xl grid-cols-1")}>
                {cols.map((col, c) => (
                    <ol key={c} className="space-y-3.5">
                        {col.map((b, j) => <Beat key={`${c}-${j}`} beat={b} delay={0.25 + (c * split + j) * 0.05} />)}
                    </ol>
                ))}
            </div>
        </div>
    )
}
