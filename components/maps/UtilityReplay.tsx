import type { EncounterResult } from '@/engine/spatial/encounter'
import type { SpatialReference, Vec3 } from '@/engine/spatial/types'
import { replayFloor } from '@/engine/spatial/career-radar'
import { toRadar } from '@/engine/spatial/types'

const colors = { smoke: '#c5d2dc', flash: '#fff0a3', he: '#c7a0ff', fire: '#ff9c66', decoy: '#e6a1d2' }
export function UtilityReplay({ result, tick, reference, unit, floor }: { result: { utility?: Pick<NonNullable<EncounterResult['utility']>, 'effects' | 'flights'> }; tick: number; reference: SpatialReference; unit: number; floor?: 'upper'|'lower' }) {
    const xy = (p: Vec3) => toRadar(p, reference), scale = 1 / (reference.transform.scale * 10.24)
    const onFloor = (p: Vec3) => !floor || replayFloor(p,reference)===floor
    return <g aria-label="Observer utility trajectories and effects">
        {result.utility?.effects.filter(e => onFloor(e.point) && tick >= e.start && tick < Math.max(e.end, e.start + 16)).map(e => <g key={e.id}>
            {(e.kind === 'fire' || e.kind === 'smoke') ? e.cells?.filter(p => e.kind !== 'fire' || Math.hypot(p[0] - e.point[0], p[1] - e.point[1]) <= Math.min(100, 20 + (tick - e.start) / 64 * 60)).map((p, i) => <rect key={i} x={xy(p)[0] - 10 * scale} y={xy(p)[1] - 10 * scale} width={20 * scale} height={20 * scale} rx={3 * scale} fill={colors[e.kind]} opacity={e.kind === 'fire' ? 0.65 : 0.42} />) : <circle cx={xy(e.point)[0]} cy={xy(e.point)[1]} r={(e.kind === 'decoy' ? 2 + (tick - e.start) % 32 / 16 : 3) * unit} fill="none" stroke={colors[e.kind]} strokeWidth={0.3 * unit} />}
            <text x={xy(e.point)[0]} y={xy(e.point)[1] - 2 * unit} fontSize={1.7 * unit} textAnchor="middle" fill={colors[e.kind]}>{e.kind}</text>
        </g>)}
        {result.utility?.flights.filter(f => f.start <= tick).map(f => {
            const path = f.path.filter(p => p.tick <= tick), last = path.at(-1)
            return <g key={f.id}>{path.slice(1).map((p,i)=>onFloor(path[i].point)&&onFloor(p.point)?<line key={i} x1={xy(path[i].point)[0]} y1={xy(path[i].point)[1]} x2={xy(p.point)[0]} y2={xy(p.point)[1]} stroke={colors[f.kind]} strokeWidth={0.25*unit} />:null)}{last && onFloor(last.point) && <circle cx={xy(last.point)[0]} cy={xy(last.point)[1]} r={0.65 * unit} fill={colors[f.kind]} stroke="#10212d" strokeWidth={0.2 * unit} />}</g>
        })}
    </g>
}
