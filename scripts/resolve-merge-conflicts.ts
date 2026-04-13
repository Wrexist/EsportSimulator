import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const MARKERS = ["<<<<<<<", "=======", ">>>>>>>"]

function hasMarker(content: string): boolean {
  return MARKERS.some(marker => content.includes(`\n${marker}`) || content.startsWith(marker))
}

function collectFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".next", "dist", "tmp"].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectFiles(full))
    else out.push(full)
  }
  return out
}

function main(): void {
  const root = process.cwd()
  const files = collectFiles(root)
  const conflicted = files
    .filter(file => {
      try {
        const content = fs.readFileSync(file, "utf8")
        return hasMarker(content)
      } catch {
        return false
      }
    })
    .map(file => path.relative(root, file))

  if (conflicted.length === 0) {
    console.log("No merge conflicts detected.")
    return
  }

  const lockfileOnly = conflicted.every(file => file === "package-lock.json")
  if (!lockfileOnly) {
    console.error("Conflicts detected in non-lockfile files. Resolve manually:")
    conflicted.forEach(file => console.error(`- ${file}`))
    process.exitCode = 1
    return
  }

  console.log("Conflict detected in package-lock.json. Regenerating lockfile...")
  const result = spawnSync("npm", ["install", "--package-lock-only"], { stdio: "inherit", cwd: root })
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    return
  }
  console.log("package-lock.json regenerated successfully.")
}

main()
