(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const ui=root.ui??=(Object.create(null));

  // World-space source relative to the car's forward (+Z at heading 0).
  function relativeThreatDirection(player,heading,source){
    if(!player||!source||![player.x,player.z,heading,source.x,source.z].every(Number.isFinite))return null;
    const dx=source.x-player.x,dz=source.z-player.z;
    if(dx*dx+dz*dz<0.0001)return null;
    const forward=dx*Math.sin(heading)+dz*Math.cos(heading);
    const right=dx*Math.cos(heading)-dz*Math.sin(heading);
    return Math.abs(forward)>=Math.abs(right)?(forward>=0?'front':'rear'):(right>=0?'right':'left');
  }

  function buildThreatIndicators({player,heading,now,active,damage,rocket}={}){
    if(!active)return {damage:null,rocket:null};
    const hit=damage&&Number.isFinite(now)&&Number.isFinite(damage.until)&&now<=damage.until
      ?relativeThreatDirection(player,heading,damage.source):null;
    const incoming=rocket?relativeThreatDirection(player,heading,rocket.source):null;
    return {damage:hit,rocket:incoming};
  }

  const labels={front:'СПЕРЕДИ',rear:'СЗАДИ',left:'СЛЕВА',right:'СПРАВА'};
  const directionLabel=direction=>labels[direction]||'';
  Object.assign(ui,{relativeThreatDirection,buildThreatIndicators,directionLabel});
  if(typeof module!=='undefined'&&module.exports)module.exports={relativeThreatDirection,buildThreatIndicators,directionLabel};
})();
