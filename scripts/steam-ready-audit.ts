#!/usr/bin/env tsx
/**
 * Steam-Ready Master Audit
 *
 * Aggregates a dozen focused checks into one report so a release engineer can
 * see, in a single command, whether the build is genuinely Steam-review ready.
 *
 * Each check is intentionally cheap (filesystem + string scans, no heavy
 * imports) so this runs in seconds and can be wired into CI. The existing
 * heavyweight gates remain authoritative for their own domains:
 *   - npm run release:hardening    (save/transaction/fuzz)
 *   - npm run compliance:steam     (asset path trademark scan)
 *   - npm run type-check / build   (compiler + bundler)
 *
 * This script focuses on review-blocker categories those gates do NOT cover:
 *   A1  Project sanity:        package.json appId, version, copyright, license
 *   A2  Steam SDK integration: preload bridge, steam_appid.txt handling
 *   A3  Achievement parity:    code IDs vs Steamworks setup doc IDs
 *   A4  Save schema integrity: CURRENT_SAVE_VERSION matches migration ladder
 *   A5  Trademark code scan:   ts/tsx/json source (not just asset paths)
 *   A6  Legal documents:       EULA + Privacy Policy presence + key phrases
 *   A7  Privacy posture:       outbound network calls in client code
 *   A8  Steam Deck readiness:  min window size, focus-visible CSS, shortcuts
 *   A9  Production hygiene:    raw console.* in engine/store, debugger stmts
 *   A10 Secrets hygiene:       tracked .env, API keys, tokens
 *   A11 Steam build files:     steam_appid in asarUnpack, license metadata
 *   A12 Achievement triggers:  every defined achievement has a code unlock
 *   A13 OSS license disclosure: NOTICE.md or THIRD_PARTY_LICENSES.md exists
 *   A14 Branding consistency:  package.json productName matches window title
 *   A15 Map-name disclosure:   surfaces Valve map names embedded as data
 *   A16 Trademark asset paths: trademark-named asset folders are excluded
 *                              from the electron-builder shipping list
 *
 * Outputs:
 *   tmp/steam-ready-report.json    machine-readable
 *   tmp/steam-ready-report.md      human-readable
 *
 * Exit codes:
 *   0  no BLOCKER findings
 *   1  one or more BLOCKER findings (HIGH severity)
 *   2  audit itself crashed
 */

import fs from "node:fs"
import path from "node:path"

type Severity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" | "INFO"

type Finding = {
    check: string
    severity: Severity
    code: string
    file?: string
    detail: string
}

const REPO_ROOT = process.cwd()
const findings: Finding[] = []

function add(f: Finding): void {
    findings.push(f)
}

function readFileSafe(rel: string): string | null {
    const full = path.join(REPO_ROOT, rel)
    try {
        return fs.readFileSync(full, "utf8")
    } catch {
        return null
    }
}

function walk(root: string, exts?: Set<string>): string[] {
    if (!fs.existsSync(root)) return []
    const out: string[] = []
    const queue = [root]
    while (queue.length) {
        const dir = queue.pop()!
        let entries: fs.Dirent[]
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
            continue
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue
                queue.push(full)
            } else if (!exts || exts.has(path.extname(entry.name).toLowerCase())) {
                out.push(full)
            }
        }
    }
    return out
}

// ============================================================
// A1: Project sanity — package.json metadata
// ============================================================
function checkA1ProjectSanity(): void {
    const pkgRaw = readFileSafe("package.json")
    if (!pkgRaw) {
        add({ check: "A1", severity: "BLOCKER", code: "PKG_MISSING", detail: "package.json not found" })
        return
    }
    let pkg: any
    try {
        pkg = JSON.parse(pkgRaw)
    } catch {
        add({ check: "A1", severity: "BLOCKER", code: "PKG_PARSE", detail: "package.json is not valid JSON" })
        return
    }

    const build = pkg.build ?? {}
    if (!build.appId) {
        add({ check: "A1", severity: "BLOCKER", code: "BUILD_APP_ID_MISSING", file: "package.json", detail: "build.appId is required for installer signing and Steam packaging" })
    }
    if (!build.productName) {
        add({ check: "A1", severity: "HIGH", code: "BUILD_PRODUCT_NAME_MISSING", file: "package.json", detail: "build.productName is required for Steam library display name" })
    }
    if (!build.copyright) {
        add({ check: "A1", severity: "HIGH", code: "BUILD_COPYRIGHT_MISSING", file: "package.json", detail: "build.copyright is required for installer + Steam legal compliance" })
    } else {
        const yr = String(new Date().getFullYear())
        if (!build.copyright.includes(yr) && !build.copyright.includes(String(Number(yr) - 1))) {
            add({ check: "A1", severity: "MEDIUM", code: "COPYRIGHT_YEAR_STALE", file: "package.json", detail: `Copyright '${build.copyright}' does not include current or previous year` })
        }
    }
    if (!pkg.version || pkg.version === "0.0.0") {
        add({ check: "A1", severity: "HIGH", code: "VERSION_PLACEHOLDER", file: "package.json", detail: `package.json version is '${pkg.version}'; set a release version` })
    }
    if (!pkg.license) {
        add({ check: "A1", severity: "MEDIUM", code: "LICENSE_FIELD_MISSING", file: "package.json", detail: "package.json has no 'license' field. Set e.g. 'UNLICENSED' or 'Proprietary'" })
    }
    if (!pkg.author) {
        add({ check: "A1", severity: "LOW", code: "AUTHOR_MISSING", file: "package.json", detail: "package.json has no 'author' field" })
    }
}

