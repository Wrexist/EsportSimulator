/**
 * L27.A3: summarize a V8 .heapsnapshot (from l27-packaged.cjs --heap-at=...).
 * Computes the dominator tree (retained sizes), the largest retained objects
 * with their shortest retaining path from the GC root, detached DOM counts and
 * per-constructor totals. With two files, also prints the constructor diff.
 *
 *   node --max-old-space-size=12000 scripts/launch/l27-heap-analyze.cjs <a.heapsnapshot> [b.heapsnapshot] [--top=40] [--json=out.json]
 */
const fs = require('node:fs')

const arg = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const files = process.argv.slice(2).filter(a => !a.startsWith('--'))
const TOP = Number(arg('top', '40'))

function load(file) {
    const snap = JSON.parse(fs.readFileSync(file, 'utf8'))
    const meta = snap.snapshot.meta
    const nf = meta.node_fields, ef = meta.edge_fields
    const NFC = nf.length, EFC = ef.length
    const nodeTypes = meta.node_types[0], edgeTypes = meta.edge_types[0]
    const iType = nf.indexOf('type'), iName = nf.indexOf('name'), iSelf = nf.indexOf('self_size'), iEc = nf.indexOf('edge_count'), iDet = nf.indexOf('detachedness'), iId = nf.indexOf('id')
    const eType = ef.indexOf('type'), eName = ef.indexOf('name_or_index'), eTo = ef.indexOf('to_node')
    const nodes = snap.nodes, edges = snap.edges, strings = snap.strings
    const N = nodes.length / NFC
    const firstEdge = new Uint32Array(N + 1)
    for (let i = 0, e = 0; i < N; i++) { firstEdge[i] = e; e += nodes[i * NFC + iEc] * EFC; firstEdge[i + 1] = e }
    const weak = edgeTypes.indexOf('weak'), shortcut = edgeTypes.indexOf('shortcut')
    const typeOf = i => nodeTypes[nodes[i * NFC + iType]]
    const nameOf = i => strings[nodes[i * NFC + iName]]
    const selfOf = i => nodes[i * NFC + iSelf]
    const edgeName = e => { const t = edgeTypes[edges[e + eType]]; const n = edges[e + eName]; return (t === 'element' || t === 'hidden') ? `[${n}]` : String(strings[n]) }
    const isStrong = e => { const t = edges[e + eType]; return t !== weak && t !== shortcut }

    // Reverse post-order DFS from root (node 0) over strong edges.
    const order = new Int32Array(N).fill(-1), post = new Int32Array(N)
    let count = 0
    const stack = new Int32Array(N), it = new Uint32Array(N)
    let sp = 0
    stack[sp++] = 0; it[0] = firstEdge[0]; order[0] = -2
    while (sp) {
        const v = stack[sp - 1]
        let pushed = false
        while (it[v] < firstEdge[v + 1]) {
            const e = it[v]; it[v] += EFC
            if (!isStrong(e)) continue
            const w = edges[e + eTo] / NFC
            if (order[w] !== -1) continue
            order[w] = -2; it[w] = firstEdge[w]; stack[sp++] = w; pushed = true; break
        }
        if (!pushed) { sp--; order[v] = count; post[count++] = v }
    }
    // Predecessors (strong edges, reachable only).
    const predCount = new Uint32Array(N + 1)
    for (let v = 0; v < N; v++) if (order[v] >= 0) for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EFC) if (isStrong(e)) { const w = edges[e + eTo] / NFC; if (order[w] >= 0) predCount[w + 1]++ }
    for (let i = 0; i < N; i++) predCount[i + 1] += predCount[i]
    const preds = new Uint32Array(predCount[N]), fill = predCount.slice(0, N)
    for (let v = 0; v < N; v++) if (order[v] >= 0) for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EFC) if (isStrong(e)) { const w = edges[e + eTo] / NFC; if (order[w] >= 0) preds[fill[w]++] = v }
    // Cooper-Harvey-Kennedy iterative dominators over post-order numbers.
    const idom = new Int32Array(count).fill(-1)
    const rootPo = order[0]
    idom[rootPo] = rootPo
    let changed = true
    while (changed) {
        changed = false
        for (let po = count - 1; po >= 0; po--) {
            if (po === rootPo) continue
            const v = post[po]
            let nd = -1
            for (let k = predCount[v]; k < predCount[v + 1]; k++) {
                let p = order[preds[k]]
                if (idom[p] === -1) continue
                if (nd === -1) { nd = p; continue }
                let a = p, b = nd
                while (a !== b) { while (a < b) a = idom[a]; while (b < a) b = idom[b] }
                nd = a
            }
            if (nd !== -1 && idom[po] !== nd) { idom[po] = nd; changed = true }
        }
    }
    const retained = new Float64Array(N)
    for (let po = 0; po < count; po++) retained[post[po]] += selfOf(post[po])
    for (let po = 0; po < count; po++) if (po !== rootPo && idom[po] >= 0) retained[post[idom[po]]] += retained[post[po]]
    const dominatorOf = v => post[idom[order[v]]]
    // Shortest strong path from root (BFS) for retaining paths.
    const parent = new Int32Array(N).fill(-1), parentEdge = new Int32Array(N).fill(-1)
    const q = new Int32Array(N); let qh = 0, qt = 0
    q[qt++] = 0; parent[0] = 0
    while (qh < qt) { const v = q[qh++]; for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EFC) { if (!isStrong(e)) continue; const w = edges[e + eTo] / NFC; if (parent[w] !== -1) continue; parent[w] = v; parentEdge[w] = e; q[qt++] = w } }
    const pathOf = v => {
        const parts = []
        for (let x = v, guard = 0; x !== 0 && parent[x] !== -1 && guard < 40; x = parent[x], guard++) parts.push(`${edgeName(parentEdge[x])}→${typeOf(x) === 'object' || typeOf(x) === 'closure' ? nameOf(x).slice(0, 40) : typeOf(x)}`)
        return parts.reverse().join(' . ')
    }
    const label = i => `${typeOf(i)}:${String(nameOf(i)).slice(0, 60)}`
    // Whole-state copies: objects owning both a "players" and a "currentWeek" property,
    // plus the distinct "players" arrays they point at (a stale copy pins its own).
    const stateCopies = []
    for (let v = 0; v < N; v++) {
        if (order[v] < 0 || typeOf(v) !== 'object') continue
        let players = -1, week = false
        for (let e = firstEdge[v]; e < firstEdge[v + 1]; e += EFC) {
            if (edgeTypes[edges[e + eType]] !== 'property') continue
            const n = strings[edges[e + eName]]
            if (n === 'players') players = edges[e + eTo] / NFC
            else if (n === 'currentWeek') week = true
        }
        if (players >= 0 && week) stateCopies.push({ v, players })
    }
    return { stateCopies, N, count, typeOf, nameOf, selfOf, retained, dominatorOf, pathOf, label, detachedness: i => iDet >= 0 ? nodes[i * NFC + iDet] : 0, idOf: i => nodes[i * NFC + iId], reachable: i => order[i] >= 0 }
}

