const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {contracts}=require('../../electron/ipc-policy');
const root=path.resolve(__dirname,'../..');
const entries=['electron/main.js','electron/steam.js'].flatMap(file=>{
    const source=fs.readFileSync(path.join(root,file),'utf8');
    return [...source.matchAll(/handle(?:App|Steam)\('([^']+)'/g)].map(match=>({channel:match[1],file,line:source.slice(0,match.index).split('\n').length}));
});
assert.deepEqual(entries.map(e=>e.channel).sort(),Object.keys(contracts).sort());
const out=path.join(root,'docs/launch-readiness/evidence');
const rows=entries.sort((a,b)=>a.channel.localeCompare(b.channel)).map(entry=>{
    const {fallback,schema,authority}=contracts[entry.channel];
    return {...entry,sender:'Exact trusted WebContents object + its current mainFrame + selected localhost origin on both frame and contents; destroyed/null frames denied.',schema,invalidReturn:fallback,authority};
});
fs.writeFileSync(path.join(out,'L07-IPC-INVENTORY.json'),JSON.stringify({date:'2026-09-13',count:rows.length,rows},null,2)+'\n');
fs.writeFileSync(path.join(out,'L07-IPC-INVENTORY.md'),`# IPC inventory\n\nAll ${rows.length} channels use the same main-process sender gate: exact trusted WebContents object, current main frame, and exact selected localhost origin on both frame and contents. Null/destroyed frames, other windows, host aliases, other ports, credentials, non-HTTP origins and mod-asset documents fail closed. Invalid payloads return the channel fallback before the handler runs. No raw ipcRenderer or event object is exposed by preload.\n\nNative game storage is limited to esports_* keys (ASCII letters/digits/underscore/hyphen, bounded length) and cs2_manager_career_profile in userData/config.json. Renderer clearing does not clear private window configuration. Community writes affect four known JSON files under userData/mods/community; Workshop reads use the SDK-selected installed directory. Logs live under userData/logs; GPU writes affect only userData/gpu-crash-flag. See the source modules for exact predicates and Steam allowlists.\n\n| Channel | Schema / successful return | Rejection | Authority | Handler |\n|---|---|---|---|---|\n`+rows.map(r=>`| ${r.channel} | ${r.schema.replaceAll('|',' / ')} | ${JSON.stringify(r.invalidReturn)} | ${r.authority} | ${r.file}:${r.line} |`).join('\n')+'\n\nFilesystem controls: JSON reads are bounded (16 MiB overlays, 256 KiB Workshop manifest, 4 KiB active pointer); mod/pointer writes use atomic replacement. Links/junctions within checked paths are rejected. Mod HTTP assets accept GET/HEAD only, approved image extensions, nosniff and a sandboxed document policy. Static malformed mod JSON never reaches the simulation without the existing snapshot validator. These checks do not isolate the game from another OS process that already controls the same user account.\n');
console.log(`Inventoried ${rows.length} IPC handlers`);
