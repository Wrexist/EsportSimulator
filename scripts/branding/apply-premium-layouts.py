from pathlib import Path
root=Path(__file__).resolve().parents[2]
backup=root/'tmp/premium-ui-before'
def edit(name,replacements):
    p=root/name; text=p.read_text(encoding='utf8'); old=text
    for a,b in replacements:
        if a not in text: raise RuntimeError(f'Missing anchor in {name}: {a[:80]}')
        text=text.replace(a,b)
    dst=backup/name;dst.parent.mkdir(parents=True,exist_ok=True)
    if not dst.exists():dst.write_text(old,encoding='utf8')
    p.write_text(text,encoding='utf8')
edit('components/layout/TopBar.tsx',[
 ('gap-3 min-w-[170px]','gap-3 topbar-club min-w-[150px]'),
 ('text-sm font-semibold text-white truncate max-w-[180px]','topbar-club-name text-sm font-semibold text-white truncate max-w-[180px]'),
 ('hidden 2xl:flex items-center','hidden xl:flex items-center'),
 ('text-sm font-medium text-white tracking-tight whitespace-nowrap','topbar-date text-sm font-medium text-white tracking-tight whitespace-nowrap')])
edit('app/page.tsx',[
 ('grid grid-cols-1 xl:grid-cols-3 gap-5','dashboard-layout'),
 ('xl:col-span-2 space-y-5','min-w-0 space-y-5'),
 ('>Next Game</CardTitle>','>Next Match</CardTitle>'),
 ('flex items-center justify-between gap-8 mb-10','match-identity flex items-center justify-between gap-8 mb-10'),
 ('grid grid-cols-1 md:grid-cols-2 gap-6','dashboard-support grid grid-cols-1 md:grid-cols-2 gap-4'),
 ('{/* Financial Hub Card */}\n          <Card className="glass-card','{/* Financial Hub Card */}\n          <Card className="dashboard-financials glass-card'),
 ('mt-8 pt-6 border-t border-white/5 grid grid-cols-2','finance-breakdown mt-8 pt-6 border-t border-white/5 grid grid-cols-2'),
 ('<div className="flex flex-col items-center gap-2 py-2">','<div className="flex flex-col items-center gap-2 py-2">\n                      <Button asChild variant="play"><Link href="/squad">Prepare lineup <ArrowRight size={16} /></Link></Button>')])
edit('components/player/player-detail.tsx',[
 ('className="glass-panel p-5 md:p-6 relative overflow-hidden"','className="profile-dossier glass-panel p-5 md:p-6 relative overflow-hidden"')])
edit('app/scouting/page.tsx',[
 ('space-y-6 max-w-[1600px] mx-auto','scouting-page space-y-5 max-w-[1600px] mx-auto'),
 ('Scouting Database\n','Scouting Network\n'),
 ('glass-panel p-6 border-white/5 space-y-4','scouting-cockpit glass-panel p-6 border-white/5 space-y-4'),
 ('grid grid-cols-1 lg:grid-cols-3 gap-8','scouting-layout'),
 ('className="lg:col-span-2"','className="min-w-0 scouting-table"'),
 ('className="lg:col-span-1"','className="min-w-0"'),
 ('glass-panel p-6 sticky top-8 border-primary/20','scouting-intelligence glass-panel border-primary/20'),
 ('onClick={() => setSelectedPlayer(player)}','onClick={() => setSelectedPlayer(player)}\n                                        tabIndex={0}\n                                        aria-label={`Inspect ${player.nickname}`}\n                                        data-selected={selectedPlayer?.id === player.id}\n                                        onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedPlayer(player) } }}'),
 ('onClick={() => setSelectedPlayer(null)}','aria-label="Close player intelligence"\n                                            onClick={() => setSelectedPlayer(null)}')])
edit('app/equipment/page.tsx',[
 ('import React, { useMemo, useState } from "react"','import React, { useMemo, useState } from "react"\nimport { equipmentArtwork } from "@/lib/ui-assets"\nimport Link from "next/link"'),
 ('min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black pb-20','equipment-page'),
 ('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6','equipment-grid'),
 ('src={item.imagePath || typeDisplay.imagePath}','src={equipmentArtwork(item.type, item.imagePath || typeDisplay.imagePath)}'),
 ('src={selectedItem.imagePath || EQUIPMENT_TYPE_DISPLAY[selectedItem.type].imagePath}','src={equipmentArtwork(selectedItem.type, selectedItem.imagePath || EQUIPMENT_TYPE_DISPLAY[selectedItem.type].imagePath)}'),
 ('{/* Header / Hero Section */}','<nav aria-label="Club campus sections" className="mb-5 flex gap-2"><Button asChild variant="outline"><Link href="/basecamp">Club campus</Link></Button><Button asChild variant="secondary"><Link href="/equipment" aria-current="page">Equipment</Link></Button></nav>\n            {/* Header / Hero Section */}')])
edit('app/match/[id]/live/page.tsx',[
 ('min-h-screen liquid-app-bg text-white p-6 flex flex-col font-sans select-none relative','live-command text-white flex flex-col font-sans select-none relative'),
 ('max-w-7xl mx-auto w-full flex flex-col flex-1 h-full min-h-0','live-command-inner mx-auto w-full flex flex-col flex-1 h-full min-h-0'),
 ('grid grid-cols-12 gap-6 flex-1 min-h-0','live-match-grid flex-1 min-h-0'),
 ('col-span-3 glass-panel-dark','match-roster glass-panel-dark'),
 ('col-span-6 flex flex-col gap-4','min-w-0 flex flex-col gap-3'),
 ('glass-panel-dark flex-1 rounded-xl p-6 overflow-hidden flex flex-col border border-white/5','live-feed-panel glass-panel-dark flex-1 rounded-xl overflow-hidden flex flex-col border border-white/5'),
 ('p-2 rounded-2xl flex items-center gap-3 border transition-colors','match-roster-row rounded-xl flex items-center gap-2 border transition-colors')])
edit('components/match/LiveMatchScoreboard.tsx',[
 ('flex items-start justify-between mb-6 relative z-10','match-scoreboard flex justify-between relative z-10'),
 ('flex items-center gap-6 w-1/3 pl-3','score-team flex items-center pl-3'),
 ('flex items-center gap-6 w-1/3 justify-end pr-3','score-team flex items-center justify-end pr-3'),
 ('text-xl font-normal uppercase','score-team-name uppercase'),
 ('liquid-panel flex items-center gap-8 px-12 py-3 rounded-xl relative overflow-hidden','score-core flex items-center rounded-xl relative overflow-hidden')])
edit('components/match/MapRadarPanel.tsx',[
 ('glass-panel-dark rounded-xl border border-white/5 overflow-hidden','map-radar-panel glass-panel-dark rounded-xl border border-white/5 overflow-hidden'),
 ('relative aspect-square w-full max-w-[360px] mx-auto','relative aspect-square w-full max-w-[520px] mx-auto')])
print('Presentation layout anchors updated; pre-edit copies in tmp/premium-ui-before.')
