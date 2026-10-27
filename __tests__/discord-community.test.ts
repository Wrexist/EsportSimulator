const news = require('../scripts/discord/steam-news.cjs')
const relay = require('../services/discord-relay/lib/major-win.cjs')
const community = require('../electron/community-share.js')
const { contracts } = require('../electron/ipc-policy')

const ticketHex = 'ab'.repeat(120)

describe('Steam news → Discord', () => {
    const item = {
        gid: '1', title: 'Coach the round update', url: 'https://store.steampowered.com/news/app/4326170/view/1',
        feedname: 'steam_community_announcements', date: 1761580800, tags: ['patchnotes'],
        contents: '[img]{STEAM_CLAN_IMAGE}/45/abc.png[/img][h2]New[/h2][list][*]Mid-round calls[*]Anti-strat prep[/list][url=https://example.org/x]Read[/url] <br>[b]Fixed[/b] a [i]bug[/i]',
    }

    test('converts BBCode to Discord markdown', () => {
        const md = news.bbcodeToMarkdown(item.contents)
        expect(md).toContain('**New**')
        expect(md).toContain('• Mid-round calls')
        expect(md).toContain('[Read](https://example.org/x)')
        expect(md).toContain('**Fixed** a *bug*')
        expect(md).not.toMatch(/\[\/?(img|list|h2|\*)\]/)
    })

    test('uses the first image and tags everyone once', () => {
        const msg = news.buildDiscordMessage(item)
        expect(msg.content.startsWith('@everyone')).toBe(true)
        expect(msg.allowed_mentions).toEqual({ parse: ['everyone'] })
        expect(msg.embeds[0].image.url).toBe('https://clan.akamai.steamstatic.com/images//45/abc.png')
        expect(msg.embeds[0].author.name).toMatch(/Patch notes/)
        expect(msg.embeds[0].description).toContain('Read the full post on Steam')
    })

    test('long notes are cut on a line break', () => {
        const long = Array.from({ length: 300 }, (_, i) => `• line number ${i}`).join('\n')
        const out = news.trimTo(long, 1800)
        expect(out.length).toBeLessThanOrEqual(1802)
        expect(out.endsWith('\n…')).toBe(true)
        expect(out.split('\n').slice(-2, -1)[0]).toMatch(/^• line number \d+$/)
    })

    test('keeps only own announcements, oldest first', () => {
        const json = { appnews: { newsitems: [
            { ...item, gid: '3', date: 3 },
            { ...item, gid: 'x', feedname: 'pcgamer' },
            { ...item, gid: '2', date: 2 },
        ] } }
        expect(news.announcementsOf(json).map((i: { gid: string }) => i.gid)).toEqual(['2', '3'])
        expect(news.announcementsOf(null)).toEqual([])
    })
})

describe('Major-win relay', () => {
    const base = { ticket: ticketHex, managerName: 'Isac', teamName: 'Natus Vincera', tournamentName: 'Katowice Major', opponentName: 'Vitality', finalScore: '2-1', season: 3 }

    test('accepts a clean share and builds a mention-free post', () => {
        const r = relay.validateShare(base)
        expect(r.ok).toBe(true)
        const msg = relay.buildMajorMessage(r.share, { trophyUrl: 'https://relay.example/major-trophy.png' })
        expect(msg.allowed_mentions).toEqual({ parse: [] })
        expect(msg.embeds[0].title).toBe('Natus Vincera win the Katowice Major')
        expect(msg.embeds[0].description).toContain('Coach **Isac**')
        expect(msg.embeds[0].description).toContain('**Vitality** 2–1')
        expect(msg.embeds[0].footer.text).toContain('Season 3')
    })

    test('strips pings, markdown and links from player text', () => {
        expect(relay.cleanText('@everyone **boss**', 32)).toBe('everyone boss')
        expect(relay.cleanText('<@123> hi', 32)).toBe('123 hi')
        expect(relay.cleanText('join discord.gg/abc', 32)).toBeNull()
        expect(relay.cleanText('https://evil.example', 32)).toBeNull()
        expect(relay.cleanText('a'.repeat(50), 32)).toHaveLength(32)
    })

    test('a hateful manager name is replaced, a hateful team name is refused', () => {
        const named = relay.validateShare({ ...base, managerName: 'hitler fan' })
        expect(named.ok && named.share.managerName).toBeNull()
        expect(relay.buildMajorMessage(named.share).embeds[0].description).toContain('Their manager')
        expect(relay.validateShare({ ...base, teamName: 'n1gger squad' }).ok).toBe(false)
        expect(relay.validateShare({ ...base, teamName: 'Grapefruit Gaming' }).ok).toBe(true)
    })

    test('refuses bad tickets and shapes', () => {
        expect(relay.validateShare({ ...base, ticket: 'zz' }).ok).toBe(false)
        expect(relay.validateShare([]).ok).toBe(false)
        expect(relay.validateShare({ ...base, finalScore: '2:1; drop' }).share.finalScore).toBeNull()
    })

    test('verifies tickets with Steam', async () => {
        const answer = (params: object) => async () => ({ ok: true, json: async () => ({ response: { params } }) })
        await expect(relay.verifyTicket(ticketHex, { key: 'k', fetchImpl: answer({ result: 'OK', steamid: '76561198000000000' }) })).resolves.toEqual({ ok: true, steamId: '76561198000000000' })
        await expect(relay.verifyTicket(ticketHex, { key: 'k', fetchImpl: answer({ result: 'OK', steamid: '76561198000000000', publisherbanned: true }) })).resolves.toMatchObject({ ok: false })
        await expect(relay.verifyTicket(ticketHex, { key: 'k', fetchImpl: async () => ({ ok: true, json: async () => ({ response: { error: { errorcode: 101 } } }) }) })).resolves.toMatchObject({ ok: false, error: 'bad_ticket' })
        await expect(relay.verifyTicket(ticketHex, {})).resolves.toMatchObject({ ok: false, error: 'not_configured' })
    })

    test('rate limits per account and in total', () => {
        let t = 0
        const allow = relay.createLimiter({ perAccount: 2, total: 3, windowMs: 1000, now: () => t })
        expect([allow('a'), allow('a'), allow('a')]).toEqual([true, true, false])
        expect([allow('b'), allow('c')]).toEqual([true, false])
        t = 1000
        expect(allow('a')).toBe(true)
    })
})

