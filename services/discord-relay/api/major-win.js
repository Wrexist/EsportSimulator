// POST /api/major-win: a player chose "Announce in Discord" on a Major title.
// Env (Vercel project settings): DISCORD_MAJOR_WEBHOOK, STEAM_PUBLISHER_KEY.

const { validateShare, buildMajorMessage, verifyTicket, createLimiter } = require('../lib/major-win.cjs')

const allow = createLimiter()
const MAX_BODY = 8 * 1024

function readJson(req) {
    if (req.body && typeof req.body === 'object') return Promise.resolve(req.body)
    return new Promise((resolve) => {
        let raw = ''
        req.on('data', chunk => { raw += chunk; if (raw.length > MAX_BODY) { resolve(null); req.destroy() } })
        req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve(null) } })
        req.on('error', () => resolve(null))
    })
}

const reply = (res, status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'method' })
    const webhook = process.env.DISCORD_MAJOR_WEBHOOK
    if (!webhook || !process.env.STEAM_PUBLISHER_KEY) return reply(res, 503, { ok: false, error: 'not_configured' })

    const checked = validateShare(await readJson(req))
    if (!checked.ok) return reply(res, 400, checked)

    const who = await verifyTicket(checked.share.ticket, { key: process.env.STEAM_PUBLISHER_KEY })
    if (!who.ok) return reply(res, who.error === 'steam_unavailable' ? 502 : 403, who)
    if (!allow(who.steamId)) return reply(res, 429, { ok: false, error: 'limited' })

    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    const trophyUrl = /^[a-z0-9.-]+$/i.test(host) ? `https://${host}/major-trophy.png` : undefined
    try {
        const sent = await fetch(webhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(buildMajorMessage(checked.share, { trophyUrl })),
            signal: AbortSignal.timeout(8000),
        })
        if (!sent.ok) return reply(res, 502, { ok: false, error: 'discord_unavailable' })
    } catch { return reply(res, 502, { ok: false, error: 'discord_unavailable' }) }
    return reply(res, 200, { ok: true })
}
