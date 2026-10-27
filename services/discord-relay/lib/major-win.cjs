// Major-win relay: checks a share from the game and turns it into one
// #major-winners post. Pure helpers (tested in __tests__/discord-relay.test.ts);
// api/major-win.js wires them to the request.
//
// Trust model: the webhook URL and the Steam publisher key live only here (as
// Vercel environment variables), never in the game. Every share carries a
// Steam Web API auth ticket, so only a signed-in copy of the game can post,
// and each Steam account is rate limited. Text from the game is untrusted
// (names are typed by players or come from mods): it is cleaned, length
// capped, stripped of links and markdown, and the webhook never pings anyone.

const APP_ID = '4326170'
const TICKET_IDENTITY = 'esm-community'
const GOLD = 0xe8b04b

const LIMITS = { managerName: 32, teamName: 40, tournamentName: 60, opponentName: 40 }
// Slurs and hate terms that turn a name into "A manager" instead of posting it.
const BLOCKED = /n[i1!]gg|f[a@]gg[o0]t|\bf[a@]gs?\b|r[e3]t[a@]rd|\bk[i1]kes?\b|\bch[i1]nks?\b|\bsp[i1]cs?\b|tr[a@]nny|\bn[a@]z[i1]s?\b|h[i1]tl[e3]r|\bc[u*]nts?\b|wh[o0]re|\br[a@]p(e|ist)s?\b/i
const LINKISH = /(https?:|www\.|discord\.(gg|com)|\.[a-z]{2,}\/|\b[a-z0-9-]+\.(com|gg|net|org|io|ru|xyz|tv|me)\b)/i

/** One line of safe display text, or null when nothing usable is left. */
function cleanText(value, max) {
    if (typeof value !== 'string') return null
    let s = value.normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
        .replace(/[@#<>*_~`|\\\[\]()]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    if (!s || LINKISH.test(s)) return null
    if (s.length > max) s = s.slice(0, max).trim()
    return s || null
}

/** Validates a share body. Returns { ok, share } or { ok: false, error }. */
function validateShare(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'bad_body' }
    if (typeof body.ticket !== 'string' || !/^[0-9a-fA-F]{40,4096}$/.test(body.ticket)) return { ok: false, error: 'bad_ticket' }
    const teamName = cleanText(body.teamName, LIMITS.teamName)
    const tournamentName = cleanText(body.tournamentName, LIMITS.tournamentName)
    if (!teamName || !tournamentName) return { ok: false, error: 'bad_names' }
    let managerName = cleanText(body.managerName, LIMITS.managerName)
    if (!managerName || BLOCKED.test(managerName)) managerName = null
    if (BLOCKED.test(teamName) || BLOCKED.test(tournamentName)) return { ok: false, error: 'bad_names' }
    const opponentName = cleanText(body.opponentName, LIMITS.opponentName)
    const finalScore = typeof body.finalScore === 'string' && /^\d{1,2}-\d{1,2}$/.test(body.finalScore) ? body.finalScore : null
    const season = Number.isInteger(body.season) && body.season >= 1 && body.season <= 999 ? body.season : null
    return {
        ok: true,
        share: { ticket: body.ticket, managerName, teamName, tournamentName, opponentName: opponentName && !BLOCKED.test(opponentName) ? opponentName : null, finalScore, season },
    }
}

/** The #major-winners post. Mentions are disabled whatever the text says. */
function buildMajorMessage(share, { trophyUrl } = {}) {
    const coach = share.managerName ? `Coach **${share.managerName}**` : 'Their manager'
    const final = share.opponentName
        ? ` They beat **${share.opponentName}**${share.finalScore ? ` ${share.finalScore.replace('-', '–')}` : ''} in the final.`
        : ''
    const embed = {
        author: { name: 'Major champions' },
        title: `${share.teamName} win the ${share.tournamentName}`,
        description: `${coach} led **${share.teamName}** to a Major title.${final}`,
        color: GOLD,
        footer: { text: share.season ? `Esports Manager: FPS  ·  Season ${share.season}` : 'Esports Manager: FPS' },
        timestamp: new Date().toISOString(),
    }
    if (trophyUrl) embed.thumbnail = { url: trophyUrl }
    return { username: 'Major Champions', allowed_mentions: { parse: [] }, embeds: [embed] }
}

/**
 * Checks the ticket with Steam. Resolves { ok, steamId } for a valid,
 * unbanned owner of the game. fetchImpl is injected for tests.
 */
async function verifyTicket(ticket, { key, fetchImpl = fetch, appId = APP_ID } = {}) {
    if (!key) return { ok: false, error: 'not_configured' }
    const url = `https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/?key=${encodeURIComponent(key)}&appid=${appId}&ticket=${ticket}&identity=${TICKET_IDENTITY}`
    let json
    try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return { ok: false, error: 'steam_unavailable' }
        json = await res.json()
    } catch { return { ok: false, error: 'steam_unavailable' } }
    const p = json?.response?.params
    if (!p || p.result !== 'OK' || !/^\d{17}$/.test(String(p.steamid || ''))) return { ok: false, error: 'bad_ticket' }
    if (p.publisherbanned || p.vacbanned) return { ok: false, error: 'banned' }
    return { ok: true, steamId: String(p.steamid) }
}

/** In-memory limiter: per Steam account and in total, per window. */
function createLimiter({ perAccount = 3, total = 30, windowMs = 60 * 60 * 1000, now = Date.now } = {}) {
    const hits = new Map()
    const all = []
    return function allow(steamId) {
        const t = now()
        while (all.length && t - all[0] >= windowMs) all.shift()
        const mine = (hits.get(steamId) || []).filter(at => t - at < windowMs)
        if (mine.length >= perAccount || all.length >= total) { hits.set(steamId, mine); return false }
        mine.push(t); all.push(t); hits.set(steamId, mine)
        if (hits.size > 5000) hits.delete(hits.keys().next().value)
        return true
    }
}

module.exports = { APP_ID, TICKET_IDENTITY, LIMITS, cleanText, validateShare, buildMajorMessage, verifyTicket, createLimiter }