// ============================================================
// A2: Steam SDK integration
// ============================================================
function checkA2SteamSDK(): void {
    const steamJs = readFileSafe("electron/steam.js")
    if (!steamJs) {
        add({ check: "A2", severity: "BLOCKER", code: "STEAM_MODULE_MISSING", detail: "electron/steam.js not found" })
        return
    }
    if (!/require\(['"]steamworks\.js['"]\)/.test(steamJs)) {
        add({ check: "A2", severity: "BLOCKER", code: "STEAMWORKS_NOT_LOADED", file: "electron/steam.js", detail: "steamworks.js is not required in the Steam module" })
    }
    if (!/steam_appid\.txt/.test(steamJs)) {
        add({ check: "A2", severity: "BLOCKER", code: "APPID_NOT_LOADED", file: "electron/steam.js", detail: "electron/steam.js never references steam_appid.txt; live App ID will fall back to test ID" })
    }
    if (!/SPACEWAR|480/.test(steamJs)) {
        add({ check: "A2", severity: "INFO", code: "NO_SPACEWAR_FALLBACK", file: "electron/steam.js", detail: "No Spacewar (480) fallback found; dev/CI without steam_appid.txt will fail to init Steam" })
    }
    const preload = readFileSafe("electron/preload.js")
    if (!preload) {
        add({ check: "A2", severity: "BLOCKER", code: "PRELOAD_MISSING", detail: "electron/preload.js not found" })
    } else {
        if (!/contextBridge\.exposeInMainWorld/.test(preload)) {
            add({ check: "A2", severity: "BLOCKER", code: "PRELOAD_NO_CONTEXTBRIDGE", file: "electron/preload.js", detail: "preload uses no contextBridge — renderer cannot reach Steam IPC safely" })
        }
        if (!/unlockAchievement|setAchievement/.test(preload)) {
            add({ check: "A2", severity: "HIGH", code: "PRELOAD_NO_ACHIEVEMENT_API", file: "electron/preload.js", detail: "preload bridge does not expose an achievement-unlock IPC" })
        }
        if (!/writeToCloud|cloudWrite|cloud_write/.test(preload)) {
            add({ check: "A2", severity: "HIGH", code: "PRELOAD_NO_CLOUD_API", file: "electron/preload.js", detail: "preload bridge does not expose Steam Cloud IPC; cloud saves won't work" })
        }
    }
    const main = readFileSafe("electron/main.js")
    if (!main || !/requestSingleInstanceLock/.test(main)) {
        add({ check: "A2", severity: "HIGH", code: "NO_SINGLE_INSTANCE", file: "electron/main.js", detail: "App does not enforce single-instance lock; Steam overlay can produce duplicate windows" })
    }
}

// ============================================================
// A3: Achievement parity (code vs Steamworks setup doc)
// ============================================================
function extractAchievementIdsFromCode(): Set<string> {
    const src = readFileSafe("engine/steam-service.ts")
    if (!src) return new Set()
    const ids = new Set<string>()
    const re = /\b([A-Z][A-Z0-9_]{2,30}):\s*\{\s*id:\s*"\1"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) ids.add(m[1])
    return ids
}

function extractAchievementIdsFromDoc(): Set<string> {
    const doc = readFileSafe("docs/STEAMWORKS_SETUP_GUIDE.md")
    if (!doc) return new Set()
    const ids = new Set<string>()
    const re = /^\|\s*`([A-Z][A-Z0-9_]+)`/gm
    let m: RegExpExecArray | null
    while ((m = re.exec(doc)) !== null) ids.add(m[1])
    return ids
}

function checkA3AchievementParity(): void {
    const codeIds = extractAchievementIdsFromCode()
    const docIds = extractAchievementIdsFromDoc()
    if (codeIds.size === 0) {
        add({ check: "A3", severity: "BLOCKER", code: "NO_CODE_ACHIEVEMENTS", file: "engine/steam-service.ts", detail: "Could not extract any achievement IDs from engine/steam-service.ts" })
        return
    }
    if (docIds.size === 0) {
        add({ check: "A3", severity: "HIGH", code: "NO_DOC_ACHIEVEMENTS", file: "docs/STEAMWORKS_SETUP_GUIDE.md", detail: "Could not extract any achievement IDs from setup doc — Steamworks admin parity cannot be verified" })
        return
    }
    const inCodeNotDoc = [...codeIds].filter(id => !docIds.has(id)).sort()
    const inDocNotCode = [...docIds].filter(id => !codeIds.has(id)).sort()
    for (const id of inCodeNotDoc) {
        add({ check: "A3", severity: "BLOCKER", code: "ACHIEVEMENT_NOT_IN_STEAMWORKS_DOC", file: "engine/steam-service.ts", detail: `Achievement '${id}' is defined in code but missing from docs/STEAMWORKS_SETUP_GUIDE.md. If it's also missing from Steamworks admin, unlock calls will silently fail.` })
    }
    for (const id of inDocNotCode) {
        add({ check: "A3", severity: "HIGH", code: "ACHIEVEMENT_NOT_IN_CODE", file: "docs/STEAMWORKS_SETUP_GUIDE.md", detail: `Achievement '${id}' is documented for Steamworks but no longer in code. Either restore the unlock path or delete the entry from Steamworks admin.` })
    }
}

// ============================================================
// A4: Save schema integrity
// ============================================================
function checkA4SaveSchema(): void {
    const types = readFileSafe("engine/save-types.ts")
    if (!types) {
        add({ check: "A4", severity: "BLOCKER", code: "SAVE_TYPES_MISSING", detail: "engine/save-types.ts not found" })
        return
    }
    const currentMatch = types.match(/CURRENT_SAVE_VERSION\s*=\s*(\d+)/)
    if (!currentMatch) {
        add({ check: "A4", severity: "BLOCKER", code: "CURRENT_VERSION_NOT_DECLARED", file: "engine/save-types.ts", detail: "CURRENT_SAVE_VERSION constant not found" })
        return
    }
    const current = Number(currentMatch[1])

    const migrations = readFileSafe("engine/save-migrations.ts")
    if (!migrations) {
        add({ check: "A4", severity: "BLOCKER", code: "MIGRATIONS_MISSING", detail: "engine/save-migrations.ts not found" })
        return
    }
    const migFns = [...migrations.matchAll(/function\s+migrateToV(\d+)\s*\(/g)].map(m => Number(m[1]))
    const maxMig = migFns.length ? Math.max(...migFns) : 0
    if (maxMig !== current) {
        add({
            check: "A4",
            severity: "BLOCKER",
            code: "MIGRATION_LADDER_GAP",
            file: "engine/save-migrations.ts",
            detail: `CURRENT_SAVE_VERSION=${current} but highest migration is V${maxMig}. Loading older saves will land at v${maxMig}, never v${current}.`,
        })
    }
    for (let v = 1; v <= maxMig; v++) {
        if (!migFns.includes(v)) {
            add({ check: "A4", severity: "HIGH", code: "MIGRATION_LADDER_HOLE", file: "engine/save-migrations.ts", detail: `migrateToV${v} is missing — ladder must be contiguous so V0 -> V${maxMig} is reachable.` })
        }
    }
}

// ============================================================
// A5: Trademark scan over source code (not asset paths)
// ============================================================
type PolicyV2 = {
    trademarkKeywords: string[]
    sourceAllowlist: string[]
    sourceAllowlistGlobs: string[]
    sourceExcludeKeywords: string[]
}

function loadPolicy(): PolicyV2 {
    const raw = readFileSafe("config/steam-compliance-policy.json")
    if (!raw) return { trademarkKeywords: [], sourceAllowlist: [], sourceAllowlistGlobs: [], sourceExcludeKeywords: [] }
    try {
        const parsed = JSON.parse(raw)
        return {
            trademarkKeywords: Array.isArray(parsed.trademarkKeywords) ? parsed.trademarkKeywords : [],
            sourceAllowlist: Array.isArray(parsed.sourceAllowlist) ? parsed.sourceAllowlist : [],
            sourceAllowlistGlobs: Array.isArray(parsed.sourceAllowlistGlobs) ? parsed.sourceAllowlistGlobs : [],
            sourceExcludeKeywords: Array.isArray(parsed.sourceExcludeKeywords) ? parsed.sourceExcludeKeywords : [],
        }
    } catch {
        return { trademarkKeywords: [], sourceAllowlist: [], sourceAllowlistGlobs: [], sourceExcludeKeywords: [] }
    }
}

function matchGlob(rel: string, glob: string): boolean {
    // Tiny glob: supports trailing "/**", "*" inside a path segment, and exact matches.
    if (glob === rel) return true
    if (glob.endsWith("/**")) {
        const prefix = glob.slice(0, -3)
        return rel === prefix || rel.startsWith(prefix + "/")
    }
    if (!glob.includes("*")) return false
    const re = new RegExp("^" + glob.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$")
    return re.test(rel)
}

function checkA5TrademarkSource(): void {
    const policy = loadPolicy()
    const excludes = new Set(policy.sourceExcludeKeywords.map(k => k.toLowerCase()))
    const keywords = policy.trademarkKeywords.map(k => k.toLowerCase()).filter(k => k && !excludes.has(k))
    if (keywords.length === 0) return
    const targets = [
        ...walk(path.join(REPO_ROOT, "engine"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "store"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "lib"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "data"), new Set([".ts", ".json"])),
        ...walk(path.join(REPO_ROOT, "public", "data"), new Set([".json"])),
        ...walk(path.join(REPO_ROOT, "app"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "components"), new Set([".ts", ".tsx"])),
    ]
    const allowlistFiles = new Set<string>([
        "config/steam-compliance-policy.json",
        "config/steam-compliance-baseline.json",
        ...policy.sourceAllowlist,
    ])
    const allowlistGlobs = policy.sourceAllowlistGlobs
    // Word-boundary semantics: a token is "matched" when neither neighbor
    // character is a letter/digit/underscore. This lets us catch hyphenated
    // and colon-bearing keywords like "counter-strike" and "cs:go" that the
    // word-token regex would otherwise split.
    const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c)
    const seen = new Set<string>()
    let allowedFileCount = 0
    for (const file of targets) {
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/")
        if (allowlistFiles.has(rel) || allowlistGlobs.some(g => matchGlob(rel, g))) {
            allowedFileCount++
            continue
        }
        let contents: string
        try {
            contents = fs.readFileSync(file, "utf8")
        } catch {
            continue
        }
        const lowered = contents.toLowerCase()
        for (const kw of keywords) {
            let from = 0
            let found = false
            while (from <= lowered.length) {
                const idx = lowered.indexOf(kw, from)
                if (idx < 0) break
                const before = idx > 0 ? lowered[idx - 1] : ""
                const after = idx + kw.length < lowered.length ? lowered[idx + kw.length] : ""
                if (!isWordChar(before) && !isWordChar(after)) { found = true; break }
                from = idx + 1
            }
            if (!found) continue
            const key = `${rel}|${kw}`
            if (seen.has(key)) continue
            seen.add(key)
            add({
                check: "A5",
                severity: "HIGH",
                code: "TRADEMARK_IN_SOURCE",
                file: rel,
                detail: `Source file references trademark token '${kw}'. Strip from shipped code or replace with sanitized-brand alias.`,
            })
        }
    }
    if (allowedFileCount > 0) {
        add({ check: "A5", severity: "INFO", code: "TRADEMARK_SOURCE_ALLOWLIST", detail: `Skipped ${allowedFileCount} file(s) covered by sourceAllowlist / sourceAllowlistGlobs in steam-compliance-policy.json.` })
    }
}

// ============================================================
// A6: Legal documents
// ============================================================
function checkA6LegalDocs(): void {
    const eula = readFileSafe("EULA.md")
    if (!eula) {
        add({ check: "A6", severity: "BLOCKER", code: "EULA_MISSING", detail: "EULA.md is missing — Steam requires an EULA shown in the Library install flow" })
    } else {
        if (!/Steam/i.test(eula)) {
            add({ check: "A6", severity: "MEDIUM", code: "EULA_NO_STEAM_REF", file: "EULA.md", detail: "EULA does not reference Steam Subscriber Agreement (SSA) precedence" })
        }
        if (!/Last Updated|Effective Date/i.test(eula)) {
            add({ check: "A6", severity: "LOW", code: "EULA_NO_DATE", file: "EULA.md", detail: "EULA has no last-updated date" })
        }
    }
    const privacy = readFileSafe("PRIVACY_POLICY.md")
    if (!privacy) {
        add({ check: "A6", severity: "HIGH", code: "PRIVACY_MISSING", detail: "PRIVACY_POLICY.md is missing — Steam store listing requires a privacy policy URL when collecting any data" })
    } else {
        if (!/Last Updated|Effective Date/i.test(privacy)) {
            add({ check: "A6", severity: "LOW", code: "PRIVACY_NO_DATE", file: "PRIVACY_POLICY.md", detail: "Privacy policy has no last-updated date" })
        }
        if (!/Steam/i.test(privacy)) {
            add({ check: "A6", severity: "MEDIUM", code: "PRIVACY_NO_STEAM_REF", file: "PRIVACY_POLICY.md", detail: "Privacy policy never mentions Steam; data flows through Steam (achievements, cloud, leaderboards) should be disclosed" })
        }
    }
}

// ============================================================
// A7: Privacy posture — outbound network calls in client code
// ============================================================
function checkA7NetworkCalls(): void {
    const roots = [
        path.join(REPO_ROOT, "engine"),
        path.join(REPO_ROOT, "store"),
        path.join(REPO_ROOT, "lib"),
        path.join(REPO_ROOT, "app"),
        path.join(REPO_ROOT, "components"),
        path.join(REPO_ROOT, "hooks"),
    ]
    const files = roots.flatMap(r => walk(r, new Set([".ts", ".tsx"])))
    // fetch("/foo") and fetch("./foo") are local — only flag absolute external URLs and bare hostnames.
    const externalFetchRe = /fetch\s*\(\s*[`'"]https?:\/\//
    const xhrRe = /\bnew\s+XMLHttpRequest\s*\(/
    const axiosRe = /\baxios\s*\.\s*(get|post|put|delete|patch|request)\s*\(/
    const fetchAnyRe = /\bfetch\s*\(/
    let externalCount = 0
    let localFetchCount = 0
    for (const file of files) {
        let src: string
        try { src = fs.readFileSync(file, "utf8") } catch { continue }
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/")
        if (externalFetchRe.test(src)) {
            externalCount++
            add({ check: "A7", severity: "HIGH", code: "EXTERNAL_NETWORK_CALL", file: rel, detail: "Client code makes an absolute http(s) request. The privacy policy declares the game offline — every external endpoint must be disclosed or removed." })
        }
        if (xhrRe.test(src)) {
            add({ check: "A7", severity: "MEDIUM", code: "XHR_DETECTED", file: rel, detail: "XMLHttpRequest usage detected. Verify it is not used for unannounced telemetry." })
        }
        if (axiosRe.test(src)) {
            add({ check: "A7", severity: "MEDIUM", code: "AXIOS_DETECTED", file: rel, detail: "axios HTTP call detected. Verify endpoint is documented in privacy policy." })
        }
        // local fetch(): only count, do not flag (these are next/static asset loads)
        if (fetchAnyRe.test(src) && !externalFetchRe.test(src)) {
            localFetchCount++
        }
    }
    add({
        check: "A7",
        severity: "INFO",
        code: "NETWORK_CALL_SUMMARY",
        detail: `Scanned ${files.length} client TS files; ${externalCount} external http(s) call site(s), ${localFetchCount} local fetch() call site(s).`,
    })
}

// ============================================================
// A8: Steam Deck readiness
// ============================================================
function checkA8SteamDeck(): void {
    const main = readFileSafe("electron/main.js")
    if (main) {
        const minWidthMatch = main.match(/MIN_WIDTH\s*=\s*(\d+)/)
        const minHeightMatch = main.match(/MIN_HEIGHT\s*=\s*(\d+)/)
        if (minWidthMatch && minHeightMatch) {
            const w = Number(minWidthMatch[1])
            const h = Number(minHeightMatch[1])
            if (w > 1280 || h > 800) {
                add({ check: "A8", severity: "HIGH", code: "DECK_MIN_RES_TOO_LARGE", file: "electron/main.js", detail: `Minimum window size ${w}x${h} exceeds Steam Deck native 1280x800; UI will be cropped.` })
            }
        } else {
            add({ check: "A8", severity: "MEDIUM", code: "DECK_MIN_RES_UNDECLARED", file: "electron/main.js", detail: "No MIN_WIDTH/MIN_HEIGHT constants found; Steam Deck verification requires a documented minimum size." })
        }
    }
    const css = readFileSafe("app/globals.css")
    if (css && !/:focus-visible/.test(css)) {
        add({ check: "A8", severity: "MEDIUM", code: "DECK_NO_FOCUS_VISIBLE", file: "app/globals.css", detail: "No :focus-visible rule found. Steam Deck Verified requires a visible focus indicator for keyboard/D-pad navigation." })
    }
    const shortcutsDoc = readFileSafe("docs/shortcuts.md")
    if (!shortcutsDoc) {
        add({ check: "A8", severity: "LOW", code: "DECK_NO_SHORTCUTS_DOC", detail: "docs/shortcuts.md missing; expected for Steam Deck keyboard-first map." })
    }
}

// ============================================================
// A9: Production hygiene — raw console.* and debugger statements
// ============================================================
function checkA9ProductionHygiene(): void {
    const roots = [
        path.join(REPO_ROOT, "engine"),
        path.join(REPO_ROOT, "store"),
    ]
    // lib/logger.ts and lib/debug-logger.ts are the intended logging entrypoints.
    const allowlist = new Set([
        "lib/logger.ts",
        "lib/debug-logger.ts",
        "lib/error-tracking.ts",
    ])
    const consoleRe = /^\s*console\.(log|warn|error|debug|info)\s*\(/m
    const debuggerRe = /\bdebugger\s*;?/
    // Files that explicitly disable the no-console eslint rule have already
    // been audited at write-time — respect that signal so we don't double-flag.
    const fileLevelDisableRe = /\/\*\s*eslint-disable\b[^*]*\bno-console\b|^\/\/\s*eslint-disable\b.*\bno-console\b/m
    let console_hits = 0
    let debugger_hits = 0
    for (const file of [...roots.flatMap(r => walk(r, new Set([".ts", ".tsx"])))]) {
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/")
        if (allowlist.has(rel)) continue
        let src: string
        try { src = fs.readFileSync(file, "utf8") } catch { continue }
        if (consoleRe.test(src)) {
            // If every console.* line in the file is preceded by an eslint-disable-next-line
            // hint, the author has explicitly tagged each call as intentional — skip.
            const consoleLines: number[] = []
            const lines = src.split("\n")
            for (let i = 0; i < lines.length; i++) {
                if (/^\s*console\.(log|warn|error|debug|info)\s*\(/.test(lines[i])) consoleLines.push(i)
            }
            const allTagged = consoleLines.length > 0 && consoleLines.every(i => {
                const prev = lines[i - 1] ?? ""
                return /eslint-disable-next-line[^\n]*\bno-console\b/.test(prev)
            })
            const fileDisabled = fileLevelDisableRe.test(src)
            if (!allTagged && !fileDisabled) {
                console_hits++
                add({ check: "A9", severity: "MEDIUM", code: "RAW_CONSOLE_IN_ENGINE", file: rel, detail: "engine/store code uses console.* directly; route through lib/logger or lib/debug-logger so it can be silenced in production." })
            }
        }
        if (debuggerRe.test(src)) {
            debugger_hits++
            add({ check: "A9", severity: "BLOCKER", code: "DEBUGGER_STATEMENT", file: rel, detail: "`debugger` statement found. Will pause execution in dev tools — never ship in production." })
        }
    }
    add({ check: "A9", severity: "INFO", code: "HYGIENE_SUMMARY", detail: `${console_hits} raw console.* file(s), ${debugger_hits} debugger statement(s).` })
}

// ============================================================
// A10: Secrets hygiene
// ============================================================
function checkA10Secrets(): void {
    const gitignore = readFileSafe(".gitignore") ?? ""
    if (!/\.env/.test(gitignore)) {
        add({ check: "A10", severity: "HIGH", code: "ENV_NOT_IGNORED", file: ".gitignore", detail: ".env files are not in .gitignore" })
    }
    const trackedEnv = walk(REPO_ROOT).filter(p => {
        const rel = path.relative(REPO_ROOT, p)
        return /\.env($|\.)/.test(path.basename(p)) && !rel.startsWith("node_modules")
    })
    for (const f of trackedEnv) {
        add({ check: "A10", severity: "BLOCKER", code: "ENV_FILE_PRESENT", file: path.relative(REPO_ROOT, f), detail: ".env file present in repo; rotate any keys it contained and remove from history." })
    }
    // Quick string scan for likely secrets in non-asset code
    const codeFiles = [
        ...walk(path.join(REPO_ROOT, "engine"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "store"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "lib"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "scripts"), new Set([".ts", ".js", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "electron"), new Set([".ts", ".js"])),
    ]
    const patterns: Array<{ name: string, re: RegExp }> = [
        { name: "STEAM_WEB_API_KEY", re: /STEAM_[A-Z_]*KEY\s*=\s*['"][A-F0-9]{20,}/i },
        { name: "AWS_SECRET", re: /AKIA[0-9A-Z]{16}/ },
        { name: "OPENAI_KEY", re: /sk-[A-Za-z0-9]{32,}/ },
        { name: "GITHUB_TOKEN", re: /ghp_[A-Za-z0-9]{30,}/ },
        { name: "REPLICATE_TOKEN", re: /r8_[A-Za-z0-9]{30,}/ },
    ]
    for (const file of codeFiles) {
        let src: string
        try { src = fs.readFileSync(file, "utf8") } catch { continue }
        for (const p of patterns) {
            if (p.re.test(src)) {
                add({ check: "A10", severity: "BLOCKER", code: `SECRET_${p.name}`, file: path.relative(REPO_ROOT, file), detail: `Possible hardcoded secret matching ${p.name}. Rotate the key and remove from code.` })
            }
        }
    }
}

// ============================================================
// A11: Steam build files in package.json
// ============================================================
function checkA11SteamBuildFiles(): void {
    const pkgRaw = readFileSafe("package.json")
    if (!pkgRaw) return
    let pkg: any
    try { pkg = JSON.parse(pkgRaw) } catch { return }
    const build = pkg.build ?? {}
    const asarUnpack: string[] = Array.isArray(build.asarUnpack) ? build.asarUnpack : []
    if (!asarUnpack.some(p => /steam_appid\.txt/.test(p))) {
        add({ check: "A11", severity: "BLOCKER", code: "APPID_NOT_UNPACKED", file: "package.json", detail: "build.asarUnpack must include steam_appid.txt so steamworks.js can read it at runtime." })
    }
    if (!asarUnpack.some(p => /steamworks/.test(p))) {
        add({ check: "A11", severity: "BLOCKER", code: "STEAMWORKS_NOT_UNPACKED", file: "package.json", detail: "build.asarUnpack must include node_modules/steamworks.js/** so its native .node binary loads at runtime." })
    }
    const files: string[] = Array.isArray(build.files) ? build.files : []
    if (!files.some(p => /steam_appid\.txt/.test(p))) {
        add({ check: "A11", severity: "HIGH", code: "APPID_NOT_IN_BUILD_FILES", file: "package.json", detail: "build.files should include steam_appid.txt explicitly so electron-builder bundles it." })
    }
    const gi = readFileSafe(".gitignore") ?? ""
    if (!/steam_appid\.txt/.test(gi)) {
        add({ check: "A11", severity: "MEDIUM", code: "APPID_NOT_GITIGNORED", file: ".gitignore", detail: "steam_appid.txt should be gitignored so the live App ID is not committed; CI/build must materialize it." })
    }
}

// ============================================================
// A12: Every code achievement has a code unlock call site
// ============================================================
function checkA12AchievementUnlockSites(): void {
    const codeIds = extractAchievementIdsFromCode()
    if (codeIds.size === 0) return
    const codeFiles = [
        ...walk(path.join(REPO_ROOT, "engine"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "store"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "hooks"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "lib"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "app"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "components"), new Set([".ts", ".tsx"])),
    ]
    const idsWithUnlock = new Set<string>()
    const defFile = path.join(REPO_ROOT, "engine/steam-service.ts")
    for (const file of codeFiles) {
        let src: string
        try { src = fs.readFileSync(file, "utf8") } catch { continue }
        for (const id of codeIds) {
            if (idsWithUnlock.has(id)) continue
            // Look for a call that passes the ID as a string argument outside the definitions table itself.
            const re = new RegExp(`(unlockAchievement|setAchievement|grantAchievement)\\s*\\(\\s*["']${id}["']`)
            if (re.test(src)) idsWithUnlock.add(id)
        }
    }
    for (const id of codeIds) {
        if (!idsWithUnlock.has(id)) {
            add({
                check: "A12",
                severity: "HIGH",
                code: "ACHIEVEMENT_UNREACHABLE",
                file: path.relative(REPO_ROOT, defFile),
                detail: `Achievement '${id}' is defined but no unlockAchievement('${id}') call site was found. It cannot unlock in-game.`,
            })
        }
    }
}

// ============================================================
// A16: Trademark assets must be excluded from electron-builder
// ============================================================
function checkA16AssetExclusions(): void {
    const pkgRaw = readFileSafe("package.json")
    if (!pkgRaw) return
    let pkg: any
    try { pkg = JSON.parse(pkgRaw) } catch { return }
    const files: string[] = Array.isArray(pkg.build?.files) ? pkg.build.files : []
    const excluded = new Set(files.filter(f => typeof f === "string" && f.startsWith("!")).map(f => f.slice(1)))

    const policy = loadPolicy()
    const keywords = policy.trademarkKeywords.map(k => k.toLowerCase())

    const teamDir = path.join(REPO_ROOT, "public", "assets", "teams")
    if (fs.existsSync(teamDir)) {
        for (const entry of fs.readdirSync(teamDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue
            const folderLower = entry.name.toLowerCase()
            const matched = keywords.find(k => k && folderLower.includes(k))
            if (!matched) continue
            const wildcard = `public/assets/teams/${entry.name}/**`
            const isCovered =
                excluded.has(wildcard) ||
                [...excluded].some(e => e === `public/assets/teams/${entry.name}/**/*`) ||
                [...excluded].some(e => e.startsWith(`public/assets/teams/${entry.name}/`))
            if (!isCovered) {
                add({
                    check: "A16",
                    severity: "HIGH",
                    code: "TRADEMARK_ASSET_FOLDER_SHIPS",
                    file: `public/assets/teams/${entry.name}/`,
                    detail: `Folder name matches trademark keyword '${matched}' but is not excluded in package.json build.files. The shipped Steam build will include these images. Add "!public/assets/teams/${entry.name}/**".`,
                })
            }
        }
    }

    const tournDir = path.join(REPO_ROOT, "public", "assets", "tournaments")
    if (fs.existsSync(tournDir)) {
        for (const entry of fs.readdirSync(tournDir, { withFileTypes: true })) {
            if (!entry.isFile()) continue
            const lower = entry.name.toLowerCase()
            const matched = keywords.find(k => k && lower.includes(k))
            if (!matched) continue
            const rel = `public/assets/tournaments/${entry.name}`
            if (!excluded.has(rel)) {
                add({
                    check: "A16",
                    severity: "HIGH",
                    code: "TRADEMARK_TOURNAMENT_LOGO_SHIPS",
                    file: rel,
                    detail: `Tournament logo name matches trademark keyword '${matched}' but is not excluded in package.json build.files. Add "!${rel}".`,
                })
            }
        }
    }
}

// ============================================================
// A13: Open-source license disclosure
// ============================================================
function checkA13OssDisclosure(): void {
    const candidates = ["NOTICE.md", "NOTICE", "THIRD_PARTY_LICENSES.md", "THIRD_PARTY_LICENSES", "LICENSES.md", "licenses/third-party.md"]
    const found = candidates.find(c => readFileSafe(c) !== null)
    if (!found) {
        add({
            check: "A13",
            severity: "MEDIUM",
            code: "OSS_NOTICE_MISSING",
            detail: "No NOTICE.md / THIRD_PARTY_LICENSES.md found. Steam review and many OSS licenses (Apache, BSD-3) require attribution of bundled open-source components in the shipped build.",
        })
        return
    }
    const text = readFileSafe(found) ?? ""
    if (!/MIT|Apache|BSD|ISC/i.test(text)) {
        add({ check: "A13", severity: "LOW", code: "OSS_NOTICE_NO_LICENSE_REFS", file: found, detail: "Notice file does not reference any common OSS license. Verify it actually lists shipped dependencies." })
    }
    if (!/trademark|Valve|Steam/i.test(text)) {
        add({ check: "A13", severity: "LOW", code: "OSS_NOTICE_NO_TRADEMARK_DISCLAIMER", file: found, detail: "Notice file does not include a trademark disclaimer for Steam / Valve. Consider clarifying non-affiliation." })
    }
}

// ============================================================
// A14: Branding consistency between manifest and window title
// ============================================================
function checkA14BrandingConsistency(): void {
    const pkgRaw = readFileSafe("package.json")
    if (!pkgRaw) return
    let pkg: any
    try { pkg = JSON.parse(pkgRaw) } catch { return }
    const productName = String(pkg.build?.productName ?? "")
    const layout = readFileSafe("app/layout.tsx") ?? ""
    const layoutTitleMatch = layout.match(/title:\s*['"]([^'"]+)['"]/)
    const layoutTitle = layoutTitleMatch ? layoutTitleMatch[1] : ""
    if (!layoutTitle) {
        add({ check: "A14", severity: "MEDIUM", code: "PAGE_TITLE_MISSING", file: "app/layout.tsx", detail: "No <title> declared via Next.js metadata; the browser tab will show a default. Steam Deck/console builds inherit this title." })
        return
    }
    // Build a normalized stem: drop punctuation, collapse whitespace, lowercase.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    const pn = norm(productName)
    const lt = norm(layoutTitle)
    if (pn && lt) {
        const pnFirst = pn.split(" ")[0] ?? ""
        const ltFirst = lt.split(" ")[0] ?? ""
        if (pnFirst && ltFirst && pnFirst !== ltFirst && !pn.includes(ltFirst) && !lt.includes(pnFirst)) {
            add({
                check: "A14",
                severity: "MEDIUM",
                code: "BRANDING_MISMATCH",
                detail: `Inconsistent product naming: package.json build.productName='${productName}', app/layout.tsx title='${layoutTitle}'. Steam users see the build name in their library; align both so support reports and store searches work.`,
            })
        }
    }
}

// ============================================================
// A15: Surfaced Valve-trademarked map names in shipped data
// ============================================================
function checkA15ValveMapNames(): void {
    // These are the specific CS / CS:GO / CS2 official competitive maps.
    // Generic English words ("Mirage", "Inferno", "Ancient", "Overpass")
    // are not flagged on their own — only the Valve-specific identifiers.
    // Valve-specific competitive map identifiers. Stored split / xor'd so a
    // global s/dust2/sandstone-style sweep can't accidentally rename this
    // keyword list out from under the check.
    const valveOnlyMaps = ["du" + "st2", "de_du" + "st2", "de_mirage", "de_inferno", "de_nuke", "de_overpass", "de_vertigo", "de_ancient", "de_anubis", "de_train"]
    const targets = [
        ...walk(path.join(REPO_ROOT, "engine"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "lib"), new Set([".ts", ".tsx"])),
        ...walk(path.join(REPO_ROOT, "types"), new Set([".ts"])),
        ...walk(path.join(REPO_ROOT, "data"), new Set([".ts", ".json"])),
        ...walk(path.join(REPO_ROOT, "public", "data"), new Set([".json"])),
    ]
    const isWord = (c: string) => /[A-Za-z0-9_]/.test(c)
    const policy = loadPolicy()
    const seen = new Set<string>()
    for (const file of targets) {
        const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/")
        if (policy.sourceAllowlist.includes(rel)) continue
        if (policy.sourceAllowlistGlobs.some(g => matchGlob(rel, g))) continue
        let contents: string
        try { contents = fs.readFileSync(file, "utf8") } catch { continue }
        const lowered = contents.toLowerCase()
        for (const m of valveOnlyMaps) {
            let from = 0
            while (from <= lowered.length) {
                const idx = lowered.indexOf(m, from)
                if (idx < 0) break
                const before = idx > 0 ? lowered[idx - 1] : ""
                const after = idx + m.length < lowered.length ? lowered[idx + m.length] : ""
                if (!isWord(before) && !isWord(after)) {
                    const key = `${rel}|${m}`
                    if (!seen.has(key)) {
                        seen.add(key)
                        add({
                            check: "A15",
                            severity: "MEDIUM",
                            code: "VALVE_MAP_NAME",
                            file: rel,
                            detail: `Valve-specific map identifier '${m}' is embedded in shipped data/code. Steam reviewers will recognise these — consider replacing with original map names (the safe-branding pipeline can map them at the data boundary).`,
                        })
                    }
                    break
                }
                from = idx + 1
            }
        }
    }
}

// ============================================================
// Report writer
// ============================================================
const SEVERITY_RANK: Record<Severity, number> = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }

function writeReports(): { exitCode: number, summary: Record<Severity, number> } {
    findings.sort((a, b) => {
        const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
        if (s !== 0) return s
        return a.check.localeCompare(b.check) || a.code.localeCompare(b.code) || (a.file ?? "").localeCompare(b.file ?? "")
    })
    const summary: Record<Severity, number> = { BLOCKER: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
    for (const f of findings) summary[f.severity]++

    const outDir = path.join(REPO_ROOT, "tmp")
    fs.mkdirSync(outDir, { recursive: true })
    const jsonPath = path.join(outDir, "steam-ready-report.json")
    fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, findings }, null, 2))

    const lines: string[] = []
    lines.push(`# Steam-Ready Master Audit`)
    lines.push(``)
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push(``)
    lines.push(`## Summary`)
    lines.push(``)
    lines.push(`| Severity | Count |`)
    lines.push(`|---|---|`)
    for (const s of ["BLOCKER", "HIGH", "MEDIUM", "LOW", "INFO"] as Severity[]) {
        lines.push(`| ${s} | ${summary[s]} |`)
    }
    lines.push(``)
    lines.push(`## Findings`)
    lines.push(``)
    if (findings.length === 0) {
        lines.push(`_None._`)
    } else {
        const byCheck = new Map<string, Finding[]>()
        for (const f of findings) {
            if (!byCheck.has(f.check)) byCheck.set(f.check, [])
            byCheck.get(f.check)!.push(f)
        }
        for (const [check, items] of [...byCheck.entries()].sort()) {
            lines.push(`### ${check} (${items.length})`)
            lines.push(``)
            for (const f of items) {
                const where = f.file ? ` \`${f.file}\`` : ""
                lines.push(`- **[${f.severity}] ${f.code}**${where} — ${f.detail}`)
            }
            lines.push(``)
        }
    }
    const mdPath = path.join(outDir, "steam-ready-report.md")
    fs.writeFileSync(mdPath, lines.join("\n"))

    const strict = process.argv.includes("--strict")
    const exitCode = summary.BLOCKER > 0 || (strict && summary.HIGH > 0) ? 1 : 0
    return { exitCode, summary }
}

// ============================================================
// Main
// ============================================================
function main(): void {
    console.log("=== Steam-Ready Master Audit ===")
    const t0 = Date.now()
    const checks: Array<[string, () => void]> = [
        ["A1 project sanity", checkA1ProjectSanity],
        ["A2 steam SDK integration", checkA2SteamSDK],
        ["A3 achievement parity", checkA3AchievementParity],
        ["A4 save schema integrity", checkA4SaveSchema],
        ["A5 trademark source scan", checkA5TrademarkSource],
        ["A6 legal documents", checkA6LegalDocs],
        ["A7 network call posture", checkA7NetworkCalls],
        ["A8 steam deck readiness", checkA8SteamDeck],
        ["A9 production hygiene", checkA9ProductionHygiene],
        ["A10 secrets hygiene", checkA10Secrets],
        ["A11 steam build files", checkA11SteamBuildFiles],
        ["A12 achievement unlock sites", checkA12AchievementUnlockSites],
        ["A13 oss license disclosure", checkA13OssDisclosure],
        ["A14 branding consistency", checkA14BrandingConsistency],
        ["A15 valve map names", checkA15ValveMapNames],
        ["A16 trademark asset exclusions", checkA16AssetExclusions],
    ]
    for (const [label, fn] of checks) {
        try {
            fn()
            console.log(`  ok  ${label}`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            add({ check: label.split(" ")[0], severity: "BLOCKER", code: "AUDIT_CRASH", detail: `Audit check threw: ${msg}` })
            console.log(`  err ${label}: ${msg}`)
        }
    }
    const { exitCode, summary } = writeReports()
    const dt = Date.now() - t0
    console.log("")
    console.log(`Findings: BLOCKER=${summary.BLOCKER} HIGH=${summary.HIGH} MEDIUM=${summary.MEDIUM} LOW=${summary.LOW} INFO=${summary.INFO}`)
    console.log(`Report:   tmp/steam-ready-report.md, tmp/steam-ready-report.json`)
    console.log(`Time:     ${dt}ms`)
    if (exitCode !== 0) {
        console.log(`\nFAIL: blocker findings present (or --strict and HIGH findings).`)
    } else {
        console.log(`\nPASS: no blocker findings.`)
    }
    process.exit(exitCode)
}

try {
    main()
} catch (err) {
    console.error("steam-ready audit crashed:", err instanceof Error ? err.message : err)
    process.exit(2)
}
