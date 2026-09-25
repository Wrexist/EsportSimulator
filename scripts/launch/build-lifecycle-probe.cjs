const fs=require('fs'),path=require('path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),parent=path.join(root,'tmp/l05-native');fs.mkdirSync(parent,{recursive:true});
const directory=fs.mkdtempSync(path.join(parent,'run-'));
esbuild.buildSync({entryPoints:[path.join(__dirname,'lifecycle-browser.ts')],bundle:true,platform:'browser',format:'iife',outfile:path.join(directory,'browser.js'),define:{'process.env.NODE_ENV':'"production"'},alias:{'@':root}});
fs.writeFileSync(path.join(parent,'latest.txt'),directory);console.log(directory);
