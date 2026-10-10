/**
 * Match-engine calibration against the pro-CS2 table (Phase 2B, item H).
 *
 *   npx tsx scripts/calibrate-engine.ts --engine legacy-v2 --samples 600
 *   npx tsx scripts/calibrate-engine.ts --engine script-v1 --samples 600 --json tmp/script-v1.json
 *   npx tsx scripts/calibrate-engine.ts --metrics rounds_per_map,ot_rate,agency_*
 *   npx tsx scripts/calibrate-engine.ts --compare docs/revamp/calibration/legacy-v2.json tmp/script-v1.json
 *
 * Options
 *   --engine <id>     legacy-v2 | script-v1 (default: DEFAULT_MATCH_ENGINE)
 *   --samples <n>     realism maps; the other suites scale from it (default 600)
 *   --seed <n>        base seed (default 20261010)
 *   --metrics <list>  comma list of metric ids, `prefix*` patterns or group names
 *   --json <file>     also write the report as JSON (input for --compare)
 *   --md <file>       also write the markdown report
 *   --strict          exit 1 when any metric fails
 *   --quiet           no progress on stderr
 *
 * Library, targets and engine selection: engine/match/calibration/.
 * An engine the registry does not mark runnable is reported as
 * "not available" (exit 0), never simulated.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_MATCH_ENGINE, MATCH_ENGINES, isMatchEngineId } from '../engine/match/engine-registry'
import { runCalibration, type CalibrationReport } from '../engine/match/calibration/run'
import { formatComparison, formatMarkdown, formatTable } from '../engine/match/calibration/report'

const DEFAULT_SAMPLES = 600
const DEFAULT_SEED = 20261010

interface Args { engine: string; samples: number; seed: number; metrics?: string[]; json?: string; md?: string; strict: boolean; quiet: boolean; compare?: [string, string] }

function parseArgs(argv: string[]): Args {
    const args: Args = { engine: DEFAULT_MATCH_ENGINE, samples: DEFAULT_SAMPLES, seed: DEFAULT_SEED, strict: false, quiet: false }
    const value = (i: number, flag: string) => {
        const v = argv[i + 1]
        if (v === undefined || v.startsWith('--')) throw Error(`${flag} needs a value`)
        return v
    }
    const int = (v: string, flag: string) => {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 1) throw Error(`${flag} must be a positive integer`)
        return n
    }
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i]
        switch (flag) {
            case '--engine': args.engine = value(i, flag); i++; break
            case '--samples': args.samples = int(value(i, flag), flag); i++; break
            case '--seed': args.seed = int(value(i, flag), flag); i++; break
            case '--metrics': args.metrics = value(i, flag).split(',').map(s => s.trim()).filter(Boolean); i++; break
            case '--json': args.json = value(i, flag); i++; break
            case '--md': args.md = value(i, flag); i++; break
            case '--compare': args.compare = [value(i, flag), value(i + 1, flag)]; i += 2; break
            case '--strict': args.strict = true; break
            case '--quiet': args.quiet = true; break
            case '--help': case '-h':
                console.log(readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*|^ \* ?/gm, ''))
                process.exit(0)
                break
            default: throw Error(`Unknown option ${flag} (see --help)`)
        }
    }
    return args
}

function writeFile(file: string, text: string): void {
    mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
    writeFileSync(file, text)
}

function readReport(file: string): CalibrationReport {
    const report = JSON.parse(readFileSync(file, 'utf8')) as CalibrationReport
    if (!Array.isArray(report.metrics)) throw Error(`${file} is not a calibration report`)
    return report
}

function main(): void {
    const args = parseArgs(process.argv.slice(2))
    if (args.compare) {
        console.log(formatComparison(readReport(args.compare[0]), readReport(args.compare[1])))
        return
    }
    if (!isMatchEngineId(args.engine)) throw Error(`Unknown engine "${args.engine}" (known: ${MATCH_ENGINES.join(', ')})`)

    // Live progress only on a terminal; piped output stays clean.
    const showProgress = !args.quiet && !!process.stderr.isTTY
    let lastSuite = ''
    const report = runCalibration({
        engine: args.engine,
        samples: args.samples,
        seed: args.seed,
        metrics: args.metrics,
        onProgress: showProgress ? (suite, done, total) => {
            if (suite !== lastSuite && lastSuite) process.stderr.write('\n')
            lastSuite = suite
            if (done === total || done % 25 === 0) process.stderr.write(`\r  ${suite} ${done}/${total}`)
        } : undefined,
    })
    if (lastSuite) process.stderr.write('\n\n')

    console.log(formatTable(report))
    if (args.json) writeFile(args.json, JSON.stringify(report, null, 2) + '\n')
    if (args.md) {
        const command = ['npx tsx scripts/calibrate-engine.ts', '--engine', args.engine, '--samples', String(args.samples), '--seed', String(args.seed),
            ...(args.metrics ? ['--metrics', args.metrics.join(',')] : []),
            ...(args.json ? ['--json', args.json.replace(/\\/g, '/')] : []), '--md', args.md.replace(/\\/g, '/')].join(' ')
        writeFile(args.md, formatMarkdown(report, { command, date: new Date().toISOString().slice(0, 10) }))
    }
    if (args.strict && report.summary.fail > 0) process.exit(1)
}

try {
    main()
} catch (error) {
    console.error((error as Error).message)
    process.exit(1)
}
