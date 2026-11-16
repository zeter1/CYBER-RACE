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
  // Rival gaps use race distance (laps + arc-length position), not 3D proximity.
  // The order is supplied by the runtime, which already respects finished racers.
  function buildRivalGapHud(player,opponents,positions,finishedIds,totalLength){
    if(!Array.isArray(positions)||!Array.isArray(opponents)||!Number.isFinite(totalLength)||totalLength<=0)return null;
    const rank=positions.findIndex(row=>row.who==='player');
    if(rank<0||positions.length<2)return null;
    const direction=rank===0?'behind':'ahead';
    const rivalRow=positions[rank===0?1:rank-1];
    if(rivalRow?.who!=='opponent'||!Number.isInteger(rivalRow.index))return null;
    const rival=opponents[rivalRow.index];
    if(!rival)return null;
    const rivalId='bot:'+rival.id;
    const finished=Boolean(rival.finished)||(finishedIds||[]).includes(rivalId);
    const place=rank===0?2:rank;
    if(finished)return {rivalId,direction,place,finished:true,distance:null};
    const progress=(car,tKey)=>{
      const lap=car?.lap,t=car?.[tKey];
      return Number.isSafeInteger(lap)&&lap>=1&&Number.isFinite(t)&&t>=0&&t<=1?lap-1+t:null;
    };
    const playerProgress=progress(player,'prevT'),rivalProgress=progress(rival,'t');
    if(playerProgress===null||rivalProgress===null)return null;
    const separation=(direction==='ahead'?rivalProgress-playerProgress:playerProgress-rivalProgress)*totalLength;
    // A position-order transition can be one frame behind the progress values.
    if(!Number.isFinite(separation)||separation< -0.01)return null;
    return {rivalId,direction,place,finished:false,distance:Math.max(0,separation)};
  }
  function formatRivalDistance(distance){
    if(!Number.isFinite(distance)||distance<0)return '—';
    return distance>=1000?(distance/1000).toFixed(1).replace('.',',')+' км':Math.round(distance)+' м';
  }
  function rivalGapTrend(previous,current){
    if(!previous||!current||previous.finished||current.finished||
       previous.rivalId!==current.rivalId||previous.direction!==current.direction||
       !Number.isFinite(previous.distance)||!Number.isFinite(current.distance))return 'unknown';
    const change=current.distance-previous.distance;
    return Math.abs(change)<2?'steady':change<0?'closing':'opening';
  }
  // Format a read-only overtake projection. No timers, DOM or balance constants here.
  function buildOvertakeSeriesHud(series,notice,time,enabled=true){
    const left=series?.secondsLeft,windowSeconds=series?.windowSeconds;
    const combo=series?.combo,nextPoints=series?.nextPoints;
    const visible=Boolean(enabled&&series?.active&&Number.isInteger(combo)&&combo>=1&&combo<=3&&
      Number.isFinite(nextPoints)&&nextPoints>0&&Number.isFinite(left)&&left>0&&
      Number.isFinite(windowSeconds)&&windowSeconds>0);
    if(!visible)return {visible:false,multiplier:'',nextReward:'',remaining:'',progress:0,notice:''};
    const showNotice=notice?.event&&Number.isFinite(time)&&Number.isFinite(notice.time)&&
      time>=notice.time&&time-notice.time<2.2;
    const event=showNotice?notice.event:null;
    const validEvent=event&&Number.isFinite(event.points)&&event.points>0;
    const kind=event?.risky?'РИСКОВАННЫЙ':'ЧИСТЫЙ';
    const eventText=validEvent?`⚡ ${kind} ОБГОН +${event.points}${event.risky?` · РИСК +${event.bonusPoints}`:''}`:'';
    return {visible,multiplier:'×'+combo,nextReward:'+'+nextPoints+' очков',
      remaining:Math.ceil(left)+' с',progress:clamp(left/windowSeconds*100,0,100),notice:eventText};
  }
  function healthPercent(health){return clamp(Number(health)||0,0,100);}
  // The scale covers combined nitro + speed pickup (about 392 km/h).
  function speedometerReading(speed){
    const kmh=Number.isFinite(speed)?Math.round(Math.abs(speed)*3.6):0;
    const fraction=clamp(kmh/400,0,1);
    return {kmh,fraction,angle:-135+fraction*270};
  }
  function formatLapTime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return '--:--.-';
    const tenths=Math.floor(seconds*10+1e-7);
    return `${String(Math.floor(tenths/600)).padStart(2,'0')}:${String(Math.floor(tenths/10)%60).padStart(2,'0')}.${tenths%10}`;
  }
  return {buildRacePositions,buildRivalGapHud,formatRivalDistance,rivalGapTrend,buildOvertakeSeriesHud,raceProgressPercent,healthPercent,speedometerReading,formatLapTime};
});
