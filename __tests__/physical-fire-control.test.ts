import { recoverRecoil, settledBurstDelay } from '@/engine/spatial/fire-control'

test('burst pauses allow physical recoil recovery instead of accumulating across magazines',()=>{
    let recoil=0,next=0,burst=0
    const firstShots:number[]=[],allShots:number[]=[]
    for(let tick=0;tick<64*30;tick++){
        recoil=recoverRecoil(recoil)
        if(tick<next)continue
        if(burst===0)firstShots.push(recoil)
        allShots.push(recoil)
        recoil+=0.65;burst++
        if(burst===3){next=tick+settledBurstDelay(recoil,7,14);burst=0}else next=tick+7
    }
    expect(firstShots.length).toBeGreaterThan(20)
    expect(Math.max(...firstShots)).toBeLessThan(0.00001)
    expect(Math.max(...allShots)).toBeLessThan(1.3)
})

test('recovery continues through an inactive reload or lost-contact interval',()=>{
    let recoil=1.8
    for(let tick=0;tick<144;tick++)recoil=recoverRecoil(recoil)
    expect(recoil).toBe(0)
    expect(settledBurstDelay(0,85,0)).toBe(85)
})
