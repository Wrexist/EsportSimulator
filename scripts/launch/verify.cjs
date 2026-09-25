// Evidence collection only. No upload, publication, baseline rewrite or credentials.
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {sourceIdentity, artifactIdentity, summarize} = require('./evidence.cjs');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
if (args.some(a => !['--checks', '--package'].includes(a)) || (args.includes('--checks') && args.includes('--package'))) {
  console.error('Usage: npm run release:verify [-- --package] OR npm run release:checks'); process.exit(2);
}
const checksOnly = args.includes('--checks');
const packageBuild = args.includes('--package');
const parent = path.join(root,'tmp/launch-evidence');
fs.mkdirSync(parent,{recursive:true});
const out = fs.mkdtempSync(path.join(parent,'run-'));
const report = {format: 'esim-release-evidence', version:1, startedAt:new Date().toISOString(), scope: checksOnly ? 'source checks only' : 'release candidate checks',
  decision:'NO-GO', node:process.version, platform:process.platform, arch:process.arch, gates:[], limitations:['Static checks do not establish content rights, Steam integration or player acceptance.']};
const write = () => fs.writeFileSync(path.join(out,'report.json'), JSON.stringify(report,null,2)+'\n');
async function run(id, npmArgs) {
  const log = `${id}.log`;
  console.log(`[RUN] ${id} -> ${path.relative(root,path.join(out,log))}`);
  const fd = fs.openSync(path.join(out,log),'w');
  const start = Date.now();
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath,[npm,...npmArgs], {cwd:root, env:{...process.env, NEXT_TELEMETRY_DISABLED:'1'}, stdio:['ignore',fd,fd], windowsHide:true});
    let settled = false;
    const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => { child.kill(); finish({code:null,error:'Gate timeout after 30 minutes'}); },30*60*1000);
    child.on('error',e => finish({code:null,error:e.message}));
    child.on('close',(code,signal) => finish({code,error:signal ? `Signal ${signal}` : undefined}));
  });
  fs.closeSync(fd);
  report.gates.push({id, status:result.code === 0 ? 'passed':'failed', ...result, durationMs:Date.now()-start, log});
  write(); console.log(`[${result.code === 0 ? 'PASS':'FAIL'}] ${id}`);
  return result.code === 0;
}
function missing(id, detail) { report.gates.push({id,status:'missing',detail}); write(); }
async function main() {
  report.source = sourceIdentity(root);
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  report.npm = execFileSync(process.execPath,[npm,'--version'],{cwd:root,windowsHide:true}).toString().trim();
  report.environment = { CI_FUZZ_WEEKS:process.env.CI_FUZZ_WEEKS || '500', NEXT_TELEMETRY_DISABLED:'1' };
  write();
  const tasks = [
    ['conflicts',['run','check:conflicts']], ['types',['exec','--','tsc','--noEmit','--incremental','false','--pretty','false']],
    ['lint',['run','lint']], ['regression',['test','--','--runInBand']],
    ['dependencies',['audit','--audit-level=high','--json']],
    ['content-rights',['run','content:verify']],
    ['readiness',['run','audit:steam-ready:strict']], ['static-content',['run','compliance:steam:strict']],
    ['fixtures',['run','qa:fixtures']], ['hardening',['run','release:hardening']],
  ];
  for (const [id, command] of tasks) await run(id,command);
  if (!checksOnly) {
    if (packageBuild) {
      if (await run('package',['run','dist'])) {
        report.artifact = artifactIdentity(path.join(root,'dist/win-unpacked'),report.source);
      }
    } else {
      await run('web-build',['run','build']);
      missing('package', 'Use --package to build and attest a fresh Windows artifact in this invocation; an old dist folder cannot pass.');
    }
    await run('ship-layout',['run','ship:verify']);
    if (!report.artifact) missing('artifact-identity','No successful package built in this invocation');
    else report.gates.push({id:'artifact-identity',status:'passed'});
    const backlog = JSON.parse(fs.readFileSync(path.join(root,'docs/launch-readiness/backlog.json'),'utf8'));
    const unresolved = backlog.packages.filter(p => !['L34','L36'].includes(p.id) && p.status !== 'verified' && !(p.gate === 'conditional' && p.status === 'excluded')).map(p => p.id);
    report.gates.push({id:'acceptance-evidence',status:unresolved.length ? 'missing':'passed', unresolved});
  }
  const after = sourceIdentity(root);
  report.gates.push({id:'source-unchanged',status:after.digest === report.source.digest ? 'passed':'failed', afterDigest:after.digest});
  report.limitations.push('L36 is the final owner review, not an input acceptance gate. Conditional packages require verification or explicit exclusion.');
  const required = [...tasks.map(t=>t[0]),'source-unchanged',...(!checksOnly ? ['package','ship-layout','artifact-identity','acceptance-evidence'] : [])];
  report.summary = summarize(report.gates,required);
  report.finishedAt = new Date().toISOString();
  report.decision = report.summary.passed && !checksOnly ? 'CANDIDATE CHECKS PASSED - owner release review required' : 'NO-GO';
  write(); console.log(`${report.decision}\nEvidence: ${path.relative(root,out)}`);
  process.exitCode = report.summary.passed ? 0:1;
}
main().catch(error => {report.fatal=error.message; write(); console.error(error); process.exitCode=1;});
