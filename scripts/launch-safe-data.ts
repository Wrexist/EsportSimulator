#!/usr/bin/env tsx
/**
 * Launch-safety pass over the shipped snapshot:
 *
 *  1. NAMES — replace every still-recognisable player handle (transformNickname
 *     only leet-swapped a char, so "apEX"->"axpEX", "ZywOo"->"SyvOo" stayed
 *     obvious) with a fully original premiumPlayerHandle(id). Deterministic +
 *     de-duplicated.
 *
 *  2. PORTRAITS — the baked portrait pool contains ~50 AI images wearing REAL
 *     esports-org jerseys / sponsor logos (FaZe, NAVI, MIBR, Monte, M80, paiN,
 *     PARIVISION, BC Game, 1xBet, Vavada, coinbase, Nike, adidas, ...). We prune
 *     the pool to the clean plain-kit portraits only, repoint every player to a
 *     clean portrait, and delete the branded files so they never ship.
 *
 * Idempotent-ish: re-running repoints from the already-clean pool. Revert with
 * `git checkout` of players.json + portrait-pool.ts + the deleted assets.
 */
import fs from "node:fs"
import path from "node:path"
import { fnv1aHash } from "../lib/safe-branding/portrait-features"
import { premiumPlayerHandle } from "../lib/safe-branding/name-transform"
import { PORTRAIT_POOL } from "../lib/safe-branding/portrait-pool"

const ROOT = process.cwd()
const PLAYERS = path.join(ROOT, "public/data/snapshot/players.json")
const POOL_TS = path.join(ROOT, "lib/safe-branding/portrait-pool.ts")

// Portraits carrying real org / sponsor branding (from the 4-sheet visual
// audit in scripts/audit-portrait-branding.tsx). Conservative — borderline
// chest emblems are cut too; over-cutting only reduces variety.
const BRANDED = new Set<string>([
    // second-pass misses (subtle chest/hood logos caught after re-render)
    "/assets/teams/b8/players/headtr7ck.png",
    "/assets/teams/bc_kamera/players/mutiriz.png",
    "/assets/teams/emperiuz/players/khelo.png",
    "/assets/teams/b8/players/s1zsi.png",
    "/assets/teams/bc_kamera/players/araqornn.png",
    "/assets/teams/bc_kamera/players/crasy.png",
    "/assets/teams/bc_kamera/players/electronik.png",
    "/assets/teams/bc_kamera/players/s7mple.png",
    "/assets/teams/cantury_rugues/players/devike.png",
    "/assets/teams/cantury_rugues/players/rxain.png",
    "/assets/teams/cantury_rugues/players/zirah.png",
    "/assets/teams/e81ium/players/zlaxs.png",
    "/assets/teams/e81ium/players/zvisher.png",
    "/assets/teams/emperiuz/players/novay.png",
    "/assets/teams/emperiuz/players/zkullz.png",
    "/assets/teams/estroflux/players/rxyu.png",
    "/assets/teams/furea/players/fxallen.png",
    "/assets/teams/furea/players/yxuurih.png",
    "/assets/teams/gamar_laogue/players/znax.png",
    "/assets/teams/hatuol/players/dukefizzura.png",
    "/assets/teams/hommerheads/players/qafolo.png",
    "/assets/teams/iurura/players/vikadia.png",
    "/assets/teams/k_dwo/players/heawyqod.png",
    "/assets/teams/lyniage/players/n7zsim.png",
    "/assets/teams/mbrix_espurts/players/lns.png",
    "/assets/teams/moyzenor/players/zpinx.png",
    "/assets/teams/nados_vyncero/players/ixm.png",
    "/assets/teams/nave_enveders/players/kairne.png",
    "/assets/teams/nrg/players/br8.png",
    "/assets/teams/nrg/players/nitr8.png",
    "/assets/teams/pezsyan_aa/players/cwem.png",
    "/assets/teams/pezsyan_aa/players/hallserc.png",
    "/assets/teams/pezsyan_aa/players/jxt.png",
    "/assets/teams/pezsyan_aa/players/nikx.png",
    "/assets/teams/pezsyan_aa/players/qrim.png",
    "/assets/teams/phantum/players/tn7r.png",
    "/assets/teams/phenatic/players/mzaden.png",
    "/assets/teams/piriveseon/players/sweih.png",
    "/assets/teams/redex_wolvez/players/daw1deus.png",
    "/assets/teams/sdengal/players/pziriajr.png",
    "/assets/teams/sdengal/players/wzm.png",
    "/assets/teams/thaia_nomads/players/kobrasera.png",
    "/assets/teams/tide/players/nzaf.png",
    "/assets/teams/tide/players/uzltimate.png",
    "/assets/teams/tide/players/ziuhy.png",
    "/assets/teams/toroaia/players/sero.png",
    "/assets/teams/valcunry/players/kyxzan.png",
    "/assets/teams/valyand/players/xfl8ud.png",
    "/assets/teams/valyand/players/zusp.png",
    "/assets/teams/virtosium_nova/players/to8ro.png",
    "/assets/teams/vitalisor/players/axpex.png",
    "/assets/teams/vlycresd/players/jcs.png",
    "/assets/teams/vlycresd/players/ztory.png",
])

