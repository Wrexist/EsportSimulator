"use client"

import type { ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"
import { ArrowLeft, Mail, MailOpen, Heart, Repeat2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PlayerPortrait } from "@/components/ui/asset-images"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { RoleTag } from "@/src/components/ui/RoleTag"
import { useGameStore } from "@/store/game-store"
import type { GameEventSaveData } from "@/engine/save-types"
import {
    answerByWeek, choiceLabel, getEventBody, parseMessageBody, weekLabel,
    type ChoiceLike, type InboxContext, type InboxItem,
} from "./inbox-model"
import { markEventUnread } from "./inbox-actions"
import { ChoiceDecision, DrawerLink, JobOfferDecision, TransferOfferDecision } from "./InboxDecision"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data shape varies by type
type AnyData = Record<string, any>

function MessageBody({ text }: { text: string }) {
    const blocks = parseMessageBody(text)
    return (
        <div className="space-y-3 text-sm leading-relaxed text-ink-2">
            {blocks.map((b, i) =>
                b.kind === "heading" ? <h4 key={i} className="pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-1">{b.text}</h4>
                    : b.kind === "list" ? (
                        <ul key={i} className="list-disc space-y-1 pl-5 marker:text-ink-3">
                            {b.items.map((item, j) => <li key={j}>{item}</li>)}
                        </ul>
                    ) : <p key={i}>{b.text}</p>,
            )}
        </div>
    )
}

/** Who the message is about, with the numbers the decision touches. */
function PlayerStrip({ playerId }: { playerId: string }) {
    const player = useGameStore(s => s.players.find(p => p.id === playerId))
    if (!player) return null
    return (
        <div className="flex items-center gap-3 rounded-md border border-line bg-raised px-3 py-2.5">
            <PlayerPortrait src={player.portraitPath} seed={player.id} alt={player.nickname} size={40} className="h-10 w-10 shrink-0 overflow-hidden rounded" />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink-1">{player.nickname}</span>
                    <RoleTag role={player.role} />
                </div>
                <div className="mt-0.5 flex gap-3 text-xs tabular-nums text-ink-3">
                    <span>Morale <span className="font-semibold text-ink-2">{Math.round(player.morale)}</span></span>
                    <span>Fatigue <span className="font-semibold text-ink-2">{Math.round(player.fatigue)}</span></span>
                    <span>Loyalty <span className="font-semibold text-ink-2">{Math.round(player.loyalty ?? 0)}</span></span>
                </div>
            </div>
            <DrawerLink href={`/player/${player.id}`}>Profile</DrawerLink>
        </div>
    )
}

function ResolvedNote({ event }: { event: GameEventSaveData }) {
    const data = (event.data ?? {}) as AnyData
    if (data.isWithdrawn && !event.selectedChoiceId) return <p className="text-xs font-medium text-ink-3">This is no longer open.</p>
    if (!event.selectedChoiceId || event.selectedChoiceId === "dismiss") return null
    const choice = ((event as { choices?: ChoiceLike[] }).choices ?? []).find(c => c.id === event.selectedChoiceId)
    const text = event.selectedChoiceId === "expired" ? "Expired before it was answered"
        : choice ? `You chose: ${choiceLabel(choice)}`
            : event.selectedChoiceId === "reject" ? "You rejected it"
                : event.selectedChoiceId === "ACCEPT" || event.selectedChoiceId === "accept" ? "You accepted"
                    : event.selectedChoiceId === "DECLINE" ? "You declined" : "Answered"
    return <p className="rounded-md border border-line px-3 py-2 text-xs font-medium text-ink-2">{text}</p>
}

function EventLinks({ event }: { event: GameEventSaveData }) {
    const data = (event.data ?? {}) as AnyData
    const links: [string, string][] = []
    if (data.matchId) links.push([`/match/${data.matchId}/tactics`, "Go to match"])
    else if (data.tournamentId) links.push([`/tournaments/${data.tournamentId}`, "View tournament"])
    if (event.type === "FINANCE" || event.type === "BUDGET_WARNING") links.push(["/finances", "Finances"])
    if (event.type === "SCOUTING_COMPLETE") links.push(["/scouting", "Scouting"])
    if (["AI_SIGNING", "AI_TRANSFER", "ROSTER_UPDATE", "TRANSFER_WINDOW"].includes(event.type as string)) links.push(["/transfers", "Transfer market"])
    if (links.length === 0) return null
    return (
        <div className="flex flex-wrap gap-2">
            {links.map(([href, label]) => <DrawerLink key={href} href={href}>{label}</DrawerLink>)}
        </div>
    )
}

function PaneHeader({ sender, subject, meta, onBack, actions }: {
    sender: string
    subject: string
    meta: string
    onBack?: () => void
    actions?: ReactNode
}) {
    return (
        <header className="flex items-start gap-3 border-b border-line px-6 py-4">
            {onBack && (
                <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to list" className="-ml-2 md:hidden">
                    <ArrowLeft size={16} />
                </Button>
            )}
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{sender}</p>
                <h3 className="mt-1 text-lg font-semibold leading-snug text-ink-1">{subject}</h3>
                <p className="mt-1 text-xs text-ink-3">{meta}</p>
            </div>
            {actions}
        </header>
    )
}

export function InboxReadingPane({ item, ctx, onBack, onOpenAwards }: {
    item: InboxItem | null
    ctx: InboxContext
    onBack?: () => void
    onOpenAwards: (awards: unknown) => void
}) {
    const { budget, acknowledgeEvent } = useGameStore(useShallow(s => ({
        budget: s.teams.find(t => t.id === s.playerTeamId)?.budget ?? 0,
        acknowledgeEvent: s.acknowledgeEvent,
    })))

    if (!item) {
        return <EmptyState icon={Mail} title="Nothing selected" description="Pick a message on the left to read it here." framed={false} className="h-full" />
    }

    if (item.source === "news" && item.news) {
        return (
            <article className="flex h-full min-h-0 flex-col">
                <PaneHeader sender={item.sender} subject={item.subject} meta={weekLabel(item.week, ctx.currentWeek)} onBack={onBack} />
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5"><MessageBody text={item.news.content} /></div>
            </article>
        )
    }

    if (item.source === "social" && item.social) {
        const post = item.social
        return (
            <article className="flex h-full min-h-0 flex-col">
                <PaneHeader sender={post.user?.handle ?? "Social"} subject={post.user?.name ?? "Social post"} meta={weekLabel(item.week, ctx.currentWeek)} onBack={onBack} />
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    <p className="text-sm leading-relaxed text-ink-1">{post.content}</p>
                    <p className="flex gap-4 text-xs tabular-nums text-ink-3">
                        <span className="flex items-center gap-1"><Heart size={13} /> {post.likes.toLocaleString("en-US")}</span>
                        <span className="flex items-center gap-1"><Repeat2 size={13} /> {post.retweets.toLocaleString("en-US")}</span>
                    </p>
                </div>
            </article>
        )
    }

    const event = item.event
    if (!event) return null
    const data = (event.data ?? {}) as AnyData
    const deadline = item.decision ? answerByWeek(event) : null
    const meta = [weekLabel(event.week, ctx.currentWeek), deadline != null ? `Answer by week ${deadline}` : null].filter(Boolean).join(" · ")
    const playerId = data.playerId != null && ctx.rosterIds.has(String(data.playerId)) ? String(data.playerId) : null

    return (
        <article className="flex h-full min-h-0 flex-col">
            <PaneHeader
                sender={item.sender}
                subject={item.subject}
                meta={meta}
                onBack={onBack}
                actions={
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => (event.acknowledged ? markEventUnread(event.id) : acknowledgeEvent(event.id))}
                        className="shrink-0 text-xs"
                    >
                        {event.acknowledged ? <Mail size={14} /> : <MailOpen size={14} />}
                        {event.acknowledged ? "Mark unread" : "Mark read"}
                    </Button>
                }
            />
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <MessageBody text={getEventBody(event, ctx)} />
                {playerId && <PlayerStrip playerId={playerId} />}
                {item.decision === "choice" && <ChoiceDecision event={event} budget={budget} />}
                {item.decision === "transfer_offer" && <TransferOfferDecision event={event} ctx={ctx} />}
                {item.decision === "job_offer" && <JobOfferDecision event={event} />}
                {!item.decision && <ResolvedNote event={event} />}
                {event.type === "MEDIA" && data.proAwards && (
                    <Button variant="outline" onClick={() => onOpenAwards(data.proAwards)}>Open the awards ceremony</Button>
                )}
                {item.decision !== "transfer_offer" && <EventLinks event={event} />}
            </div>
        </article>
    )
}
