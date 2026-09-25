(function attachCyberOpponentBrain(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.ai??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberOpponentBrain(){
  'use strict';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

  function chooseLaneTarget(randomValue,roadHalf){
    const half=Math.max(0,Number(roadHalf)||0),random=clamp(Number(randomValue)||0,0,1);
    return clamp((random-0.5)*half*1.05,-half*0.62,half*0.62);
  }
  function rubberBandMultiplier(playerProgress,botProgress,minMultiplier,maxMultiplier){
    const gap=(Number(playerProgress)||0)-(Number(botProgress)||0);
    return clamp(1+gap*0.08,Number(minMultiplier)||0.88,Number(maxMultiplier)||1.12);
  }
  function computeOpponentSpeed(options){
    const base=Number(options?.baseSpeed)||0;
    let speed=base*(Number(options?.difficultySpeed)||1);
    if(options?.slowed)speed*=0.35;
    if(options?.nitro)speed*=1.7;
    if(options?.speedBoost)speed*=1.25;
    speed*=rubberBandMultiplier(options?.playerProgress,options?.botProgress,options?.minRubberBand,options?.maxRubberBand);
    const maxSpeed=Math.max(0,Number(options?.maxSpeed)||0)*1.48;
    if(maxSpeed>0)speed=Math.min(speed,maxSpeed);
    return Number.isFinite(speed)?speed:base;
  }
  function avoidanceLaneTarget(currentTargetOffset,botId,roadHalf){
    const half=Math.max(0,Number(roadHalf)||0),delta=Number(botId)%2===0?5:-5;
    return clamp((Number(currentTargetOffset)||0)+delta,-half*0.62,half*0.62);
  }
  function opponentAttackGeometry(origin,target,forward){
    const dx=(Number(target?.x)||0)-(Number(origin?.x)||0),dz=(Number(target?.z)||0)-(Number(origin?.z)||0);
    const distance=Math.hypot(dx,dz);
    if(distance<=0.001)return {distance,facing:-1,dirX:0,dirZ:0};
    const dirX=dx/distance,dirZ=dz/distance;
    return {distance,facing:dirX*(Number(forward?.x)||0)+dirZ*(Number(forward?.z)||0),dirX,dirZ};
  }
  function computeLeadShot2D({origin,target,targetVelocity,projectileSpeed,maxLead=0.34,spreadRadians=0}){
    const ox=Number(origin?.x)||0,oz=Number(origin?.z)||0,tx=Number(target?.x)||0,tz=Number(target?.z)||0;
    const distance=Math.hypot(tx-ox,tz-oz),speed=Math.max(1,Number(projectileSpeed)||1);
    const leadTime=clamp(distance/speed,0,Math.max(0,Number(maxLead)||0));
    let aimX=tx+(Number(targetVelocity?.x)||0)*leadTime-ox,aimZ=tz+(Number(targetVelocity?.z)||0)*leadTime-oz;
    const aimLength=Math.hypot(aimX,aimZ)||1;aimX/=aimLength;aimZ/=aimLength;
    const angle=Number(spreadRadians)||0,cos=Math.cos(angle),sin=Math.sin(angle);
    return {x:aimX*cos-aimZ*sin,z:aimX*sin+aimZ*cos,leadTime,distance};
  }
  return {chooseLaneTarget,rubberBandMultiplier,computeOpponentSpeed,avoidanceLaneTarget,opponentAttackGeometry,computeLeadShot2D};
});
