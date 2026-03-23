import { PlayerSaveData, TeamSaveData, CompletedMatchSaveData } from "@/engine"

export interface SocialPost {
    id: string
    teamId?: string // PHASE 24: Link to team profile
    user: {
        name: string
        handle: string
        avatar: string
        isVerified?: boolean
    }
    content: string
    timestamp: string
    likes: number
    retweets: number
    replies: number
    image?: string
}

const FANS = [
    { name: "CS2 Insider", handle: "@cs2insider", avatar: "CS", verified: true },
    { name: "S1mpleFan", handle: "@goat_enjoyer", avatar: "SF" },
    { name: "HLTV Confirmed", handle: "@HLTVconfirmed", avatar: "H", verified: true },
    { name: "Toxic Player", handle: "@tilt_lord_", avatar: "T" },
    { name: "Tactical Tim", handle: "@strat_god", avatar: "TT" },
    { name: "The Analyst", handle: "@analyst_cs", avatar: "A", verified: true },
]

const WIN_TEMPLATES = [
    "Unreal performance by {team}! They looked completely dominant today. {hashtag}",
    "How did {player} even hit that shot? Pure insanity. {team} on fire! 🔥",
    "GGEZ for {team}. The other guys didn't stand a chance. #CS2",
    "Finally a win for {team}. Hopefully they can keep this momentum going into the Major.",
]

const LOSS_TEMPLATES = [
    "Another loss for {team}. Changes are needed. This roster isn't working. 📉",
    "Bench {player}. Missing every easy shot today. Disastrous performance from {team}.",
    "I've seen silver stacks play better than {team} did on Mirage. Truly tragic.",
    "Pain. Just pain. {team} had it and threw at the last round. #Tilt",
]

const GENERAL_TEMPLATES = [
    "The meta is changing and {team} needs to adapt quickly. #CS2",
    "Seeing rumors about {team} looking for a new tactical coach. Big if true!",
    "Anyone else thinks {player} is the most underrated rifler in the scene right now?",
]

export function generateSocialPosts(
    playerTeam: TeamSaveData | undefined,
    completedMatches: CompletedMatchSaveData[],
    players: PlayerSaveData[]
): SocialPost[] {
    const posts: SocialPost[] = []

    if (!playerTeam) return []

    const followers = playerTeam.followers || 5000
    const engagementBoost = Math.log10(followers) / 2 // Scales engagement with followers

    // 1. Official Team Announcement
    const lastMatch = completedMatches.find(m => m.homeTeamId === playerTeam.id || m.awayTeamId === playerTeam.id)
    if (lastMatch) {
        const isHome = lastMatch.homeTeamId === playerTeam.id
        const playerWon = (isHome && lastMatch.result.homeScore > lastMatch.result.awayScore) ||
            (!isHome && lastMatch.result.awayScore > lastMatch.result.homeScore)

        const scoreString = isHome
            ? `${lastMatch.result.homeScore}-${lastMatch.result.awayScore}`
            : `${lastMatch.result.awayScore}-${lastMatch.result.homeScore}`

        posts.push({
            id: `sp_official_${lastMatch.id}`,
            teamId: playerTeam.id,
            user: {
                name: playerTeam.name,
                handle: `@${playerTeam.name.replace(/\s/g, "").toLowerCase()}`,
                avatar: playerTeam.name.substring(0, 2).toUpperCase(),
                isVerified: true
            },
            content: playerWon
                ? `VICTORY! We take down the match ${scoreString}. Proud of the boys today. #RUN${playerTeam.name.substring(0, 3).toUpperCase()}`
                : `Tough loss today (${scoreString}). We'll be back stronger. GG to the opponents.`,
            timestamp: "2h",
            likes: Math.floor(followers * 0.05 * engagementBoost), // 5% base engagement
            retweets: Math.floor(followers * 0.01 * engagementBoost),
            replies: Math.floor(followers * 0.005 * engagementBoost)
        })

        // 2. Fan Reactions (Performance based)
        const templates = playerWon ? WIN_TEMPLATES : LOSS_TEMPLATES
        const fans = [...FANS].sort(() => Math.random() - 0.5)
        const mvpId = (lastMatch.result as any).mvp
        const mvp = players.find(p => p.id === mvpId)

        for (let i = 0; i < 2; i++) {
            const fan = fans[i]
            let content = templates[Math.floor(Math.random() * templates.length)]
                .replace(/{team}/g, playerTeam.name)
                .replace(/{player}/g, mvp?.nickname || "their carry")
                .replace(/{hashtag}/g, `#${playerTeam.name.replace(/\s/g, "")}`)

            posts.push({
                id: `sp_match_${lastMatch.id}_${i}`,
                user: { name: fan.name, handle: fan.handle, avatar: fan.avatar, isVerified: fan.verified },
                content,
                timestamp: i === 0 ? "1h" : "3h",
                likes: Math.floor(Math.random() * 500 * engagementBoost),
                retweets: Math.floor(Math.random() * 100 * engagementBoost),
                replies: Math.floor(Math.random() * 50 * engagementBoost)
            })
        }
    }

    // 3. Add some general posts
    FANS.slice(3, 5).forEach((fan, i) => {
        const template = GENERAL_TEMPLATES[Math.floor(Math.random() * GENERAL_TEMPLATES.length)]
        posts.push({
            id: `sp_gen_${i}`,
            user: { name: fan.name, handle: fan.handle, avatar: fan.avatar, isVerified: fan.verified },
            content: template.replace(/{team}/g, playerTeam.name).replace(/{player}/g, players[0]?.nickname || "the team"),
            timestamp: "5h",
            likes: Math.floor(Math.random() * 200 * engagementBoost),
            retweets: Math.floor(Math.random() * 50 * engagementBoost),
            replies: Math.floor(Math.random() * 20 * engagementBoost)
        })
    })

    return posts.sort((a, b) => {
        const timeA = a.timestamp.includes('h') ? parseInt(a.timestamp) : 0
        const timeB = b.timestamp.includes('h') ? parseInt(b.timestamp) : 0
        return timeA - timeB
    })
}
