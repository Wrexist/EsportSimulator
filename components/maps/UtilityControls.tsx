"use client"

import { useState } from 'react'
import { DEFAULT_UTILITY, EMPTY_STOCK, UTILITY_KINDS, parseUtilitySetup, type ThrowPlan, type UtilitySetup } from '@/engine/spatial/utility'
import type { EncounterResult } from '@/engine/spatial/encounter'
import type { Vec3 } from '@/engine/spatial/types'
import styles from './encounter-lab.module.css'

const titles = { smoke: 'Smoke', flash: 'Flashbang', he: 'HE grenade', fire: 'Fire', decoy: 'Decoy' }
function Coordinates({ label, value, change }: { label: string; value: Vec3; change: (v: Vec3) => void }) {
    return <div className={styles.row}>{(['X', 'Y', 'Z'] as const).map((axis, i) => <label key={axis}>{axis}<input key={`${label}-${axis}-${value[i]}`} aria-label={`${label} ${axis}`} type="number" step="any" min="-100000" max="100000" defaultValue={Math.round(value[i] * 100) / 100} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} onBlur={e => { const n = e.currentTarget.valueAsNumber; if (Number.isFinite(n) && Math.abs(n) <= 100000) { if (n !== Math.round(value[i] * 100) / 100) { const p = [...value] as Vec3; p[i] = n; change(p) } } else e.currentTarget.value = String(Math.round(value[i] * 100) / 100) }} /></label>)}</div>
}
export function UtilityControls({ value, result, disabled, change }: { value?: UtilitySetup; result: EncounterResult | null; disabled: boolean; change: (v: UtilitySetup | undefined) => void }) {
    const [notice, setNotice] = useState(''), [selected, setSelected] = useState('')
    const setup = value || DEFAULT_UTILITY, plan = setup.throws.find(p => p.id === selected) || setup.throws[0]
    const apply = (next: UtilitySetup) => { try { const parsed = parseUtilitySetup(next); change(parsed); setNotice('') } catch (e) { setNotice(e instanceof Error ? e.message : 'Invalid utility setup') } }
    const update = (patch: Partial<ThrowPlan>) => plan && apply({ ...setup, throws: setup.throws.map(p => p.id === plan.id ? { ...p, ...patch } : p) })
    const add = () => {
        let n = 1; while (setup.throws.some(p => p.id === `throw-${n}`)) n++
        const id = `throw-${n}`
        apply({ ...setup, throws: [...setup.throws, { id, owner: 'A', kind: 'smoke', at: 0.5, yaw: 0, pitch: 35, power: 0.5, mode: 'normal', tolerance: 16, bounceTargets: [] }] }); setSelected(id)
    }
    const flight = result?.utility?.flights.find(f => f.id === plan?.id)
    return <fieldset disabled={disabled}><legend>Utility test · L12</legend>
        <p>Schedule up to eight throws. Equip the grenades, set the release direction, then run the encounter. Save test keeps all settings.</p>
        <div className={styles.row}><button disabled={setup.throws.length >= 8} onClick={add}>Add throw</button>{value && <button onClick={() => change(undefined)}>Disable utility test</button>}</div>
        {value && <>
            <label className={styles.check}><input type="checkbox" checked={setup.ceasefire} onChange={e => apply({ ...setup, ceasefire: e.target.checked })} />Hold gunfire during utility test</label>
            <details><summary>Inventory and bounce tuning</summary>
                {(['A', 'B'] as const).map(owner => <div key={owner}><b>Player {owner} · {Object.values(setup.inventory[owner]).reduce((a, b) => a + b, 0)}/4 equipped</b>{UTILITY_KINDS.map(kind => <label key={kind}>{titles[kind]}<select aria-label={`Player ${owner} equipped ${kind}`} value={setup.inventory[owner][kind]} onChange={e => apply({ ...setup, inventory: { ...setup.inventory, [owner]: { ...setup.inventory[owner], [kind]: +e.target.value } } })}>{Array.from({ length: kind === 'flash' ? 3 : 2 }, (_, i) => <option key={i}>{i}</option>)}</select></label>)}</div>)}
                <label>Bounce retention · {setup.restitution}<input aria-label="Grenade bounce retention" type="range" min="0" max="0.8" step="0.05" value={setup.restitution} onChange={e => apply({ ...setup, restitution: +e.target.value })} /></label>
                <label>Surface friction · {setup.friction}<input aria-label="Grenade surface friction" type="range" min="0" max="1" step="0.05" value={setup.friction} onChange={e => apply({ ...setup, friction: +e.target.value })} /></label>
            </details>
            <button onClick={() => { const inventory: UtilitySetup['inventory'] = { A: { ...EMPTY_STOCK }, B: { ...EMPTY_STOCK } }; setup.throws.forEach(p => inventory[p.owner][p.kind]++); apply({ ...setup, inventory }) }}>Equip planned throws</button>
            <p>A: {UTILITY_KINDS.filter(k => setup.inventory.A[k]).map(k => `${setup.inventory.A[k]} ${k}`).join(', ') || 'empty'} · B: {UTILITY_KINDS.filter(k => setup.inventory.B[k]).map(k => `${setup.inventory.B[k]} ${k}`).join(', ') || 'empty'}</p>
            {plan && <>
                <label>Selected throw<select aria-label="Selected utility throw" value={plan.id} onChange={e => setSelected(e.target.value)}>{setup.throws.map(p => <option key={p.id} value={p.id}>{p.id} · {p.owner} · {titles[p.kind]} · {p.at}s</option>)}</select></label>
                <div className={styles.row}><label>Thrower<select value={plan.owner} onChange={e => update({ owner: e.target.value as ThrowPlan['owner'] })}><option>A</option><option>B</option></select></label><label>Grenade<select aria-label="Grenade kind" value={plan.kind} onChange={e => update({ kind: e.target.value as ThrowPlan['kind'] })}>{UTILITY_KINDS.map(k => <option key={k} value={k}>{titles[k]}</option>)}</select></label></div>
                <div className={styles.row}><label>Release at (s)<input aria-label="Throw release time" type="number" min="0" max="18" step="0.1" value={plan.at} onChange={e => update({ at: +e.target.value })} /></label><label>Throw mode<select value={plan.mode} onChange={e => update({ mode: e.target.value as ThrowPlan['mode'] })}><option value="normal">Normal</option><option value="lob">Lob</option><option value="running">Running boost</option></select></label></div>
                <label>Direction · {plan.yaw.toFixed(1)}°<input aria-label="Throw direction" type="range" min="-180" max="180" value={plan.yaw} onChange={e => update({ yaw: +e.target.value })} /></label>
                <label>Elevation · {plan.pitch}°<input aria-label="Throw elevation" type="range" min="-85" max="85" value={plan.pitch} onChange={e => update({ pitch: +e.target.value })} /></label>
                <label>Power · {Math.round(plan.power * 100)}%<input aria-label="Throw power" type="range" min="0.1" max="1" step="0.05" value={plan.power} onChange={e => update({ power: +e.target.value })} /></label>
                <details><summary>Landing and bounce targets</summary><p>World coordinates. These checkpoints measure error; they never steer the grenade. Matching the model is not a verified real-map lineup.</p>
                    <label>Tolerance (units)<input type="number" min="1" max="256" value={plan.tolerance} onChange={e => update({ tolerance: +e.target.value })} /></label>
                    {plan.target ? <><Coordinates label="Landing target" value={plan.target} change={target => update({ target })} /><button onClick={() => update({ target: undefined })}>Clear landing target</button></> : <button onClick={() => update({ target: [0, 0, 0] })}>Add landing target</button>}
                    {plan.bounceTargets.map((p, i) => <div key={i}><b>Expected bounce {i + 1}</b><Coordinates label={`Bounce ${i + 1}`} value={p} change={next => update({ bounceTargets: plan.bounceTargets.map((p, j) => j === i ? next : p) })} /><button onClick={() => update({ bounceTargets: plan.bounceTargets.filter((_, j) => j !== i) })}>Remove bounce {i + 1}</button></div>)}
                    <button disabled={plan.bounceTargets.length >= 8} onClick={() => update({ bounceTargets: [...plan.bounceTargets, plan.target || [0, 0, 0]] })}>Add bounce target</button>
                    <button disabled={flight?.state !== 'detonated'} onClick={() => flight && update({ target: [...flight.point], bounceTargets: flight.bounces.slice(0, 8).map(p => [...p]), note: 'Model-generated checkpoints. Real-map review remains draft.' })}>Use replay as model checkpoints</button>
                </details>
                <details><summary>Source and review notes</summary><p>Reference metadata stays separate from computed flight. All real-map lineups remain draft until independently reviewed.</p><label>HTTPS reference<input type="url" placeholder="https://…" defaultValue={plan.source || ''} key={`${plan.id}-source-${plan.source}`} onBlur={e => update({ source: e.target.value || undefined })} /></label><label>Review notes<textarea key={`${plan.id}-note`} defaultValue={plan.note || ''} maxLength={1000} onBlur={e => e.target.value !== (plan.note || '') && update({ note: e.target.value })} /></label></details>
                <button onClick={() => apply({ ...setup, throws: setup.throws.filter(p => p.id !== plan.id) })}>Remove selected throw</button>
            </>}
            <p>Original lab tuning: 64 ticks/s, four flight substeps, seven-ray collision approximation. Running mode adds a fixed launch boost. Smoke and fire use conservative coverage; doors and material penetration await reviewed data.</p>
        </>}
        {notice && <p role="alert">{notice}</p>}
    </fieldset>
}
