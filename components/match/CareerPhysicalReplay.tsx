'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useGameStore } from '@/store/game-store'
import { savedCareerRadarBinding } from '@/engine/spatial/career-radar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const Player=dynamic(()=>import('./PhysicalReplayPlayer').then(m=>m.PhysicalReplayPlayer),{ssr:false})

export function CareerPhysicalReplay({matchId,onOpen}:{matchId:string;onOpen:()=>void}) {
    const journal=useGameStore(s=>s.physicalMatchPreview),saveId=useGameStore(s=>s.saveId),players=useGameStore(s=>s.players)
    const [open,setOpen]=useState(false),[saveError,setSaveError]=useState('')
    const binding=useMemo(()=>journal&&saveId?savedCareerRadarBinding(journal,saveId,matchId):null,[journal,saveId,matchId])
    const names=useMemo(()=>Object.fromEntries(players.map(p=>[p.id,p.nickname])),[players])
    if(!binding||!journal?.latest||!saveId)return null
    const {replay}=journal.latest
    return <>
        <Button variant="secondary" size="sm" onClick={()=>{onOpen();setOpen(true)}}>Review physical rehearsal</Button>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-3xl">
                <DialogTitle>Physical round replay</DialogTitle>
                <DialogDescription>Saved rehearsal for this match. The career match is paused; its score, money and XP are unchanged.</DialogDescription>
                <Player key={`${saveId}:${journal.sessionId}:${replay.sha256}`} replay={replay} binding={binding} names={names} checkpoint={journal.playback} onCheckpoint={tick=>{
                    const store=useGameStore.getState()
                    store.savePhysicalReplayPosition(saveId,journal.sessionId,replay.sha256,tick)
                }} onSave={()=>{
                    const state=useGameStore.getState()
                    if(state.saveId===saveId && state.physicalMatchPreview?.sessionId===journal.sessionId && state.physicalMatchPreview?.latest?.replay.sha256===replay.sha256)
                        void state.saveGame().then(()=>setSaveError('Replay position saved.')).catch(()=>setSaveError('Replay position could not be saved.'))
                }}/>
                {saveError&&<p role="status">{saveError}</p>}
            </DialogContent>
        </Dialog>
    </>
}
