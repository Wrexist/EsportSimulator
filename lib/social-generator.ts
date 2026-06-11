import { PlayerSaveData, TeamSaveData, CompletedMatchSaveData, StaffSaveData, MatchSaveData } from "@/engine"
import { SeededRNG } from "@/engine/rng"
import type { SocialPost } from "@/engine/save-types"

export type { SocialPost } from "@/engine/save-types"

export interface SocialFeedInput {
    playerTeam: TeamSaveData | undefined
    teams: TeamSaveData[]
    players: PlayerSaveData[]
    staff: StaffSaveData[]
    completedMatches: CompletedMatchSaveData[]
    scheduledMatches: MatchSaveData[]
    currentWeek: number
    saveId: string
}

// ============ Personas ============
// Casters/desk talent — fictional but realistic scene voices. Fan accounts
// flavor the feed; every post that names a player/team uses REAL game data.
const CASTERS = [
    { name: "Alex \"Machine\" Carter", handle: "@MachineCasts", avatar: "MC", verified: true },
    { name: "Freya \"Valkyrie\" Lund", handle: "@valkyrie_casts", avatar: "VL", verified: true },
    { name: "Scene Report", handle: "@scene_report", avatar: "SR", verified: true },
    { name: "The Analyst Desk", handle: "@analyst_desk", avatar: "AD", verified: true },
]

const FANS = [
    { name: "FPS Insider", handle: "@fpsinsider", avatar: "FI", verified: true },
    { name: "ClutchOrKick", handle: "@clutch_or_kick", avatar: "CK" },
    { name: "Pro Confirmed", handle: "@proConfirmed", avatar: "PC", verified: true },
    { name: "Tilted Ted", handle: "@tilt_lord_", avatar: "TT" },
    { name: "Tactical Tina", handle: "@strat_goddess", avatar: "TN" },
    { name: "Eco Round Eric", handle: "@eco_warrior", avatar: "EE" },
]

// ============ Templates ============
const FAN_WIN = [
    "Unreal performance by {team}! {mvp} looked untouchable today. {hashtag}",
    "How did {mvp} even hit that? {team} on absolute fire right now 🔥",
    "Called it weeks ago — {team} is for real. Book them for the playoffs.",
    "{team} winning and the timeline is eating well tonight. {hashtag}",
]
const FAN_LOSS = [
    "Another loss for {team}. Something has to change in this roster. 📉",
    "{team} had the lead and threw it. I can't keep doing this. #Pain",
    "Rough one for {team} fans. {mvp} fought hard but no support today.",
    "I've seen open-qualifier teams close out maps better than {team} did today.",
]
const FAN_GENERAL = [
    "Anyone else think {player} is the most underrated {role} in the scene right now?",
    "{player} stream later today? The grind never stops for {team}'s {role}.",
    "Unpopular opinion: {team} has the best young core in the region.",
    "If {player} keeps this form up, a top-10 ranking is inevitable.",
]
const CASTER_PREVIEW = [
    "Week {week} preview: {home} vs {away} is the one to watch. Styles make fights. 📺",
    "{home} vs {away} this week — I've got it going the distance. Don't miss it.",
]
const CASTER_RANKINGS = [
    "Power rankings update: {top1} holds #1, with {top2} and {top3} circling. The gap is closing.",
    "Current world top 3: {top1}, {top2}, {top3}. The {top1} era continues — for now.",
]
const COACH_WIN = [
    "Proud of the group today. Preparation showed. On to the next one. 🛠️",
    "Good win — but we stay humble. Plenty to clean up from the VOD.",
]
const COACH_LOSS = [
    "Not our day. We'll own it, review it, and come back sharper.",
    "Tough result. The fix is in the details — back to the server tomorrow.",
]
const PLAYER_WIN = [
    "WE MOVE 🔥 GGs {opp}, good fight. {hashtag}",
    "That's why we grind. Thank you for the support — more to come. 💪",
]
const PLAYER_LOSS = [
    "Not the result we wanted. We go again. ❤️",
    "GGs {opp}. Learning experience — we'll be back.",
]
const RIVAL_WIN = [
    "Victory! {score} over {opp}. The work continues. 🏆",
    "+1 in the books. {score} vs {opp}. Proud of the squad.",
]

