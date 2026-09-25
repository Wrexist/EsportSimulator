import { readFile } from 'node:fs/promises'
import { notFound } from 'next/navigation'
import { isDevToolsEnabled } from '@/lib/runtime-flags'
import { PhysicalReplayPlayer } from '@/components/match/PhysicalReplayPlayer'
import type { SpatialRoundReplay } from '@/engine/spatial/round-replay'
import type { CareerRoundBinding } from '@/engine/spatial/career-round-adapter'

export const dynamic='force-dynamic'
export default async function PhysicalReplayReview() {
    if(!isDevToolsEnabled())notFound()
    let artifact:{replay:SpatialRoundReplay;binding:CareerRoundBinding}
    try {artifact=JSON.parse(await readFile('tmp/physical-career-radar-preview.json','utf8'))}
    catch {return <p className="p-8">Run npx tsx scripts/launch/check-physical-career.ts to create the local review recording.</p>}
    const names=Object.fromEntries(artifact.binding.players.map(p=>[p.playerId,p.actorId]))
    return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Mirage physical replay review</h1>
        <p className="text-sm text-slate-300">Local 5v5 test recording. These are test actors, not your career. No saves or rewards are changed.</p>
        <PhysicalReplayPlayer {...artifact} names={names}/>
    </main>
}
