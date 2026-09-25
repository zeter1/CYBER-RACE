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

  function stepOpponentFrame(state,context,dt,rng=Math.random){
    const step=Math.max(0,Number(dt)||0);
    const roadHalf=Math.max(0,Number(context?.roadHalf)||0);
    let laneChangeTimer=(Number(state?.laneChangeTimer)||0)-step;
    let targetOffset=Number(state?.targetOffset)||0;
    let laneChanged=false;
    if(laneChangeTimer<=0){
      laneChangeTimer=2.2+rng()*4.2;
      targetOffset=chooseLaneTarget(rng(),roadHalf);
      laneChanged=true;
    }

    const currentOffset=Number(state?.offset)||0;
    const offset=currentOffset+(targetOffset-currentOffset)*(1-Math.exp(-0.75*step));
    const bumpVelocity=(Number(state?.bumpVelocity)||0)*Math.exp(-5.5*step);
    const bumpOffset=clamp(((Number(state?.bumpOffset)||0)+bumpVelocity*step)*Math.exp(-1.8*step),-5.5,5.5);

    let nitroCharges=Math.max(0,Math.trunc(Number(state?.nitroCharges)||0));
    let nitroTimer=Math.max(0,Number(state?.nitroTimer)||0);
    let speedBoostTimer=Math.max(0,Number(state?.speedBoostTimer)||0);
    let usedNitro=false;
    if(nitroCharges>0&&rng()<0.9*step){
      nitroCharges--;
      nitroTimer=2.5;
      usedNitro=true;
    }

    const nitroActive=nitroTimer>0;
    const speedBoostActive=speedBoostTimer>0;
    if(nitroActive)nitroTimer=Math.max(0,nitroTimer-step);
    if(speedBoostActive)speedBoostTimer=Math.max(0,speedBoostTimer-step);

    const lap=Math.max(1,Math.trunc(Number(state?.lap)||1));
    const t=Math.max(0,Number(state?.t)||0);
    const botProgress=(lap-1)+t;
    let effSpeed=computeOpponentSpeed({
      baseSpeed:Number(state?.baseSpeed)||0,
      difficultySpeed:Number(context?.difficultySpeed)||1,
      slowed:Number(state?.slowTimer)>0,
      nitro:nitroActive,
      speedBoost:speedBoostActive,
      playerProgress:Number(context?.playerProgress)||0,
      botProgress,
      minRubberBand:Number(context?.minRubberBand)||0.88,
      maxRubberBand:Number(context?.maxRubberBand)||1.12,
      maxSpeed:Number(context?.maxSpeed)||0
    });

    const shouldAvoid=typeof context?.shouldAvoid==='function'
      ? Boolean(context.shouldAvoid({offset,bumpOffset,targetOffset,effSpeed}))
      : false;
    if(shouldAvoid){
      effSpeed*=0.82;
      targetOffset=avoidanceLaneTarget(targetOffset,Number(state?.id)||0,roadHalf);
    }
    const maxSpeed=Math.max(0,Number(context?.maxSpeed)||0);
    if(maxSpeed>0)effSpeed=Math.min(effSpeed,maxSpeed*1.48);

    const totalLength=Math.max(1e-6,Number(context?.totalLength)||1);
    let nextT=t+(effSpeed/totalLength)*step;
    let nextLap=lap;
    let wrapped=false;
    let finished=false;
    if(nextT>=1){
      nextT%=1;
      nextLap++;
      wrapped=true;
      if(nextLap>Math.max(1,Math.trunc(Number(context?.totalLaps)||1)))finished=true;
    }

    return {
      laneChangeTimer,targetOffset,offset,bumpVelocity,bumpOffset,
      nitroCharges,nitroTimer,speedBoostTimer,
      t:nextT,lap:nextLap,effSpeed,
      laneChanged,usedNitro,avoidance:shouldAvoid,wrapped,finished
    };
  }

  function planOpponentAttack(options,rng=Math.random){
    const attack=opponentAttackGeometry(options?.origin,options?.target,options?.forward);
    const difficulty=options?.difficulty||{};
    let kind='none',shotX=0,shotZ=0;
    const canAttempt=
      !options?.playerDestroyed&&
      Number(options?.playerInvincible)<=0&&
      attack.distance>0.001&&
      attack.distance<Number(difficulty.attackRange||0)&&
      attack.facing>Number(difficulty.minFacing||0)&&
      Number(options?.projectileCount||0)<Number(options?.maxProjectiles||0);

    if(canAttempt&&rng()<0.66){
      const spread=(rng()-0.5)*Number(difficulty.aimSpread||0);
      const shot=computeLeadShot2D({
        origin:options.origin,target:options.target,targetVelocity:options.targetVelocity,
        projectileSpeed:118,maxLead:0.34,spreadRadians:spread
      });
      shotX=shot.x;shotZ=shot.z;
      if(Number(options?.rockets||0)>0&&attack.distance>28&&rng()<0.6)kind='rocket';
      else if(Number(options?.gunAmmo||0)>0)kind='bullet';
    }

    const attackScale=Math.max(0.82,1-(Math.max(1,Number(options?.playerLap)||1)-1)*0.01);
    const cooldown=(0.9+rng()*1.55)*attackScale*Number(difficulty.attackDelay||1);
    return {kind,shotX,shotZ,distance:attack.distance,facing:attack.facing,cooldown};
  }

  return {chooseLaneTarget,rubberBandMultiplier,computeOpponentSpeed,avoidanceLaneTarget,opponentAttackGeometry,computeLeadShot2D,stepOpponentFrame,planOpponentAttack};
});
