"use client"

import { useEffect, useRef, useState, type RefObject } from 'react'
import { DEFAULT_ENCOUNTER, LAB_RIFLE, type ActorId, type CombatProfile, type EncounterResult, type EncounterSettings } from '@/engine/spatial/encounter'
import { toRadar, type SpatialReference, type Vec3 } from '@/engine/spatial/types'
import { parseLabProject, type LabProject } from '@/lib/spatial-lab-project'
import styles from './encounter-lab.module.css'
import { UtilityControls } from './UtilityControls'
import { UtilityReplay } from './UtilityReplay'

interface Props { project: LabProject | null; reference: SpatialReference | null; worker: RefObject<Worker | null>; disabled: boolean; edit: (project: LabProject) => void }
export function EncounterLab({ project, reference, worker, disabled, edit }: Props) {
    const settings = project?.encounter || DEFAULT_ENCOUNTER
    const [result, setResult] = useState<EncounterResult | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('Place A and B on the map above, then set their starting view directions.')
    const [tick, setTick] = useState(0), [playing, setPlaying] = useState(false), [perspective, setPerspective] = useState<ActorId | 'world'>('A')
    const [example, setExample] = useState('clear-duel')
    const [focused, setFocused] = useState(true), [replayRate, setReplayRate] = useState(0.25)
    const request = useRef(0), timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        request.current++; setResult(null); setBusy(false); setPlaying(false); setTick(0)
        setMessage('Setup changed. Run an encounter to inspect the new result.')
        if (timeout.current) clearTimeout(timeout.current)
    }, [project])
    useEffect(() => {
        const instance = worker.current
        if (!reference || !instance) return
        const receive = (event: MessageEvent) => {
            if (event.data.id !== `encounter:${request.current}`) return
            if (timeout.current) clearTimeout(timeout.current)
            setBusy(false)
            if (event.data.type === 'error') { setMessage(event.data.message); return }
            if (event.data.type === 'encounter-result') { setResult(event.data.result); setTick(0); setMessage(event.data.movement) }
        }
        const failed = () => { setBusy(false); setMessage('Worker unavailable. Reload the lab to retry.') }
        instance.addEventListener('message', receive); instance.addEventListener('error', failed)
        return () => { instance.removeEventListener('message', receive); instance.removeEventListener('error', failed); request.current++; if (timeout.current) clearTimeout(timeout.current) }
    }, [reference, worker])
    useEffect(() => {
        if (!playing || !result) return
        const timer = setInterval(() => setTick(t => Math.min(result.frames.length - 1, t + 1)), 1000 / (64 * replayRate))
        return () => clearInterval(timer)
    }, [playing, result, replayRate])
    useEffect(() => { if (result && tick >= result.frames.length - 1) setPlaying(false) }, [tick, result])
    const update = (patch: Partial<EncounterSettings>) => project && !disabled && edit({ ...project, encounter: { ...settings, ...patch } })
    const player = (id: 'a' | 'b', patch: Partial<CombatProfile>) => update({ [id]: { ...settings[id], ...patch } })
    const openExample = async () => {
        if (!reference || !project || reference.mapId !== 'Mirage') return
        const captured = project, token = ++request.current
        setBusy(true)
        try {
            const response = await fetch(`/map-studio/encounters/${example.startsWith("utility-") ? "l12" : "l11"}/${example}.lab.json`)
            if (!response.ok) throw Error('Example file is unavailable')
            const next = parseLabProject(await response.text(), reference)
            if (token !== request.current) return
            if (next.utility) setPerspective("world")
            const url = URL.createObjectURL(new Blob([JSON.stringify(captured, null, 2)], { type: 'application/json' }))
            const a = document.createElement('a'); a.href = url; a.download = 'mirage-before-encounter-example.spatial-lab.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
            edit(next)
        } catch (error) { if (token === request.current) setMessage(error instanceof Error ? error.message : 'Could not open example') }
        finally { if (token === request.current) setBusy(false) }
    }
    const face = (away: boolean) => {
        if (!project?.a || !project.b) return
        const a = project.a.point, b = project.b.point, yaw = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
        const pitch = Math.atan2(b[2] - a[2], Math.hypot(b[0] - a[0], b[1] - a[1])) * 180 / Math.PI
        const reverse = yaw > 0 ? yaw - 180 : yaw + 180
        update({ a: { ...settings.a, yaw: away ? reverse : yaw, pitch: Math.max(-89, Math.min(89, pitch)) }, b: { ...settings.b, yaw: reverse, pitch: Math.max(-89, Math.min(89, -pitch)) } })
    }
    const run = () => {
        if (!project?.a || !project.b || !worker.current) return
        request.current++; setBusy(true); setPlaying(false); setResult(null); setTick(0); setMessage('Resolving perception and shots in the background…')
        worker.current.postMessage({ type: 'encounter', id: `encounter:${request.current}`, project: { ...project, encounter: settings } })
        timeout.current = setTimeout(() => { request.current++; setBusy(false); setMessage('Encounter exceeded its time limit. Reload the lab to retry.') }, 30000)
    }
    const frame = result?.frames[tick], observer = frame?.actors.find(a => a.id === perspective)
    const shownActors = frame?.actors.filter(a => perspective === 'world' || a.id === perspective) || []
    const events = result?.events.filter(e => e.tick <= tick && (perspective === 'world' || e.actor === perspective)) || []
    const xy = (p: Vec3) => reference ? toRadar(p, reference) : [0, 0]
    // The camera uses the known scenario setup only; it never tracks a hidden actor's live position.
    const startA = project?.a ? xy(project.a.point) : [50, 50], startB = project?.b ? xy(project.b.point) : [50, 50]
    const span = focused && project?.a && project.b ? Math.min(100, Math.max(18, Math.abs(startA[0] - startB[0]) + 12, Math.abs(startA[1] - startB[1]) + 12)) : 100
    const unit = span / 100, left = Math.max(0, Math.min(100 - span, (startA[0] + startB[0]) / 2 - span / 2)), top = Math.max(0, Math.min(100 - span, (startA[1] + startB[1]) / 2 - span / 2))
    const exportReplay = () => {
        if (!result || !reference || !project) return
        const blob = new Blob([JSON.stringify({ format: 'esim-encounter-replay', version: 1, sourceVersion: reference.sourceVersion, meshSha256: reference.meshSha256, project: { ...project, encounter: settings }, result }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `${project.mapId.toLowerCase()}-encounter-replay.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return <section id="controlled-encounter" className={styles.encounter} aria-label="Controlled encounter">
        <div className={styles.heading}><div><span>CONTROLLED ENCOUNTER · L11 / L12</span><h2>See. React. Resolve.</h2><p>Test perception, shots and utility against the map geometry. Replay the result, tick by tick.</p></div><button onClick={run} disabled={disabled || busy || !project?.a || !project.b}>{busy ? 'Running…' : 'Run encounter'}</button></div>
        <div className={styles.layout}>
            <div className={styles.setup}>
                <label>Mirage example<select aria-label="Mirage encounter example" value={example} disabled={busy || disabled || reference?.mapId !== 'Mirage'} onChange={e => setExample(e.target.value)}><option value="clear-duel">Clear sight · reaction duel</option><option value="opaque-wall">Opaque geometry · no contact</option><option value="facing-away">Both players face away</option><option value="empty-magazine">A must reload</option><option value="simultaneous-trade">Equal reaction · trade</option><optgroup label="Utility · original test fixtures">{["smoke", "flash", "he", "fire", "decoy"].map(k => <option key={k} value={`utility-${k}`}>{k} · trajectory and effect</option>)}</optgroup></select></label>
                <button disabled={busy || disabled || !project || reference?.mapId !== 'Mirage'} onClick={() => void openExample()}>Open encounter example</button><p>Opening an example downloads your current lab test as a backup. Map Studio drawings stay separate. Save test above also saves encounter settings.</p>
                <div className={styles.row}><label>Seed<input aria-label="Encounter seed" type="number" min="0" max="4294967295" value={settings.seed} disabled={disabled} onChange={e => Number.isInteger(+e.target.value) && +e.target.value >= 0 && +e.target.value <= 0xffffffff && update({ seed: +e.target.value })} /></label><label>Duration<select value={settings.seconds} disabled={disabled} onChange={e => update({ seconds: +e.target.value })}>{[4, 8, 12, 20].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label></div>
                <div className={styles.row}><button disabled={disabled || !project?.a || !project.b} onClick={() => face(false)}>Face each other</button><button disabled={disabled || !project?.a || !project.b} onClick={() => face(true)}>A faces away</button></div>
                <p>These buttons set the scenario's initial view directions. Players do not automatically turn when you move a marker.</p>
                <UtilityControls value={project?.utility} result={result} disabled={disabled || busy || !project} change={utility => project && edit({ ...project, utility, encounter: { ...settings, seconds: utility ? Math.max(12, settings.seconds) : settings.seconds } })} />
                {(['a', 'b'] as const).map(id => <fieldset key={id} disabled={disabled}><legend>Player {id.toUpperCase()}</legend>
                    <label>Facing · {settings[id].yaw.toFixed(0)}°<input aria-label={`Player ${id.toUpperCase()} facing`} type="range" min="-180" max="180" step="1" value={settings[id].yaw} onChange={e => player(id, { yaw: +e.target.value })} /></label>
                    <label>Pitch · {settings[id].pitch.toFixed(0)}°<input aria-label={`Player ${id.toUpperCase()} pitch`} type="range" min="-89" max="89" step="1" value={settings[id].pitch} onChange={e => player(id, { pitch: +e.target.value })} /></label>
                    <div className={styles.row}><label>Reaction<select aria-label={`Player ${id.toUpperCase()} reaction`} value={settings[id].reactionMs} onChange={e => player(id, { reactionMs: +e.target.value })}>{[0, 150, 250, 300, 500, 1000, 2000].map(v => <option key={v} value={v}>{v} ms</option>)}</select></label><label>Aim error<select aria-label={`Player ${id.toUpperCase()} aim error`} value={settings[id].aimError} onChange={e => player(id, { aimError: +e.target.value })}>{[0, 0.35, 0.5, 1, 3, 5].map(v => <option key={v} value={v}>{v}°</option>)}</select></label></div>
                    <div className={styles.row}><label>Magazine<select aria-label={`Player ${id.toUpperCase()} ammo`} value={settings[id].ammo} onChange={e => player(id, { ammo: +e.target.value })}>{[0, 1, 5, 30].map(v => <option key={v} value={v}>{v} rounds</option>)}</select></label><label>Armor<select aria-label={`Player ${id.toUpperCase()} armor`} value={settings[id].armor} onChange={e => player(id, { armor: +e.target.value })}>{[0, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}</select></label></div>
                    <label className={styles.check}><input type="checkbox" checked={settings[id].helmet} onChange={e => player(id, { helmet: e.target.checked })} />Helmet</label>
                </fieldset>)}
                <label>Field of view · {settings.fov}°<input aria-label="Encounter field of view" type="range" min="30" max="160" value={settings.fov} disabled={disabled} onChange={e => update({ fov: +e.target.value })} /></label>
                <label className={styles.check}><input type="checkbox" checked={settings.approach} disabled={disabled} onChange={e => update({ approach: e.target.checked })} />A follows an approach route</label>
                <p>Scripted movement uses the lab's stance, pace and geometry checks. It stops short of B. This is a controlled movement test, not autonomous pursuit.</p>
                <details><summary>Model and units</summary><p>{LAB_RIFLE.id}: provisional original tuning. 64 ticks/s; positions in map world units; angles in degrees. 34 base damage, head ×4, three-shot bursts, 2.25s reload. Armor, range, movement and recoil affect damage or accuracy. Approximate torso box and head sphere; no material penetration or live career integration. Utility adds smoke, facing-aware flash, covered HE, supported fire and uncertain decoy cues. Parameters remain provisional.</p></details>
            </div>
            <div className={styles.replay}>
                <div className={styles.row}><label>Inspection view<select aria-label="Encounter inspection view" value={perspective} onChange={e => setPerspective(e.target.value as typeof perspective)}><option value="A">Player A knowledge</option><option value="B">Player B knowledge</option><option value="world">World truth · observer</option></select></label><button disabled={!result} onClick={exportReplay}>Export replay</button></div>
                <button aria-pressed={focused} onClick={() => setFocused(!focused)}>{focused ? 'Show full map' : 'Focus encounter'}</button>
                <div className={styles.map}>{reference && <svg viewBox={`${left} ${top} ${span} ${span}`} aria-label="Encounter replay map">
                    <image href={reference.radars.upper} width="100" height="100" opacity="0.6" />
                    {perspective === "world" && result?.utility && <UtilityReplay result={result} tick={tick} reference={reference} unit={unit} />}
                    {observer?.utility?.heard && <circle cx={xy(observer.utility.heard.point)[0]} cy={xy(observer.utility.heard.point)[1]} r={64 / (reference.transform.scale * 10.24)} fill="none" stroke="#e6a1d2" strokeDasharray={`${unit} ${unit}`} strokeWidth={0.3 * unit} />}
                    {events.filter(e => e.tick > tick - 8 && e.from && e.to && ['damage', 'miss', 'obstruction'].includes(e.type)).map((e, i) => <line key={i} x1={xy(e.from!)[0]} y1={xy(e.from!)[1]} x2={xy(e.to!)[0]} y2={xy(e.to!)[1]} stroke={e.type === 'damage' ? '#f4d081' : '#ed8191'} strokeWidth={0.25 * unit} />)}
                    {shownActors.map(a => <g key={a.id} transform={`translate(${xy(a.position).join(' ')})`}><circle r={unit} fill={a.health <= 0 ? '#758594' : a.id === 'A' ? '#99cfff' : '#f4d081'} /><path transform={`rotate(${-a.yaw}) scale(${unit})`} d="M 0 0 L 3 -1.5 L 3 1.5 Z" fill={a.id === 'A' ? '#99cfff' : '#f4d081'} opacity="0.4" /><text y={-1.8 * unit} fontSize={2.4 * unit} textAnchor="middle" fill="white">{a.id}</text></g>)}
                    {observer?.knowledge && <g transform={`translate(${xy(observer.knowledge.point).join(' ')})`} opacity={Math.max(0.1, observer.knowledge.confidence)}><circle r={observer.knowledge.visible ? unit : Math.max(unit, observer.knowledge.uncertainty / (reference.transform.scale * 10.24))} fill="none" stroke="#f1cf8d" strokeWidth={0.3 * unit} strokeDasharray={observer.knowledge.visible ? undefined : `${0.7 * unit} ${0.5 * unit}`} /><text y={-2 * unit} fontSize={2.4 * unit} textAnchor="middle" fill="#f1cf8d">{observer.knowledge.visible ? 'Seen' : 'Last seen'}</text></g>}
                </svg>}</div>
                <div className={styles.row}><button disabled={!result} onClick={() => { if (result && tick >= result.frames.length - 1) setTick(0); setPlaying(!playing) }}>{playing ? 'Pause' : 'Play'}</button><button disabled={!result} onClick={() => { setPlaying(false); setTick(0) }}>Restart</button><button disabled={!result || tick === result.frames.length - 1} onClick={() => { setPlaying(false); setTick(t => t + 1) }}>Step</button><span>{(tick / 64).toFixed(3)}s</span></div>
                <label>Playback speed<select aria-label="Encounter playback speed" value={replayRate} onChange={e => setReplayRate(+e.target.value)}><option value="0.25">0.25× · slow motion</option><option value="0.5">0.5×</option><option value="1">1× · real time</option></select></label>
                <input aria-label="Encounter timeline" type="range" min="0" max={Math.max(1, (result?.frames.length || 1) - 1)} value={tick} disabled={!result} onChange={e => { setPlaying(false); setTick(+e.target.value) }} />
                <div className={styles.stats}>{shownActors.map(a => <div key={a.id}><b>Player {a.id} · {a.state}</b><span>{a.health} HP · {a.armor} armor · {a.ammo}/{a.reserve} rounds</span><span>{a.speed.toFixed(0)} units/s · {a.knowledge ? a.knowledge.visible ? 'Visual contact' : `Last seen ${((tick - a.knowledge.seenTick) / 64).toFixed(2)}s ago` : 'No enemy information'}</span>{a.utility && <span>{a.utility.blindUntil > tick ? `Blinded · ${((a.utility.blindUntil - tick) / 64).toFixed(2)}s` : "Vision ready"} · {Object.values(a.utility.inventory).reduce((a, b) => a + b, 0)} grenades left{a.utility.heard ? " · Unconfirmed sound cue" : ""}</span>}</div>)}</div>
                <p role="status">{message}</p>{result && <p><b>Result: {result.outcome === 'timeout' ? 'Unresolved' : result.outcome === 'trade' ? 'Both players down' : `Player ${result.outcome} survives`}.</b> {result.reason}</p>}
                <h3>Utility diagnostics</h3>{result?.utility ? <><p>World view shows trajectories and conservative effect cells. The 2D projection can overlap floors; review bounce and landing Z in world coordinates. Player views withhold hidden throws and effects.</p>{result.utility.checks.map(c => <p key={c.id}><b>{c.id} · {c.state === "matches-model" ? "Checked against model · real-map draft" : c.state}</b>{c.landingError !== undefined && ` · Landing error ${c.landingError.toFixed(1)} units`}{c.bounceErrors.length > 0 && ` · Bounce errors: ${c.bounceErrors.map(n => n === null ? "missing" : n.toFixed(1)).join(", ")}`}<br />{c.reason}</p>)}</> : <p>Add a throw or open a utility example to inspect flight and effects.</p>}
                <h3>Why it happened</h3><p>{perspective === 'world' ? 'Observer view exposes both players for debugging.' : `Only player ${perspective}'s own events and remembered observations are shown. Hidden enemy positions and ammo are withheld.`}</p>
                <ol className={styles.timeline}>{events.slice(-60).map((e, i) => <li key={`${e.tick}-${e.actor}-${e.type}-${i}`}><time>{e.time.toFixed(3)}s</time><button onClick={() => { setPlaying(false); setTick(e.tick) }}>{e.actor} · {e.type}</button><span>{e.grenade && <b>{e.grenade}: </b>}{e.reason}</span></li>)}</ol>
                {result && events.length === 0 && <p>No observed events at this time. Play or scrub forward.</p>}
            </div>
        </div>
    </section>
}
