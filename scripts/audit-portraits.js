#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const sharp = require("sharp")

const root = process.cwd()
const playersPath = path.join(root, "raw-data", "snapshot", "players.json")
const publicDir = path.join(root, "public")
const minSourceSize = Number(process.env.PORTRAIT_MIN_SIZE || 512)
const minFileBytes = Number(process.env.PORTRAIT_MIN_BYTES || 4096)
const strict = process.argv.includes("--strict")
const json = process.argv.includes("--json")
const blockingIssueTypes = new Set([
  "missing-path",
  "missing-file",
  "path-points-to-missing-source-but-webp-exists",
  "unreadable-image",
])

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function publicAssetPath(assetPath) {
  if (!assetPath || typeof assetPath !== "string") return null
  const clean = assetPath.replace(/^[\\/]+/, "").replace(/\//g, path.sep)
  return path.join(publicDir, clean)
}

function webpSibling(filePath) {
  if (!filePath) return null
  return filePath.replace(/\.(png|jpg|jpeg)$/i, ".webp")
}

async function inspectImage(player) {
  const issues = []
  const assetPath = player.portraitPath
  const filePath = publicAssetPath(assetPath)

  if (!assetPath) {
    return { player, issues: ["missing-path"] }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    const altWebp = webpSibling(filePath)
    if (altWebp && fs.existsSync(altWebp)) {
      issues.push("path-points-to-missing-source-but-webp-exists")
    } else {
      issues.push("missing-file")
      return { player, issues }
    }
  }

  const realPath = fs.existsSync(filePath) ? filePath : webpSibling(filePath)
  const ext = path.extname(assetPath).toLowerCase()
  if (ext !== ".webp") issues.push("non-webp-path")

  const stat = fs.statSync(realPath)
  if (stat.size < minFileBytes) issues.push("tiny-file")

  try {
    const meta = await sharp(realPath).metadata()
    const width = meta.width || 0
    const height = meta.height || 0
    if (width !== height) issues.push("not-square")
    if (width < minSourceSize || height < minSourceSize) issues.push("below-512-source")
  } catch (error) {
    issues.push("unreadable-image")
  }

  return { player, issues }
}

async function main() {
  if (!fs.existsSync(playersPath)) {
    throw new Error(`Missing snapshot players file: ${playersPath}`)
  }

  const players = readJson(playersPath)
  const results = await Promise.all(players.map(inspectImage))
  const failures = results.filter((result) => result.issues.length > 0)
  const broken = failures.filter((result) => result.issues.some((issue) => blockingIssueTypes.has(issue)))
  const issueCounts = failures.reduce((acc, result) => {
    for (const issue of result.issues) acc[issue] = (acc[issue] || 0) + 1
    return acc
  }, {})

  const summary = {
    checked: players.length,
    passed: players.length - failures.length,
    pathResolved: players.length - broken.length,
    broken: broken.length,
    failed: failures.length,
    minSourceSize,
    minFileBytes,
    issueCounts,
    failures: failures.slice(0, 50).map(({ player, issues }) => ({
      id: player.id,
      nickname: player.nickname,
      portraitPath: player.portraitPath,
      issues,
    })),
  }

  if (json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log(`Portrait audit: ${summary.passed}/${summary.checked} passed`)
    console.log(`Resolved portrait paths: ${summary.pathResolved}/${summary.checked}`)
    for (const [issue, count] of Object.entries(issueCounts)) {
      console.log(`- ${issue}: ${count}`)
    }
    if (failures.length > summary.failures.length) {
      console.log(`Showing first ${summary.failures.length} of ${failures.length} failures.`)
    }
    for (const failure of summary.failures) {
      console.log(`  ${failure.nickname} (${failure.id}) -> ${failure.issues.join(", ")} :: ${failure.portraitPath}`)
    }
  }

  if (strict && failures.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
