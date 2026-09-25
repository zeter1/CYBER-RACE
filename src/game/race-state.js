(function attachCyberRaceState(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberRaceState(){
  'use strict';

  function resolveLapCompletion({lap,curLap,bestLap,totalLaps}){
    const completedLap=Math.max(1,Math.trunc(Number(lap)||1));
    const lapTime=Math.max(0,Number(curLap)||0);
    const total=Math.max(1,Math.trunc(Number(totalLaps)||1));
    const previousBest=Number.isFinite(Number(bestLap))?Number(bestLap):Infinity;
    const nextBest=lapTime>0&&lapTime<previousBest?lapTime:previousBest;
    const finished=completedLap>=total;
    return {
      completedLap,lapTime,bestLap:nextBest,
      lap:finished?completedLap:completedLap+1,curLap:0,finished,
      grantCombatPack:completedLap%3===0&&completedLap<total,scoreDelta:50
    };
  }

  return {resolveLapCompletion};
});
