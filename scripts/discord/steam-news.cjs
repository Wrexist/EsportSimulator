// Steam announcement → Discord message. Pure helpers, shared by the GitHub
// workflow runner (post-steam-news.cjs) and the tests.
//
// Steam's news API returns announcement bodies as BBCode. Discord embeds take
// a small Markdown subset, so the body is converted, trimmed, and the full
// notes stay one click away on Steam.

const APP_ID = 4326170
const GAME_NAME = 'Esports Manager: FPS'
const STORE_URL = `https://store.steampowered.com/app/${APP_ID}/`
const NEWS_URL = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${APP_ID}&count=10&maxlength=0&feeds=steam_community_announcements`
const HEADER_IMAGE = `https://cdn.akamai.steamstatic.com/steam/apps/${APP_ID}/header.jpg`
const CLAN_IMAGE_BASE = 'https://clan.akamai.steamstatic.com/images/'
// Trophy gold from the game's palette.
const EMBED_COLOR = 0xe8b04b
const DESCRIPTION_LIMIT = 1800

const clanImage = s => s.replace(/\{STEAM_CLAN_IMAGE\}/g, CLAN_IMAGE_BASE)

/** First image in the body, used as the embed's big picture. */
function firstImage(bbcode) {
    const m = /\[img(?:=[^\]]*)?\]\s*([^\[\s]+)\s*\[\/img\]/i.exec(bbcode) || /\[img\s+src="([^"]+)"[^\]]*\]/i.exec(bbcode)
    if (!m) return null
    const url = clanImage(m[1])
    return /^https:\/\//.test(url) ? url : null
}

/** BBCode (and the odd HTML tag) → Discord Markdown. */
function bbcodeToMarkdown(input) {
    let s = clanImage(String(input || '')).replace(/\r\n?/g, '\n')
    // Finished links are parked as tokens so the leftover-tag sweep cannot eat "[text]".
    const links = []
    const park = md => `\u0000${links.push(md) - 1}\u0000`
    s = s.replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, '')
        .replace(/\[img\s[^\]]*\]/gi, '')
        .replace(/\[previewyoutube[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, '')
        .replace(/\[video[^\]]*\][\s\S]*?\[\/video\]/gi, '')
        .replace(/\[h[1-3]\]([\s\S]*?)\[\/h[1-3]\]/gi, (_, t) => `\n**${t.trim()}**\n`)
        .replace(/\[(b|strong)\]([\s\S]*?)\[\/\1\]/gi, '**$2**')
        .replace(/\[(i|em)\]([\s\S]*?)\[\/\1\]/gi, '*$2*')
        .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '__$1__')
        .replace(/\[(s|strike)\]([\s\S]*?)\[\/\1\]/gi, '~~$2~~')
        .replace(/\[url=["']?([^\]"']+)["']?\]([\s\S]*?)\[\/url\]/gi, (_, href, text) => /^https?:\/\//.test(href) ? park(`[${text.trim()}](${href})`) : text)
        .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '$1')
        .replace(/\[\*\]\s*/g, '\n• ')
        .replace(/\[\/\*\]/g, '')
        .replace(/\[\/?(list|olist|ul|ol|p|quote|code|noparse|spoiler|table|tr|td|th|hr|center)[^\]]*\]/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[a-z][^>]*>/gi, '')
        .replace(/\[\/?[a-z0-9]+(?:=[^\]]*)?\]/gi, '')
        .replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)])
    return s.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Cut at a line (or word) boundary so a bullet is never chopped mid-word. */
function trimTo(text, limit) {
    if (text.length <= limit) return text
    const cut = text.slice(0, limit)
    const line = cut.lastIndexOf('\n')
    const end = line > limit * 0.6 ? line : cut.lastIndexOf(' ')
    return cut.slice(0, end > 0 ? end : limit).trimEnd() + '\n…'
}

/** Only the developer's own announcements (not press articles Steam aggregates). */
function announcementsOf(apiJson) {
    const items = apiJson?.appnews?.newsitems
    if (!Array.isArray(items)) return []
    return items
        .filter(i => i && i.feedname === 'steam_community_announcements' && typeof i.gid === 'string' && typeof i.title === 'string')
        .sort((a, b) => (a.date || 0) - (b.date || 0))
}

/** Webhook body: one @everyone line and one embed. */
function buildDiscordMessage(item) {
    const isPatch = Array.isArray(item.tags) && item.tags.includes('patchnotes')
    const body = bbcodeToMarkdown(item.contents)
    const url = /^https:\/\//.test(item.url || '') ? item.url : STORE_URL
    const description = `${trimTo(body, DESCRIPTION_LIMIT)}\n\n**[Read the full post on Steam](${url})**  ·  [Store page](${STORE_URL})`
    return {
        content: `@everyone ${isPatch ? 'A new update is live on Steam.' : 'New announcement from the team.'}`,
        allowed_mentions: { parse: ['everyone'] },
        embeds: [{
            title: item.title.slice(0, 250),
            url,
            description,
            color: EMBED_COLOR,
            author: { name: isPatch ? `${GAME_NAME}  ·  Patch notes` : `${GAME_NAME}  ·  News` },
            image: { url: firstImage(item.contents || '') || HEADER_IMAGE },
            footer: { text: 'Steam' },
            timestamp: new Date((item.date || 0) * 1000).toISOString(),
        }],
    }
}

module.exports = { APP_ID, NEWS_URL, STORE_URL, HEADER_IMAGE, bbcodeToMarkdown, firstImage, trimTo, announcementsOf, buildDiscordMessage }
