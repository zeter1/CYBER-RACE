(function attachCyberBallistics(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.weapons??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberBallistics(){
  'use strict';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function estimateLeadTime(distance,speed,maxLead=0.55){return clamp((Number(distance)||0)/Math.max(1,Number(speed)||1),0,Math.max(0,Number(maxLead)||0));}
  function homingBlend(turnSpeed,dt){return clamp((Number(turnSpeed)||0)*Math.max(0,Number(dt)||0),0,1);}
  function updateRocketProgress(distance,lastDistance,noProgress,dt){
    const step=Math.max(0,Number(dt)||0);
    const next=Number(distance)+1.5<Number(lastDistance)?Math.max(0,(Number(noProgress)||0)-step*2):(Number(noProgress)||0)+step;
    return {noProgress:next,stalled:next>0.6};
  }
  function selectRocketTarget(candidates,start,forward,maxRange,minDot,positionOf=item=>item?.position){
    let target=null,bestScore=Infinity;
    const sx=Number(start?.x)||0,sy=Number(start?.y)||0,sz=Number(start?.z)||0;
    const fx=Number(forward?.x)||0,fy=Number(forward?.y)||0,fz=Number(forward?.z)||0;
    for(const candidate of candidates||[]){
      if(!candidate||candidate.dead||Number(candidate.health)<=0)continue;
      const position=positionOf(candidate);if(!position)continue;
      const dx=(Number(position.x)||0)-sx,dy=(Number(position.y)||0)-sy,dz=(Number(position.z)||0)-sz;
      const distance=Math.hypot(dx,dy,dz);
      if(distance<1||distance>Number(maxRange))continue;
      const dot=(dx*fx+dy*fy+dz*fz)/distance;if(dot<Number(minDot))continue;
      const score=distance*(1.7-dot);if(score<bestScore){bestScore=score;target=candidate;}
    }
    return target;
  }
  return {estimateLeadTime,homingBlend,updateRocketProgress,selectRocketTarget};
});
