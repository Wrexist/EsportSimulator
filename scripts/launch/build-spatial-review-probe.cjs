const fs=require('fs'),path=require('path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'../..'),parent=path.join(root,'tmp/l09-native');fs.mkdirSync(parent,{recursive:true});
const directory=fs.mkdtempSync(path.join(parent,'run-'));
const fixture=process.argv[2]==='l14'?'l14-browser.ts':process.argv[2]==='l13'?'l13-browser.ts':process.argv[2]==='l12'?'l12-browser.ts':process.argv[2]==='l11'?'l11-browser.ts':process.argv[2]==='mirage-v12'?'mirage-v12-browser.ts':'spatial-review-browser.ts';
esbuild.buildSync({entryPoints:[path.join(__dirname,fixture)],bundle:true,platform:'browser',format:'iife',outfile:path.join(directory,'browser.js'),define:{'process.env.NODE_ENV':'"production"'},alias:{'@':root}});
fs.writeFileSync(path.join(parent,'latest.txt'),directory);console.log(directory);
