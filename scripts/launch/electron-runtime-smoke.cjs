// Run with ELECTRON_RUN_AS_NODE=1 using the installed Electron executable.
// This tests its real Node/native ABI and local Next server, not window/IPC behavior.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../..');
const output = path.join(root,'tmp/l06-electron-server.json');
let nextApp, server;
const timer = setTimeout(()=>{fs.writeFileSync(output,JSON.stringify({passed:false,error:'90 second timeout'}));process.exit(1);},90000);
async function main() {
  assert.ok(process.versions.electron,'Must use the Electron executable');
  assert.equal(typeof require('steamworks.js').init,'function');
  nextApp = require('next')({dev:false,dir:root});
  await nextApp.prepare();
  server = http.createServer(nextApp.getRequestHandler());
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/main-menu`);
  const html = await response.text();
  assert.equal(response.status,200);
  assert.ok(html.includes('New Career'));
  const report={passed:true,electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome,
    buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim(),steamNativeLoads:true,localMainMenuStatus:response.status,
    limitations:['Source tree, not ASAR package; no Steam initialization/account calls, window, IPC, or offline-disconnected acceptance. No career storage touched.']};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
}
main().then(()=>process.exitCode=0).catch(error=>{
  fs.writeFileSync(output,JSON.stringify({passed:false,error:error.stack},null,2)+'\n');process.exitCode=1;
}).finally(async()=>{clearTimeout(timer);if(server)server.close();if(nextApp)await nextApp.close();});
