# Discord relay (Major winners)

A tiny serverless endpoint that lets the game post a Major title to the
community Discord's `#major-winners` channel without the game ever holding the
webhook URL.

```
game (Announce in Discord) ──ticket + names──▶ /api/major-win ──▶ Steam: is this ticket real?
                                                      └──────────▶ Discord webhook (#major-winners)
```

- Only a player's button press sends anything (`components/moments/ShareMajorToDiscord.tsx`).
- The Electron main process attaches a Steam Web API auth ticket (`electron/community-share.js`).
- The relay checks the ticket with Steam (publisher key), cleans the text, rate
  limits each Steam account, and posts with all mentions disabled.

## Deploy (Vercel)

1. New Vercel project from this repo, **Root Directory** `services/discord-relay`,
   Framework preset **Other**, no build command.
2. Environment variables:
   - `DISCORD_MAJOR_WEBHOOK`: webhook URL of `#major-winners`
   - `STEAM_PUBLISHER_KEY`: Steamworks publisher Web API key
3. Live at `https://esm-discord-relay.vercel.app` (team Delta). Put `https://<project>.vercel.app/api/major-win` in `RELAY_URL`
   (`electron/community-share.js`) and the server invite in
   `DISCORD_INVITE_URL` (`lib/community.ts`). Both empty = the button is hidden.

## Check it

`curl -X POST https://<project>.vercel.app/api/major-win -d '{}'` answers
`400 bad_ticket` when configured, `503 not_configured` when an env var is missing.
