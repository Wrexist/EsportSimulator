"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Names that open their page: players, clubs and tournaments. One look
 * everywhere (inherit the text colour, gold on hover) so a name reads as
 * text until you point at it.
 */
const LINK = "rounded-sm hover:text-gold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold"

interface EntityLinkProps {
    id: string | null | undefined
    children: ReactNode
    className?: string
    title?: string
}

export function teamHref(id: string) { return `/team/${encodeURIComponent(id)}` }
export function playerHref(id: string) { return `/player/${encodeURIComponent(id)}` }
export function tournamentHref(id: string) { return `/tournaments/${encodeURIComponent(id)}` }

function make(href: (id: string) => string) {
    return function EntityLink({ id, children, className, title }: EntityLinkProps) {
        if (!id) return <span className={className}>{children}</span>
        return (
            <Link href={href(id)} className={cn(LINK, className)} title={title} onClick={e => e.stopPropagation()}>
                {children}
            </Link>
        )
    }
}

export const TeamLink = make(teamHref)
export const PlayerLink = make(playerHref)
export const TournamentLink = make(tournamentHref)
