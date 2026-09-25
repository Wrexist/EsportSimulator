from pathlib import Path
import sys, json
root=Path(__file__).resolve().parent
sys.path.insert(0,str(root.parents[1]/'tmp/steam-brand-fonttools'))
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
font=TTFont(root.parent/'esports-manager-steam-assets-4326170/brand-v2/BarlowCondensed-ExtraBold.ttf')
glyphs=font.getGlyphSet(); cmap=font.getBestCmap()
def line(text,x,y,maxw,h,fill):
    advance=0; paths=[]; bounds=[]
    for ch in text:
        g=glyphs[cmap[ord(ch)]]; p=SVGPathPen(glyphs); g.draw(p); b=BoundsPen(glyphs);g.draw(b)
        paths.append(f'<path transform="translate({advance} 0)" d="{p.getCommands()}"/>')
        if b.bounds: bounds.append((advance+b.bounds[0],b.bounds[1],advance+b.bounds[2],b.bounds[3]))
        advance+=g.width+15
    left=min(b[0] for b in bounds);right=max(b[2] for b in bounds);bottom=min(b[1] for b in bounds);top=max(b[3] for b in bounds)
    s=min(maxw/(right-left),h/(top-bottom))
    return f'<g fill="{fill}" transform="translate({x} {y}) scale({s} {-s}) translate({-left} {-top})">'+''.join(paths)+'</g>'
def save(name,w,h,body):
    (root/'sources'/name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>',encoding='utf8')
save('title.svg',800,400,line('ESPORTS',0,0,800,155,'#fff9eb')+line('MANAGER',0,176,800,155,'#fff9eb')+line('FPS',340,358,160,40,'#ffd36a')+'<path d="M0 378H295 M490 378H765" stroke="#ffd36a" stroke-width="2" opacity=".6"/>')
save('compact-title.svg',1000,240,line('ESPORTS MANAGER',0,0,1000,155,'#fff9eb')+line('FPS',0,181,180,48,'#ffd36a'))
items=[
('01-live-match','LIVE MATCH MANAGEMENT','Call the buy.','Win the round.'),
('02-player-development','PLAYER DEVELOPMENT','Find talent.','Build a star.'),
('03-match-analysis','MATCH ANALYSIS','Read the match.','Find your edge.'),
('04-scouting','SCOUTING & RECRUITMENT','Find your next','superteam.'),
('05-build-your-club','FACILITIES & DEVELOPMENT','Build your','home advantage.'),
('06-equipment','EQUIPMENT & UPGRADES','Equip your team.','Raise the standard.'),
('07-contracts-and-budget','CLUB FINANCES','Run the whole','organization.'),
('08-club-overview','YOUR CLUB. YOUR NEXT MOVE.','Make every','season count.')]
for name,kicker,a,b in items:
    save(name+'.svg',1200,330,line(kicker,0,0,1100,24,'#79d6d2')+line(a,0,61,1180,105,'#fff9eb')+line(b,0,185,1180,110,'#ffd36a'))
(root/'sources/copy.json').write_text(json.dumps(items,indent=2),encoding='utf8')
print('Outlined title lockups and eight headlines exported.')
