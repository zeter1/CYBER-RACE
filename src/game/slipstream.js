(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const game=root.game??=(Object.create(null));
  const CHARGE_SECONDS=1.4;
  const MAX_GAP=105,MIN_GAP=18,MAX_SIDE=11;

  // A tactical choice, not free passive regeneration: follow a live rival
  // on the same racing line, without contact, until one charge is earned.
  game.createSlipstreamTracker=function createSlipstreamTracker(){
    const awarded=new Set();
    let targetId=null,charge=0,noticeUntil=-Infinity;
    function interrupt(){targetId=null;charge=0;}
    function reset(){awarded.clear();interrupt();noticeUntil=-Infinity;}
    function snapshotAwardedIds(){return [...awarded].sort((a,b)=>a-b);}
    function restoreAwardedIds(ids){
      if(!Array.isArray(ids)||ids.length>6||ids.some(id=>!Number.isSafeInteger(id)||id<0||id>5)||
         new Set(ids).size!==ids.length)return false;
      reset();for(const id of ids)awarded.add(id);
      return true;
    }
    function step({dt=0,now=0,active=false,player,rivals=[]}={}){
      if(!active||!player||!Number.isFinite(dt)||dt<=0||
         !player.onRoad||!player.forward||!player.undamaged||
         !Number.isFinite(player.speed)||player.speed<25||
         !Number.isFinite(player.nitro)||player.nitro>=5||
         !Number.isFinite(player.x)||!Number.isFinite(player.z)||
         !Number.isFinite(player.heading)){
        interrupt();return null;
      }
      const fx=Math.sin(player.heading),fz=Math.cos(player.heading);
      let best=null,bestGap=Infinity;
      for(const rival of rivals){
        if(!rival||!rival.active||awarded.has(rival.id)||
           !Number.isFinite(rival.x)||!Number.isFinite(rival.z)||
           !Number.isFinite(rival.heading)||!Number.isFinite(rival.speed)||
           rival.speed<20||Math.cos(player.heading-rival.heading)<0.78)continue;
        const dx=rival.x-player.x,dz=rival.z-player.z;
        const ahead=dx*fx+dz*fz;
        const sideways=Math.abs(dx*fz-dz*fx);
        if(ahead>=MIN_GAP&&ahead<=MAX_GAP&&sideways<=MAX_SIDE&&ahead<bestGap){
          best=rival;bestGap=ahead;
        }
      }
      if(!best){interrupt();return null;}
      if(targetId!==best.id){targetId=best.id;charge=0;}
      // Runtime already caps dt at 0.1 s. Guard other callers as well.
      charge=Math.min(CHARGE_SECONDS,charge+Math.min(dt,0.1));
      if(charge+1e-8<CHARGE_SECONDS)return null;
      awarded.add(best.id);
      noticeUntil=Number.isFinite(now)?now+2.4:-Infinity;
      interrupt();
      return best.id;
    }
    function view(now=0){
      const active=targetId!==null&&charge>0;
      const rewarded=!active&&Number.isFinite(now)&&now<noticeUntil;
      return {visible:active||rewarded,active,rewarded,
        progress:active?Math.min(1,charge/CHARGE_SECONDS):rewarded?1:0};
    }
    return {step,view,interrupt,reset,snapshotAwardedIds,restoreAwardedIds};
  };
})();
