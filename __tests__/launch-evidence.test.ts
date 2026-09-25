import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const {summarize, artifactIdentity} = require('../scripts/launch/evidence.cjs')

test('required gates fail closed for missing, failed, duplicate and skipped evidence', () => {
  for (const gates of [[], [{id:'save',status:'failed'}], [{id:'save',status:'skipped'}], [{id:'save',status:'passed'},{id:'save',status:'passed'}]]) {
    expect(summarize(gates,['save']).passed).toBe(false)
  }
  expect(summarize([{id:'save',status:'passed'}],['save']).passed).toBe(true)
})
test('artifact attestation requires an executable and detects changed bytes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'esim-artifact-test-'))
  try {
    expect(()=>artifactIdentity(dir,{digest:'source',lockSha256:'lock'})).toThrow('executable missing')
    fs.writeFileSync(path.join(dir,'EsportsManager.exe'),'synthetic test fixture')
    const a = artifactIdentity(dir,{digest:'source',lockSha256:'lock'})
    fs.writeFileSync(path.join(dir,'EsportsManager.exe'),'changed fixture')
    const b = artifactIdentity(dir,{digest:'source',lockSha256:'lock'})
    expect(a.digest).not.toBe(b.digest)
    expect(a.sourceDigest).toBe('source')
  } finally {
    // One explicit test file in a freshly generated directory; no recursive delete.
    if (fs.existsSync(path.join(dir,'EsportsManager.exe'))) fs.unlinkSync(path.join(dir,'EsportsManager.exe'))
    fs.rmdirSync(dir)
  }
})
