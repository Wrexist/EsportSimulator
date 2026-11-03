/**
 * Text must be translated when it renders, never when a module loads: a
 * module-level t() call freezes the string in whatever language was active
 * at import time (English), so a language change would never reach it.
 */
import * as ts from "typescript"
import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

const ROOT = join(__dirname, "..")
const DIRS = ["components", "app", "lib", "src"]

function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(path)
    }
    return out
}

function moduleLevelCalls(path: string): string[] {
    const src = readFileSync(path, "utf8")
    if (!/\bt\(|\btn\(/.test(src)) return []
    const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const found: string[] = []
    const visit = (node: ts.Node, insideFunction: boolean) => {
        const inside = insideFunction || ts.isFunctionLike(node) || ts.isClassDeclaration(node)
        if (!inside && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === "t" || node.expression.text === "tn")) {
            found.push(`${path.slice(ROOT.length + 1)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
        }
        ts.forEachChild(node, child => visit(child, inside))
    }
    visit(sf, false)
    return found
}

describe("translations happen at render time", () => {
    it("no t() or tn() call runs when a module loads", () => {
        const files = DIRS.flatMap(dir => sourceFiles(join(ROOT, dir)))
        expect(files.length).toBeGreaterThan(100)
        expect(files.flatMap(moduleLevelCalls)).toEqual([])
    })
})
