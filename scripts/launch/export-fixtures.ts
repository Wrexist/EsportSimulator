import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createLaunchFixture, FixtureStorage, SCENARIOS, EXPECTATIONS } from './fixtures'
import { SaveManager } from '../../engine/save-manager'
import { validateSaveSchema } from '../../engine/save-schema'

const root = process.cwd()
const parent = path.join(root, 'tmp', 'launch-fixtures')
fs.mkdirSync(parent, { recursive: true })
const out = fs.mkdtempSync(path.join(parent, 'run-'))
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
const manifest = {
  format: 'esim-qa-fixtures', version: 1, seed: 3402,
  head: execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),
  lockSha256: hash(fs.readFileSync(path.join(root,'package-lock.json'))),
  factorySha256: hash(fs.readFileSync(path.join(root,'scripts/launch/fixtures.ts'))),
  reset: 'Generate again into a new run directory. Import only through normal game UI on a dedicated browser profile at http://localhost:3210. Never import into the owner career origin http://127.0.0.1:3210. Never clear owner storage.',
  limitations: 'Synthetic QA inputs, not balanced careers or browser acceptance. Native file import may require the tester to select the file.',
  fixtures: [] as object[],
}
try {
  for (const scenario of SCENARIOS) {
    const save = createLaunchFixture(scenario, manifest.seed)
    const schema = validateSaveSchema(save)
    if (!schema.ok) throw new Error(`${scenario}: ${schema.issues.join('; ')}`)
    const manager = new SaveManager(new FixtureStorage())
    const bytes = manager.exportSave(save)
    const imported = manager.importSave(bytes)
    if (!imported.save) throw new Error(`${scenario}: ${imported.error}`)
    const file = `${scenario}.json`
    fs.writeFileSync(path.join(out,file), bytes)
    manifest.fixtures.push({scenario, file, sha256:hash(bytes), saveVersion:save.saveVersion, week:save.currentWeek,
      steps:['Import synthetic save on QA origin',...EXPECTATIONS[scenario], 'Export last-good save before each destructive scenario', 'Close QA tab; reopen and load; compare week, roster, finances and pending activities'],
      status:'schema and production import validated; browser acceptance pending'})
  }
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
  console.log(`PASS: ${SCENARIOS.length} deterministic fixtures validated by production importer. ${path.relative(root,out)}`)
} catch (error) {
  fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({manifest,error:String(error)},null,2))
  console.error(error); process.exitCode = 1
}
