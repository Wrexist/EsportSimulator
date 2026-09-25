import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repo = path.resolve(__dirname,'..')
let sandbox: string
beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(),'esim-content-gate-'))
  fs.mkdirSync(path.join(sandbox,'config'))
  fs.mkdirSync(path.join(sandbox,'public/maps'),{recursive:true})
  fs.writeFileSync(path.join(sandbox,'config/steam-compliance-policy.json'),JSON.stringify({trademarkKeywords:['review-token'],legacyContaminatedAllowlist:[]}))
  fs.writeFileSync(path.join(sandbox,'STEAM_STORE_LISTING.md'),'Windows 1.0: manage a club and play a match.')
})
afterEach(() => {
  const resolved = path.resolve(sandbox)
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('esim-content-gate-')) throw new Error('Refusing unsafe test cleanup')
  fs.rmSync(resolved,{recursive:true})
})
function scan(...args: string[]) {
  return spawnSync(process.execPath,[path.join(repo,'node_modules/tsx/dist/cli.mjs'),path.join(repo,'scripts/steam-compliance-audit.ts'),'--strict-medium',...args],{cwd:sandbox,encoding:'utf8',windowsHide:true})
}
test('Windows 1.0 listing does not require an Early Access claim', () => {
  expect(scan().status).toBe(0)
})
test('contaminated map outside public/assets fails the real scanner', () => {
  fs.writeFileSync(path.join(sandbox,'public/maps/radar.png'),'<html>not an image</html>')
  expect(scan().status).toBe(1)
  const report = JSON.parse(fs.readFileSync(path.join(sandbox,'tmp/steam-compliance-report.json'),'utf8'))
  expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({code:'HTML_IN_IMAGE',file:'public/maps/radar.png'})]))
})
test('missing policy fails rather than silently using an empty policy', () => {
  fs.unlinkSync(path.join(sandbox,'config/steam-compliance-policy.json'))
  expect(scan().status).toBe(1)
})
test('bulk historical baselines cannot waive a required finding or be rewritten', () => {
  const baseline = JSON.stringify({acceptedMediumFindings:['TRADEMARK_KEYWORD_PATH|public/maps/review-token.txt']})
  fs.writeFileSync(path.join(sandbox,'config/steam-compliance-baseline.json'),baseline)
  fs.writeFileSync(path.join(sandbox,'public/maps/review-token.txt'),'needs review')
  expect(scan('--write-baseline').status).toBe(1)
  expect(fs.readFileSync(path.join(sandbox,'config/steam-compliance-baseline.json'),'utf8')).toBe(baseline)
})
