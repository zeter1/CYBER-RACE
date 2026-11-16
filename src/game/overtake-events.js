(function attachCyberOvertakeEvents(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberOvertakeEvents(){
  'use strict';
  // Track distance is expressed in world units, not a relative lap fraction.
  const BEHIND_METERS=10, AHEAD_METERS=8, NEAR_METERS=130;
  const CONFIRM_SECONDS=0.25, COMBO_WINDOW=12, COMBO_MAX=3;
  const BASE_POINTS=30, RISK_POINTS=20;
  // Cars collide under 7.6 world units (2 * CONFIG.CAR_RADIUS). Require
  // extra clearance for a rewarded near miss; evaluate only near the pass.
  const RISK_MIN_DISTANCE=8.5, RISK_MAX_DISTANCE=18, RISK_PROGRESS_WINDOW=8;
  const progress=car=>{
    if(!Number.isSafeInteger(car?.lap)||car.lap<1||
       !Number.isFinite(car.t)||car.t<0||car.t>1)return null;
    return car.lap-1+car.t;
  };
  // Minimum XZ separation of two moving cars over a frame, not just at its ends.
  function sweptDistance(a0,a1,b0,b1){
    const rx=a0.x-b0.x,rz=a0.z-b0.z;
    const vx=(a1.x-a0.x)-(b1.x-b0.x),vz=(a1.z-a0.z)-(b1.z-b0.z);
    const lengthSq=vx*vx+vz*vz;
    const t=lengthSq>1e-12?Math.max(0,Math.min(1,-(rx*vx+rz*vz)/lengthSq)):0;
    return Math.hypot(rx+vx*t,rz+vz*t);
  }
  function createOvertakeTracker(){
    let previousPlayer=null,combo=0,lastAward=-Infinity;
    const tracks=new Map(),awarded=new Set(),blocked=new Set();
    function disarm(track){
      track.armed=false;track.frontTime=0;track.riskSeen=false;track.riskBlocked=false;
    }
    // An interruption drops unfinished manoeuvres, but never reopens awarded rivals.
    function interrupt(){
      previousPlayer=null;tracks.clear();combo=0;lastAward=-Infinity;
    }
    function reset(){
      interrupt();awarded.clear();blocked.clear();
    }
    // Only completed awards survive a checkpoint; combo and partial passes start fresh.
    function snapshotAwardedIds(){
      return [...awarded].sort((a,b)=>a-b);
    }
    // Read-only UI projection: gameplay time freezes on pause; never mutate awards here.
    function getSeriesStatus(time){
      const elapsed=time-lastAward;
      const secondsLeft=COMBO_WINDOW-elapsed;
      const active=combo>0&&Number.isFinite(time)&&Number.isFinite(lastAward)&&
        elapsed>=0&&secondsLeft>0;
      return {active,combo:active?combo:0,secondsLeft:active?secondsLeft:0,
        windowSeconds:COMBO_WINDOW,nextPoints:BASE_POINTS*Math.min(active?combo+1:1,COMBO_MAX)};
    }
    function restoreAwardedIds(ids){
      if(!Array.isArray(ids)||ids.length>6||
         [...ids].some(id=>!Number.isSafeInteger(id)||id<0||id>=6)||
         new Set(ids).size!==ids.length)return false;
      reset();
      for(const id of ids)awarded.add(id);
      return true;
    }
    function contact(id){
      if(!Number.isInteger(id))return;
      tracks.delete(id);blocked.add(id);
      combo=0;lastAward=-Infinity;
    }
    function step({time,totalLength,player,rivals,active=true,forward=true}={}){
      const playerProgress=progress(player);
      if(!active||!forward||!Number.isFinite(time)||time<0||
         !Number.isFinite(totalLength)||totalLength<=0||playerProgress===null||
         !Number.isFinite(player?.x)||!Number.isFinite(player?.z)||!Array.isArray(rivals)){
        interrupt();return [];
      }
      const elapsed=previousPlayer?time-previousPlayer.time:0;
      const reasonable=(from,to)=>
        (to-from)*totalLength>=-1.5&&(to-from)*totalLength<=200*elapsed+5;
      const validPlayer=Boolean(previousPlayer)&&elapsed>0&&elapsed<=0.15&&
        reasonable(previousPlayer.progress,playerProgress);
      if(previousPlayer&&!validPlayer)interrupt();
      const events=[],present=new Set();
      for(const rival of rivals){
        const id=rival?.id,otherProgress=progress(rival);
        if(!Number.isInteger(id)||present.has(id))continue;
        present.add(id);
        if(rival.active===false||otherProgress===null||
           !Number.isFinite(rival.x)||!Number.isFinite(rival.z)){
          tracks.delete(id);continue;
        }
        const gap=(otherProgress-playerProgress)*totalLength;
        const close=Math.hypot(player.x-rival.x,player.z-rival.z)<=NEAR_METERS;
        const prior=tracks.get(id);
        const validBot=Boolean(prior)&&validPlayer&&reasonable(prior.progress,otherProgress);
        const track=prior||{progress:otherProgress,x:rival.x,z:rival.z,
          armed:false,frontTime:0,riskSeen:false,riskBlocked:false};
        tracks.set(id,track);
        const oldGap=prior&&previousPlayer?(prior.progress-previousPlayer.progress)*totalLength:Infinity;
        const oldRival={x:track.x,z:track.z};
        track.progress=otherProgress;track.x=rival.x;track.z=rival.z;
        if(!validBot||awarded.has(id)){
          disarm(track);
          continue;
        }
        if(blocked.has(id)){
          if(Math.abs(gap)>NEAR_METERS)blocked.delete(id);
          disarm(track);
          continue;
        }
        if(Math.abs(gap)>NEAR_METERS||!close){
          disarm(track);
          continue;
        }
        if(gap>=BEHIND_METERS&&!track.armed){
          track.armed=true;track.riskSeen=false;track.riskBlocked=false;
        }
        if(track.armed){
          const maxFrameMotion=200*elapsed+5;
          const continuous=Math.hypot(player.x-previousPlayer.x,player.z-previousPlayer.z)<=maxFrameMotion&&
            Math.hypot(rival.x-oldRival.x,rival.z-oldRival.z)<=maxFrameMotion;
          if(!continuous)track.riskBlocked=true; // Teleports cannot create a near miss.
          else{
            const closeToSide=Math.min(Math.abs(oldGap),Math.abs(gap))<=RISK_PROGRESS_WINDOW||
              (oldGap>0&&gap<0);
            if(closeToSide){
              const distance=sweptDistance(previousPlayer,player,oldRival,rival);
              if(distance<RISK_MIN_DISTANCE)track.riskBlocked=true;
              else if(distance<=RISK_MAX_DISTANCE)track.riskSeen=true;
            }
          }
        }
        if(gap>=BEHIND_METERS){
          track.frontTime=0;
        }else if(gap<=-AHEAD_METERS&&track.armed){
          track.frontTime+=elapsed;
          if(track.frontTime>=CONFIRM_SECONDS){
            combo=time-lastAward<=COMBO_WINDOW?Math.min(combo+1,COMBO_MAX):1;
            lastAward=time;
            awarded.add(id);
            const risky=track.riskSeen&&!track.riskBlocked;
            const bonusPoints=risky?RISK_POINTS:0;
            events.push({id,points:BASE_POINTS*combo+bonusPoints,combo,risky,bonusPoints});
            disarm(track);
          }
        }else{
          track.frontTime=0;
        }
      }
      for(const id of tracks.keys())if(!present.has(id))tracks.delete(id);
      previousPlayer={progress:playerProgress,time,x:player.x,z:player.z};
      return events;
    }
    return {step,contact,interrupt,reset,snapshotAwardedIds,restoreAwardedIds,getSeriesStatus};
  }
  return {createOvertakeTracker};
});
