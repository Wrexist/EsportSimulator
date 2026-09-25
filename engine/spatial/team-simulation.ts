import { inPlantZone } from './objective-zones'
import { SeededRNG } from '../rng'
import { physicalWeapon } from './weapon-profiles'
import { recoverRecoil, settledBurstDelay } from './fire-control'
import { bodyIntersection, visibleSample } from './encounter'
import { withOccupiedBodies, type CollisionWorld } from './geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS, type NavLocation, type RouteOptions } from './navigation'
import { simulateMovement, type MovementFrame } from './movement'
import { distance3, mix3, type Vec3 } from './types'
import { UtilitySimulation, smokeRay, type UtilityStock } from './utility'
import { checkRecoveryThrow, recoveryThreat } from './recovery-support'
import { chooseTeamPlan, parseTeamSetup, type Contact, type Intent, type Side, type TeamMember, type TeamPlan, type TeamSetup } from './team-model'

export interface TeamEvent { tick: number; type: string; side?: Side; actor?: string; target?: string; point?: Vec3; from?: Vec3; reason: string; damage?: number; grenade?: string; weapon?: string; headshot?: boolean }
export interface TeamActorView { id: string; side: Side; role: TeamMember['role']; position: Vec3; yaw: number; health: number; armor: number; ammo: number; intent: Intent; reason: string; goal: Vec3 | null; contacts: Contact[]; blindUntil: number; inventory: UtilityStock | null; height?: 54 | 72; movement?: MovementFrame['state'] }
export interface BombView { state: 'carried' | 'dropped' | 'planted' | 'defused' | 'exploded'; carrier: string | null; point: Vec3; site: 'A' | 'B'; plantedTick: number | null; progress: number; actor: string | null }
export interface TeamFrame { tick: number; actors: TeamActorView[]; plans: Record<Side, TeamPlan>; reports: Record<Side, Contact[]>; bomb: BombView }
export interface TeamResult { version: 1; frames: TeamFrame[]; events: TeamEvent[]; outcome: 'T' | 'CT' | 'unresolved'; reason: string; utility?: { effects: UtilitySimulation['effects']; flights: UtilitySimulation['flights']; checks: ReturnType<UtilitySimulation['checks']> }; metrics: { shots: number; damage: number; reports: number; waits: number; replans: number; minSeparation: number } }
type Actor = TeamMember & { position: Vec3; pitch: number; contacts: Map<string, Contact>; reportsSent: Map<string, number>; target: string | null; acquired: number; ready: boolean; nextShot: number; reloadEnd: number; reserve: number; recoil: number; burst: number; blindUntil: number; intent: Intent; reason: string; goal: NavLocation | null; route: MovementFrame[]; routeIndex: number; lastRoute: number; stalled: number; failures: number; retiredGoal: string; tradeUntil: number; rng: SeededRNG; speed: number; heard: { point: Vec3; at: number; until: number } | null }
const copy = (p: Vec3): Vec3 => [...p]
const angle = (from: Vec3, to: Vec3) => ({ yaw: Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI, pitch: Math.atan2(to[2] - from[2], Math.hypot(to[0] - from[0], to[1] - from[1])) * 180 / Math.PI })
const delta = (to: number, from: number) => ((to - from + 540) % 360 + 360) % 360 - 180
const cloneContact = (c: Contact): Contact => ({ ...c, point: copy(c.point) })
/** Minimum horizontal separation during two same-tick moves; floors are checked separately. */
export function sweptTeamSeparation(a: Vec3, nextA: Vec3, b: Vec3, nextB: Vec3) {
    if (Math.min(a[2], nextA[2]) >= Math.max(b[2], nextB[2]) + 72 || Math.min(b[2], nextB[2]) >= Math.max(a[2], nextA[2]) + 72) return Infinity
    const x = a[0] - b[0], y = a[1] - b[1], dx = nextA[0] - a[0] - nextB[0] + b[0], dy = nextA[1] - a[1] - nextB[1] + b[1], d = dx * dx + dy * dy
    const t = d ? Math.max(0, Math.min(1, -(x * dx + y * dy) / d)) : 0
    return Math.hypot(x + dx * t, y + dy * t)
}