const formatRoleName = (role?: string) => {
    const r = (role || "RIFLER").toString().toUpperCase()
    if (r === "AWPER") return "AWPer"
    if (r === "IGL") return "IGL"
    if (r === "ENTRY_FRAGGER" || r === "ENTRY") return "entry fragger"
    if (r === "SUPPORT") return "support"
    return "rifler"
}

const teamHandle = (name: string) => `@${name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 15) || "team"}`
const teamHashtag = (name: string) => `#${name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "GG"}`

const seedFrom = (...parts: Array<string | number>): number => {
    const payload = parts.map(String).join("|")
    let hash = 2166136261
    for (let i = 0; i < payload.length; i++) {
        hash ^= payload.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0) || 1
}

/** Draw without replacement so one feed never shows the same template twice. */
function drawTemplate(rng: SeededRNG, pool: string[], used: Set<string>): string {
    const fresh = pool.filter(t => !used.has(t))
    const pick = fresh.length > 0
        ? fresh[Math.floor(rng.next() * fresh.length)]
        : pool[Math.floor(rng.next() * pool.length)]
    used.add(pick)
    return pick
}

/**
 * Build the weekly social feed from REAL game state: the user's roster and
 * coach post under their own names, rival orgs post their results, casters
 * preview the user's next fixture and tweet world rankings, and fan accounts
 * react to actual scores/MVPs. Deterministic per (saveId, week): the feed is
 * stable across re-opens and refreshes each in-game week.
 */
