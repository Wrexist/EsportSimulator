// Audit-only probes of existing code with fake transport, timers, and audio.
// Run from the repository root: node docs/audit-2026-09-12/evidence/behavior-probes.cjs
// These reproduce defects; they are not assertions of desired behavior.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

function load(file, context, imports = {}) {
  const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.url', '"file:///audit/worker.ts"');
  const output = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS}}).outputText;
  const exports = {};
  vm.runInNewContext(output, {...context, exports, require: name => {
    if (!(name in imports)) throw Error(`Unexpected import: ${name}`);
    return imports[name];
  }}, {filename:file});
  return exports;
}

async function main() {
  const timers = [];
  const listeners = new Set();
  const worker = {
    addEventListener: (_, f) => listeners.add(f),
    removeEventListener: (_, f) => listeners.delete(f),
    postMessage: () => {},
    terminate: () => {},
  };
  const {weekProcessorBridge: bridge} = load('engine/worker/week-processor-bridge.ts', {
    setTimeout: (fn, ms) => { const t = {fn, ms}; timers.push(t); return t; },
    clearTimeout: () => {},
  }, {'@/lib/logger': {logger:{warn:()=>{}}}});
  bridge.worker = worker;
  bridge.workerReady = true;
  bridge.processSync = async save => ({save, result:{success:true}, rngState:1});
  const config = {playerTeamId:'audit', trainingFocus:new Map()};
  const rng = {getState:()=>1};
  const first = bridge.processInWorker({label:'week A'}, config, rng);
  timers[0].fn();
  await first;
  const retainedAfterTimeout = listeners.size;
  const second = bridge.processInWorker({label:'week B'}, config, rng);
  for (const handler of [...listeners]) handler({data:{type:'RESULT',save:{label:'late week A'},result:{success:true},rngState:1}});
  const actual = await second;
  assert.equal(retainedAfterTimeout,1);
  assert.equal(actual.save.label,'late week A');
  console.log('REPRODUCED: timed-out worker retains listener; next request accepts previous request result.');

  const handlers = {};
  const gains = [];
  class FakeAudioContext {
    constructor() { this.destination = {}; }
    createGain() { const node={gain:{value:0},connect:()=>{}}; gains.push(node); return node; }
  }
  const {soundManager} = load('lib/sound-manager.ts', {
    window:{AudioContext:FakeAudioContext,addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:()=>{}}
  });
  soundManager.setMasterVolume(0);
  handlers.click();
  assert.equal(gains[0].gain.value,0.24);
  console.log('REPRODUCED: setting master volume to zero before first interaction is lost; audio initializes at gain 0.24.');

  const {buildSaveSnapshot} = load('store/utils/build-save-snapshot.ts', {}, {
    '@/engine/save-types':{CURRENT_SAVE_VERSION:6}, '@/engine/rng':{generateSeed:()=>123}, '@/engine':{FOUNDING_LEGENDS:[]}
  });
  const snapshot = buildSaveSnapshot({lastCommittedWeekTick:52});
  assert.equal(snapshot.lastCommittedWeekTick,undefined);
  console.log('REPRODUCED: buildSaveSnapshot omits lastCommittedWeekTick. Recovery impact requires store + persistence integration testing.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
