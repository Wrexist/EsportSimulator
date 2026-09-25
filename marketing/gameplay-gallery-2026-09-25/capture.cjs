const {chromium}=require('playwright');
const fs=require('fs'); const path=require('path');
const out=__dirname;
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const page=await context.newPage();page.setDefaultTimeout(60000);
 async function shot(name){await page.locator('h1').first().waitFor({timeout:120000});await context.storageState({indexedDB:true,path:path.join(out,'capture-session.local.json')});await page.waitForTimeout(1200);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});await page.addStyleTag({content:'nextjs-portal,.z-devtools{display:none!important}'});await page.screenshot({path:path.join(out,name+'.png')});console.log('SAVED '+name);}
 await page.goto('http://localhost:3372/new-game');
 await page.locator('input[placeholder*="name"]').first().fill('Alex Morgan');
 await page.getByRole('button',{name:'Choose Existing Team'}).click();
 await page.getByRole('heading',{name:'Eternal Flame',exact:true}).click();
 await page.getByRole('button',{name:'START CAREER',exact:true}).click();
 await page.getByRole('heading',{name:'Club overview',exact:true}).waitFor({timeout:120000});
 const skip=page.getByRole('button',{name:'Skip first session guide'});if(await skip.isVisible())await skip.click();
 await page.waitForTimeout(2500);await shot('01-club-overview');
 for(const [link,name] of [['Squad','02-squad'],['Scouting','04-scouting'],['Facilities','05-club-campus'],['Equipment','06-equipment'],['Finances','07-finances'],['Training','08-training']]){
 const target=await page.getByRole('link',{name:link,exact:true}).first().getAttribute('href');await page.goto('http://localhost:3372'+target,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForTimeout(5000);console.log('ROUTE',page.url(),await page.locator('h1').allTextContents());if(link==='Scouting')await page.getByText('kyxsen',{exact:true}).first().click();await shot(name);
 if(link==='Squad'){const p=page.locator('a[href^="/player/"]').first();if(await p.count()){await p.click();await shot('03-player-profile');}}
 }
 await context.storageState({indexedDB:true,path:path.join(out,'capture-session.local.json')});
 fs.writeFileSync(path.join(out,'capture-log.json'),JSON.stringify({date:new Date().toISOString(),viewport:{width:1920,height:1080},source:'Current local game, isolated new career, no gameplay value manipulation'},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
