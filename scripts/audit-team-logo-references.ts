import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

async function main() {
    const root = process.cwd()
    const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as Array<{ id: string; name: string; logoPath: string }>
    const raw = read("raw-data/snapshot/teams.json")
    const shipped = read("public/data/snapshot/teams.json")
    const rows = await Promise.all(shipped.map(async team => {
        // Sanitization preserved the rank prefix. Ambiguous prefixes need manual review.
        const matches = raw.filter(source => source.id.split("_")[1] === team.id.split("_")[1])
        const source = matches.length === 1 ? matches[0] : undefined
        const directory = source?.logoPath.replace(/\/[^/]+$/, "")
        const candidates = directory ? [`${directory}/logo.original.webp`, source!.logoPath] : []
        const reference = candidates.find(file => fs.existsSync(path.join(root, "public", file)))
        const meta = reference ? await sharp(path.join(root, "public", reference)).metadata() : undefined
        return { id: team.id, name: team.name, sourceName: source?.name ?? null, mapping: source ? "preserved-rank-candidate" : "ambiguous", reference: reference ?? null, width: meta?.width ?? null, height: meta?.height ?? null, status: !source ? "unmatched" : !reference ? "missing" : (meta?.width ?? 0) < 128 ? "small-reference" : "available" }
    }))
    const output = path.join(root, "docs/audit-2026-09-12/logo-reference-audit.json")
    fs.writeFileSync(output, JSON.stringify(rows, null, 2) + "\n")
    const counts = rows.reduce<Record<string, number>>((result, row) => { result[row.status] = (result[row.status] ?? 0) + 1; return result }, {})
    process.stdout.write(JSON.stringify(counts) + "\n")
}

void main()
