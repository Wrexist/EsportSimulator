/**
 * G11 translation prep: checks translators' files against English and shows
 * how much of the interface already goes through the translation layer.
 *
 *   npx tsx scripts/i18n-report.ts            report
 *   npx tsx scripts/i18n-report.ts --template write locales/template.json (English text to translate)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { EN } from "@/locales/en"
import { checkTranslation } from "@/lib/i18n"

const root = process.cwd()

if (process.argv.includes("--template")) {
    writeFileSync(join(root, "locales/template.json"), JSON.stringify(EN, null, 2) + "\n")
    console.log(`locales/template.json: ${Object.keys(EN).length} strings`)
}

console.log(`English: ${Object.keys(EN).length} strings`)
const dir = join(root, "public/locales")
const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".json")) : []
if (!files.length) console.log("No translations yet (public/locales/<code>.json).")
let failed = false
for (const file of files) {
    const code = file.replace(/\.json$/, "")
    const dict = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>
    const { missing, unknown, badPlaceholders } = checkTranslation(code, dict)
    const same = Object.keys(EN).filter(k => dict[k] === (EN as Record<string, string>)[k])
    console.log(`\n${code}: ${missing.length ? `${missing.length} missing` : "complete"}, ${unknown.length} unknown keys, ${badPlaceholders.length} placeholder mismatches, ${same.length} still in English`)
    for (const k of missing.slice(0, 20)) console.log(`  missing      ${k}`)
    for (const k of unknown.slice(0, 20)) console.log(`  unknown      ${k}`)
    for (const k of badPlaceholders) console.log(`  placeholders ${k}`)
    if (badPlaceholders.length) failed = true
}

// How much of the interface is still hard-coded English (a rough count of JSX text).
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? (e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(join(d, e.name))) : e.name.endsWith(".tsx") ? [join(d, e.name)] : [])
let hardcoded = 0, translatedFiles = 0, total = 0
for (const f of ["app", "components", "src"].filter(d => existsSync(join(root, d))).flatMap(d => walk(join(root, d)))) {
    const src = readFileSync(f, "utf8")
    total++
    if (/from ["']@\/lib\/i18n["']/.test(src)) translatedFiles++
    hardcoded += (src.match(/>\s*[A-Z][a-z][^<>{}]{2,}</g) ?? []).length
}
console.log(`\nInterface: ${translatedFiles} of ${total} component files use the translation layer; about ${hardcoded} hard-coded text nodes left.`)
if (failed) process.exit(1)
