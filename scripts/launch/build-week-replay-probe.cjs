const fs=require('fs'),path=require('path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),parent=path.join(root,'tmp/l04-native');fs.mkdirSync(parent,{recursive:true});
const directory=fs.mkdtempSync(path.join(parent,'run-'));
esbuild.buildSync({entryPoints:[path.join(__dirname,process.argv[2]==='l22'?'l22-first-session-browser.ts':process.argv[2]==='l15'?'l15-week-browser.ts':'week-replay-browser.ts')],bundle:true,platform:'browser',format:'iife',outfile:path.join(directory,'browser.js'),external:['fs/promises'],define:{'process.env':'{}','process.env.NODE_ENV':'"production"','import.meta.url':'"http://localhost:33580/browser.js"'},alias:{'@':root}});
fs.writeFileSync(path.join(parent,'latest.txt'),directory);console.log(directory);
