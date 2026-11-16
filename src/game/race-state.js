(function attachCyberRaceState(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberRaceState(){
  'use strict';

  function resolveLapCompletion({lap,curLap,bestLap,totalLaps,validLap=true}){
    const completedLap=Math.max(1,Math.trunc(Number(lap)||1));
    const lapTime=Math.max(0,Number(curLap)||0);
    const total=Math.max(1,Math.trunc(Number(totalLaps)||1));
    const previousBest=Number.isFinite(Number(bestLap))?Number(bestLap):Infinity;
    // Progress and rewards still count, but recovery/teleport laps cannot set a record.
    const nextBest=validLap&&lapTime>0&&lapTime<previousBest?lapTime:previousBest;
    const finished=completedLap>=total;
    return {
      completedLap,lapTime,bestLap:nextBest,
      lap:finished?completedLap:completedLap+1,curLap:0,finished,
      grantCombatPack:completedLap%3===0&&completedLap<total,scoreDelta:50
    };
  }

  function createRaceGrid(totalLength,roadHalf,opponentCount){
    const length=Math.max(40,Number(totalLength)||40),half=Math.max(0,Number(roadHalf)||0);
    const count=Math.max(0,Math.trunc(Number(opponentCount)||0));
    return Array.from({length:count+1},(_,index)=>{
      const row=index<4?0:1+Math.floor((index-4)/3);
      const offset=index<4?[-.6,-.2,.2,.6][index]:[-.4,0,.4][(index-4)%3];
      return {t:Math.min(.49,row*20/length),offset:offset*half};
    });
  }

  // Closest approach of two moving cars during one simulation frame.
  // Relative motion avoids missing fast crossings between discrete positions.
  function sweptVehicleContact2D(playerFrom,playerTo,botFrom,botTo,radius){
    const dx=playerFrom.x-botFrom.x,dz=playerFrom.z-botFrom.z;
    const vx=(playerTo.x-playerFrom.x)-(botTo.x-botFrom.x);
    const vz=(playerTo.z-playerFrom.z)-(botTo.z-botFrom.z);
    const travelSq=vx*vx+vz*vz;
    const t=travelSq>1e-12?Math.max(0,Math.min(1,-(dx*vx+dz*vz)/travelSq)):0;
    return (dx+vx*t)**2+(dz+vz*t)**2<radius*radius;
  }

  // Completed opponents keep their crossing order. The player is inserted when
  // they finish; remaining opponents are ranked by distance at that instant.
  function singleRaceFinishOrder(opponents,finishedIds){
    const present=new Set(opponents.map(o=>'bot:'+o.id));
    const seen=new Set(),finished=[];
    for(const id of finishedIds){
      if(present.has(id)&&!seen.has(id)){finished.push(id);seen.add(id);}
    }
    const unfinished=opponents.filter(o=>!seen.has('bot:'+o.id)).slice()
      .sort((a,b)=>((b.lap-1)+b.t)-((a.lap-1)+a.t)||a.id-b.id);
    return [...finished,'player',...unfinished.map(o=>'bot:'+o.id)];
  }

  return {resolveLapCompletion,createRaceGrid,sweptVehicleContact2D,singleRaceFinishOrder};
});
