/**
 * Tuning table for the script-v1 round resolver. All values are rating
 * points on the duel scale unless noted: P(A beats B) = logistic((rA - rB) / DUEL_SCALE).
 *
 * Calibrated against the pro-CS2 targets in docs/revamp/AUDIT_2026-10-09.md
 * §3a with the calibration runners (tmp/p2b, scripts/calibrate-engine.ts).
 * Exported as a plain object so calibration sweeps can override values in a
 * scratch process; production code never mutates it.
 */
export const TUNING = {
    /** Logistic scale: a gap of this many points is a 73/27 duel. */
    DUEL_SCALE: 30,
    /** Skill points above the group average that double a player's share of the duels (see impactWeight). */
    STAR_SPREAD: 20,
    /** Rating points per skill point. */
    AIM_PER_SKILL: 0.28,
    /** Per-map spread of a player's day, and of a whole team's day (points, normal). */
    DAY_FORM_SD: 3,
    TEAM_DAY_FORM_SD: 2,
    /** Duel points per 1.0 of capped team-edge difference (split half to each side). */
    EDGE_DUEL_POINTS: 8.5,

    // ── angles ──
    /** Holding a pre-aimed angle against a peeker. */
    HOLD: 7,
    /** Extra for an AWP / scout holding a long angle. */
    AWP_HOLD: 6,
    /** An AWP / scout forced to peek or fight close. */
    AWP_PEEK: 4,
    /** Chance meeting (resolver contact, see contactsUntil): points to the T, who moves with intent. */
    CONTACT_T_EDGE: 3,
    /** Chance meeting before the round's first kill: points to an AWP / scout (scoped in, first shot). */
    CONTACT_AWP_OPEN: 10,
    /** Only meetings with an AWP / scout in them can be the round's opening kill. */
    CONTACT_OPENING_AWP_ONLY: true,
    /** Peeker penalty per extra defender covering the same entrance (max 2). */
    CROSSFIRE: 3,
    /** A holder who got a kill within SPOTTED_SECONDS keeps only this share of the hold. */
    SPOTTED_SECONDS: 8,
    SPOTTED_HOLD: 0,
    /** Per player the attackers outnumber (or are outnumbered by) the holders in a fight (max 3). */
    NUMBERS: 0,
    /**
     * Every duel: per player one team has alive over the other, relative to the
     * smaller side ((a - b) / min(a, b), capped at ±NUMBERS_CAP): 5v4 +¼, 2v1 +1, 3v1 +2.
     */
    NUMBERS_ROUND: 7,
    NUMBERS_CAP: 2,
    // ── saves (see givesUp in simulate.ts) ──
    /**
     * Chance an outnumbered side saves: BASE + PER_DOWN per player down - PER_LEFT
     * per player left beyond the first (1v2 0.28, 1v3 0.43, 2v3 0.15, 2v4 0.30), times the scale below.
     */
    SAVE_BASE: 0.13,
    SAVE_PER_DOWN: 0.15,
    SAVE_PER_LEFT: 0.13,
    /** Save chance when the clock says the round is lost (scaled by urgency). */
    SAVE_CLOCK: 0.4,
    /** Seconds before the last moment (plant / defuse) the clock starts to weigh. */
    SAVE_CLOCK_SECONDS: 12,
    /** Nothing worth keeping (pistols, SMGs on an eco): saves this much less. */
    SAVE_CHEAP: 0.5,
    /** Scale for Ts before a plant (time to play, the plant still wins), early in the round, and CTs on a retake (the bomb clock). */
    SAVE_T: 0.2,
    SAVE_EARLY: 0.24,
    SAVE_RETAKE: 0.9,
    /** Chance the winners catch a saver on the way out: CTs hunting Ts, Ts (guarding the bomb) hunting CTs. */
    EXIT_HUNT_CT: 0.4,
    EXIT_HUNT_T: 0.11,
    /** Seconds of round left for a full hunt chance; the hunter's edge over a running saver. */
    EXIT_ROOM: 25,
    EXIT_EDGE: 10,
    /** Chance a lone site defender facing 3+ attackers falls back to retake. */
    FALLBACK: 0.5,
    /** A blinded player. */
    BLIND: 10,
    /** Eyesight above 70 while holding, per point. */
    EYESIGHT: 0.05,
    /** Split executes hit from two angles: holders lose this much of their hold. */
    SPLIT_HOLD_CUT: 2,

    // ── situations ──
    /** Opening duel: entry (peeker) and reaction (both) per point above 50. */
    ENTRY: 0.08,
    REACTION: 0.05,
    /** Trade duel: trader bonus, + trading per point above 50. */
    TRADE: 10,
    TRADING: 0.08,
    /** The player who just won a duel is exposed to the trade. */
    EXPOSED: 4,
    /** Last alive: clutch per point above 60 and stress resistance per point above 50. */
    CLUTCH: 0.08,
    STRESS: 0.04,
    /**
     * The last player alive against two or more: every angle is theirs to clear
     * alone while the others crossfire and trade, so late man-advantages close
     * out instead of trading down to a 1v1 (1v2 clutches ≈ 13%, 1v3 ≈ 2%).
     * Smaller since team play (crossfire support, NUMBERS_ROUND 7) does part of this.
     */
    CLUTCH_ISOLATE: -12,
    /** A lurker catching a rotator from behind. */
    LURK: 6,
    LURK_CREATIVITY: 0.08,
    /** An aggressive CT push surprises the first T on the route. */
    PUSH_SURPRISE: 6,
    /** Attackers on a rush (or an eco rush) hit before the defence is set. */
    RUSH_SPEED: 2,
    /** Retakers swinging late with the bomb ticking. */
    RUSHED: 3,
    /** High-pressure stage: per point of stress resistance below 60, scaled by stage. */
    PRESSURE: 0.06,
    /** Anti-strat: the opponent knows this player's spots. */
    TARGETED: 6,

    // ── health ──
    /** Per kill this player already made this round (max 3). */
    MULTI_KILL: 5,
    /** Per HP missing. */
    HP_PENALTY: 0.2,
    /** Chance a duel's loser chips the winner: base + close × (1 - P(winner)). */
    CHIP_BASE: 0.3,
    CHIP_CLOSE: 0.6,

    // ── trades ──
    /** Base chance the side that just lost a player trades it (attack / defence / pick). */
    TRADE_HIT: 0.47,
    TRADE_HOLD: 0.34,
    TRADE_PICK: 0.3,
    TRADE_DECAY: 0.57,
    /** Extra trade chance per attacker beyond the defenders' number (they swing together). */
    TRADE_PER_EXTRA: 0.15,
    /** Trade chance kept by the last player alive against two or more. */
    TRADE_LONE: 0.16,

    // ── timing ──
    /** Seconds between new peeks while a site is being taken (clearing angles), and on a rush. */
    HIT_STEP: [3, 6] as [number, number],
    RUSH_STEP: [1.2, 3] as [number, number],
    /** When off-site CTs start rotating, relative to the execute (seconds). */
    ROTATE_INFO: [-2, 1.5] as [number, number],

    // ── utility ──
    FLASH_BASE: 0.25,
    FLASH_PER_GRENADES: 0.004,

    // ── reads ──
    /** CT read edge per 50 points of IGL call-quality difference. */
    READ_IGL: 0.12,
    /** Read edge when your playstyle counters theirs (negative when countered). */
    READ_COUNTER: 0.15,
    READ_RIGHT_BASE: 0.18,
    READ_WRONG_BASE: 0.08,
    /** G1 playbook: added chance the CT reads a fixed T call, per earlier use of that call on this map. */
    PLAYBOOK_READ_PER_REPEAT: 0.1,
    /** Repeats that still add to the read. */
    PLAYBOOK_READ_REPEAT_CAP: 6,
    /** G1 playbook: shift of the T site roll away from a site a fixed CT setup kept stacking (per stack, net of the other site). */
    PLAYBOOK_STACK_ADAPT: 0.03,
    /** Farthest the T site roll moves from 50/50. */
    PLAYBOOK_STACK_ADAPT_CAP: 0.15,

    // ── team factors ──
    /** Duel points per +1.0 round-win probability of a manager regroup (timeout). */
    REGROUP_POINTS_PER_PROB: 50,

    // ── sight engine (sight.ts) ──
    /** CT side bias on the sight engine (replaces CT_BIAS there). */
    SIGHT_CT_BIAS: 5,
    /** CTs before the plant (they defend ground they know; after the plant SIGHT_POST is the T side's). */
    SIGHT_CT_DEFEND: 7,
    /** Share of the aim-skill points that counts on the sight engine (1 = the resolver's). */
    SIGHT_SKILL: 0.75,
    /** Duel points per skill point above the player's team average (the star's swing). */
    SIGHT_STAR: 0.25,
    /** Trade points on the sight engine (replaces TRADE; the trading attribute still counts). */
    SIGHT_TRADE: 2,
    /** When the hitters leave their staging spots, by T strategy (s; fake: when the fake shows). */
    SIGHT_EXEC: { default: [66, 96], execute: [46, 72], split: [56, 82], fake: [40, 56], rush: [0, 0], eco: [60, 85] } as Record<string, [number, number]>,
    /** Mid control: seconds after the map's mid time the Ts walk at the mid CT. */
    SIGHT_MID_DELAY: [8, 28] as [number, number],
    /** Spacing of the waypoints a T follows along a route to the staging spot (map-%). */
    SIGHT_ROUTE_STEP: 8,
    /** Smokes the Ts spend on crossings watched by CT holds on the way out. */
    SIGHT_CROSS_SMOKES: 2,
    /** Chance the Ts take mid early, scaled from the resolver's per-strategy odds. */
    SIGHT_MID_SCALE: 0.6,
    /** When a CT peeks the T AWPer's angle (s). */
    SIGHT_PEEK_AT: [18, 40] as [number, number],
    /** Save scale for CTs facing a planted bomb (the resolver's SAVE_RETAKE). */
    SIGHT_SAVE_RETAKE: 3,
    /** Ts on a site beyond the CTs there that make a rotator wait for the retake instead. */
    SIGHT_LOST_SITE: 2,
    /** A posted T against a retaking CT. */
    SIGHT_POST: 29,
    /** Post edge lost per retaker beyond the Ts alive (angles left open). */
    SIGHT_POST_OPEN: 9,
    /** Seconds a T flushed off a post angle (molotov) takes to set up on it again. */
    SIGHT_REPOST: 4,
    /** Team play: points per mate within SIGHT_SUPPORT_RANGE (map-%) who sees the foe too, up to SIGHT_SUPPORT_CAP mates. */
    SIGHT_SUPPORT: 7,
    SIGHT_SUPPORT_RANGE: 10,
    SIGHT_SUPPORT_CAP: 2,
    /** Skill a supporter needs over the foe to count double (or under it to count for nothing): keeps team play from drowning out skill. */
    SIGHT_SUPPORT_SKILL: 80,
    /** Weight of a supporter with a pistol when the foe has more than a pistol. */
    SIGHT_SUPPORT_PISTOL: 0.4,
    /** Seconds from the fake to the real execute. */
    SIGHT_FAKE_GAP: [10, 16] as [number, number],
    /** Longest sight line that can start a fight (map-%, ≈ 31 m: the pro p90 kill distance). */
    SIGHT_RANGE: 24,
    /**
     * Chance a new sighting becomes a fight, by distance (map-%): ≤ 3, ≤ 6, ≤ 10, ≤ 15, ≤ 20, beyond.
     * Pro contact → kill within 3 s: 78% at 0–4 m, 71% at 4–8 m, 62% at 8–13 m (pro-benchmarks §7).
     */
    SIGHT_ENGAGE: [0.95, 0.9, 0.8, 0.65, 0.5, 0.4] as number[],
    /** Seconds before a pair that let a sighting pass rolls again. */
    SIGHT_RECHECK: 1,
    /** A sighting this close (map-%, ≈ 8 m) that is let pass: whoever walked into it backs off. */
    SIGHT_CLOSE: 6,
    /** Seconds the one who backs off waits out of sight. */
    SIGHT_BACKOFF: 2,
    /** Saving players avoid fights: the engage chance is scaled by this. */
    SIGHT_SAVE_ENGAGE: 0.5,
    /** Seconds standing still before a player counts as holding the angle. */
    SIGHT_SETTLE: 0.6,
    /** Radians either side of where a player faces in which they see an enemy coming (≈ 100°). */
    SIGHT_AWARE: 1.75,
    /** Caught facing away (and not hearing them come). */
    SIGHT_BEHIND: 10,
    /** A walking enemy this close (map-%) is heard: the holder turns to face them. */
    SIGHT_HEAR: 15,
    /** Through a smoke: closer than this (map-%) they hear each other and fight through it. */
    SIGHT_SMOKE_NEAR: 6,
    /** Ts within this walking distance (map-%) of the bomb hear a defuse and go for it. */
    SIGHT_DEFUSE_HEAR: 30,
    /** Planting or defusing when shot at. */
    SIGHT_BUSY: 12,
    /** Sight → kill (s): median, and the median up close (< 4 map-%); lognormal spreads. Pro 0.43 / 0.58 s. */
    SIGHT_KILL_MEDIAN: 0.43,
    SIGHT_KILL_CLOSE: 0.58,
    SIGHT_KILL_SPREAD: 0.9,
    SIGHT_KILL_SPREAD_CLOSE: 1.2,
    /** Points per map-% past a weapon's comfortable range (pistols from 9, SMGs from 11, shotguns from 5). */
    SIGHT_RANGE_PISTOL: 1,
    SIGHT_RANGE_SMG: 0.5,
    SIGHT_RANGE_SHOTGUN: 1.5,
    /** Seconds after a teammate's death in which its killer can be traded (trade points). */
    SIGHT_TRADE_WINDOW: 4,
    /** Seconds after a kill in which the killer is exposed. */
    SIGHT_EXPOSED_SECONDS: 2.5,
    /** A flash blinds whoever faces it within this range (map-%). Extra blind chance over the resolver's. */
    SIGHT_FLASH_RANGE: 14,
    SIGHT_FLASH_BONUS: 0.1,
    /** Ts seen this close to a site centre (two of them, or one in the core) give the CTs the call. */
    SIGHT_SITE_RADIUS: 12,
    SIGHT_SITE_CORE: 7,
    /** Ts within SIGHT_SITE_RADIUS a CT must see at once for the call (one inside the core is enough). */
    SIGHT_CALL_SEEN: 3,
    /** Default staging: map-% short of the route's contact point. */
    SIGHT_STAGE_DEFAULT: 13,
    /** A T waits on a pro waiting spot this close (walking map-%) to their stage on the route, when one is free and out of known angles. */
    SIGHT_STAGE_SPREAD: 12,
    /** Pro holds with at least this share are angles every T knows (they stage out of them and smoke them off), with the geometry holds. */
    SIGHT_KNOWN_ANGLE: 0.03,
    /** Mid control: how far short of the mid CT the takers walk, and how long they stay. */
    SIGHT_MID_BACK: 6,
    SIGHT_MID_HOLD: 8,
    /** A CT peeking the T AWPer walks to this far short of the angle. */
    SIGHT_PEEK_BACK: 10,
    /** Rotators stop this far short of the site centre, then go in after ROTATE_WAIT seconds. */
    SIGHT_ROTATE_STAGE: 9,
    /** A rotator stops at the last spot of the walk in the site cannot see, but no farther out than this (map-%). */
    SIGHT_ROTATE_FAR: 16,
    SIGHT_ROTATE_WAIT: 2,
    /** A lone site CT facing this many hitters on the execute falls back for the retake, with this chance. */
    SIGHT_ANCHOR_HITTERS: 3,
    SIGHT_ANCHOR_FALLBACK: 0.15,
    /** Retakers regroup this far short of the bomb. */
    SIGHT_RETAKE_STAGE: 11,

    // ── side balance ──
    /** CT side bias (points) applied to every CT duel; per-map overrides below. */
    CT_BIAS: 6,
    MAP_CT_BIAS: {} as Record<string, number>,
}
