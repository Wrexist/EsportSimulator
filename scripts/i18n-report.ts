/**
 * G11 translation prep: checks translators' files against English and shows
 * how much of the interface already goes through the translation layer.
 *
 *   npx tsx scripts/i18n-report.ts            report
 *   npx tsx scripts/i18n-report.ts --all      list every hard-coded JSX text node
 *   npx tsx scripts/i18n-report.ts --template write locales/template.json (English text to translate)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, relative, sep } from "node:path"
import ts from "typescript"
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

// How much of the interface is still hard-coded English. JSX text only (the TypeScript parser tells
// `<b>Text</b>` from `Promise<Text>`), outside the dev-only screens (I18N-27).
const walk = (d: string, ext: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? (e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(join(d, e.name), ext)) : e.name.endsWith(ext) ? [join(d, e.name)] : [])
const DEV_ONLY = [join(root, "app", "dev"), join(root, "components", "dev")]
const isDev = (f: string) => DEV_ONLY.some(d => f.startsWith(d + sep))
const lineOf = (sf: ts.SourceFile, node: ts.Node) => `${relative(root, sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`
let translatedFiles = 0, total = 0
const hardcoded: string[] = []
for (const f of ["app", "components", "src"].filter(d => existsSync(join(root, d))).flatMap(d => walk(join(root, d), ".tsx")).filter(f => !isDev(f))) {
    const src = readFileSync(f, "utf8")
    total++
    if (/from ["']@\/lib\/i18n["']/.test(src)) translatedFiles++
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
        // Two letters in a row: words, not "·", "/" or "%".
        if (ts.isJsxText(node) && /\p{L}{2}/u.test(node.text)) hardcoded.push(`${lineOf(sf, node)}  ${node.text.trim().replace(/\s+/g, " ").slice(0, 60)}`)
        ts.forEachChild(node, visit)
    }
    visit(sf)
}
console.log(`\nInterface: ${translatedFiles} of ${total} component files use the translation layer; ${hardcoded.length} JSX text nodes are hard-coded.`)
for (const h of hardcoded.slice(0, process.argv.includes("--all") ? undefined : 40)) console.log(`  ${h}`)

// Engine-written news and inbox items must carry translation keys (newsText / eventText refs), or the
// player reads English in every language (I18N-01). Flags pushes whose title/content/message is a plain string.
const TEXT_PROPS = new Set(["title", "content", "message", "description"])
const isPlainText = (e: ts.Expression): boolean =>
    ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e) || (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken)
const plainLines: string[] = []
for (const f of ["engine", "store", "lib"].filter(d => existsSync(join(root, d))).flatMap(d => walk(join(root, d), ".ts"))) {
    const src = readFileSync(f, "utf8")
    if (!/(newsFeed|eventsLog)\.(unshift|push)\(/.test(src)) continue
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const checkObject = (obj: ts.ObjectLiteralExpression) => {
        for (const p of obj.properties) {
            if (!ts.isPropertyAssignment(p)) continue
            const name = p.name.getText(sf)
            if (TEXT_PROPS.has(name) && isPlainText(p.initializer)) plainLines.push(`${lineOf(sf, p)}  ${name}: ${p.initializer.getText(sf).slice(0, 60)}`)
            if (name === "data" && ts.isObjectLiteralExpression(p.initializer)) checkObject(p.initializer)
        }
    }
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
            && /^(unshift|push)$/.test(node.expression.name.text)
            && /(newsFeed|eventsLog)$/.test(node.expression.expression.getText(sf))) {
            for (const arg of node.arguments) if (ts.isObjectLiteralExpression(arg)) checkObject(arg)
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
}
console.log(`\nStored text: ${plainLines.length} news/inbox pushes write a plain English title, content or message (use newsText / eventText).`)
for (const l of plainLines) console.log(`  ${l}`)
if (failed) process.exit(1)
