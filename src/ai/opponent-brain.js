(function attachCyberOpponentBrain(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.ai??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberOpponentBrain(){
  'use strict';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  const NITRO_DURATION=2.5,NITRO_SPEED_MULTIPLIER=1.7;

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
    if(options?.nitro)speed*=NITRO_SPEED_MULTIPLIER;
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

  const PERSONALITIES=Object.freeze([
    Object.freeze({name:'racer',passing:24,resources:1,attack:8,hold:2.2}),
    Object.freeze({name:'aggressor',passing:18,resources:0.85,attack:24,hold:1.8}),
    Object.freeze({name:'tactician',passing:19,resources:1.35,attack:10,hold:2.6})
  ]);
  const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  function signedTrackDistance(from,to,length){
    return (((to-from)*length+length/2)%length+length)%length-length/2;
  }
  function pickupNeed(state,type){
    if(type==='health')return clamp((85-finite(state.health,100))/65,0,1.5);
    if(type==='shield')return finite(state.shieldTimer)>1?0:0.45+(finite(state.health,100)<50?0.4:0);
    if(type==='rocket')return clamp((4-finite(state.rockets))/4,0,1);
    if(type==='machinegun')return clamp((45-finite(state.gunAmmo))/45,0,1);
    if(type==='nitro')return clamp((3-finite(state.nitroCharges))/3,0,1)*0.7;
    if(type==='speedboost')return finite(state.speedBoostTimer)>1?0:0.6;
    return 0;
  }

  // Predict the entire nitro window in track-relative coordinates. A closest
  // approach on each segment catches a collision even between sampled times.
  function nitroCorridorClear(offset,targetOffset,boostedSpeed,traffic){
    const steps=10,clearance=11;
    for(const other of traffic){
      const otherOffset=finite(other.offset),otherTarget=finite(other.targetOffset,otherOffset);
      let prevGap=other.gap,prevSide=offset-otherOffset;
      for(let i=1;i<=steps;i++){
        const time=NITRO_DURATION*i/steps;
        const blend=1-Math.exp(-.75*time);
        const nextGap=other.gap+(finite(other.speed)-boostedSpeed)*time;
        const nextSide=offset+(targetOffset-offset)*blend-(otherOffset+(otherTarget-otherOffset)*blend);
        const dg=nextGap-prevGap,ds=nextSide-prevSide;
        const alpha=clamp(-(prevGap*dg+prevSide*ds)/(dg*dg+ds*ds||1),0,1);
        if(Math.hypot(prevGap+dg*alpha,prevSide+ds*alpha)<clearance)return false;
        prevGap=nextGap;prevSide=nextSide;
      }
    }
    return true;
  }

  // Plain-data local planner: no scene, storage, timers or gameplay RNG.
  function planOpponentTactics(state={},context={},dt=0){
    const profile=PERSONALITIES[Math.abs(Math.trunc(finite(state.id)))%PERSONALITIES.length];
    const length=Math.max(1,finite(context.totalLength,1));
    const half=Math.max(0,finite(context.roadHalf,40))*.62;
    const offset=clamp(finite(state.offset)+finite(state.bumpOffset),-half,half);
    const speed=Math.max(1,finite(state.speed,finite(state.baseSpeed,45)));
    const allTraffic=(context.traffic||[]).filter(other=>other.id!==state.id&&!other.dead).map(other=>({
      ...other,gap:signedTrackDistance(finite(state.t),finite(other.t),length)
    }));
    const traffic=allTraffic.filter(other=>Math.abs(other.gap)<200);
    let speedLimit=Infinity;
    for(const other of traffic){
      if(other.gap>0&&other.gap<120&&Math.abs(finite(other.offset)-offset)<9){
        speedLimit=Math.min(speedLimit,Math.max(0,finite(other.speed)+(other.gap-14)*.45));
      }
    }
    const predictedSpeed=Math.min(speed,speedLimit);
    const bend=clamp(Math.abs(finite(context.bend)),0,1.5);
    const speedFactor=clamp(1-bend*.45,.62,1);
    function corridor(targetOffset){
      let risk=0,ahead=Infinity;
      for(const other of traffic){
        if(other.gap>0&&Math.abs(finite(other.offset)-targetOffset)<9)ahead=Math.min(ahead,other.gap);
        for(const time of [0,.2,.4,.6,.8,1,1.3,1.6,2]){
          const side=offset+(targetOffset-offset)*(1-Math.exp(-.75*time));
          const otherSide=finite(other.offset)+(finite(other.targetOffset,finite(other.offset))-finite(other.offset))*(1-Math.exp(-.75*time));
          const gap=other.gap+(finite(other.speed)-predictedSpeed)*time;
          const distance=Math.hypot(gap,side-otherSide);
          if(distance<9)risk=Math.max(risk,1-distance/9);
        }
      }
      return {risk,ahead};
    }
    function evaluate(targetOffset,goal='race',bonus=0,extra={}){
      const lane=clamp(finite(targetOffset),-half,half),space=corridor(lane);
      return {goal,targetOffset:lane,...extra,...space,
        score:bonus-Math.abs(lane-offset)*.18-Math.abs(lane)*.025-space.risk*100-(space.ahead<80?(80-space.ahead)*.5:0)};
    }
    const candidates=[offset,finite(state.targetOffset),0,-half*.45,half*.45,-half*.9,half*.9]
      .filter(lane=>Math.abs(lane-offset)<=25).map(lane=>evaluate(lane));
    const leader=traffic.filter(other=>other.gap>0&&other.gap<100&&Math.abs(finite(other.offset)-offset)<9&&finite(other.speed)<speed+2)
      .sort((a,b)=>a.gap-b.gap)[0];
    if(leader){
      for(const candidate of [...candidates]){
        if(Math.abs(candidate.targetOffset-finite(leader.offset))>=9){
          candidates.push(evaluate(candidate.targetOffset,'overtake',profile.passing,{targetId:leader.id}));
        }
      }
    }
    const pickups=(context.pickups||[]).filter(pickup=>{
      const distance=((finite(pickup.t)-finite(state.t))%1+1)%1*length;
      const side=offset+(clamp(finite(pickup.offset),-half,half)-offset)*(1-Math.exp(-.75*distance/speed));
      return distance>3&&distance<Math.min(180,speed*3.8)&&Math.abs(side-finite(pickup.offset))<7
        &&Math.abs(finite(pickup.offset))<=half+6&&pickupNeed(state,pickup.type)>0;
    });
    for(const pickup of pickups){
      const distance=((finite(pickup.t)-finite(state.t))%1+1)%1*length;
      const value=pickupNeed(state,pickup.type)*50*profile.resources/(1+distance/130);
      candidates.push(evaluate(pickup.offset,'resupply',value,{pickupId:pickup.id}));
    }
    const target=traffic.filter(other=>other.gap>32&&other.gap<135)
      .sort((a,b)=>(b.id===state.combatTargetId)-(a.id===state.combatTargetId)||a.gap-b.gap)[0];
    if(target&&(finite(state.rockets)>0||finite(state.gunAmmo)>0)&&finite(state.health,100)>35){
      candidates.push(evaluate(target.offset,'attack',profile.attack,{targetId:target.id}));
    }
    // A valuable pickup must never outweigh an available collision-free corridor.
    candidates.sort((a,b)=>(a.risk>0)-(b.risk>0)||(a.risk>0?a.risk-b.risk:0)||b.score-a.score);
    let chosen=candidates[0],remaining=profile.hold;
    const previous=state.tacticalPlan;
    if(previous&&finite(previous.remaining)>0){
      const matching=previous.goal==='resupply'?pickups.find(p=>p.id===previous.pickupId):null;
      const valid=previous.goal==='race'||previous.goal==='resupply'&&matching
        ||previous.goal==='overtake'&&leader?.id===previous.targetId
        ||previous.goal==='attack'&&target?.id===previous.targetId&&(finite(state.rockets)>0||finite(state.gunAmmo)>0);
      if(valid){
        const held=candidates.find(candidate=>candidate.goal===previous.goal&&Math.abs(candidate.targetOffset-previous.targetOffset)<.1);
        if(held&&held.risk===0&&chosen.score<held.score+8){chosen=held;remaining=Math.max(0,previous.remaining-Math.max(0,finite(dt)));}
      }
    }
    // Save finite nitro for a reachable pass. The rival must be close enough for a
    // boost to matter, yet separated laterally so acceleration does not cause contact.
    const tacticalPass=traffic.some(other=>{
      const rivalSpeed=Math.max(0,finite(other.speed));
      const boostGain=(speed*NITRO_SPEED_MULTIPLIER-rivalSpeed)*NITRO_DURATION;
      return other.gap>24&&other.gap<Math.min(115,boostGain+20)
        &&rivalSpeed>=speed-12&&boostGain>18
        &&Math.abs(finite(other.offset)-offset)>11
        &&Math.abs(finite(other.offset)-chosen.targetOffset)>11;
    });
    const nitroReady=finite(state.nitroCharges)>0&&finite(state.nitroTimer)<=0&&finite(state.speedBoostTimer)<=0
      &&finite(state.slowTimer)<=0&&bend<.16&&chosen.risk<.1&&tacticalPass
      &&chosen.goal!=='resupply'&&chosen.goal!=='attack'&&Math.abs(chosen.targetOffset-offset)<7;
    // Hard difficulty (1.07) and rubber band (1.12) can raise base speed by ~20%.
    // The conservative boost estimate avoids under-predicting traffic after prior braking.
    const boostedSpeed=Math.max(speed,finite(state.baseSpeed,speed)*1.2)*NITRO_SPEED_MULTIPLIER;
    const useNitro=nitroReady&&nitroCorridorClear(offset,chosen.targetOffset,boostedSpeed,allTraffic);
    return {personality:profile.name,goal:chosen.goal,targetOffset:chosen.targetOffset,
      pickupId:chosen.pickupId,targetId:chosen.targetId,remaining,speedFactor,speedLimit,useNitro};
  }

  function stepOpponentFrame(state,context,dt,rng=Math.random){
    const step=Math.max(0,Number(dt)||0);
    const roadHalf=Math.max(0,Number(context?.roadHalf)||0);
    let laneChangeTimer=(Number(state?.laneChangeTimer)||0)-step;
    let targetOffset=Number(state?.targetOffset)||0;
    let laneChanged=false;
    const tactics=context?.tactics;
    if(tactics){
      targetOffset=clamp(finite(tactics.targetOffset),-roadHalf*.62,roadHalf*.62);
      laneChangeTimer=0;
    }else if(laneChangeTimer<=0){
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
    if(nitroCharges>0&&(tactics?Boolean(tactics.useNitro)&&nitroTimer<=0&&speedBoostTimer<=0:rng()<0.9*step)){
      nitroCharges--;
      nitroTimer=NITRO_DURATION;
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
    if(tactics){
      effSpeed*=clamp(finite(tactics.speedFactor,1),.3,1.2);
      if(Number.isFinite(tactics.speedLimit))effSpeed=Math.min(effSpeed,Math.max(0,tactics.speedLimit));
    }

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

  function selectOpponentCombatTarget(options={}){
    let selected=null,best=-Infinity;
    const range=Math.max(1,finite(options.range,145));
    for(const candidate of options.candidates||[]){
      if(candidate.id===options.selfId||candidate.dead||candidate.health<=0||candidate.invincible||!candidate.visible)continue;
      const geometry=opponentAttackGeometry(options.origin,candidate.position,options.forward);
      if(geometry.distance<3||geometry.distance>=range||geometry.facing<=finite(options.minFacing,.1))continue;
      const score=50*(1-geometry.distance/range)+25*geometry.facing
        +(candidate.shieldTimer>0?0:12)+clamp((100-finite(candidate.health,100))/10,0,8)
        +clamp((finite(candidate.progress)-finite(options.progress))*.15,0,10)
        +(candidate.id===options.currentTargetId?12:0)
        +(candidate.id===options.lastAttackerId&&options.lastAttackerTimer>0?14:0);
      if(score>best){best=score;selected=candidate.id;}
    }
    return selected;
  }

  function planCombatAttack(options,rng){
    const attack=opponentAttackGeometry(options.origin,options.target,options.forward);
    const difficulty=options.difficulty||{},delay=finite(difficulty.attackDelay,1);
    const allowed=!options.targetDead&&!options.targetInvincible&&options.lineOfSight
      &&attack.distance>.001&&attack.distance<finite(difficulty.attackRange,145)
      &&attack.facing>finite(difficulty.minFacing,.1)&&options.projectileCount<options.maxProjectiles;
    let kind='none',burstRemaining=0,cooldown=.3,shotX=0,shotZ=0;
    if(allowed){
      const rocket=options.rockets>0&&options.targetShieldTimer<=0&&attack.distance>35&&attack.facing>.55
        &&!(options.burstRemaining>0)&&(options.gunAmmo<=0||options.targetHealth<=35||rng()<.4);
      if(rocket){kind='rocket';cooldown=(2.5+rng()*1.2)*delay;}
      else if(options.gunAmmo>0){
        kind='bullet';burstRemaining=options.burstRemaining>0?options.burstRemaining-1:2;
        cooldown=(burstRemaining>0?.16:1.4+rng()*1.1)*delay;
      }
      if(kind!=='none'){
        const shot=computeLeadShot2D({origin:options.origin,target:options.target,targetVelocity:options.targetVelocity,
          projectileSpeed:kind==='rocket'?finite(options.rocketSpeed,118):finite(options.bulletSpeed,108),
          maxLead:.5,spreadRadians:(rng()-.5)*finite(difficulty.aimSpread)});
        shotX=shot.x;shotZ=shot.z;
      }
    }
    return {kind,shotX,shotZ,distance:attack.distance,facing:attack.facing,cooldown,burstRemaining};
  }

  function planOpponentAttack(options,rng=Math.random){
    if(options?.combat)return planCombatAttack(options,rng);
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

  return {chooseLaneTarget,rubberBandMultiplier,computeOpponentSpeed,avoidanceLaneTarget,opponentAttackGeometry,computeLeadShot2D,planOpponentTactics,selectOpponentCombatTarget,stepOpponentFrame,planOpponentAttack};
});
