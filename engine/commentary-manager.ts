import { CS2Map } from "@/types/game"

export type CommentaryType =
    | "MATCH_START"
    | "ROUND_START"
    | "KILL_GENERIC"
    | "KILL_HS"
    | "KILL_AWP"
    | "KILL_NADE"
    | "KILL_KNIFE"
    | "TRADE_KILL"
    | "MULTIKILL_2"
    | "MULTIKILL_3"
    | "MULTIKILL_4"
    | "ACE"
    | "PLANT"
    | "DEFUSE"
    | "EXPLODE"
    | "ROUND_WIN_T"
    | "ROUND_WIN_CT"
    | "TIMEOUT"
    | "CLUTCH_WIN"
    | "ECO_WIN"

export interface CommentaryContext {
    player?: string
    victim?: string
    team?: string
    assister?: string
    weapon?: string
    map?: string
    round?: number
    money?: number
}

class CommentaryManager {

    private seed: number = 1

    /** Set seed for deterministic commentary during a match */
    public setSeed(seed: number): void {
        this.seed = seed
    }

    private nextRandom(): number {
        // Simple seeded PRNG (mulberry32)
        this.seed |= 0
        this.seed = (this.seed + 0x6D2B79F5) | 0
        let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    private getRandom(arr: string[]): string {
        return arr[Math.floor(this.nextRandom() * arr.length)]
    }

    private format(text: string, ctx: CommentaryContext): string {
        let out = text
        if (ctx.player) out = out.replace("{player}", ctx.player)
        if (ctx.victim) out = out.replace("{victim}", ctx.victim)
        if (ctx.team) out = out.replace("{team}", ctx.team)
        if (ctx.weapon) out = out.replace("{weapon}", ctx.weapon)
        if (ctx.map) out = out.replace("{map}", ctx.map)
        if (ctx.round) out = out.replace("{round}", ctx.round.toString())
        if (ctx.assister) out = out.replace("{assister}", ctx.assister)
        return out
    }

    public generate(type: CommentaryType, ctx: CommentaryContext): string {
        const templates = COMMENTARY_TEMPLATES[type] || COMMENTARY_TEMPLATES["KILL_GENERIC"]
        const template = this.getRandom(templates)
        return this.format(template, ctx)
    }
}

const COMMENTARY_TEMPLATES: Record<CommentaryType, string[]> = {
    MATCH_START: [
        "The match on {map} is about to begin!",
        "Both teams are loaded into {map}. Glhf!",
        "Atmosphere is electric here on {map} as we get underway.",
        "Pistol round starting on {map}!",
    ],
    ROUND_START: [
        "Round {round} is live.",
        "Freezetime over, round {round} begins.",
        "Both teams moving out for round {round}.",
    ],
    KILL_GENERIC: [
        "{player} eliminates {victim}",
        "{player} takes down {victim}",
        "{player} drops {victim}",
        "{player} finds a frag on {victim}",
        "{victim} gets shut down by {player}",
        "{player} catches {victim} off guard",
        "{player} + {assister} eliminate {victim}",
        "{player} takes out {victim} with help from {assister}"
    ],
    KILL_HS: [
        "{player} pops {victim}'s head!",
        "CRISP cleanup by {player} on {victim}!",
        "{player} one-taps {victim}!",
        "He's got one button on his mouse! {player} deletes {victim}.",
        "{player} gives {victim} a haircut!",
        "EDSPOT! {player} finds the head.",
    ],
    KILL_AWP: [
        "{player} snipes {victim} across the map!",
        "INHUMAN REACTIONS from {player}!",
        "One shot, one kill. {player} deletes {victim}.",
        "{victim} walks into {player}'s scope.",
        "The Big Green Gun sings! {player} puts down {victim}.",
        "WHAT WAS THAT?! {player} hits the flick!",
    ],
    KILL_NADE: [
        "{player} blows up {victim} with a grenade!",
        "KOBE! {player} nades {victim}.",
        "{victim} dies to {player}'s HE Grenade.",
    ],
    KILL_KNIFE: [
        "{player} humiliates {victim} with a knife!",
        "It's a shank! {player} slices {victim}.",
        "{player} gets close and personal with {victim}!",
        "Someone call the police! {player} just mugged {victim}!",
    ],
    TRADE_KILL: [
        "{player} instantly trades the kill on {victim}.",
        "{player} re-frags {victim}.",
        "Trade kill comes in from {player}.",
    ],
    MULTIKILL_2: [
        "{player} finds a double!",
        "Two quick kills for {player}!",
        "{player} with a multi-kill!",
    ],
    MULTIKILL_3: [
        "OHHH TRIPLE KILL for {player}!",
        "{player} is holding the site alone!",
        "{player} is on fire!",
        "HAPPY WITH THE THREE PIECE!",
    ],
    MULTIKILL_4: [
        "4k! {player} is unstoppable!",
        "One away from the ace for {player}!",
        "{player} finds the fourth! IS IT THE ACE?!",
        "QUAD KILL for {player}!",
    ],
    ACE: [
        "ACE! {player} wipes the entire team!",
        "POUNDS IT DOWN! {player} GETS THE ACE!",
        "{player} secures the ACE for the highlight reel!",
        "THE BIG APPLE IS HUNGRY AND {player} FEEDS IT!",
    ],
    PLANT: [
        "Bomb has been planted.",
        "The explosive is set!",
        "Terrorists plant the bomb.",
        "Bomb is down!",
    ],
    DEFUSE: [
        "Bomb has been defused!",
        "CTs secure the round with a defuse.",
        "Defuse successful. Counter-Terrorists win.",
        "Just in time! Bomb defused.",
    ],
    EXPLODE: [
        "The bomb explodes!",
        "Terrorists win by detonation.",
        "Too late for the CTs. Bomb detonates.",
    ],
    ROUND_WIN_T: [
        "Round won by Terrorists.",
        "Ts take the round.",
        "Offense prevails this round.",
    ],
    ROUND_WIN_CT: [
        "Round won by Counter-Terrorists.",
        "CTs hold the line.",
        "Defense stands strong.",
    ],
    TIMEOUT: [
        "Time runs out! CTs win.",
        "The clock hits zero. Defense wins.",
    ],
    CLUTCH_WIN: [
        "{player} wins the clutch!",
        "Incredible clutch from {player}!",
        "{player} denies the odds and secures the round!",
    ],
    ECO_WIN: [
        "They win the eco round against full buys!",
        "Huge upset! Pistols beat rifles!",
        "Disaster for the economy, they lost to an eco.",
    ]
}

export const commentaryManager = new CommentaryManager()
