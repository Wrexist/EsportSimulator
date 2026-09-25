"""Portable outlined branding: no installed fonts required by exported SVGs."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tmp/steam-brand-fonttools'))
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

root = Path(__file__).resolve().parent
font = TTFont(root / 'BarlowCondensed-ExtraBold.ttf')
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()

def line(text, x, y, width, height, fill, spacing=20):
    paths=[]; advance=0; bounds=[]
    for char in text:
        glyph = glyphs[cmap[ord(char)]]
        pen=SVGPathPen(glyphs); glyph.draw(pen)
        bp=BoundsPen(glyphs); glyph.draw(bp)
        paths.append(f'<path transform="translate({advance} 0)" d="{pen.getCommands()}"/>')
        if bp.bounds: bounds.append((advance+bp.bounds[0],bp.bounds[1],advance+bp.bounds[2],bp.bounds[3]))
        advance += glyph.width + spacing
    left=min(b[0] for b in bounds); right=max(b[2] for b in bounds)
    bottom=min(b[1] for b in bounds); top=max(b[3] for b in bounds)
    return f'<g fill="{fill}" transform="translate({x} {y}) scale({width/(right-left)} {-height/(top-bottom)}) translate({-left} {-top})">'+''.join(paths)+'</g>'

defs='''<defs><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#ffffff"/><stop offset=".5" stop-color="#e7eff5"/><stop offset="1" stop-color="#9eafc1"/></linearGradient><linearGradient id="teal"><stop stop-color="#71f4e5"/><stop offset="1" stop-color="#19b8ce"/></linearGradient></defs>'''
body=line('ESPORTS',80,74,1120,218,'url(#metal)',32)+line('MANAGER',80,318,1120,218,'url(#metal)',20)+line('FPS',500,584,280,82,'url(#teal)',100)
body+='<path d="M80 625H426 M854 625H1200" stroke="#40d5d3" stroke-width="4"/><path d="M80 70H1200" stroke="#ffffff" opacity=".12" stroke-width="2"/>'
(root/'wordmark.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">'+defs+body+'</svg>',encoding='utf-8')
icon='<rect width="512" height="512" rx="88" fill="#091723"/><path d="M72 82H440" stroke="#40d5d3" stroke-width="5"/>'+line('E',80,146,158,224,'url(#metal)',0)+line('M',254,146,178,224,'url(#teal)',0)
(root/'monogram.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">'+defs+icon+'</svg>',encoding='utf-8')
print('Outlined wordmark and monogram created; OFL license retained.')
