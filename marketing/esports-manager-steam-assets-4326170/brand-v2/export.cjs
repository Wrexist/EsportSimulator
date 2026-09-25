const fs=require('fs'),path=require('path'),sharp=require('sharp'),crypto=require('crypto');
const root=path.dirname(__dirname),out=path.join(root,'UPLOAD-READY-v2');
const items=[];
async function write(file,pipeline,field){const dest=path.join(out,file);fs.mkdirSync(path.dirname(dest),{recursive:true});await pipeline.toFile(dest);const m=await sharp(dest).metadata();items.push({file,width:m.width,height:m.height,format:m.format,field,sha256:crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')});}
async function capsule(file,source,w,h,lx,ly,lw,field){
 const logo=await sharp(path.join(__dirname,'wordmark.svg')).resize(lw).png().toBuffer();
 await write(file,sharp(path.join(__dirname,source)).resize(w,h,{fit:'cover'}).composite([{input:logo,left:lx,top:ly}]).flatten({background:'#07121d'}).png(),field);
}
(async()=>{
 await capsule('01-STORE/main_capsule_1232x706.png','main-clean.png',1232,706,44,115,535,'Main Capsule');
 await capsule('01-STORE/header_capsule_920x430.png','main-clean.png',920,430,20,58,406,'Header Capsule');
 await capsule('01-STORE/small_capsule_462x174.png','main-clean.png',462,174,4,3,296,'Small Capsule');
 await capsule('01-STORE/vertical_capsule_748x896.png','vertical-clean.png',748,896,119,25,510,'Vertical Capsule');
 await capsule('02-LIBRARY/library_capsule_600x900.png','library-clean.png',600,900,50,35,500,'Library Capsule');
 await capsule('02-LIBRARY/library_header_920x430.png','main-clean.png',920,430,20,58,406,'Library Header');
 await write('02-LIBRARY/library_logo_1280x720.png',sharp(path.join(__dirname,'wordmark.svg')).png(),'Library Logo');
 for(const [src,dst,field] of [
 ['store/page_background_1438x810.png','01-STORE/page_background_1438x810.png','Page Background'],
 ['library/library_hero_3840x1240.png','02-LIBRARY/library_hero_3840x1240.png','Library Hero'],
 ['about/01_build_your_squad_1460x600.png','03-ABOUT-ONLY/01_build_your_squad_1460x600.png','Description extra image'],
 ['about/02_run_the_club_1460x600.png','03-ABOUT-ONLY/02_run_the_club_1460x600.png','Description extra image'],
 ['about/03_shape_your_season_1460x600.png','03-ABOUT-ONLY/03_shape_your_season_1460x600.png','Description extra image'],
 ['events/event_header_1920x622.png','05-EVENTS-ONLY/event_header_1920x622.png','Event Header']]) await write(dst,sharp(path.join(root,'upload',src)).png(),field);
 for(const n of [256,512])await write('04-APP-ICONS/shortcut_icon_'+n+'.png',sharp(path.join(__dirname,'monogram.svg')).resize(n).png(),'Shortcut Icon');
 await write('04-APP-ICONS/app_icon_184.jpg',sharp(path.join(__dirname,'monogram.svg')).resize(184).flatten({background:'#091723'}).jpeg({quality:98,chromaSubsampling:'4:4:4'}),'App Icon');
 await capsule('05-EVENTS-ONLY/event_cover_800x450.png','main-clean.png',800,450,25,65,354,'Event Cover');
 const sizes=[16,24,32,48,64,128,256],frames=await Promise.all(sizes.map(n=>sharp(path.join(__dirname,'monogram.svg')).resize(n).png().toBuffer()));
 const dir=Buffer.alloc(6+16*sizes.length);dir.writeUInt16LE(1,2);dir.writeUInt16LE(sizes.length,4);let offset=dir.length;
 frames.forEach((f,i)=>{const p=6+16*i;dir[p]=sizes[i]%256;dir[p+1]=sizes[i]%256;dir.writeUInt16LE(1,p+4);dir.writeUInt16LE(32,p+6);dir.writeUInt32LE(f.length,p+8);dir.writeUInt32LE(offset,p+12);offset+=f.length;});
 fs.writeFileSync(path.join(out,'04-APP-ICONS/shortcut_icon.ico'),Buffer.concat([dir,...frames]));
 fs.writeFileSync(path.join(out,'asset-manifest.json'),JSON.stringify({appId:4326170,assets:items,icoSizes:sizes},null,2));
 fs.writeFileSync(path.join(out,'READ-ME-FIRST.txt'),'Only upload files from the matching numbered folder.\n01 STORE: Store graphical assets.\n02 LIBRARY: Library graphical assets; explicitly select Library Header for the 920x430 file.\n03 ABOUT: Description extra images, NEVER screenshots/capsules.\n04 APP ICONS: Steamworks application settings.\n05 EVENTS: Optional future event artwork.\nNo source masters or gameplay screenshots are in this package.\n');
 console.log('Exported '+items.length+' exact-size images and seven-frame ICO.');
})().catch(e=>{console.error(e);process.exitCode=1});