export function generateSocialPosts(input: SocialFeedInput): SocialPost[] {
    const { playerTeam, teams, players, staff, completedMatches, scheduledMatches, currentWeek, saveId } = input
    if (!playerTeam) return []

    const rng = new SeededRNG(seedFrom(saveId || "local", currentWeek, playerTeam.id))
    // Built without `week`; stamped with the generation week on return.
    const posts: Omit<SocialPost, "week">[] = []
    const usedTemplates = new Set<string>()

    const followers = playerTeam.followers || playerTeam.fanbase || 5000
    const engagementBoost = Math.max(0.5, Math.log10(Math.max(10, followers)) / 2)
    const eng = (base: number) => Math.max(1, Math.floor(base * engagementBoost * (0.7 + rng.next() * 0.6)))

    const roster = playerTeam.rosterIds
        .map(id => players.find(p => p.id === id))
        .filter((p): p is PlayerSaveData => !!p)

    const playerById = new Map(players.map(p => [p.id, p]))
    const teamById = new Map(teams.map(t => [t.id, t]))

    // ---- 1. The user's last match: official post + player post + fan takes ----
    const lastMatch = completedMatches.find(m => m.homeTeamId === playerTeam.id || m.awayTeamId === playerTeam.id)
    if (lastMatch) {
        const isHome = lastMatch.homeTeamId === playerTeam.id
        const oppTeam = teamById.get(isHome ? lastMatch.awayTeamId : lastMatch.homeTeamId)
        const playerWon = (isHome && lastMatch.result.homeScore > lastMatch.result.awayScore) ||
            (!isHome && lastMatch.result.awayScore > lastMatch.result.homeScore)
        const scoreString = isHome
            ? `${lastMatch.result.homeScore}-${lastMatch.result.awayScore}`
            : `${lastMatch.result.awayScore}-${lastMatch.result.homeScore}`
        const mvp = playerById.get(lastMatch.result.mvpPlayerId || "")
        const oppName = oppTeam?.name || "the opponents"

        posts.push({
            id: `sp_official_${lastMatch.id}`,
            teamId: playerTeam.id,
            user: {
                name: playerTeam.name,
                handle: teamHandle(playerTeam.name),
                avatar: playerTeam.name.substring(0, 2).toUpperCase(),
                isVerified: true,
            },
            content: playerWon
                ? `VICTORY! ${scoreString} over ${oppName}.${mvp ? ` MVP: ${mvp.nickname} 🌟` : ""} Proud of the team. ${teamHashtag(playerTeam.name)}`
                : `Tough ${scoreString} loss to ${oppName}. We'll review and come back stronger. GGs.`,
            timestamp: "2h",
            likes: eng(followers * 0.05),
            retweets: eng(followers * 0.01),
            replies: eng(followers * 0.005),
        })

        // The MVP (or a roster leader) posts from their own account.
        const voicePlayer = (playerWon && mvp && roster.some(r => r.id === mvp.id)) ? mvp : roster[0]
        if (voicePlayer) {
            const pool = playerWon ? PLAYER_WIN : PLAYER_LOSS
            posts.push({
                id: `sp_player_${lastMatch.id}_${voicePlayer.id}`,
                user: {
                    name: voicePlayer.nickname,
                    handle: `@${voicePlayer.nickname.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase() || "pro"}`,
                    avatar: voicePlayer.nickname.substring(0, 2).toUpperCase(),
                    isVerified: true,
                },
                content: drawTemplate(rng, pool, usedTemplates)
                    .replace(/{opp}/g, oppName)
                    .replace(/{hashtag}/g, teamHashtag(playerTeam.name)),
                timestamp: "1h",
                likes: eng(followers * 0.08),
                retweets: eng(followers * 0.015),
                replies: eng(followers * 0.008),
            })
        }

        // The team's coach reflects on the result.
        const coach = staff.find(s => s.teamId === playerTeam.id && s.role === "coach")
        if (coach) {
            posts.push({
                id: `sp_coach_${lastMatch.id}`,
                user: {
                    name: `${coach.name} (Coach)`,
                    handle: `@coach_${coach.name.split(" ")[0]?.toLowerCase() || "hq"}`,
                    avatar: coach.name.substring(0, 2).toUpperCase(),
                    isVerified: true,
                },
                content: drawTemplate(rng, playerWon ? COACH_WIN : COACH_LOSS, usedTemplates),
                timestamp: "4h",
                likes: eng(followers * 0.02),
                retweets: eng(followers * 0.004),
                replies: eng(followers * 0.003),
            })
        }

        // Two distinct fan takes on the result (no duplicate templates).
        const fanPool = [...FANS]
        for (let i = 0; i < 2 && fanPool.length > 0; i++) {
            const fan = fanPool.splice(Math.floor(rng.next() * fanPool.length), 1)[0]
            posts.push({
                id: `sp_match_${lastMatch.id}_${i}`,
                user: { name: fan.name, handle: fan.handle, avatar: fan.avatar, isVerified: fan.verified },
                content: drawTemplate(rng, playerWon ? FAN_WIN : FAN_LOSS, usedTemplates)
                    .replace(/{team}/g, playerTeam.name)
                    .replace(/{mvp}/g, mvp?.nickname || roster[0]?.nickname || "their carry")
                    .replace(/{hashtag}/g, teamHashtag(playerTeam.name)),
                timestamp: i === 0 ? "1h" : "3h",
                likes: eng(rng.next() * 500),
                retweets: eng(rng.next() * 100),
                replies: eng(rng.next() * 50),
            })
        }
    }

    // ---- 2. A rival org posts its own recent result ----
    const rivalMatch = completedMatches.find(m =>
        m.homeTeamId !== playerTeam.id && m.awayTeamId !== playerTeam.id &&
        teamById.has(m.homeTeamId) && teamById.has(m.awayTeamId))
    if (rivalMatch) {
        const homeWon = rivalMatch.result.homeScore > rivalMatch.result.awayScore
        const winner = teamById.get(homeWon ? rivalMatch.homeTeamId : rivalMatch.awayTeamId)!
        const loser = teamById.get(homeWon ? rivalMatch.awayTeamId : rivalMatch.homeTeamId)!
        const score = homeWon
            ? `${rivalMatch.result.homeScore}-${rivalMatch.result.awayScore}`
            : `${rivalMatch.result.awayScore}-${rivalMatch.result.homeScore}`
        posts.push({
            id: `sp_rival_${rivalMatch.id}`,
            teamId: winner.id,
            user: {
                name: winner.name,
                handle: teamHandle(winner.name),
                avatar: winner.name.substring(0, 2).toUpperCase(),
                isVerified: true,
            },
            content: drawTemplate(rng, RIVAL_WIN, usedTemplates)
                .replace(/{score}/g, score)
                .replace(/{opp}/g, loser.name),
            timestamp: "6h",
            likes: eng((winner.followers || winner.fanbase || 5000) * 0.04),
            retweets: eng((winner.followers || winner.fanbase || 5000) * 0.008),
            replies: eng((winner.followers || winner.fanbase || 5000) * 0.004),
        })
    }

    // ---- 3. Caster previews the user's next fixture ----
    const nextMatch = scheduledMatches
        .filter(m => (m.homeTeamId === playerTeam.id || m.awayTeamId === playerTeam.id) && m.week >= currentWeek)
        .sort((a, b) => a.week - b.week)[0]
    if (nextMatch) {
        const home = teamById.get(nextMatch.homeTeamId)
        const away = teamById.get(nextMatch.awayTeamId)
        if (home && away) {
            const caster = CASTERS[Math.floor(rng.next() * 2)] // the two play-by-play casters
            posts.push({
                id: `sp_preview_${nextMatch.id}`,
                user: { name: caster.name, handle: caster.handle, avatar: caster.avatar, isVerified: caster.verified },
                content: drawTemplate(rng, CASTER_PREVIEW, usedTemplates)
                    .replace(/{week}/g, String(nextMatch.week))
                    .replace(/{home}/g, home.name)
                    .replace(/{away}/g, away.name),
                timestamp: "8h",
                likes: eng(800),
                retweets: eng(150),
                replies: eng(60),
            })
        }
    }

    // ---- 4. Analyst desk posts the live world top-3 ----
    const ranked = [...teams]
        .filter(t => typeof t.worldRanking === "number" && (t.worldRanking as number) > 0)
        .sort((a, b) => (a.worldRanking || 99) - (b.worldRanking || 99))
    if (ranked.length >= 3) {
        const desk = CASTERS[2 + Math.floor(rng.next() * 2)] // scene report / analyst desk
        posts.push({
            id: `sp_rankings_${currentWeek}`,
            user: { name: desk.name, handle: desk.handle, avatar: desk.avatar, isVerified: desk.verified },
            content: drawTemplate(rng, CASTER_RANKINGS, usedTemplates)
                .replace(/{top1}/g, ranked[0].name)
                .replace(/{top2}/g, ranked[1].name)
                .replace(/{top3}/g, ranked[2].name),
            timestamp: "12h",
            likes: eng(1200),
            retweets: eng(300),
            replies: eng(120),
        })
    }

    // ---- 5. General fan chatter about a real roster player ----
    if (roster.length > 0) {
        const subject = roster[Math.floor(rng.next() * roster.length)]
        const fan = FANS[Math.floor(rng.next() * FANS.length)]
        posts.push({
            id: `sp_gen_${currentWeek}_${subject.id}`,
            user: { name: fan.name, handle: fan.handle, avatar: fan.avatar, isVerified: fan.verified },
            content: drawTemplate(rng, FAN_GENERAL, usedTemplates)
                .replace(/{player}/g, subject.nickname)
                .replace(/{role}/g, formatRoleName(subject.role as string | undefined))
                .replace(/{team}/g, playerTeam.name),
            timestamp: "1d",
            likes: eng(rng.next() * 200),
            retweets: eng(rng.next() * 50),
            replies: eng(rng.next() * 20),
        })
    }

    // ---- 6. Transfer-market buzz about a real listed player ----
    const listed = players.find(p => p.forSale && !playerTeam.rosterIds.includes(p.id))
    if (listed) {
        const owner = teams.find(t => t.rosterIds.includes(listed.id))
        posts.push({
            id: `sp_rumor_${currentWeek}_${listed.id}`,
            user: { name: "FPS Insider", handle: "@fpsinsider", avatar: "FI", isVerified: true },
            content: owner
                ? `Sources: ${owner.name} are open to offers for ${listed.nickname}. Several orgs monitoring the situation. 👀`
                : `Free agent watch: ${listed.nickname} is available and training daily. Smart pickup for a contender?`,
            timestamp: "1d",
            likes: eng(900),
            retweets: eng(250),
            replies: eng(110),
        })
    }

    // Sort newest first (timestamps are "Nh" / "Nd"), then stamp the week.
    const toHours = (t: string) => t.includes("d") ? parseInt(t) * 24 : parseInt(t)
    return posts
        .sort((a, b) => toHours(a.timestamp) - toHours(b.timestamp))
        .map(p => ({ ...p, week: currentWeek }))
}
