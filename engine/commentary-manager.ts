import { GameMap } from "@/types/game"

export type CommentaryType =
    | "MATCH_START"
    | "ROUND_START"
    | "KILL_GENERIC"
    | "KILL_ASSIST"
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

/**
 * Signals available at each kill, used to escalate commentary to the loudest
 * matching template pool (ace > multikill > weapon-specific > utility/headshot
 * > trade > assist > generic). Pure selection — no RNG, so it stays
 * deterministic and unit-testable. Callers (the live-match hook) pass whatever
 * they have; everything is optional.
 */
export interface KillCommentarySignals {
    weaponId?: string
    isHeadshot?: boolean
    isUtility?: boolean
    isTrade?: boolean
    hasAssister?: boolean
    /** Kills this player has racked up in the current round (this kill included). */
    multiKillCount?: number
    /** True when this frag wiped the last standing enemy (a 5-man ace). */
    isAce?: boolean
}

class CommentaryManager {

    private seed: number = 1
    // No-immediate-repeat guard: the last template string we emitted. If the
    // seeded pick lands on the same line twice in a row we deterministically
    // advance one slot, so the showcase feed never prints an identical line
    // back-to-back even when a pool is small.
    private lastTemplate: string | null = null

    /** Set seed for deterministic commentary during a match */
    public setSeed(seed: number): void {
        this.seed = seed
        this.lastTemplate = null
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
        let idx = Math.floor(this.nextRandom() * arr.length)
        // Avoid emitting the exact same line twice in a row (deterministic skip).
        if (arr.length > 1 && arr[idx] === this.lastTemplate) {
            idx = (idx + 1) % arr.length
        }
        this.lastTemplate = arr[idx]
        return arr[idx]
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

    /**
     * Pick the loudest commentary pool that matches a kill's signals. This is
     * the single source of truth that lets an ace / multikill / headshot / nade
     * kill / trade / assisted frag each read like the highlight it is instead of
     * collapsing to one generic line. Pure + deterministic (no RNG here — the
     * RNG only picks a line *within* the chosen pool via generate()).
     */
    public selectKillType(signals: KillCommentarySignals): CommentaryType {
        const weaponId = signals.weaponId?.toLowerCase()

        // Peak moments trump everything.
        if (signals.isAce || signals.multiKillCount === 5) return "ACE"
        if (signals.multiKillCount === 4) return "MULTIKILL_4"
        if (signals.multiKillCount === 3) return "MULTIKILL_3"
        if (signals.multiKillCount === 2) return "MULTIKILL_2"

        // Signature weapons read louder than the generic descriptors.
        if (weaponId === "awp") return "KILL_AWP"
        if (weaponId === "knife") return "KILL_KNIFE"

        // How the frag happened.
        if (signals.isUtility) return "KILL_NADE"
        if (signals.isHeadshot) return "KILL_HS"
        if (signals.isTrade) return "TRADE_KILL"
        if (signals.hasAssister) return "KILL_ASSIST"

        return "KILL_GENERIC"
    }

    /**
     * Convenience wrapper: select the richest kill pool from the available
     * signals and render a line. Keeps highlight-detection in one place so
     * every call site escalates identically.
     */
    public generateKill(signals: KillCommentarySignals, ctx: CommentaryContext): string {
        return this.generate(this.selectKillType(signals), ctx)
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
        "{player} lays out {victim}",
        "{player} tags {victim} and he's down",
        "That's a pick for {player} on {victim}",
        "{player} deletes {victim} off the server",
        "{victim} runs straight into {player}",
        "{player} wins the duel against {victim}",
        "Good read from {player}, {victim} is gone",
        "{player} punishes {victim}'s aggression",
        "{player} cleans up {victim}",
        "{player} sends {victim} back to spectate",
    ],
    KILL_ASSIST: [
        "{player} + {assister} eliminate {victim}",
        "{player} takes out {victim} with help from {assister}",
        "{assister} sets it up, {player} finishes {victim}",
        "Team effort — {assister} chips, {player} closes on {victim}",
        "{player} cleans up {victim} after {assister} does the damage",
        "{assister} and {player} combine to bury {victim}",
    ],
    KILL_HS: [
        "{player} pops {victim}'s head!",
        "CRISP cleanup by {player} on {victim}!",
        "{player} one-taps {victim}!",
        "He's got one button on his mouse! {player} deletes {victim}.",
        "{player} gives {victim} a haircut!",
        "EDSPOT! {player} finds the head.",
        "Bang! {player} clicks {victim}'s head clean off.",
        "{player} with the surgical headshot on {victim}!",
        "Right between the eyes — {player} tags {victim}!",
        "{player} snaps to {victim}'s dome and pulls the trigger!",
    ],
    KILL_AWP: [
        "{player} snipes {victim} across the map!",
        "INHUMAN REACTIONS from {player}!",
        "One shot, one kill. {player} deletes {victim}.",
        "{victim} walks into {player}'s scope.",
        "The Big Green Gun sings! {player} puts down {victim}.",
        "WHAT WAS THAT?! {player} hits the flick!",
        "{player} threads the needle on {victim} with the AWP!",
        "No chance for {victim} — {player} is holding that angle perfectly.",
        "{player} slings it and {victim} evaporates!",
        "Textbook AWP from {player}, {victim} never saw the shot.",
    ],
    KILL_NADE: [
        "{player} blows up {victim} with a grenade!",
        "KOBE! {player} nades {victim}.",
        "{victim} dies to {player}'s HE Grenade.",
        "{player} cooks it perfectly — {victim} caught in the blast!",
        "Chip damage? No, that's a KILL for {player} off the nade!",
        "{player} lobs it and {victim} is gone!",
    ],
    KILL_KNIFE: [
        "{player} humiliates {victim} with a knife!",
        "It's a shank! {player} slices {victim}.",
        "{player} gets close and personal with {victim}!",
        "Someone call the police! {player} just mugged {victim}!",
        "{player} tastes the knife kill on {victim}!",
        "The ultimate disrespect — {player} knifes {victim}!",
    ],
    TRADE_KILL: [
        "{player} instantly trades the kill on {victim}.",
        "{player} re-frags {victim}.",
        "Trade kill comes in from {player}.",
        "No free kills here — {player} trades back through {victim}.",
        "{player} answers immediately, {victim} down.",
        "Perfect trade discipline from {player} on {victim}.",
    ],
    MULTIKILL_2: [
        "{player} finds a double!",
        "Two quick kills for {player}!",
        "{player} with a multi-kill!",
        "{player} is cooking — that's two!",
        "Back-to-back frags for {player}!",
    ],
    MULTIKILL_3: [
        "OHHH TRIPLE KILL for {player}!",
        "{player} is holding the site alone!",
        "{player} is on fire!",
        "HAPPY WITH THE THREE PIECE!",
        "{player} carves out a 3K!",
        "Three down and {player} is not done!",
    ],
    MULTIKILL_4: [
        "4k! {player} is unstoppable!",
        "One away from the ace for {player}!",
        "{player} finds the fourth! IS IT THE ACE?!",
        "QUAD KILL for {player}!",
        "{player} has four and the crowd is on their feet!",
    ],
    ACE: [
        "ACE! {player} wipes the entire team!",
        "POUNDS IT DOWN! {player} GETS THE ACE!",
        "{player} secures the ACE for the highlight reel!",
        "THE BIG APPLE IS HUNGRY AND {player} FEEDS IT!",
        "FIVE! {player} takes the whole server down!",
        "AN ACE FOR THE AGES FROM {player}!",
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
        "The Terrorists close it out.",
        "T side gets the job done.",
        "Attackers break through for the round.",
        "That's a round in the pocket for the Ts.",
        "The offense executes and cashes in.",
        "Ts stack another one on the board.",
        "Momentum swings to the T side.",
        "The Terrorists overwhelm the defense.",
        "Round goes the way of the attackers.",
    ],
    ROUND_WIN_CT: [
        "Round won by Counter-Terrorists.",
        "CTs hold the line.",
        "Defense stands strong.",
        "The Counter-Terrorists lock it down.",
        "CT side shuts the door.",
        "The defense holds firm for the round.",
        "Great hold from the CTs.",
        "Counter-Terrorists deny the site.",
        "The defenders read it perfectly.",
        "CTs put another round on the board.",
        "The retake pays off for the CT side.",
        "Defense wins this exchange.",
    ],
    TIMEOUT: [
        "Time runs out! CTs win.",
        "The clock hits zero. Defense wins.",
        "No execute in time — the CTs take it on the timer.",
    ],
    CLUTCH_WIN: [
        "{player} wins the clutch!",
        "Incredible clutch from {player}!",
        "{player} denies the odds and secures the round!",
        "ICE IN THE VEINS! {player} clutches it!",
        "{player} stands tall and wins it alone!",
    ],
    ECO_WIN: [
        "They win the eco round against full buys!",
        "Huge upset! Pistols beat rifles!",
        "Disaster for the economy, they lost to an eco.",
        "Eco round stolen! The pistols get it done!",
        "Money round gone wrong — beaten on the eco!",
    ]
}

export const commentaryManager = new CommentaryManager()
