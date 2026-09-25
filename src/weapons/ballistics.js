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

  function vectorLength(vector){
    return Math.hypot(Number(vector?.x)||0,Number(vector?.y)||0,Number(vector?.z)||0);
  }
  function normalized(vector){
    const length=vectorLength(vector);
    if(length<=1e-12)return {x:0,y:0,z:0};
    return {x:(Number(vector?.x)||0)/length,y:(Number(vector?.y)||0)/length,z:(Number(vector?.z)||0)/length};
  }
  function stepHomingProjectile(state){
    const dt=Math.max(0,Number(state?.dt)||0);
    const position={x:Number(state?.position?.x)||0,y:Number(state?.position?.y)||0,z:Number(state?.position?.z)||0};
    const velocity={x:Number(state?.velocity?.x)||0,y:Number(state?.velocity?.y)||0,z:Number(state?.velocity?.z)||0};
    const targetPosition={x:Number(state?.targetPosition?.x)||0,y:Number(state?.targetPosition?.y)||0,z:Number(state?.targetPosition?.z)||0};
    const targetVelocity={x:Number(state?.targetVelocity?.x)||0,y:Number(state?.targetVelocity?.y)||0,z:Number(state?.targetVelocity?.z)||0};
    const distance=Math.hypot(targetPosition.x-position.x,targetPosition.y-position.y,targetPosition.z-position.z);
    const speed=Math.max(1,vectorLength(velocity));
    const leadTime=estimateLeadTime(distance,speed,Number(state?.maxLead)||0.55);
    const predicted={
      x:targetPosition.x+targetVelocity.x*leadTime,
      y:targetPosition.y+targetVelocity.y*leadTime,
      z:targetPosition.z+targetVelocity.z*leadTime
    };
    const desired=normalized({x:predicted.x-position.x,y:predicted.y-position.y,z:predicted.z-position.z});
    const current=normalized(velocity);
    const blend=homingBlend(Number(state?.turnSpeed)||4,dt);
    const blended=normalized({
      x:current.x+(desired.x-current.x)*blend,
      y:current.y+(desired.y-current.y)*blend,
      z:current.z+(desired.z-current.z)*blend
    });
    const nextVelocity={x:blended.x*speed,y:blended.y*speed,z:blended.z*speed};
    const progress=updateRocketProgress(distance,Number(state?.lastTargetDistance),Number(state?.noProgress)||0,dt);
    const nextPosition={
      x:position.x+nextVelocity.x*dt,
      y:position.y+nextVelocity.y*dt,
      z:position.z+nextVelocity.z*dt
    };
    return {
      position:nextPosition,velocity:nextVelocity,distance,speed,leadTime,
      noProgress:progress.noProgress,stalled:progress.stalled
    };
  }

  return {estimateLeadTime,homingBlend,updateRocketProgress,selectRocketTarget,stepHomingProjectile};
});
