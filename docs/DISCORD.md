# Community Discord

Two automations keep the server moving:

| What | Where it posts | How |
| --- | --- | --- |
| Every Steam announcement and patch note, with @everyone | `#announcements` | `.github/workflows/discord-steam-news.yml` checks the Steam news feed every 15 minutes |
| A player's Major title, when they press **Announce in Discord** | `#major-winners` | Game → `services/discord-relay` → webhook |

## Suggested channels

- **INFO**: `#welcome` (rules + store link), `#announcements` (feed only, members can't post), `#roadmap`
- **COMMUNITY**: `#general`, `#major-winners` (feed only, members react), `#career-stories` (screenshots and runs), `#tactics-and-playbooks`
- **FEEDBACK**: `#bug-reports`, `#suggestions`
- **MODDING**: `#workshop-mods`

For the two feed channels: Edit Channel → Permissions → @everyone → turn off Send Messages, keep Add Reactions on.

## Setup

1. `#announcements` → Edit Channel → Integrations → Webhooks → New Webhook (name it "Esports Manager: FPS", game icon) → Copy URL.
   GitHub → repo Settings → Secrets and variables → Actions → New repository secret `DISCORD_UPDATES_WEBHOOK`.
2. Test it once: Actions → "Discord · Steam updates feed" → Run workflow → tick "Also post the newest announcement again".
3. `#major-winners`: same, then follow `services/discord-relay/README.md`.

The feed's first run only records what's already on Steam, so old news is never re-posted with @everyone.
