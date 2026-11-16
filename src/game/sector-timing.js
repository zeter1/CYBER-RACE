(function attachSectorTiming(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createSectorTimingModule(){
  'use strict';

  const GATES=Object.freeze([1/3,2/3]);
  const MAX_STEP_PROGRESS=0.06;
  const EPS=1e-8;
  const validTime=value=>Number.isFinite(value)&&value>=0;
  const copyTimes=times=>times.map(time=>time===null?null:time);

  function formatSectorTime(time){
    if(!validTime(time))return '—';
    if(time>=60){
      const minutes=Math.floor(time/60);
      return minutes+':'+(time-minutes*60).toFixed(2).padStart(5,'0').replace('.',',');
    }
    return time.toFixed(2).replace('.',',')+' с';
  }
  function formatSectorDelta(delta){
    if(!Number.isFinite(delta))return '—';
    const sign=delta<-.005?'−':delta>.005?'+':'±';
    return sign+Math.abs(delta).toFixed(2).replace('.',',')+' с';
  }

  // Session-only telemetry: neither scoring, lap classification nor saved records.
  // Observe only monotonically moving progress; closeLap is invoked exclusively
  // by runtime's already-validated finish-line crossing.
  function createSectorTimer(){
    let best=[null,null,null],current=[null,null,null],lastCompleted=null;
    let lap=1,lastT=0,lastElapsed=0,gateTime=0,nextGate=0,valid=true;

    function prime(nextLap=1,t=0,elapsed=0,isValid=true){
      lap=nextLap;lastT=t;lastElapsed=elapsed;gateTime=0;nextGate=0;
      current=[null,null,null];valid=isValid;
    }
    function reset(){
      best=[null,null,null];lastCompleted=null;prime();
    }
    function invalidate(){valid=false;return null;}
    function resume({lap:restoredLap,t,elapsed}={}){
      // Old stage checkpoints contain no sector history. Never fabricate one.
      const safeLap=Number.isSafeInteger(restoredLap)&&restoredLap>0?restoredLap:1;
      prime(safeLap,Number.isFinite(t)&&t>=0&&t<1?t:0,
        validTime(elapsed)?elapsed:0,false);
    }
    function acceptSector(index,time){
      if(!Number.isFinite(time)||time<=0)return invalidate();
      const previous=best[index];
      const delta=previous===null?null:time-previous;
      current[index]=time;
      if(previous===null||time<previous)best[index]=time;
      return {sector:index+1,time,delta,improved:delta!==null&&delta<-.005};
    }
    function observe({lap:lapNumber,t,elapsed,onRoad=true,forward=true}={}){
      if(!Number.isSafeInteger(lapNumber)||lapNumber!==lap||
         !Number.isFinite(t)||t<0||t>=1||!validTime(elapsed))return invalidate();
      if(!valid)return null;
      const progress=t-lastT;
      if(!onRoad||!forward||elapsed+EPS<lastElapsed||
         progress<-.002||progress>MAX_STEP_PROGRESS)return invalidate();
      if(progress<EPS){
        lastElapsed=elapsed;return null;
      }
      let event=null;
      while(nextGate<GATES.length&&t+EPS>=GATES[nextGate]){
        const boundary=GATES[nextGate];
        if(boundary<lastT-EPS)return invalidate();
        const crossing=lastElapsed+(elapsed-lastElapsed)*(boundary-lastT)/progress;
        event=acceptSector(nextGate,crossing-gateTime);
        if(!valid)return null;
        gateTime=crossing;nextGate++;
      }
      lastT=t;lastElapsed=elapsed;
      return event;
    }
    function closeLap({lap:lapNumber,t,elapsed,onRoad=true,forward=true}={}){
      const wrap=(1-lastT)+t;
      const complete=valid&&lapNumber===lap&&Number.isFinite(t)&&t>=0&&t<.25&&
        validTime(elapsed)&&elapsed+EPS>=lastElapsed&&nextGate===2&&
        lastT>.75&&wrap>0&&wrap<=MAX_STEP_PROGRESS&&onRoad&&forward;
      let event=null;
      if(complete){
        event=acceptSector(2,elapsed-gateTime);
        if(valid){
          lastCompleted={lap,times:copyTimes(current),
            deltas:current.map((_,i)=>i===2?event.delta:null)};
          // Preserve the comparison against previous best for every split,
          // including sectors that were improved earlier in this lap.
          lastCompleted.deltas=copyTimes(completedDeltas);
        }
      }
      prime((Number.isSafeInteger(lapNumber)&&lapNumber>0?lapNumber:lap)+1,
        Number.isFinite(t)&&t>=0&&t<1?t:0,0,true);
      return event;
    }

    // Deltas must refer to the best that existed before each split, not to the
    // best array after it was updated.
    let completedDeltas=[null,null,null];
    const observeSplit=observe;
    function recordObservation(data){
      const event=observeSplit(data);
      if(event)completedDeltas[event.sector-1]=event.delta;
      return event;
    }
    const completeLap=closeLap;
    function recordFinish(data){
      const event=completeLap(data);
      if(event)completedDeltas[2]=event.delta;
      if(lastCompleted&&lastCompleted.lap===data?.lap)lastCompleted.deltas=copyTimes(completedDeltas);
      completedDeltas=[null,null,null];
      return event;
    }
    function resetSession(){reset();completedDeltas=[null,null,null];}
    function restoreSession(data){resetSession();resume(data);}
    function snapshot(){
      return {sector:Math.min(3,nextGate+1),valid,
        current:copyTimes(current),best:copyTimes(best),
        lastCompleted:lastCompleted?{lap:lastCompleted.lap,times:copyTimes(lastCompleted.times),
          deltas:copyTimes(lastCompleted.deltas)}:null};
    }
    return {reset:resetSession,invalidate,resume:restoreSession,
      observe:recordObservation,closeLap:recordFinish,snapshot};
  }

  return {createSectorTimer,formatSectorTime,formatSectorDelta};
});
