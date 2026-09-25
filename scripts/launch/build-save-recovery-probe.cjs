const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const parent=path.join(root,'tmp/l03-native');fs.mkdirSync(parent,{recursive:true});
const directory=fs.mkdtempSync(path.join(parent,'run-'));
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'save-recovery-browser.ts')],bundle:true,platform:'browser',format:'iife',outfile:path.join(directory,'browser.js'),define:{'process.env.NODE_ENV':'"production"'},alias:{'@':root}});
fs.writeFileSync(path.join(parent,'latest.txt'),directory);
console.log(directory);