type Player = { id: string; name: string; nickname: string; portraitPath: string;[k: string]: unknown }

function main() {
    const CLEAN = PORTRAIT_POOL.filter(p => !BRANDED.has(p))
    console.log(`Pool: ${PORTRAIT_POOL.length} → ${CLEAN.length} clean (${PORTRAIT_POOL.length - CLEAN.length} branded removed)`)
    if (CLEAN.length < 50) throw new Error("Clean pool too small — aborting")

    const players: Player[] = JSON.parse(fs.readFileSync(PLAYERS, "utf8"))

    // --- 1 & 2: fictionalise names (deduped) + repoint portraits to clean pool ---
    const used = new Set<string>()
    let renamed = 0, repointed = 0
    for (const p of players) {
        // Unique original handle, deterministic by id with salt re-roll on clash.
        let handle = premiumPlayerHandle(p.id)
        for (let salt = 1; used.has(handle.toLowerCase()) && salt < 200; salt++) {
            handle = premiumPlayerHandle(p.id, salt)
        }
        used.add(handle.toLowerCase())
        if (p.name !== handle || p.nickname !== handle) renamed++
        p.name = handle
        p.nickname = handle

        // Only players currently on a BRANDED portrait get reassigned to a clean
        // one (deterministic, matches pickPooledPortrait's hashing). Players
        // already on a clean plain-kit portrait keep their distinct face.
        if (BRANDED.has(p.portraitPath)) {
            p.portraitPath = CLEAN[fnv1aHash(p.id) % CLEAN.length]
            repointed++
        }
    }
    fs.writeFileSync(PLAYERS, JSON.stringify(players, null, 2) + "\n")
    console.log(`Players: ${players.length} total, ${renamed} renamed, ${repointed} portraits repointed, ${used.size} unique handles`)

    // --- rewrite portrait-pool.ts with the clean set ---
    const poolBody = `// AUTO-GENERATED — the pool of baked Pixar-style portrait PNGs players use.
// Pruned by scripts/launch-safe-data.ts to plain-kit portraits only: every
// image wearing a real esports-org jersey or sponsor logo was removed so the
// shipped build carries zero real branding. Photo-less generated players
// (legends, free agents, prospects) deterministically reuse one of these.
import { fnv1aHash } from "./portrait-features"

export const PORTRAIT_POOL: string[] = [
${CLEAN.map(p => `  ${JSON.stringify(p)},`).join("\n")}
]

/** Deterministic baked portrait for a seed (e.g. player.id). */
export function pickPooledPortrait(seed: string): string {
  if (!PORTRAIT_POOL.length) return "/player_placeholder.webp"
  return PORTRAIT_POOL[fnv1aHash(seed) % PORTRAIT_POOL.length]
}
`
    fs.writeFileSync(POOL_TS, poolBody)
    console.log(`Rewrote portrait-pool.ts (${CLEAN.length} entries)`)

    // --- delete the branded files from disk ---
    let deleted = 0, missing = 0
    for (const rel of BRANDED) {
        const abs = path.join(ROOT, "public", rel)
        if (fs.existsSync(abs)) { fs.unlinkSync(abs); deleted++ } else missing++
    }
    console.log(`Deleted ${deleted} branded portrait files (${missing} already absent)`)
    console.log("Done.")
}

main()
