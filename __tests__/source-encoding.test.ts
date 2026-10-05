import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

// Next's compiler rejects non-UTF-8 source outright ("stream did not contain valid UTF-8").
// Windows tools that write ANSI (e.g. PowerShell 5.1 Set-Content) can silently introduce
// such bytes; tests and tsc still pass, so only the production build would catch it.
const SOURCE = /\.(ts|tsx|js|jsx|cjs|mjs|css|json)$/

describe("source encoding", () => {
    it("every tracked source file is valid UTF-8", () => {
        const root = path.resolve(__dirname, "..")
        const files = execFileSync("git", ["ls-files", "-z", "app", "components", "engine", "hooks", "lib", "store", "electron", "scripts", "data"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
            .split("\0").filter(file => SOURCE.test(file))
        const decoder = new TextDecoder("utf-8", { fatal: true })
        const invalid = files.filter(file => {
            try { decoder.decode(fs.readFileSync(path.join(root, file))); return false } catch { return true }
        })
        expect(invalid).toEqual([])
    })
})
