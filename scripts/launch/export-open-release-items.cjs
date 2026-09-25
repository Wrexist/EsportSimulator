const fs = require('node:fs');
const backlog = JSON.parse(fs.readFileSync('docs/launch-readiness/backlog.json', 'utf8'));
const tasks = backlog.packages.flatMap(p => p.tasks).filter(x => !x.done);
const acceptance = backlog.packages.flatMap(p => p.acceptance).filter(x => !x.done);
const lines = [
  '# All unaccepted Steam release items — 25 September 2026', '',
  `Register snapshot: ${backlog.packages.length} packages; ${tasks.length} unchecked implementation tasks and ${acceptance.length} unchecked acceptance criteria. These are not a remaining-code estimate or readiness percentage.`, '',
  '**Read [the current handoff](../../STEAM_RELEASE_HANDOFF.md) first.** The package register includes historical bookkeeping: unchecked means not accepted, not necessarily unimplemented. Reverify current code and evidence before changing anything. No implementation or approval is inferred by this export.', '',
  'The current handoff adds the latest Overpass failures, physical rehearsal limitation, portrait synchronization, source-content reconciliation, Steam status and packaging requirements. Original detailed prompts remain available for every package.', '',
];
for (const p of backlog.packages) {
  lines.push(`## ${p.id} — ${p.title}`, '', `Recorded status: **${p.status}** · ${p.gate} · Dependencies: ${p.dependsOn.join(', ') || 'none'} · [Master prompt](${p.prompt})`, '');
  const open = [...p.tasks, ...p.acceptance].filter(x => !x.done);
  if (!open.length) lines.push('No unchecked items in this package register. Preserve its evidence and recheck affected behavior after changes.', '');
  else for (const item of open) lines.push(`- [ ] **${item.id}** ${item.text}`);
  lines.push('');
  if (p.evidence?.length) lines.push('Recorded evidence: ' + p.evidence.map(file => `[${file.split('/').pop()}](${file.replace('docs/launch-readiness/', '')})`).join(', '), '');
}
fs.writeFileSync('docs/launch-readiness/OPEN-RELEASE-ITEMS-2026-09-25.md', lines.join('\n'));
console.log(JSON.stringify({packages: backlog.packages.length, uncheckedTasks: tasks.length, uncheckedAcceptance: acceptance.length}));
