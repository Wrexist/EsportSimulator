// "Announce in Discord" for a Major title. The game never holds the Discord
// webhook: it sends the share to the community relay (services/discord-relay)
// with a Steam Web API auth ticket, and the relay posts to #major-winners.
// Only runs when the player presses the button; nothing is sent otherwise.

// Deployed relay endpoint. Empty = feature off (the button is not shown).
const RELAY_URL = '';
// Must match TICKET_IDENTITY in services/discord-relay/lib/major-win.cjs.
const TICKET_IDENTITY = 'esm-community';
const FIELDS = ['managerName', 'teamName', 'tournamentName', 'opponentName', 'finalScore', 'season'];

// One post per title per session, even if the button is pressed again.
const posted = new Set();

const isConfigured = (url = RELAY_URL) => /^https:\/\/[a-z0-9.-]+\/api\/major-win$/i.test(url);

function canShare(client, { demo = false, url = RELAY_URL } = {}) {
    return !demo && isConfigured(url) && typeof client?.auth?.getAuthTicketForWebApi === 'function';
}

/** Resolves 'posted' | 'limited' | 'failed' | 'unavailable'. */
async function shareMajorWin(client, share, { demo = false, url = RELAY_URL, fetchImpl = fetch, log = () => {} } = {}) {
    if (!canShare(client, { demo, url })) return 'unavailable';
    const key = `${share.season ?? ''}|${share.tournamentName}`;
    if (posted.has(key)) return 'posted';
    let ticket;
    try {
        ticket = await client.auth.getAuthTicketForWebApi(TICKET_IDENTITY, 10);
    } catch (e) {
        log(`[Community] Steam ticket failed: ${e?.message || e}`);
        return 'failed';
    }
    try {
        const body = { ticket: ticket.getBytes().toString('hex') };
        for (const field of FIELDS) if (share[field] !== undefined && share[field] !== null) body[field] = share[field];
        const res = await fetchImpl(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        });
        if (res.ok) { posted.add(key); return 'posted'; }
        log(`[Community] Relay answered ${res.status}`);
        return res.status === 429 ? 'limited' : 'failed';
    } catch (e) {
        log(`[Community] Relay unreachable: ${e?.message || e}`);
        return 'failed';
    } finally {
        try { ticket.cancel(); } catch (_) { /* already released */ }
    }
}

module.exports = { RELAY_URL, TICKET_IDENTITY, FIELDS, isConfigured, canShare, shareMajorWin };