/** Bounded team vertical slice. World truth is read by sensing, physical resolution and round adjudication only. */
export function simulateTeams(input: TeamSetup, nav: NavigationMesh, world: CollisionWorld, blocked: number[] = [], captureRays = false, traversal: Partial<RouteOptions> & { speed?: number } = {}): TeamResult {
    const height = traversal.height ?? 72, speed = height === 54 ? 85 : traversal.speed ?? 220
    if (![54, 72].includes(height) || ![85, 130, 220].includes(speed)) throw Error('Invalid team traversal settings')
    const eye = (p: Vec3): Vec3 => [p[0], p[1], p[2] + height - 8]
    const airborne = (a: Actor) => ['airborne', 'ladder'].includes(a.route[a.routeIndex]?.state || '')

    const s = parseTeamSetup(input, nav), events: TeamEvent[] = [], frames: TeamFrame[] = [], memory = Math.ceil(s.memorySeconds * 64)
    const actors: Actor[] = s.actors.map((a, i) => ({ ...a, position: copy(a.start.point), pitch: 0, contacts: new Map(), reportsSent: new Map(), target: null, acquired: 0, ready: false, nextShot: 0, reloadEnd: 0, reserve: physicalWeapon(a.loadout?.weapon).reserve, recoil: 0, burst: 0, blindUntil: 0, intent: a.health ? a.role : 'dead', reason: 'Assigned opening role.', goal: null, route: [], routeIndex: 0, lastRoute: -128, stalled: 0, failures: 0, retiredGoal: '', tradeUntil: 0, rng: new SeededRNG((s.seed ^ (0x9e3779b9 * (i + 1))) >>> 0), speed: 0, heard: null }))
    for (const a of actors) if (a.health > 0 && (world.bodyHit?.(a.position, height) || !nav.supportedBody(a.position, world))) throw Error(`${a.id} needs clear, supported ground`)
    for (const [i, a] of actors.entries()) for (const b of actors.slice(i + 1)) if (a.health > 0 && b.health > 0 && sweptTeamSeparation(a.position, a.position, b.position, b.position) < 32) throw Error('Team starting bodies overlap')
    for (const p of Object.values(s.sites)) if (world.bodyHit?.(p.point, height) || !nav.supportedBody(p.point, world)) throw Error('Objective test point needs supported ground and clearance')
    const utility = s.utility ? new UtilitySimulation({ ...s.utility, throws: [] }, world, actors.map(a => a.id)) : null, queued = new Set<string>()
    const reports: Record<Side, Map<string, Contact>> = { T: new Map(), CT: new Map() }, messages: { at: number; side: Side; contact: Contact }[] = []
    const plans: Record<Side, TeamPlan> = { T: { mode: 'default', site: s.objective, since: 0, reason: 'Opening assignments; no enemy information.' }, CT: { mode: 'default', site: s.objective, since: 0, reason: 'Hold assigned angles until evidence arrives.' } }
    const carrier = actors.find(a => a.id === s.carrier)!
    const bomb: BombView = { state: s.initialBomb, carrier: s.initialBomb === 'carried' ? carrier.id : null, point: copy(s.initialBomb === 'carried' ? carrier.position : s.sites[s.objective].point), site: s.objective, plantedTick: s.initialBomb === 'planted' ? 0 : null, progress: 0, actor: null }
    const metrics = { shots: 0, damage: 0, reports: 0, waits: 0, replans: 0, minSeparation: 100000 }
    let outcome: TeamResult['outcome'] = 'unresolved', reason = 'Scenario duration ended before an objective result.', lastTick = 0, defuser: string | null = null, actionStarted = 0
    const emit = (tick: number, type: string, reason: string, extra: Partial<TeamEvent> = {}) => events.push({ tick, type, reason, ...extra })
    const nearby = (p: Vec3, z = p[2]): NavLocation | null => nav.surfaces(p[0], p[1]).filter(p => Math.abs(p.point[2] - z) <= 20).sort((a, b) => Math.abs(a.point[2] - z) - Math.abs(b.point[2] - z))[0] || null
    const bodyWaits = new Map<string, { blocker: string; point: Vec3 }>()
    const followTargets = new Map<string, string>()
    const routePurposes = new Map<string, string>()
    const watch = new Map<string, { enemy: string; at: number; phase: string }>()
    const utilityBusy = new Map<string, number>()
    const heldReasons = new Map<string, string>()
    const yielding = new Map<string, { goal: NavLocation; until: number; requester: string; lane: Vec3 }>()
    const yieldCooldown = new Map<string, number>()
    let recoverer: string | null = null
    type RecoveryScreen = { grenade: string; actor: string; point: Vec3; threat: Vec3; until: number }
    let recoveryScreen: RecoveryScreen | null = null
    const guards = new Map<string, { key: string; goal: NavLocation }>()
    const rejectedGuards = new Map<string, { key: string; points: Vec3[] }>()
    const guardReview = new Map<string, { key: string; until: number }>()
    // Populated only by this tick's direct sensing; radio and stale contacts cannot
    // become precise physical obstacles in another player's route planner.
    const observedBodies = new Map<string, Vec3[]>()
    const reservationWorlds = new Map<string, { key: string; world: CollisionWorld }>()
    const route = (a: Actor, goal: NavLocation, occupied = false) => {
        const start = nearby(a.position)
        let collision=world
        if(occupied){
            const bodies=[...actors.filter(b=>b!==a&&b.side===a.side&&b.health>0).map(b=>b.position),...(observedBodies.get(a.id)||[])]
            const key=bodies.map(p=>p.join(',')).join(';'),cached=reservationWorlds.get(a.id)
            if(cached?.key===key)collision=cached.world
            else{collision=withOccupiedBodies(world,bodies);reservationWorlds.set(a.id,{key,world:collision})}
        }
        return start ? nav.findRoute(start, goal, { ...DEFAULT_ROUTE_OPTIONS, ladders: false, ...traversal, height, blocked }, collision) : null
    }
    const travel = (a: Actor, goal: NavLocation) => {
        if (distance3(a.position, goal.point) <= 64 && !world.raycast(eye(a.position), eye(goal.point))) return 0
        const r = route(a, goal), track = r?.points.length ? simulateMovement(r, world, speed, height, nav) : []
        return track.at(-1)?.state === 'arrived' ? track.at(-1)!.time : 999
    }
    const guardGoal = (a: Actor, point: Vec3, phase: string, tick: number): NavLocation => {
        const key = `${phase}:${point.join(',')}`, saved = guards.get(a.id)
        const rejected=rejectedGuards.get(a.id)
        const excluded=rejected?.key===key?rejected.points:[]
        if (saved?.key === key && !excluded.some(p=>distance3(p,saved.goal.point)<1)) return saved.goal
        const review=guardReview.get(a.id)
        if(saved?.key===key&&excluded.length&&review?.key===key&&tick<review.until)return saved.goal
        if(excluded.length)guardReview.set(a.id,{key,until:tick+128})
        const candidates = [128, 192].flatMap(radius => Array.from({ length: 8 }, (_, i) => {
            const angle = i * Math.PI / 4
            return nearby([point[0] + Math.cos(angle) * radius, point[1] + Math.sin(angle) * radius, point[2]])
        })).filter((p): p is NavLocation => !!p).sort((p, q) => distance3(a.position, p.point) - distance3(a.position, q.point))
        for (const goal of candidates) {
            if (excluded.some(p=>distance3(p,goal.point)<32) || !nav.supportedBody(goal.point, world) || world.bodyHit?.(goal.point, height)
                || actors.some(b => b !== a && b.side === a.side && b.health > 0 && distance3(b.position, goal.point) < 48)
                || [...guards.entries()].some(([id, g]) => id !== a.id && g.key === key && distance3(g.goal.point, goal.point) < 64)) continue
            const r = route(a, goal, excluded.length>0)
            if (!r?.points.length || simulateMovement(r, world, speed, height, nav).at(-1)?.state !== 'arrived') continue
            guards.set(a.id, { key, goal }); return goal
        }
        // No invented floor or teleport when the objective has no usable perimeter.
        // Keep a failed assignment visibly blocked if no replacement is reachable.
        if(saved?.key===key&&excluded.length)return saved.goal
        const goal = nearby(a.position) || a.station
        guards.set(a.id, { key, goal }); return goal
    }
    const intent = (a: Actor, next: Intent, why: string, tick: number) => { if (a.intent !== next || a.reason !== why) { emit(tick, 'intent', why, { side: a.side, actor: a.id }); a.intent = next; a.reason = why } }
    const snapshot = (tick: number) => frames.push({ tick, actors: actors.map(a => ({ id: a.id, side: a.side, role: a.role, position: copy(a.position), yaw: a.yaw, health: a.health, armor: a.armor, ammo: a.ammo, intent: a.intent, reason: a.reason, goal: a.goal ? copy(a.goal.point) : null, contacts: [...a.contacts.values()].map(cloneContact), blindUntil: a.blindUntil, inventory: utility ? { ...utility.inventory[a.id] } : null, height: height as 54 | 72, movement: a.route[a.routeIndex]?.state || 'arrived' })), plans: { T: { ...plans.T }, CT: { ...plans.CT } }, reports: { T: [...reports.T.values()].map(cloneContact), CT: [...reports.CT.values()].map(cloneContact) }, bomb: { ...bomb, point: copy(bomb.point) } })
    for (let tick = 0; tick <= Math.floor(s.seconds * 64); tick++) {
        lastTick = tick
        const releasing = new Set<string>()
        for (const message of messages.filter(m => m.at <= tick)) {
            if (tick - message.contact.seen >= memory) continue
            const c = { ...message.contact, received: tick, visible: false }, old = reports[message.side].get(c.enemy)
            if (!old || old.seen < c.seen) { reports[message.side].set(c.enemy, cloneContact(c)); metrics.reports++; emit(tick, 'report', `Radio report delivered from ${c.source}; position is an observation, not a live track.`, { side: message.side, target: c.enemy, point: copy(c.point) }) }
            for (const a of actors.filter(a => a.side === message.side && a.health > 0)) { const known = a.contacts.get(c.enemy); if (!known || known.seen < c.seen) a.contacts.set(c.enemy, cloneContact(c)) }
        }
        for (let i = messages.length - 1; i >= 0; i--) if (messages[i].at <= tick) messages.splice(i, 1)
        for (const side of ['T', 'CT'] as const) for (const [id, c] of reports[side]) {
            const age = tick - c.seen
            if (age >= memory) { reports[side].delete(id); emit(tick, 'stale-report', 'Shared enemy information expired.', { side, target: id }) }
            else { c.confidence = 1 - age / memory; c.uncertainty = age / 64 * 220 }
        }
        const vision = utility?.visibility(tick) || world
        for (const a of actors.filter(a => a.health > 0)) {
            const seen = new Set<string>()
            const bodies:Vec3[]=[];observedBodies.set(a.id,bodies)
            for (const enemy of actors.filter(b => b.side !== a.side && b.health > 0)) {
                const p = tick >= a.blindUntil ? visibleSample(a, enemy.position, height, 110, vision) : null
                if (!p) continue
                bodies.push(copy(enemy.position))
                seen.add(enemy.id)
                const previous = a.contacts.get(enemy.id), c: Contact = { enemy: enemy.id, point: p, seen: tick, received: tick, source: a.id, visible: true, confidence: 1, uncertainty: 0 }
                a.contacts.set(enemy.id, c)
                if (!previous?.visible) emit(tick, 'sight', 'Direct body sample visible inside field of view.', { actor: a.id, side: a.side, target: enemy.id, point: copy(p) })
                if (!a.reportsSent.has(enemy.id) || tick - a.reportsSent.get(enemy.id)! >= 32) { messages.push({ at: tick + Math.max(1, Math.ceil(s.communicationMs * 64 / 1000)), side: a.side, contact: cloneContact(c) }); a.reportsSent.set(enemy.id, tick) }
            }
            for (const [id, c] of a.contacts) if (!seen.has(id)) {
                if (c.visible) emit(tick, 'lost', 'Line of sight interrupted; freeze the last observed position.', { actor: a.id, side: a.side, target: id })
                c.visible = false; const age = tick - c.seen
                if (age >= memory) a.contacts.delete(id)
                else { c.confidence = 1 - age / memory; c.uncertainty = age / 64 * 220 }
            }
        }
        if (tick % 16 === 0) {
            if (bomb.state !== 'dropped') recoverer = null
            else if (!actors.some(a => a.id === recoverer && a.health > 0 && !a.retiredGoal)) {
                const goal = nearby(bomb.point)
                const candidates = goal ? actors.filter(a => a.side === 'T' && a.health > 0 && !a.retiredGoal)
                    .map(a => ({ a, seconds: travel(a, goal) })).filter(c => c.seconds < 999)
                    .sort((a, b) => a.seconds - b.seconds || a.a.id.localeCompare(b.a.id)) : []
                recoverer = candidates[0]?.a.id || null
                if (recoverer) emit(tick, 'recovery-assigned', 'One reachable teammate recovers the bomb; the others leave the pickup approach clear.', { actor: recoverer, side: 'T' })
            }
            for (const side of ['T', 'CT'] as const) {
                const alive = actors.filter(a => a.side === side && a.health > 0), known = [...reports[side].values()].filter(c => c.confidence > 0.35)
                const estimates = side === 'CT' && bomb.state === 'planted' ? alive.map(a => ({ a, seconds: travel(a, nearby(bomb.point) || s.sites[bomb.site]) })).sort((a, b) => a.seconds - b.seconds || a.a.id.localeCompare(b.a.id)) : []
                if (estimates.length && (!defuser || !alive.some(a => a.id === defuser))) defuser = estimates[0].a.id
                const next = chooseTeamPlan({ side, tick, alive: alive.length, credibleEnemies: known.length, contactsAtSite: known.filter(c => distance3(c.point, s.sites[plans[side].site].point) < 600).length, planted: bomb.state === 'planted', bombSite: bomb.site, bombRemaining: s.bombSeconds - (tick - (bomb.plantedTick || 0)) / 64, travelSeconds: bomb.actor && bomb.actor === defuser ? -bomb.progress / 64 : estimates.find(e => e.a.id === defuser)?.seconds ?? 999, roundRemaining: s.roundSeconds - tick / 64, openingSeconds: s.openingSeconds, defuseSeconds: actors.find(a => a.id === defuser)?.loadout ? (actors.find(a => a.id === defuser)!.loadout!.kit ? 5 : 10) : s.defuseSeconds, economy: s.economy, plan: plans[side] })
                if (next.mode !== plans[side].mode || next.site !== plans[side].site) { plans[side] = next; emit(tick, 'plan', next.reason, { side }); for (const a of alive) { a.retiredGoal = ''; a.failures = 0 } }
            }
            for (const a of actors.filter(a => a.health > 0)) {
                // Finish a validated airborne/climbing segment before changing goals or stopping to fire.
                if (airborne(a) || bomb.actor === a.id && plans[a.side].mode !== 'save') continue
                const wait=bodyWaits.get(a.id), blocker=wait&&actors.find(b=>b.id===wait.blocker)
                const guard=guards.get(a.id)
                if(a.retiredGoal&&guard&&a.goal&&distance3(guard.goal.point,a.goal.point)<1){
                    const rejected=rejectedGuards.get(a.id)
                    const points=rejected?.key===guard.key?rejected.points:[]
                    if(!points.some(p=>distance3(p,guard.goal.point)<1)){
                        rejectedGuards.set(a.id,{key:guard.key,points:[...points,copy(guard.goal.point)].slice(-16)})
                        emit(tick,'cover-route-rejected','The cover assignment is blocked; try another checked position without changing the objective.',{actor:a.id,side:a.side,point:copy(guard.goal.point)})
                    }
                }
                const passing = yielding.get(a.id)
                if (passing) {
                    const requester = actors.find(b=>b.id===passing.requester&&b.health>0)
                    // Reaching a passing pocket is not permission to step back into
                    // the lane. Keep it clear until the requester passes or settles.
                    const needsLane = requester && distance3(requester.position,passing.lane)<96
                        && (!requester.goal || distance3(requester.position,requester.goal.point)>8)
                    if (tick < passing.until && a.stalled<64 && (distance3(a.position,passing.goal.point)>8 || needsLane)) continue
                    yielding.delete(a.id);a.goal=null;a.route=[];a.retiredGoal='';a.failures=0
                }
                // A stationary anchor also yields when a teammate needs its occupied lane.
                // Objective carriers win priority in mutual waits; stable IDs break ties.
                const priority = (b: Actor) => b.id===bomb.carrier || b.id===recoverer || b.id===defuser ? 0 : 1
                // Follow tracks intentionally end short of the teammate's goal.
                // An exhausted track is stationary even while that goal is distant.
                const stationary = !a.route.length || a.routeIndex>=a.route.length-1 || !!a.retiredGoal || !!a.goal && distance3(a.position,a.goal.point)<=8
                const requester = stationary ? actors.find(b=>b!==a&&b.side===a.side&&b.health>0&&b.stalled>=32&&bodyWaits.get(b.id)?.blocker===a.id) : undefined
                const mutual = blocker?.health && blocker.side===a.side && bodyWaits.get(blocker.id)?.blocker===a.id && a.stalled>=32
                    && (priority(a)>priority(blocker) || priority(a)===priority(blocker) && a.id.localeCompare(blocker.id)>0)
                const passingFor = requester || (mutual ? blocker : undefined)
                if (passingFor && tick >= (yieldCooldown.get(a.id)||0) && !(s.guns && [...a.contacts.values()].some(c=>c.visible))) {
                    yieldCooldown.set(a.id,tick+256)
                    const friends=actors.filter(b=>b!==a&&b.side===a.side&&b.health>0)
                    const laneAngle=Math.atan2(a.position[1]-passingFor.position[1],a.position[0]-passingFor.position[0])
                    const candidates=[48,64,96,128,192].flatMap(radius=>Array.from({length:16},(_,i)=>nearby([a.position[0]+Math.cos(laneAngle+i*Math.PI/8)*radius,a.position[1]+Math.sin(laneAngle+i*Math.PI/8)*radius,a.position[2]])))
                        .filter((p):p is NavLocation=>!!p&&distance3(p.point,passingFor.position)>64&&nav.supportedBody(p.point,world)&&!world.bodyHit?.(p.point,height))
                        .filter(p=>!passingFor.route.slice(passingFor.routeIndex).some(f=>distance3(f.position,a.position)<192&&sweptTeamSeparation(p.point,p.point,f.position,f.position)<48))
                        .sort((p,q)=>distance3(p.point,a.goal?.point||a.start.point)-distance3(q.point,a.goal?.point||a.start.point))
                    for(const goal of candidates){
                        let r=route(a,goal),track=r?.points.length?simulateMovement(r,world,speed,height,nav):[]
                        const occupied=()=>track.some((f,i)=>friends.some(b=>sweptTeamSeparation(i?track[i-1].position:a.position,f.position,b.position,b.position)<32))
                        if(track.at(-1)?.state==='arrived'&&occupied()){
                            r=route(a,goal,true);track=r?.points.length?simulateMovement(r,world,speed,height,nav):[]
                        }
                        if(track.at(-1)?.state!=='arrived'||occupied())continue
                        a.goal=goal;a.route=track;a.routeIndex=0;a.stalled=0;a.failures=0;a.retiredGoal='';bodyWaits.delete(a.id)
                        yielding.set(a.id,{goal,until:tick+384,requester:passingFor.id,lane:copy(a.position)});routePurposes.set(a.id,'yield')
                        intent(a,'support','Make checked passing space for a teammate.',tick)
                        emit(tick,'spacing-yield','A teammate needs passing space; yield on a supported, body-clear route.',{actor:a.id,side:a.side,target:passingFor.id,point:copy(goal.point)})
                        break
                    }
                    if(yielding.has(a.id))continue
                }
                if(a.retiredGoal&&wait&&(!blocker?.health||distance3(blocker.position,wait.point)>=8)){
                    a.retiredGoal='';a.failures=0;a.stalled=0;a.route=[];bodyWaits.delete(a.id)
                    emit(tick,'route-retry','The teammate obstructing the route moved away; retry with the same collision checks.',{actor:a.id,side:a.side})
                }
                const team = actors.filter(b => b.side === a.side && b.health > 0), plan = plans[a.side], visible = [...a.contacts.values()].find(c => c.visible)
                followTargets.delete(a.id)
                let goal = a.station, next: Intent = a.role, why = 'Hold the assigned opening angle.'
                if (plan.mode === 'save') { goal = a.start; next = 'save'; why = plan.reason }
                else if (a.side === 'T' && bomb.state === 'planted') { goal = guardGoal(a, bomb.point, 'post-plant', tick); next = 'anchor'; why = 'Hold a separate reachable position near the planted bomb.' }
                else if (a.side === 'T' && bomb.state === 'dropped') { goal = a.id === recoverer ? nearby(bomb.point) || a.station : guardGoal(a, bomb.point, 'recovery', tick); next = 'support'; why = a.id === recoverer ? 'Nominated teammate recovers the dropped bomb.' : 'Cover the recovery without crowding the pickup.' }
                else if (plan.mode === 'retake') { goal = a.id === defuser ? nearby(bomb.point) || s.sites[bomb.site] : guardGoal(a, bomb.point, 'retake', tick); next = 'retake'; why = a.id === defuser ? 'Nominated defuser approaches the announced bomb.' : 'Cover the defuser from a separate reachable position.' }
                else if (a.side === 'T' && plan.mode !== 'default') {
                    const leader = team.find(b => b.role === 'entry') || team[0]
                    goal = s.sites[plan.site]; next = plan.mode === 'rotate' ? 'rotate' : a.role === 'entry' ? 'entry' : 'execute'; why = plan.reason
                    if (a.role === 'lurk' && tick < (s.openingSeconds + 6) * 64 && team.length > 1) { goal = a.station; next = 'lurk'; why = 'Maintain the separate assigned angle before joining the execute.' }
                    if (a.role === 'support' && a.id !== bomb.carrier && leader !== a && distance3(leader.position, goal.point) > 96) {
                        const forward = leader.route[Math.min(leader.routeIndex + 32, leader.route.length - 1)]?.position || goal.point
                        const dx = forward[0] - leader.position[0], dy = forward[1] - leader.position[1], length = Math.hypot(dx, dy) || 1
                        const ux = dx / length, uy = dy / length, ax = a.position[0] - leader.position[0], ay = a.position[1] - leader.position[1]
                        // A following player can spawn ahead of the entry. Holding there
                        // creates a permanent body obstruction in the team's own execute.
                        const obstructsEntry = ax * ux + ay * uy > 0 && Math.abs(ax * uy - ay * ux) < 40 && distance3(a.position, leader.position) < 96
                        const yieldPoint = obstructsEntry ? [1, -1].map(sign => nearby([a.position[0] - uy * 64 * sign, a.position[1] + ux * 64 * sign, a.position[2]]))
                            .find(p => p && nav.supportedBody(p.point, world) && !world.bodyHit?.(p.point, height)
                                && !world.movementHit(a.position, p.point, height)
                                && !team.some(b => b !== a && sweptTeamSeparation(p.point, p.point, b.position, b.position) < 40)) : null
                        // A support already ahead must clear the entrance in the
                        // objective direction, not reverse into the approaching entry.
                        if (ax * ux + ay * uy <= 0) {
                            goal = nearby(leader.position) || a.station; next = 'support'; why = 'Follow the entry with a 72-unit spacing buffer.'
                            followTargets.set(a.id, leader.id)
                        } else why = 'Clear the approach toward the objective before regrouping behind the entry.'
                        if (yieldPoint) { goal = yieldPoint; why = 'Yield clear floor space beside the entry before following the execute.' }
                        if (yieldPoint) followTargets.delete(a.id)
                    }
                    if (a.id !== bomb.carrier && distance3(a.position, goal.point) < 384 && goal === s.sites[plan.site]) {
                        goal = guardGoal(a, goal.point, `execute-${plan.site}`, tick); next = 'anchor'; why = 'Clear the plant approach and cover from a separate position.'
                    }
                } else if (a.side === 'CT' && plan.mode === 'rotate' && a.role !== 'anchor') {
                    const c = [...reports.CT.values()].sort((a, b) => b.seen - a.seen)[0]
                    goal = c ? nearby([c.point[0], c.point[1], c.point[2] - height + 8]) || a.station : a.station; next = 'rotate'; why = c ? 'Approach the last communicated area, not a hidden live position.' : 'Report expired; return to the assigned angle.'
                }
                if (team.length === 1 && next !== 'save') { next = 'clutch'; why = 'Last teammate alive; continue the objective using available evidence.' }
                if (a.tradeUntil > tick && visible) { next = 'trade'; why = 'A nearby teammate fell; a currently visible target permits a trade attempt.'; goal = nearby(a.position) || a.station }
                else if (visible && s.guns && next !== 'save') { goal = nearby(a.position) || a.station; why = 'Stop advancing to engage a directly visible opponent.' }
                const following = followTargets.has(a.id) && next === 'support' && !(visible && s.guns)
                const purpose = visible && s.guns && next !== 'save' ? 'engage'
                    : following ? `follow:${followTargets.get(a.id)}`
                    : a.id === recoverer && bomb.state === 'dropped' ? 'recover'
                    : a.id === defuser && bomb.state === 'planted' ? 'defuse' : next
                if (a.retiredGoal) { next = 'blocked'; why = 'Repeated movement attempts failed; hold until the team objective changes.' }
                intent(a, next, why, tick)
                // Following paths intentionally stop short. A nearby pickup/defuse
                // destination must not inherit that exhausted, shortened track.
                if (!a.goal || distance3(a.goal.point, goal.point) > 24 || routePurposes.get(a.id) !== purpose) {
                    routePurposes.set(a.id, purpose); a.goal = goal; a.route = []; a.routeIndex = 0; a.stalled = 0; a.failures = 0; a.retiredGoal = ''
                }
                if (a.goal && distance3(a.position, a.goal.point) > (a.goal === s.sites[bomb.site] ? (s.plantZones ? 8 : 48) : 8) && (!a.route.length || a.stalled >= 64) && tick - a.lastRoute >= 64 && !a.retiredGoal) {
                    if (a.stalled >= 64) a.failures++
                    if (a.failures >= 3) { a.retiredGoal = 'blocked'; a.route = []; intent(a, 'blocked', 'Repeated movement attempts failed; hold until the team objective changes.', tick); continue }
                    // A following goal is the teammate's position, so treating that
                    // endpoint as a solid obstacle makes every retry fail clearance.
                    // Plan through world geometry, then stop short along the actual
                    // supported path. Body arbitration still checks every executed step.
                    const reserveBodies=a.stalled>=64&&!following
                    let r = route(a, a.goal, reserveBodies)
                    // A distant reserved body can close a nav polygon or its center.
                    // Approach on checked world geometry so local passing arbitration
                    // can run; execution still checks every live swept body.
                    if(reserveBodies&&!r?.points.length)r=route(a,a.goal)
                    a.lastRoute = tick; metrics.replans++
                    a.route = r?.points.length ? simulateMovement(r, world, speed, height, nav) : []; a.routeIndex = 0
                    if (!a.route.length || a.route.at(-1)?.state !== 'arrived') {
                        const failure = a.route.at(-1)?.reason || r?.reason || 'Route failed supported movement checks.'
                        // A partial failed track is not executable. Keeping it here prevented
                        // the bounded retry path from ever running once its last frame was reached.
                        a.route = []; a.failures++
                        emit(tick, 'route-blocked', failure, { actor: a.id, side: a.side })
                        if (a.failures >= 3) { a.retiredGoal = 'blocked'; intent(a, 'blocked', 'Three route attempts failed; hold safely until the team objective changes.', tick) }
                    }
                    else {
                        a.stalled = 0
                        if (following) {
                            let remaining = 0, end = a.route.length - 1
                            while (end > 0 && remaining < 72) {
                                remaining += distance3(a.route[end].position, a.route[end - 1].position); end--
                            }
                            // Never stop partway through a jump or ladder segment.
                            while (end > 0 && ['airborne', 'ladder'].includes(a.route[end].state)) end--
                            a.route = a.route.slice(0, end + 1)
                        }
                    }
                }
            }
            for (const plan of s.utility?.throws || []) if (!queued.has(plan.id) && tick >= plan.at * 64) {
                const owner = actors.find(a => a.id === plan.owner)!, mode = plans[owner.side].mode
                if (plan.trigger === 'recovery') {
                    const threat = recoveryThreat(owner.contacts.values(), bomb.point, tick)
                    let why = 'Waiting for a dropped bomb, nominated recoverer and a recent threat report.'
                    if (owner.health > 0 && owner.side === 'T' && mode !== 'save' && bomb.state === 'dropped' && recoverer && owner.id !== recoverer && threat) {
                        why = 'Wait until grounded, stationary, unblinded and ready to use utility.'
                        if (!airborne(owner) && owner.speed === 0 && tick >= owner.blindUntil && !owner.reloadEnd && tick >= (utilityBusy.get(owner.id) || 0) && !releasing.has(owner.id)) {
                            const check = checkRecoveryThrow(plan, { ...s.utility!, inventory: utility!.inventory }, owner, actors.filter(a => a.side === owner.side), bomb.point, threat, world, height)
                            why = check.reason
                            if (check.allowed) {
                                utility!.queue(plan); queued.add(plan.id); releasing.add(owner.id); utilityBusy.set(owner.id, tick + 32)
                                emit(tick, 'utility-commit', check.reason, { actor: owner.id, side: owner.side, grenade: plan.id })
                                if(plan.kind==='smoke'&&!recoveryScreen){
                                    recoveryScreen={grenade:plan.id,actor:recoverer,point:copy(bomb.point),threat:copy(threat.point),until:tick+384}
                                    emit(tick,'recovery-screen-wait','Hold the pickup until the committed smoke actually screens the reported angle.',{actor:recoverer,side:'T',grenade:plan.id})
                                }
                            }
                        }
                    }
                    heldReasons.set(plan.id, why)
                    continue
                }
                if (owner.health > 0 && mode !== 'save' && !releasing.has(owner.id) && tick >= (utilityBusy.get(owner.id) || 0) && (owner.contacts.size > 0 || ['execute', 'rotate', 'retake'].includes(mode)) && distance3(owner.position, s.sites[plans[owner.side].site].point) < 600) { utility!.queue(plan); queued.add(plan.id); releasing.add(owner.id); utilityBusy.set(owner.id, tick + 32); emit(tick, 'utility-commit', 'Authored throw released after evidence/execute trigger and objective proximity; inventory is spent by flight resolution.', { actor: owner.id, side: owner.side, grenade: plan.id }) }
            }
        }
        if(recoveryScreen){
            const screen: RecoveryScreen = recoveryScreen
            const effect=utility?.effects.find(e=>e.id===screen.grenade&&e.kind==='smoke')
            const ready=effect&&smokeRay(screen.threat,eye(screen.point),[effect],tick,world)
            const cancelled=bomb.state!=='dropped'||distance3(bomb.point,screen.point)>1||recoverer!==screen.actor||!actors.find(a=>a.id===screen.actor)?.health
                ||tick>=screen.until||utility?.flights.find(f=>f.id===screen.grenade)?.state==='failed'
            if(ready||cancelled){
                emit(tick,ready?'recovery-screen-ready':'recovery-screen-cancelled',ready?'The resolved smoke screens the reported angle; resume the checked pickup route.':'Smoke wait cancelled after objective, owner or flight state changed, or the bounded wait expired.',{actor:screen.actor,side:'T',grenade:screen.grenade})
                recoveryScreen=null
            }
        }
        // Movement arbitration observes bodies only at physical execution, never for hidden-target path planning.
        // Reserve the remaining flight corridor: do not launch into a body or let a
        // grounded teammate walk into a committed jump while gravity is in progress.
        const flightCorridor = (a: Actor) => {
            const points: Vec3[] = []
            for (let i = a.routeIndex + 1; i < a.route.length; i++) {
                points.push(a.route[i].position)
                if (a.route[i].state !== 'airborne' && a.route[i].state !== 'ladder') break
            }
            return points
        }
        const starts = new Map(actors.map(a => [a.id, copy(a.position)])), proposals = new Map<string, Vec3>()
        const ordered = [...actors].sort((a, b) => ((actors.indexOf(a) + Math.floor(tick / 16)) % actors.length) - ((actors.indexOf(b) + Math.floor(tick / 16)) % actors.length))
        for (const a of ordered) {
            a.speed = 0
            if (a.health <= 0 || recoveryScreen?.actor===a.id && !airborne(a) || releasing.has(a.id) || a.retiredGoal || bomb.actor === a.id || !a.goal || !airborne(a) && distance3(a.position, a.goal.point) <= (a.goal === s.sites[bomb.site] ? (s.plantZones ? 8 : 48) : 8)) continue
            const frame = a.route[a.routeIndex + 1], next = frame?.position
            if (!next) continue
            const length = distance3(a.position, next), blockedBody = actors.find(b => b !== a && b.health > 0 && sweptTeamSeparation(a.position, next, starts.get(b.id)!, proposals.get(b.id) || starts.get(b.id)!) < 32)
            const inFlight = frame.state === 'airborne' || airborne(a)
            const takeoffBlocked = !airborne(a) && frame.state === 'airborne' && flightCorridor(a).some(p => actors.some(b => b !== a && b.health > 0 && sweptTeamSeparation(p, p, b.position, b.position) < 32))
            const reserved = actors.some(b => b !== a && b.health > 0 && airborne(b) && flightCorridor(b).some(p => sweptTeamSeparation(a.position, next, p, p) < 32))
            const obstruction = blockedBody ? `Body ${blockedBody.id} occupies the swept path.` : takeoffBlocked ? 'Landing corridor is occupied.' : reserved ? 'Yield to a committed flight corridor.' : length > (inFlight ? 560 : 300) / 64 ? 'Movement step exceeds the speed bound.' : world.movementHit(a.position,next,height) ? 'Swept body hits world geometry.' : world.bodyHit?.(next,height) ? 'Destination body intersects world geometry.' : null
            if (obstruction) {
                a.stalled++; metrics.waits++
                if(blockedBody?.side===a.side&&!a.retiredGoal)bodyWaits.set(a.id,{blocker:blockedBody.id,point:copy(blockedBody.position)})
                if (a.stalled === 1) emit(tick, 'spacing-wait', obstruction, { actor: a.id, side: a.side, ...(captureRays ? {from:copy(a.position),point:copy(next)} : {}) }); continue
            }
            a.position = copy(next); proposals.set(a.id, copy(next)); a.routeIndex++; a.speed = length * 64; a.stalled = 0; bodyWaits.delete(a.id)
            if (!a.contacts.size && length > 0.01) a.yaw = angle(starts.get(a.id)!, a.position).yaw
        }
        const utilityEvents = utility?.step(tick, actors, height) || []
        for (const e of utilityEvents) {
            const target = actors.find(a => a.id === e.target), owner = actors.find(a => a.id === e.actor)!
            if (target && e.type === 'flash') target.blindUntil = Math.max(target.blindUntil, tick + (e.blindTicks || 0))
            let damage = e.damage
            if (target && damage) { const absorb = e.type === 'blast-damage' ? Math.min(target.armor, damage * 0.35) : 0; damage = Math.min(target.health, Math.ceil(damage - absorb)); target.armor = Math.max(0, target.armor - Math.ceil(absorb)); target.health = Math.max(0, target.health - damage); metrics.damage += damage }
            if (e.type === 'decoy-heard' && target && e.to && !target.heard) target.heard = { point: copy(e.to), at: tick, until: tick + 128 }
            emit(tick, e.type, e.reason, { actor: e.type === 'decoy-heard' ? e.target : e.actor, side: e.type === 'decoy-heard' ? target?.side : owner.side, target: e.target, grenade: e.grenade, ...(e.to ? { point: copy(e.to) } : {}), ...(damage !== undefined ? { damage } : {}) })
        }
        // New smoke/flash is checked again before committing a shot this tick.
        const currentVision = utility?.visibility(tick) || world, shots: { actor: Actor; from: Vec3; to: Vec3 }[] = []
        for (const a of actors.filter(a => a.health > 0)) {
            const weapon = physicalWeapon(a.loadout?.weapon)
            a.recoil = recoverRecoil(a.recoil)
            if (a.reloadEnd && tick >= a.reloadEnd) { const n = Math.min(weapon.magazine - a.ammo, a.reserve); a.ammo += n; a.reserve -= n; a.reloadEnd = 0; emit(tick, 'reload', 'Magazine refilled from finite reserve.', { actor: a.id, side: a.side }) }
            if (s.guns && !a.ammo && a.reserve && !a.reloadEnd) a.reloadEnd = tick + weapon.reloadTicks
            if (a.heard && tick >= a.heard.until) a.heard = null
            const known = [...a.contacts.values()].filter(c => c.visible).sort((c, d) => distance3(a.position, c.point) - distance3(a.position, d.point) || c.enemy.localeCompare(d.enemy))[0]
            const phase = plans[a.side].mode === 'save' ? 'withdrawal' : a.side === 'T' && bomb.state === 'dropped' && recoverer && a.id !== recoverer ? 'recovery' : null
            const threat = phase && !known ? recoveryThreat(a.contacts.values(), phase === 'recovery' ? bomb.point : a.position, tick) : undefined
            if (threat && phase) {
                let focus = watch.get(a.id)
                if (!focus || focus.enemy !== threat.enemy || focus.phase !== phase) {
                    focus = { enemy: threat.enemy, at: tick, phase }; watch.set(a.id, focus)
                    emit(tick, 'cover-angle', `Watch the last reported angle during ${phase}; direct sight is still required to fire.`, { actor: a.id, side: a.side, target: threat.enemy, point: copy(threat.point) })
                }
                if (tick >= a.blindUntil && tick - focus.at >= Math.ceil((0.65 - (a.attributes?.reaction ?? s.skill[a.side]) * 0.5) * 64)) {
                    const desired = angle(eye(a.position), threat.point)
                    a.yaw += Math.max(-4.6875, Math.min(4.6875, delta(desired.yaw, a.yaw)))
                    a.pitch += Math.max(-4.6875, Math.min(4.6875, desired.pitch - a.pitch))
                }
            } else {
                watch.delete(a.id)
                if (a.heard && tick >= a.heard.at + Math.ceil((0.65 - (a.attributes?.reaction ?? s.skill[a.side]) * 0.5) * 64) && tick >= a.blindUntil && !known) { const desired = angle(eye(a.position), a.heard.point); a.yaw += Math.max(-4.6875, Math.min(4.6875, delta(desired.yaw, a.yaw))) }
            }
            if (!known || tick < a.blindUntil || currentVision.raycast(eye(a.position), known.point)) { a.target = null; a.ready = false; continue }
            if (a.target !== known.enemy) { a.target = known.enemy; a.acquired = tick; a.ready = false }
            const reaction = Math.ceil((0.65 - (a.attributes?.reaction ?? s.skill[a.side]) * 0.5) * 64)
            if (tick - a.acquired >= reaction) a.ready = true
            // Offset only the last visible sample; never read a hidden enemy's live position.
            const aimPoint: Vec3 = [known.point[0], known.point[1], known.point[2] - weapon.aimDrop]
            const desired = angle(eye(a.position), aimPoint), turn = 4.6875
            if (!a.ready) continue
            a.yaw += Math.max(-turn, Math.min(turn, delta(desired.yaw, a.yaw))); a.pitch += Math.max(-turn, Math.min(turn, desired.pitch - a.pitch))
            if (!s.guns || airborne(a) || tick < (utilityBusy.get(a.id) || 0) || !a.ready || bomb.actor === a.id || a.reloadEnd || !a.ammo || tick < a.nextShot || Math.abs(delta(desired.yaw, a.yaw)) > 2 || Math.abs(desired.pitch - a.pitch) > 2) continue
            const spread = weapon.spread + (1 - (a.attributes?.aim ?? s.skill[a.side])) * 3 + a.speed / 220 * weapon.movementSpread, from = eye(a.position)
            for (let pellet = 0; pellet < weapon.pellets; pellet++) {
                const yaw = (a.yaw + a.rng.range(-spread, spread)) * Math.PI / 180, pitch = (a.pitch + a.rng.range(-spread, spread) + a.recoil) * Math.PI / 180
                shots.push({ actor: a, from, to: [from[0] + Math.cos(yaw) * Math.cos(pitch) * weapon.range, from[1] + Math.sin(yaw) * Math.cos(pitch) * weapon.range, from[2] + Math.sin(pitch) * weapon.range] })
            }
            a.ammo--; a.burst++; a.recoil += weapon.recoilDegrees * (a.attributes ? 1.3 - a.attributes.control * .6 : 1)
            a.nextShot = tick + (a.burst % weapon.burstSize === 0 ? settledBurstDelay(a.recoil, weapon.shotTicks, weapon.burstPauseTicks) : weapon.shotTicks); metrics.shots++
            emit(tick, 'shot', 'Reaction, aim and magazine checks passed.', { actor: a.id, side: a.side, ...(a.loadout ? { weapon: weapon.id } : {}) })
        }
        const shotBodies = actors.filter(a => a.health > 0)
        for (const shot of shots) {
            const weapon = physicalWeapon(shot.actor.loadout?.weapon)
            const wall = world.raycast(shot.from, shot.to), hits = shotBodies.filter(a => a !== shot.actor).map(a => ({ a, hit: bodyIntersection(shot.from, shot.to, a.position, height) })).filter(x => x.hit).sort((a, b) => a.hit!.fraction - b.hit!.fraction || a.a.id.localeCompare(b.a.id)), first = hits[0]
            if (!first || wall && wall.fraction <= first.hit!.fraction + 1e-7) { emit(tick, 'shot-blocked-or-missed', 'Resolved ray hit geometry or missed every live body.', { actor: shot.actor.id, side: shot.actor.side, ...(captureRays ? { from: copy(shot.from), point: copy(wall?.point || shot.to) } : {}) }); continue }
            if (first.a.side === shot.actor.side) { emit(tick, 'friendly-obstruction', 'A teammate body intercepts the shot; friendly gun damage is disabled in this lab.', { actor: shot.actor.id, side: shot.actor.side, ...(captureRays ? { from: copy(shot.from), point: mix3(shot.from, shot.to, first.hit!.fraction) } : {}) }); continue }
            const point = mix3(shot.from, shot.to, first.hit!.fraction), raw = weapon.damage * (first.hit!.region === 'head' ? weapon.headMultiplier : 1) * Math.pow(weapon.falloffPer500, distance3(shot.from, point) / 500), protectedHit = first.hit!.region !== 'head' || (first.a.loadout?.helmet ?? true), absorb = protectedHit ? Math.min(first.a.armor, raw * weapon.armorAbsorption) : 0, damage = Math.min(first.a.health, Math.ceil(raw - absorb))
            first.a.armor = Math.max(0, first.a.armor - Math.ceil(absorb)); first.a.health = Math.max(0, first.a.health - damage); metrics.damage += damage
            emit(tick, 'damage', `${first.hit!.region} ray hit after geometry and first-body checks.`, { actor: shot.actor.id, side: shot.actor.side, target: first.a.id, point, damage, headshot: first.hit!.region === 'head', ...(shot.actor.loadout ? { weapon: weapon.id } : {}), ...(captureRays ? { from: copy(shot.from) } : {}) })
        }
        for (const a of actors) if (a.health <= 0 && a.intent !== 'dead') {
            intent(a, 'dead', 'Resolved health reached zero; actions stop.', tick); a.route = []
            for (const mate of actors.filter(b => b.side === a.side && b.health > 0 && distance3(a.position, b.position) < 400)) mate.tradeUntil = tick + 128
            if (bomb.carrier === a.id) { bomb.state = 'dropped'; bomb.carrier = null; bomb.point = copy(a.position); bomb.progress = 0; bomb.actor = null; emit(tick, 'bomb-dropped', 'Bomb carrier died; teammates must physically recover it.', { side: 'T', actor: a.id, point: copy(a.position) }) }
        }
        if (bomb.state === 'carried') bomb.point = copy(actors.find(a => a.id === bomb.carrier)!.position)
        if (bomb.state === 'dropped') { const picker = actors.find(a => a.side === 'T' && a.health > 0 && recoveryScreen?.actor!==a.id && distance3(a.position, bomb.point) < 32 && !world.raycast(eye(a.position), eye(bomb.point))); if (picker) { bomb.state = 'carried'; bomb.carrier = picker.id; emit(tick, 'bomb-picked-up', 'Teammate reached the dropped bomb.', { side: 'T', actor: picker.id }) } }
        if (bomb.state === 'planted' && tick >= bomb.plantedTick! + s.bombSeconds * 64) { bomb.state = 'exploded'; outcome = 'T'; reason = 'Bomb deadline elapsed before a completed defuse.'; emit(tick, 'exploded', reason) }
        if (outcome === 'unresolved') {
            const planter = bomb.state === 'carried' ? actors.find(a => a.id === bomb.carrier && a.health > 0 && !airborne(a) && plans.T.mode !== 'save' && plans.T.mode !== 'default' && (s.plantZones ? inPlantZone(a.position, s.plantZones[plans.T.site]) : distance3(a.position, s.sites[plans.T.site].point) <= 64 && Math.abs(a.position[2] - s.sites[plans.T.site].point[2]) <= 12) && !world.raycast(eye(a.position), eye(s.sites[plans.T.site].point))) : null
            const defusing = bomb.state === 'planted' ? actors.find(a => a.id === defuser && a.health > 0 && !airborne(a) && plans.CT.mode !== 'save' && distance3(a.position, bomb.point) <= 64 && Math.abs(a.position[2] - bomb.point[2]) <= 12 && !world.raycast(eye(a.position), eye(bomb.point))) : null
            const action = planter || defusing
            if (action) {
                if (bomb.actor !== action.id) { bomb.actor = action.id; actionStarted = tick; bomb.progress = 0; emit(tick, planter ? 'plant-start' : 'defuse-start', 'Begin an uninterrupted objective action within the declared test radius.', { actor: action.id, side: action.side }) }
                bomb.progress = tick - actionStarted; intent(action, planter ? 'plant' : 'defuse', 'Hold position to complete the objective action.', tick)
                if (bomb.progress >= (planter ? s.plantSeconds : action.loadout ? (action.loadout.kit ? 5 : 10) : s.defuseSeconds) * 64) {
                    if (planter) { bomb.state = 'planted'; bomb.site = plans.T.site; bomb.point = copy(s.plantZones ? action.position : s.sites[bomb.site].point); bomb.carrier = null; bomb.plantedTick = tick; emit(tick, 'planted', 'Plant completed; bomb site and deadline are publicly announced.', { point: copy(bomb.point) }) }
                    else { bomb.state = 'defused'; outcome = 'CT'; reason = 'Uninterrupted defuse finished before the bomb deadline.'; emit(tick, 'defused', reason) }
                    bomb.progress = 0; bomb.actor = null
                }
            } else if (bomb.actor) { emit(tick, 'objective-interrupted', 'Actor left range, died or changed to a save; progress resets.'); bomb.actor = null; bomb.progress = 0 }
            const ts = actors.filter(a => a.side === 'T' && a.health > 0), cts = actors.filter(a => a.side === 'CT' && a.health > 0)
            if (outcome === 'unresolved' && (!cts.length || !ts.length && bomb.state !== 'planted')) { outcome = !ts.length && bomb.state !== 'planted' ? 'CT' : 'T'; reason = 'Elimination resolved the round objective.' }
            if (outcome === 'unresolved' && bomb.state !== 'planted' && tick >= s.roundSeconds * 64) { outcome = 'CT'; reason = 'Round time expired without a completed plant.'; emit(tick, 'round-timeout', reason) }
        }
        for (const [i, a] of actors.entries()) for (const b of actors.slice(i + 1)) if (a.health > 0 && b.health > 0) metrics.minSeparation = Math.min(metrics.minSeparation, sweptTeamSeparation(a.position, a.position, b.position, b.position))
        if (tick % 8 === 0 || outcome !== 'unresolved' || tick === Math.floor(s.seconds * 64)) snapshot(tick)
        if (outcome !== 'unresolved') break
    }
    for (const p of s.utility?.throws || []) if (!queued.has(p.id)) emit(lastTick, 'utility-held', heldReasons.get(p.id) || 'Trigger, proximity or living owner requirement was not met; inventory was preserved.', { actor: p.owner, side: actors.find(a => a.id === p.owner)!.side, grenade: p.id })
    return { version: 1, frames, events, outcome, reason, metrics, ...(utility ? { utility: { effects: utility.effects, flights: utility.flights, checks: utility.checks() } } : {}) }
}
