import fs from "node:fs"
import path from "node:path"

type FindingLevel = "HIGH" | "MEDIUM" | "LOW"

type Finding = {
  level: FindingLevel
  code: string
  file: string
  detail: string
}

type CompliancePolicy = {
  trademarkKeywords: string[]
  legacyContaminatedAllowlist: string[]
}

type ComplianceBaseline = {
  acceptedMediumFindings: string[]
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"])
const TEXT_SIGNATURES = ["<!doctype html", "<html", "<?xml", "<svg", "<!DOCTYPE html"]
const BINARY_IMAGE_PREFIXES = [
  Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from("GIF87a"),
  Buffer.from("GIF89a"),
  Buffer.from("RIFF"),
]

function loadPolicy(): CompliancePolicy {
  const policyPath = path.join(process.cwd(), "config", "steam-compliance-policy.json")
  if (!fs.existsSync(policyPath)) throw new Error("Required compliance policy is missing")

  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8")) as CompliancePolicy
    if (!Array.isArray(parsed.trademarkKeywords) || !parsed.trademarkKeywords.every(k => typeof k === "string" && k.length > 0) || !Array.isArray(parsed.legacyContaminatedAllowlist)) throw new Error("Invalid compliance policy")
    return {
      trademarkKeywords: Array.isArray(parsed.trademarkKeywords) ? parsed.trademarkKeywords : [],
      legacyContaminatedAllowlist: Array.isArray(parsed.legacyContaminatedAllowlist) ? parsed.legacyContaminatedAllowlist : [],
    }
  } catch {
    throw new Error("Required compliance policy could not be validated")
  }
}

function loadBaseline(): ComplianceBaseline {
  const baselinePath = path.join(process.cwd(), "config", "steam-compliance-baseline.json")
  if (!fs.existsSync(baselinePath)) return { acceptedMediumFindings: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as ComplianceBaseline
    return {
      acceptedMediumFindings: Array.isArray(parsed.acceptedMediumFindings) ? parsed.acceptedMediumFindings : [],
    }
  } catch {
    return { acceptedMediumFindings: [] }
  }
}

function isBinaryImage(buffer: Buffer): boolean {
  if (buffer.length < 4) return false
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return true
  return BINARY_IMAGE_PREFIXES.some(prefix => buffer.subarray(0, prefix.length).equals(prefix))
}

function looksLikeHtmlOrXml(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 512).toString("utf8").trimStart().toLowerCase()
  return TEXT_SIGNATURES.some(sig => head.startsWith(sig.toLowerCase()))
}

function walk(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const files: string[] = []
  const queue = [root]
  while (queue.length) {
    const dir = queue.pop()!
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) queue.push(fullPath)
      else files.push(fullPath)
    }
  }
  return files
}

function runAudit(policy: CompliancePolicy): Finding[] {
  const findings: Finding[] = []
  const repoRoot = process.cwd()
  if (!fs.existsSync(path.join(repoRoot, "public"))) throw new Error("Required public asset directory is missing")
  const legacyAllowlist = new Set(policy.legacyContaminatedAllowlist)

  for (const fullPath of walk(path.join(repoRoot, "public"))) {
    const rel = path.relative(repoRoot, fullPath).replaceAll("\\", "/")
    const ext = path.extname(fullPath).toLowerCase()

    if (IMAGE_EXTENSIONS.has(ext)) {
      const bytes = fs.readFileSync(fullPath)
      if (!isBinaryImage(bytes) && looksLikeHtmlOrXml(bytes)) {
        const isLegacyKnown = legacyAllowlist.has(rel)
        findings.push({
          level: isLegacyKnown ? "MEDIUM" : "HIGH",
          code: isLegacyKnown ? "HTML_IN_IMAGE_LEGACY" : "HTML_IN_IMAGE",
          file: rel,
          detail: isLegacyKnown
            ? "Known contaminated legacy asset. Keep excluded from build until replaced."
            : "Image path contains HTML/XML payload instead of binary image content.",
        })
      }
    }

    const loweredPath = rel.toLowerCase()
    const keyword = policy.trademarkKeywords.find(kw => loweredPath.includes(kw))
    if (keyword) {
      findings.push({
        level: "MEDIUM",
        code: "TRADEMARK_KEYWORD_PATH",
        file: rel,
        detail: `Path contains keyword '${keyword}' that may require licensing verification.`,
      })
    }
  }

  const listingPath = path.join(repoRoot, "STEAM_STORE_LISTING.md")
  if (fs.existsSync(listingPath)) {
    const text = fs.readFileSync(listingPath, "utf8")
    const hasLaunchScope = /Windows 1\.0/i.test(text)
    const mentionsGameplay = /gameplay|manage|recruit|tournament|match/i.test(text)

    if (!hasLaunchScope || !mentionsGameplay) {
      findings.push({
        level: "HIGH",
        code: "LAUNCH_SCOPE_MISSING",
        file: "STEAM_STORE_LISTING.md",
        detail: "Windows 1.0 scope or gameplay description is missing from the store draft.",
      })
    }
  } else {
    findings.push({
      level: "MEDIUM",
      code: "STORE_LISTING_FILE_MISSING",
      file: "STEAM_STORE_LISTING.md",
      detail: "Store listing source file is missing from repository.",
    })
  }

  return findings
}

function main(): void {
  const policy = loadPolicy()
  const baseline = loadBaseline()
  const findings = runAudit(policy)
  const grouped = {
    high: findings.filter(f => f.level === "HIGH").length,
    medium: findings.filter(f => f.level === "MEDIUM").length,
    low: findings.filter(f => f.level === "LOW").length,
  }

  const outDir = path.join(process.cwd(), "tmp")
  fs.mkdirSync(outDir, { recursive: true })
  const reportPath = path.join(outDir, "steam-compliance-report.json")
  fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), scope: "All public files: filename keywords and raster signatures only. Does not verify inline artwork, provenance, licenses or packaged inclusion.", grouped, findings }, null, 2))

  console.log("=== Steam Compliance Audit ===")
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`)
  console.log(`High: ${grouped.high} | Medium: ${grouped.medium} | Low: ${grouped.low}`)

  for (const finding of findings.slice(0, 20)) {
    console.log(`[${finding.level}] ${finding.code} :: ${finding.file} -> ${finding.detail}`)
  }
  if (findings.length > 20) {
    console.log(`... ${findings.length - 20} additional finding(s) in full report`)
  }

  const strictMedium = process.argv.includes("--strict-medium")
  const writeBaseline = process.argv.includes("--write-baseline")

  // Historical bulk baselines are retained as compatibility inputs, never release approval.
  const acceptedMedium = new Set<string>()
  console.log(`Historical baseline entries ignored for release: ${baseline.acceptedMediumFindings.length}`)
  const newMediumFindings = findings.filter(f => f.level === "MEDIUM" && !acceptedMedium.has(`${f.code}|${f.file}`))

  if (writeBaseline) {
    console.error("Bulk acceptance is disabled. Findings need individual review, evidence and expiry in L08; no files were changed.")
    process.exitCode = 1
  }

  if (strictMedium) {
    console.log(`Strict mode medium delta: ${newMediumFindings.length} new / ${grouped.medium} total`)
  }

  if (grouped.high > 0 || (strictMedium && newMediumFindings.length > 0)) {
    process.exitCode = 1
  }
}

main()