describe('in-game share (main process)', () => {
    const share = { managerName: 'Isac', teamName: 'Team', tournamentName: 'Major', finalScore: '2-0', season: 1 }
    const url = 'https://relay.example/api/major-win'
    const client = (calls: string[]) => ({ auth: { getAuthTicketForWebApi: async (id: string) => { calls.push(id); return { getBytes: () => Buffer.from('ticket'), cancel: () => calls.push('cancel') } } } })

    test('off until the relay URL is set, and always off in the demo', async () => {
        expect(community.isConfigured()).toBe(community.RELAY_URL !== '')
        expect(community.canShare(client([]), { url, demo: true })).toBe(false)
        expect(community.canShare(null, { url })).toBe(false)
        await expect(community.shareMajorWin(client([]), share, { url: '' })).resolves.toBe('unavailable')
    })

    test('sends the ticket and names once, then reports posted', async () => {
        const calls: string[] = []
        const sent: Array<{ url: string; body: Record<string, unknown> }> = []
        const fetchImpl = async (to: string, init: { body: string }) => { sent.push({ url: to, body: JSON.parse(init.body) }); return { ok: true, status: 200 } }
        await expect(community.shareMajorWin(client(calls), { ...share, tournamentName: 'Major A' }, { url, fetchImpl })).resolves.toBe('posted')
        await expect(community.shareMajorWin(client(calls), { ...share, tournamentName: 'Major A' }, { url, fetchImpl })).resolves.toBe('posted')
        expect(sent).toHaveLength(1)
        expect(sent[0].body).toEqual({ ticket: Buffer.from('ticket').toString('hex'), managerName: 'Isac', teamName: 'Team', tournamentName: 'Major A', finalScore: '2-0', season: 1 })
        expect(calls).toEqual([community.TICKET_IDENTITY, 'cancel'])
        expect(community.TICKET_IDENTITY).toBe(relay.TICKET_IDENTITY)
    })

    test('maps relay answers', async () => {
        await expect(community.shareMajorWin(client([]), { ...share, tournamentName: 'Major B' }, { url, fetchImpl: async () => ({ ok: false, status: 429 }) })).resolves.toBe('limited')
        await expect(community.shareMajorWin(client([]), { ...share, tournamentName: 'Major C' }, { url, fetchImpl: async () => { throw new Error('offline') } })).resolves.toBe('failed')
    })

    test('IPC contract only takes the share fields', () => {
        const check = contracts['community-share-major'].check
        expect(check([share])).toBe(true)
        expect(check([{ ...share, webhook: 'x' }])).toBe(false)
        expect(check([{ ...share, finalScore: '2:0' }])).toBe(false)
        expect(check([{ ...share, teamName: '' }])).toBe(false)
        expect(check([share, 1])).toBe(false)
    })
})
