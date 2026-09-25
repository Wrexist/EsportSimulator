/** Fixed local compute soak. No UI, disk or leak certification. */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { computeWeek } from '../../engine/worker/compute-week'
import { canonicalWeekState } from '../../engine/worker/week-replay'
import type { GameSave } from '../../engine/save-types'
const root=process.cwd()
async function main() {
    const file=path.join(root,'tmp/l27-fixtures/full-world.json')
    const bytes=fs.readFileSync(file)
    const save:GameSave=JSON.parse(bytes.toString())
    const rows=[]
    for(let i=0;i<52;i++) {
        const start=performance.now()
        const result=await computeWeek(save,{playerTeamId:save.playerTeamId,trainingFocus:new Map()},save.lastRngSeed)
        if(!result.result.success) throw Error(result.result.error)
        const ms=performance.now()-start
        if(typeof global.gc==='function') global.gc()
        rows.push({week:save.currentWeek,ms,matches:result.result.matchesPlayed,heapBytes:process.memoryUsage().heapUsed,players:save.players.length,events:save.eventsLog.length,completedMatches:save.completedMatches.length,ledger:save.financeLedger.length})
        if((i+1)%13===0) console.log(JSON.stringify(rows.at(-1)))
    }
    const result={version:1,weeks:52,forcedGc:typeof global.gc==='function',inputHash:crypto.createHash('sha256').update(bytes).digest('hex'),outputHash:crypto.createHash('sha256').update(canonicalWeekState(save)).digest('hex'),rows,limitation:'Direct computeWeek soak on isolated full-world fixture. Excludes application post-week coordination, actual worker transport, browser/native memory, rendering and durable storage. Does not establish a 60-minute UI soak or long-career balance.'}
    fs.writeFileSync(path.join(root,'docs/launch-readiness/evidence/L27-compute-soak.json'),JSON.stringify(result,null,2)+'\n')
}
main().catch(error=>{console.error(error);process.exitCode=1})
