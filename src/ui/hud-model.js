(function attachCyberHudModel(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.ui??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberHudModel(){
  'use strict';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function buildRacePositions(player,opponents){
    const all=[{who:'player',progress:(Number(player?.lap)||1)-1+(Number(player?.prevT)||0)}];
    (opponents||[]).forEach((opponent,index)=>all.push({who:'opponent',index,progress:(Number(opponent?.lap)||1)-1+(Number(opponent?.t)||0)}));
    all.sort((a,b)=>b.progress-a.progress);return all;
  }
  function raceProgressPercent(player,totalLaps){
    const total=Math.max(1,Number(totalLaps)||1);
    return clamp((((Number(player?.lap)||1)-1+(Number(player?.prevT)||0))/total)*100,0,100);
  }
  function healthPercent(health){return clamp(Number(health)||0,0,100);}
  return {buildRacePositions,raceProgressPercent,healthPercent};
});
