import fs from "node:fs"
import path from "node:path"

const SKIP_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "out", "tmp", "SteamBuild"])
const MARKERS = ["<<<<<<<", "=======", ">>>>>>>"]

function walk(root: string): string[] {
  const files: string[] = []
  const queue = [root]
  while (queue.length) {
    const dir = queue.pop()!
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(full)
      } else {
        files.push(full)
      }
    }
  }
  return files
}

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  const binaryExt = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".pdf", ".zip", ".exe", ".dll", ".woff", ".woff2"])
  return !binaryExt.has(ext)
}

function main(): void {
  const root = process.cwd()
  const offenders: Array<{ file: string; line: number; marker: string }> = []

  for (const file of walk(root)) {
    if (!isTextFile(file)) continue

    let content = ""
    try {
      content = fs.readFileSync(file, "utf8")
    } catch {
      continue
    }

    const lines = content.split(/\r?\n/)
    lines.forEach((line, index) => {
      const marker = MARKERS.find(m => line.startsWith(m))
      if (marker) {
        offenders.push({ file: path.relative(root, file), line: index + 1, marker })
      }
    })
  }

  if (offenders.length > 0) {
    console.error(`Found ${offenders.length} unresolved merge conflict marker(s):`)
    offenders.slice(0, 50).forEach(o => console.error(`- ${o.file}:${o.line} (${o.marker})`))
    if (offenders.length > 50) {
      console.error(`... and ${offenders.length - 50} more`)
    }
    process.exitCode = 1
    return
  }

  console.log("PASS: no unresolved merge conflict markers found")
}

main()
