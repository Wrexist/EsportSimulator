"use client"

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { toRadar, type SpatialReference, type Vec3 } from '@/engine/spatial/types'
import type { Side, TeamSetup, TeamMember } from '@/engine/spatial/team-model'
import type { TeamResult } from '@/engine/spatial/team-simulation'
import { projectRoundReplay, captureRoundPosition, restoreRoundPosition, type SpatialRoundReplay } from '@/engine/spatial/round-replay'
import { teamView } from '@/engine/spatial/team-view'
import { PHYSICAL_WEAPONS, physicalWeapon } from '@/engine/spatial/weapon-profiles'
import { bindAuthoredPlantZones } from '@/engine/spatial/career-loadouts'
import { previewCareerRound } from '@/engine/spatial/career-round-adapter'
import { parseLabProject, type LabProject } from '@/lib/spatial-lab-project'
import { UtilityReplay } from './UtilityReplay'
import { CareerRoundRehearsal } from './CareerRoundRehearsal'
import type { ThrowPlan } from '@/engine/spatial/utility'
import mapScenarios from '@/data/physical-map-scenarios.json'
import { replayFloor } from '@/engine/spatial/career-radar'
import styles from './encounter-lab.module.css'

interface Props { project: LabProject | null; reference: SpatialReference | null; worker: RefObject<Worker | null>; disabled: boolean; edit: (project: LabProject) => void }
const examples = [['delayed-radio', 'Delayed reports · 2v2'], ['execute', 'Entry, support and plant'], ['retake', 'Retake and defuse'], ['deadline-save', 'Impossible deadline · save'], ['support-smoke', 'Support utility budget'], ['trade-clutch', 'Reaction, trade and clutch']]
function download(value: unknown, name: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })), a = document.createElement('a')
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function TeamLab({ project, reference, worker, disabled, edit }: Props) {
    const [example, setExample] = useState('delayed-radio'), [result, setResult] = useState<TeamResult | null>(null), [busy, setBusy] = useState(false)
    const [replay, setReplay] = useState<SpatialRoundReplay | null>(null)
    const [message, setMessage] = useState('Open a team example to begin.'), [index, setIndex] = useState(0), [playing, setPlaying] = useState(false), [rate, setRate] = useState(0.5)
    const [view, setView] = useState<Side | 'world'>('T'), [selected, setSelected] = useState('T1'), [focus, setFocus] = useState(true)
    const [floor, setFloor] = useState<'upper'|'lower'>('upper')
    const serial = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null), settings = project?.teams
    useEffect(() => {
        serial.current++; setReplay(null); setResult(null); setBusy(false); setPlaying(false); setIndex(0)
        setMessage(project?.teams ? 'Team setup ready. Run it to inspect decisions.' : 'Open a team example to begin.')
        if (timer.current) clearTimeout(timer.current)
    }, [project])
    useEffect(() => {
        const instance = worker.current
        if (!instance || !reference) return
        serial.current++
        const receive = (event: MessageEvent) => {
            if (event.data.id !== `teams:${serial.current}`) return
            if (timer.current) clearTimeout(timer.current)
            setBusy(false)
            if (event.data.type === 'teams-result') { setReplay(event.data.replay || null); setResult(event.data.result); setIndex(0); setMessage('Replay ready. Team views show delivered reports; observer view shows physical truth.') }
            else if (event.data.type === 'error') setMessage(event.data.message)
        }
        const fail = () => { serial.current++; setBusy(false); setMessage('Worker unavailable. Reload the lab to retry.') }
        instance.addEventListener('message', receive); instance.addEventListener('error', fail)
        return () => { instance.removeEventListener('message', receive); instance.removeEventListener('error', fail); if (timer.current) clearTimeout(timer.current) }
    }, [worker, reference])
    useEffect(() => {
        if (!playing || !result) return
        if (index >= result.frames.length - 1) { setPlaying(false); return }
        const duration = (result.frames[index + 1].tick - result.frames[index].tick) / 64 * 1000 / rate
        const id = setTimeout(() => setIndex(i => i + 1), duration)
        return () => clearTimeout(id)
    }, [playing, result, index, rate])
    const update = (patch: Partial<TeamSetup>) => {
        if (!project || !settings || !reference || disabled || busy) return
        try { edit(parseLabProject(JSON.stringify({ ...project, teams: { ...settings, ...patch } }), reference)) }
        catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid team setup') }
    }
    const actor = settings?.actors.find(a => a.id === selected)
    const updateThrow = (id: string, patch: Partial<ThrowPlan>) => settings?.utility && update({ utility: { ...settings.utility, throws: settings.utility.throws.map(p => p.id === id ? { ...p, ...patch } : p) } })
    const member = (patch: Partial<TeamMember>) => settings && update({ actors: settings.actors.map(a => a.id === selected ? { ...a, ...patch } : a) })
    const open = async () => {
        if (!project || !reference || disabled || busy) return
        const before = project, token = ++serial.current; setBusy(true)
        try {
            const response = await fetch(`/map-studio/teams/l13/${example}.lab.json`)
            if (!response.ok) throw Error('Team example unavailable')
            const next = parseLabProject(await response.text(), reference)
            if (token !== serial.current) return
            download(before, 'mirage-before-team-example.spatial-lab.json'); edit(next)
        } catch (error) { if (token === serial.current) setMessage(error instanceof Error ? error.message : 'Could not open team example') }
        finally { if (token === serial.current) setBusy(false) }
    }
    const poolScenario = mapScenarios.find(s=>s.mapId===reference?.mapId)
    const openMapScenario = async (recovery: false | 'recovery' | 'recovery-squad' | 'recovery-combat' = false) => {
        if(!project||!reference||!poolScenario?.project||disabled||busy)return
        const before=project,token=++serial.current;setBusy(true)
        try{
            const response=await fetch(recovery?`/map-studio/teams/${recovery}/${reference.mapId.toLowerCase()}.lab.json`:poolScenario.project)
            if(!response.ok)throw Error('Map scenario unavailable')
            const next=parseLabProject(await response.text(),reference)
            if(token!==serial.current)return
            download(before,`${reference.mapId.toLowerCase()}-before-${recovery||'5v5'}.spatial-lab.json`);edit(next)
        }catch(error){if(token===serial.current)setMessage(error instanceof Error?error.message:'Could not open map scenario')}
        finally{if(token===serial.current)setBusy(false)}
    }
    const run = () => {
        if (!project?.teams || !worker.current || disabled || busy) return
        serial.current++; setBusy(true); setPlaying(false); setResult(null); setReplay(null); setIndex(0); setMessage('Resolving team decisions in the background…')
        worker.current.postMessage({ type: 'teams', id: `teams:${serial.current}`, project, replay: true })
        timer.current = setTimeout(() => { serial.current++; setBusy(false); setMessage('Team check exceeded five minutes. Reload the lab before retrying.') }, 300000)
    }
    const tick = result?.frames[index]?.tick || 0
    const projection = useMemo(() => replay ? projectRoundReplay(replay, tick) : null, [replay, tick])
    const frame = projection?.frame || result?.frames[index], shown = frame ? teamView(frame, projection?.events || result!.events, view) : null
    const savePosition = () => {
        if (!replay) return
        try { localStorage.setItem(`esim:round-position:v1:${replay.project.mapId}`, JSON.stringify(captureRoundPosition(replay, tick))); setMessage('Replay position saved on this device. Run this same test to resume it.') }
        catch { setMessage('Could not save replay position. Device storage may be full.') }
    }
    const resumePosition = () => {
        if (!replay) return
        try {
            const saved = JSON.parse(localStorage.getItem(`esim:round-position:v1:${replay.project.mapId}`) || 'null')
            const restored = restoreRoundPosition(replay, saved)
            setPlaying(false); setIndex(result!.frames.reduce((n, f, i) => f.tick <= restored.tick ? i : n, 0)); setMessage('Saved replay position restored. No events or rewards were applied again.')
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not restore position') }
    }
    const exportAdapterCheck = async () => {
        if (!replay) return
        try {
            const preview = await previewCareerRound(replay, {
                matchId: `lab:${replay.sha256}`, mapId: replay.project.mapId, roundNumber: 1,
                homeTeamId: 'preview-home', awayTeamId: 'preview-away', homeSide: 'T',
                players: replay.project.teams!.actors.map(a => ({ actorId: a.id, playerId: `preview:${a.id}`, teamId: a.side === 'T' ? 'preview-home' : 'preview-away' })),
            })
            download(preview, `${replay.project.mapId.toLowerCase()}-career-adapter-preview.json`)
            setMessage('Adapter check exported using lab identities. No career, rewards or purchases were changed.')
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Adapter check failed') }
    }
    const xy = (p: Vec3) => reference ? toRadar(p, reference) : [0, 0]
    const onFloor = (p: Vec3) => !reference || replayFloor(p,reference)===(reference.radars.lower?floor:'upper')
    const shownSettings = replay?.project.teams || settings
    const initial = shownSettings ? [...shownSettings.actors.map(a => xy(a.start.point)), ...Object.values(shownSettings.sites).map(p => xy(p.point))] : [[50, 50]]
    const xs = initial.map(p => p[0]), ys = initial.map(p => p[1]), span = focus ? Math.min(100, Math.max(16, Math.max(...xs) - Math.min(...xs) + 12, Math.max(...ys) - Math.min(...ys) + 12)) : 100
    const left = Math.max(0, Math.min(100 - span, (Math.min(...xs) + Math.max(...xs) - span) / 2)), top = Math.max(0, Math.min(100 - span, (Math.min(...ys) + Math.max(...ys) - span) / 2)), unit = span / 100
    return <section id="team-lab" className={styles.encounter} aria-label="Team coordination lab">
        <div className={styles.heading}><div><span>TEAM COORDINATION · L13</span><h2>Read the round.</h2><p>Inspect what a team knows, where it moves and why its plan changes.</p></div><button onClick={run} disabled={disabled || busy || !settings}>{busy ? 'Running…' : 'Run team scenario'}</button></div>
        <div className={styles.layout}><div className={styles.setup}>
            <CareerRoundRehearsal project={project} reference={reference} worker={worker} disabled={disabled||busy} onReplay={value=>{setReplay(value);setResult(value.result);setIndex(0);setPlaying(false);setMessage('Saved career rehearsal. No production career rewards were applied.')}} />
            <p>Team movement uses the lab stance, speed and enabled traversal connections.</p>
            <label>Mirage team example<select aria-label="Mirage team example" value={example} disabled={busy || disabled} onChange={e => setExample(e.target.value)}>{examples.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
            <button disabled={disabled || busy || !project || reference?.mapId !== 'Mirage'} onClick={() => void open()}>Open team example</button>
            <p>Your current lab test downloads as a backup. Map Studio drawings stay separate. Save test above includes team settings.</p>
            {poolScenario?.project && <><button disabled={disabled||busy||!project} onClick={()=>void openMapScenario()}>Open {reference?.mapId} 5v5 review</button><p>Separate rehearsal with grounded spawns and plant areas. Your current lab test downloads first; drawings and careers are preserved.</p></>}
            {poolScenario?.project && <><button disabled={disabled||busy||!project} onClick={()=>void openMapScenario('recovery')}>Open {reference?.mapId} recovery smoke</button><p>Two attackers, one defender: checked smoke flight and bomb pickup timing. A simulator calibration example; your current lab test downloads first.</p><button disabled={disabled||busy||!project} onClick={()=>void openMapScenario('recovery-squad')}>Open {reference?.mapId} moving 5v5 recovery</button><p>Ten players with moving teammates during smoke flight. Gunfire is disabled to inspect coordination. Your current lab test downloads first.</p></>}
            {poolScenario?.project && <><button disabled={disabled||busy||!project} onClick={()=>void openMapScenario('recovery-combat')}>Open {reference?.mapId} combat recovery</button><p>Ten-second 5v5 smoke and bomb recovery with live fire. A seeded calibration example, not a full-match certification. Your current lab test downloads first.</p></>}
            {settings && <fieldset disabled={disabled || busy}><legend>Round setup</legend>
                <div className={styles.row}><label>Seed<input aria-label="Team seed" type="number" min="0" max="4294967295" value={settings.seed} onChange={e => update({ seed: +e.target.value })} /></label><label>Duration<select value={settings.seconds} onChange={e => update({ seconds: +e.target.value })}>{[...new Set([8,10,12,25,35,60,90,160,200,settings.seconds])].sort((a,b)=>a-b).map(n => <option key={n} value={n}>{n}s</option>)}</select></label></div>
                <label>Communication delay<select aria-label="Team communication delay" value={settings.communicationMs} onChange={e => update({ communicationMs: +e.target.value })}>{[0,250,500,1000,2000].map(n => <option key={n} value={n}>{n} ms</option>)}</select></label>
                <label>Report memory<select value={settings.memorySeconds} onChange={e => update({ memorySeconds: +e.target.value })}>{[1,2,4,8].map(n => <option key={n} value={n}>{n}s</option>)}</select></label>
                <label>Economy policy<select value={settings.economy} onChange={e => update({ economy: e.target.value as TeamSetup['economy'] })}><option value="protect">Protect equipment</option><option value="balanced">Balanced</option><option value="commit">Commit to objective</option></select></label>
                {(['T', 'CT'] as const).map(side => <label key={side}>{side} execution skill · {Math.round(settings.skill[side] * 100)}%<input aria-label={`${side} execution skill`} type="range" min="0" max="1" step="0.05" value={settings.skill[side]} onChange={e => update({ skill: { ...settings.skill, [side]: +e.target.value } })} /></label>)}
                <label className={styles.check}><input type="checkbox" checked={settings.guns} onChange={e => update({ guns: e.target.checked })} />Enable live fire</label>
                <label>Initial bomb<select value={settings.initialBomb} onChange={e => update({ initialBomb: e.target.value as TeamSetup['initialBomb'] })}>{['carried','planted','dropped'].map(v => <option key={v}>{v}</option>)}</select></label>
                <div className={styles.row}><label>Round clock<input type="number" min="5" max="180" value={settings.roundSeconds} onChange={e => update({ roundSeconds: +e.target.value })} /></label><label>Bomb clock<input type="number" min="5" max="45" value={settings.bombSeconds} onChange={e => update({ bombSeconds: +e.target.value })} /></label></div>
                <div className={styles.row}><label>Plant seconds<input type="number" min="1" max="4" value={settings.plantSeconds} onChange={e => update({ plantSeconds: +e.target.value })} /></label><label>Defuse seconds<input type="number" min="1" max="10" value={settings.defuseSeconds} onChange={e => update({ defuseSeconds: +e.target.value })} /></label></div>
                <label>Opening seconds<input type="number" min="0" max="10" value={settings.openingSeconds} onChange={e => update({ openingSeconds: +e.target.value })} /></label>
                <button type="button" disabled={!project?.annotations || !reference} onClick={() => {
                    try { if (project && reference) { edit(bindAuthoredPlantZones(project, reference)); setMessage('Authored plant polygons bound for this preview. Draft geometry still needs review.') } }
                    catch (error) { setMessage(error instanceof Error ? error.message : 'Plant area binding failed') }
                }}>Use authored plant areas</button>
                <p>{settings.plantZones ? 'Planting uses the authored polygon and floor range.' : 'Legacy objective radius. Bind authored areas to test real boundaries.'}</p>
                <label>Starting objective<select value={settings.objective} onChange={e => update({ objective: e.target.value as 'A' | 'B' })}><option>A</option><option>B</option></select></label>
                <label>Bomb carrier<select value={settings.carrier} onChange={e => update({ carrier: e.target.value })}>{settings.actors.filter(a => a.side === 'T').map(a => <option key={a.id}>{a.id}</option>)}</select></label>
            </fieldset>}
            {settings && actor && <fieldset disabled={disabled || busy}><legend>Player assignments</legend><label>Selected player<select value={selected} onChange={e => setSelected(e.target.value)}>{settings.actors.map(a => <option key={a.id}>{a.id}</option>)}</select></label>
                <label>Weapon<select aria-label="Physical weapon" value={actor.loadout?.weapon || ''} onChange={e => {
                    const weapon = physicalWeapon(e.target.value || undefined)
                    member({ ammo: weapon.magazine, loadout: e.target.value ? { weapon: weapon.id, helmet: actor.loadout?.helmet ?? false, kit: actor.side === 'CT' && (actor.loadout?.kit ?? false) } : undefined })
                }}><option value="">Legacy lab rifle</option>{Object.keys(PHYSICAL_WEAPONS).map(id => <option key={id} value={id}>{id.toUpperCase()}</option>)}</select></label>
                {actor.loadout && <div className={styles.row}>
                    <label><input type="checkbox" checked={actor.loadout.helmet} onChange={e => member({ loadout: { ...actor.loadout!, helmet: e.target.checked } })} />Helmet</label>
                    {actor.side === 'CT' && <label><input type="checkbox" checked={actor.loadout.kit} onChange={e => member({ loadout: { ...actor.loadout!, kit: e.target.checked } })} />Defuse kit (5s; otherwise 10s)</label>}
                </div>}
                {(['aim','reaction','control'] as const).map(key => <label key={key}>{key} ? {Math.round((actor.attributes?.[key] ?? settings.skill[actor.side]) * 100)}%<input aria-label={`Player ${key}`} type="range" min="0" max="1" step="0.01" value={actor.attributes?.[key] ?? settings.skill[actor.side]} onChange={e => member({ attributes: { aim: settings.skill[actor.side], reaction: settings.skill[actor.side], control: settings.skill[actor.side], ...actor.attributes, [key]: +e.target.value } })} /></label>)}
                <label>Role<select value={actor.role} onChange={e => member({ role: e.target.value as TeamMember['role'] })}>{['entry','support','lurk','anchor'].map(r => <option key={r}>{r}</option>)}</select></label>
                <label>Starting facing · {actor.yaw.toFixed(0)}°<input type="range" min="-180" max="180" value={actor.yaw} onChange={e => member({ yaw: +e.target.value })} /></label>
                <p>Place markers A and B on supported ground in the map above, then assign them below.</p>
                <div className={styles.row}><button disabled={!project?.a} onClick={() => project?.a && member({ start: project.a })}>A → player start</button><button disabled={!project?.b} onClick={() => project?.b && member({ station: project.b })}>B → hold angle</button></div>
                <div className={styles.row}><button disabled={!project?.a} onClick={() => project?.a && update({ sites: { ...settings.sites, A: project.a } })}>A → test site A</button><button disabled={!project?.b} onClick={() => project?.b && update({ sites: { ...settings.sites, B: project.b } })}>B → test site B</button></div>
            </fieldset>}
            {settings?.utility && <fieldset disabled={disabled || busy}><legend>Authored team utility</legend>
                <p>Recovery throws wait for a dropped bomb and a recent threat. The supporting player must stop at the release marker. Trajectory checks preserve grenades when the landing misses or a flash exposes teammates at their current positions.</p>
                {settings.utility.throws.map(plan => <div key={plan.id}>
                    <strong>{plan.owner} · {plan.kind} · {plan.id}</strong>
                    <label>Release trigger<select aria-label={`${plan.id} release trigger`} value={plan.trigger || 'execute'} onChange={e => updateThrow(plan.id, { trigger: e.target.value as ThrowPlan['trigger'] })}>
                        <option value="execute">Execute / nearby evidence</option>
                        <option value="recovery" disabled={!plan.origin || !plan.target || !['smoke', 'flash'].includes(plan.kind) || plan.mode === 'running'}>Support bomb recovery</option>
                    </select></label>
                    <div className={styles.row}><button type="button" disabled={!project?.a} onClick={() => project?.a && updateThrow(plan.id, { origin: project.a.point })}>A → release position</button><button type="button" disabled={!project?.b} onClick={() => project?.b && updateThrow(plan.id, { target: project.b.point })}>B → landing target</button></div>
                    <p>Release: {plan.origin?.map(n => n.toFixed(0)).join(', ') || 'not set'} · Landing: {plan.target?.map(n => n.toFixed(0)).join(', ') || 'not set'}. Recovery supports stationary smoke/flash throws. Full angles, power and bounce targets remain in the exported test.</p>
                </div>)}
                {!settings.utility.throws.length && <p>No authored throws in this scenario.</p>}
            </fieldset>}
            <details><summary>Model and review limits</summary><p>64 simulation ticks/s; replay samples every 8 ticks. Up to 5 players per side. 32-unit body spacing; original rifle and utility tuning. Older examples use diagnostic target circles; map-pool reviews use sampled native plant-piece unions. Geometry remains provisional. Map-pool scenarios use standing walking; floor layers are displayed separately. Other authored traversal remains subject to the scenario settings. Team view shows delivered radio reports, not private live sightings. This lab does not yet control career matches.</p></details>
        </div><div className={styles.replay}>
            <div className={styles.row}><label>Knowledge view<select aria-label="Team knowledge view" value={view} onChange={e => setView(e.target.value as typeof view)}><option value="T">T · shared knowledge</option><option value="CT">CT · shared knowledge</option><option value="world">Observer · world truth</option></select></label><button disabled={!result} onClick={() => download({ format: 'esim-team-replay', version: 1, sourceVersion: reference?.sourceVersion, meshSha256: reference?.meshSha256, project, result }, 'mirage-team-replay.json')}>Export team replay</button></div>
            <button aria-pressed={focus} onClick={() => setFocus(!focus)}>{focus ? 'Show full map' : 'Focus team scenario'}</button>
            <div className={styles.row}>{reference?.radars.lower && <label>Replay floor<select aria-label="Team replay floor" value={floor} onChange={e=>setFloor(e.target.value as typeof floor)}><option value="upper">Upper</option><option value="lower">Lower</option></select></label>}</div>
            <div className={styles.map}>{reference && <svg viewBox={`${left} ${top} ${span} ${span}`} aria-label="Team replay map">
                <image href={floor === 'lower' && reference.radars.lower ? reference.radars.lower : reference.radars.upper} width="100" height="100" opacity="0.6" />
                {shownSettings && Object.entries(shownSettings.sites).filter(([,p])=>onFloor(p.point)).map(([id,p]) => {
                    const zone=shownSettings.plantZones?.[id as 'A'|'B']
                    return <g key={id}>
                        {zone ? [zone,...zone.pieces||[]].map((piece,i)=><polygon key={i} points={piece.points.map(p=>xy(p).join(',')).join(' ')} fill="rgba(244,184,63,.09)" stroke="#f4b83f" strokeWidth={.2*unit} />)
                            : <circle cx={xy(p.point)[0]} cy={xy(p.point)[1]} r={64/(reference.transform.scale*10.24)} fill="none" stroke="#a8b3be" strokeWidth={.2*unit} strokeDasharray={`${unit} ${unit}`} />}
                        <text x={xy(p.point)[0]} y={xy(p.point)[1]-2*unit} fontSize={1.9*unit} textAnchor="middle" fill="#dce7ef">Site {id}</text>
                    </g>
                })}
                {view === 'world' && result?.utility && <UtilityReplay result={result} tick={tick} reference={reference} unit={unit} floor={reference.radars.lower?floor:undefined} />}
                {view === 'world' && projection?.events.filter(e => e.from && e.point && onFloor(e.from) && onFloor(e.point) && tick - e.tick < 8).map((e, i) => <line key={`shot-${i}`} x1={xy(e.from!)[0]} y1={xy(e.from!)[1]} x2={xy(e.point!)[0]} y2={xy(e.point!)[1]} stroke={e.type === 'damage' ? '#f1a5aa' : '#a3b0bf'} strokeWidth={unit * 0.2} />)}
                {shown?.actors.filter(a=>onFloor(a.position)).map(a => <g key={a.id} transform={`translate(${xy(a.position).join(' ')})`}><circle r={unit} fill={a.health <= 0 ? '#647485' : a.side === 'T' ? '#f4d081' : '#99cfff'} /><path transform={`rotate(${-a.yaw}) scale(${unit})`} d="M0 0 L3 -1.5 L3 1.5 Z" fill={a.side === 'T' ? '#f4d081' : '#99cfff'} opacity="0.4" /><text y={-1.8 * unit} fontSize={2 * unit} textAnchor="middle" fill="white">{a.id}</text></g>)}
                {shown?.contacts.filter(c=>onFloor(c.point)).map(c => <g key={c.enemy} transform={`translate(${xy(c.point).join(' ')})`} opacity={Math.max(0.15,c.confidence)}><circle r={Math.max(unit, c.uncertainty / (reference.transform.scale * 10.24))} fill="none" stroke="#f1a5aa" strokeWidth={0.25 * unit} strokeDasharray={`${unit} ${unit}`} /><text y={2.5 * unit} fontSize={1.8 * unit} fill="#f1a5aa">{c.enemy} · report {((tick-c.seen)/64).toFixed(1)}s</text></g>)}
                {shown?.bomb && onFloor(shown.bomb.point) && <rect x={xy(shown.bomb.point)[0] - unit * 0.5} y={xy(shown.bomb.point)[1] - unit * 0.5} width={unit} height={unit} fill="#f7fafc" />}
            </svg>}</div>
            <div className={styles.row}><button disabled={!result} onClick={() => { if (result && index === result.frames.length - 1) setIndex(0); setPlaying(!playing) }}>{playing ? 'Pause teams' : 'Play teams'}</button><button disabled={!result} onClick={() => { setPlaying(false); setIndex(0) }}>Restart teams</button><button disabled={!result || index === result.frames.length - 1} onClick={() => { setPlaying(false); setIndex(i => i + 1) }}>Step teams</button><span>{(tick/64).toFixed(3)}s · tick {tick}</span></div>
            <label>Playback speed<select value={rate} onChange={e => setRate(+e.target.value)}>{[0.25,0.5,1,2].map(n => <option key={n} value={n}>{n}×</option>)}</select></label>
            <input aria-label="Team replay timeline" type="range" min="0" max={Math.max(1,(result?.frames.length || 1)-1)} value={index} disabled={!result} onChange={e => { setPlaying(false); setIndex(+e.target.value) }} />
            <p role="status">{message}</p>
            {shown?.plans.map(([side, plan]) => <p key={side}><b>{side} · {plan.mode} · {plan.site}.</b> {plan.reason}</p>)}
            {shown?.bomb && <p>Bomb: {shown.bomb.state}{shown.bomb.actor ? ` · ${shown.bomb.actor} action ${(shown.bomb.progress/64).toFixed(2)}s` : ''}</p>}
            {result && index === result.frames.length - 1 && <p><b>{result.outcome === 'unresolved' ? 'Unresolved' : `${result.outcome} wins`}.</b> {result.reason}</p>}
            <div className={styles.stats}>{shown?.actors.map(a => <div key={a.id}><b>{a.id} · {a.intent}</b><span>{a.health} HP · {a.ammo} rounds{a.inventory ? ` · ${Object.values(a.inventory).reduce((n,x) => n+x,0)} grenades` : ''}</span><span>{a.reason}</span></div>)}</div>
            {replay && projection && <div aria-label="Versioned round replay">
                <h3>Round replay</h3><p>Recorded positions, shots, health and outcome. Career integration is still held for review.</p>
                <div className={styles.row}><button onClick={savePosition}>Save replay position</button><button onClick={resumePosition}>Resume replay position</button><button onClick={() => download(replay, `${replay.project.mapId.toLowerCase()}-round-replay.json`)}>Export round replay</button><button onClick={exportAdapterCheck}>Export adapter check</button><button onClick={() => { setPlaying(false); setIndex(result!.frames.length - 1) }}>Skip to round result</button></div>
                <p>{replay.engine} | {replay.sha256.slice(0,12)} | {replay.project.mapId}</p>
                <div className={styles.stats}>{shown?.actors.map(a => <div key={a.id}><b>{a.id} | {projection.players[a.id].kills} K / {projection.players[a.id].deaths} D</b><span>{projection.players[a.id].damage} damage{projection.complete ? ` | +$${projection.players[a.id].reward} round reward` : ''}</span></div>)}</div>
                <p>Rewards are diagnostic deltas from zero cash, using the existing round rules. Purchases, loss streaks and career payouts are not part of this lab.</p>
            </div>}
            <h3>Decision timeline</h3><ol className={styles.timeline}>{shown?.events.slice(-70).reverse().map((e,i) => <li key={`${e.tick}-${i}`}><time>{(e.tick/64).toFixed(3)}s</time><b>{e.actor || e.side || 'Round'} · {e.type}{e.target ? ` → ${e.target}` : ''}</b><span>{e.reason}</span></li>)}</ol>
        </div></div>
    </section>
}