function summarize(file) {
    const h = load(file)
    let total = 0, detached = 0, detachedSelf = 0
    const byCtor = new Map()
    for (let i = 0; i < h.N; i++) {
        if (!h.reachable(i)) continue
        const s = h.selfOf(i); total += s
        const key = h.typeOf(i) === 'object' || h.typeOf(i) === 'closure' ? `${h.typeOf(i)}:${h.nameOf(i)}` : h.typeOf(i)
        const r = byCtor.get(key) || { count: 0, self: 0 }; r.count++; r.self += s; byCtor.set(key, r)
        if (h.detachedness(i) === 2 || /^Detached /.test(String(h.nameOf(i)))) { detached++; detachedSelf += s }
    }
    // Largest retainers: nodes whose retained size is large but whose dominator is
    // a "root-ish" holder; skip synthetic roots.
    const idx = []
    for (let i = 1; i < h.N; i++) if (h.reachable(i) && h.retained[i] > 512 * 1024 && h.typeOf(i) !== 'synthetic') idx.push(i)
    idx.sort((a, b) => h.retained[b] - h.retained[a])
    const big = idx.slice(0, TOP).map(i => ({ id: h.idOf(i), node: h.label(i), retainedMB: +(h.retained[i] / 1048576).toFixed(2), dominator: h.label(h.dominatorOf(i)), path: h.pathOf(i).slice(-900) }))
    const ctors = [...byCtor].sort((a, b) => b[1].self - a[1].self).slice(0, 60).map(([k, v]) => ({ ctor: k, count: v.count, selfMB: +(v.self / 1048576).toFixed(2) }))
    const copies = h.stateCopies.map(({ v, players }) => ({ id: h.idOf(v), playersArrayId: h.idOf(players), retainedMB: +(h.retained[v] / 1048576).toFixed(2), path: h.pathOf(v).slice(-700) }))
    const distinctPlayers = new Set(copies.map(c => c.playersArrayId)).size
    return { file, nodes: h.N, stateCopies: copies, distinctPlayersArrays: distinctPlayers, reachableMB: +(total / 1048576).toFixed(1), detachedDomNodes: detached, detachedSelfMB: +(detachedSelf / 1048576).toFixed(2), big, ctors, byCtor }
}

const results = files.map(summarize)
for (const r of results) {
    console.log(`\n=== ${r.file}: ${r.nodes} nodes, reachable ${r.reachableMB} MB, detached DOM ${r.detachedDomNodes} (${r.detachedSelfMB} MB)`)
    console.log(`--- state-like objects: ${r.stateCopies.length}, distinct players arrays: ${r.distinctPlayersArrays}`)
    for (const c of r.stateCopies) console.log(`  @${c.id} players@${c.playersArrayId} retained ${c.retainedMB} MB\n      ${c.path}`)
    for (const b of r.big) console.log(`${String(b.retainedMB).padStart(8)} MB  ${b.node}\n            dom: ${b.dominator}\n            path: ${b.path}`)
}
if (results.length === 2) {
    const [a, b] = results
    const keys = new Set([...a.byCtor.keys(), ...b.byCtor.keys()])
    const diff = [...keys].map(k => { const x = a.byCtor.get(k) || { count: 0, self: 0 }, y = b.byCtor.get(k) || { count: 0, self: 0 }; return { ctor: k, dCount: y.count - x.count, dSelfMB: +((y.self - x.self) / 1048576).toFixed(2) } })
        .sort((p, q) => q.dSelfMB - p.dSelfMB).slice(0, 40)
    console.log('\n=== constructor growth (b - a)')
    for (const d of diff) console.log(`${String(d.dSelfMB).padStart(8)} MB ${String(d.dCount).padStart(8)}  ${d.ctor}`)
}
const out = arg('json', '')
if (out) fs.writeFileSync(out, JSON.stringify(results.map(({ byCtor, ...r }) => r), null, 2) + '\n')
