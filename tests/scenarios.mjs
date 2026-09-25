import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const {createSeededRng}=require('../src/core/seeded-rng.js');
const ai=require('../src/ai/opponent-brain.js');
const ballistics=require('../src/weapons/ballistics.js');
const fixture=JSON.parse(readFileSync(new URL('./fixtures/cyber-replay.json',import.meta.url),'utf8'));

const close=(actual,expected,tolerance=1e-6,message='')=>{
  assert.ok(Math.abs(actual-expected)<=tolerance,`${message} expected ${expected}, got ${actual}`);
};

{
  const spec=fixture.opponent;
  const rng=createSeededRng(spec.seed);
  let state={...spec.state};
  const events={laneChanges:0,nitroUses:0,avoidanceFrames:0,wraps:0};
  for(let frame=0;frame<spec.frames;frame++){
    const result=ai.stepOpponentFrame(state,{
      ...spec.context,
      shouldAvoid:({offset,bumpOffset})=>Math.abs(offset+bumpOffset)>spec.context.avoidOffsetThreshold
    },spec.dt,rng);
    events.laneChanges+=result.laneChanged?1:0;
    events.nitroUses+=result.usedNitro?1:0;
    events.avoidanceFrames+=result.avoidance?1:0;
    events.wraps+=result.wrapped?1:0;
    state={...state,...result};
  }
  assert.equal(state.lap,spec.expected.lap);
  close(state.t,spec.expected.t,1e-7,'opponent t');
  close(state.offset,spec.expected.offset,1e-9,'opponent offset');
  close(state.targetOffset,spec.expected.targetOffset,1e-9,'opponent targetOffset');
  assert.equal(state.nitroCharges,spec.expected.nitroCharges);
  assert.deepEqual(events,{
    laneChanges:spec.expected.laneChanges,
    nitroUses:spec.expected.nitroUses,
    avoidanceFrames:spec.expected.avoidanceFrames,
    wraps:spec.expected.wraps
  });
}

{
  const spec=fixture.attack;
  const rng=createSeededRng(spec.seed);
  const state=structuredClone(spec.initial);
  const kinds=[];
  let cooldownSum=0;
  for(let i=0;i<spec.iterations;i++){
    state.target.x+=spec.targetStep.x;
    state.target.z+=spec.targetStep.z;
    const plan=ai.planOpponentAttack(state,rng);
    kinds.push(plan.kind);
    cooldownSum+=plan.cooldown;
    if(plan.kind==='rocket')state.rockets--;
    else if(plan.kind==='bullet')state.gunAmmo--;
  }
  assert.deepEqual(kinds,spec.expected.kinds);
  assert.equal(state.rockets,spec.expected.rockets);
  assert.equal(state.gunAmmo,spec.expected.gunAmmo);
  close(cooldownSum,spec.expected.cooldownSum,1e-6,'attack cooldown sum');
}

{
  const spec=fixture.rocket;
  let position={...spec.state.position};
  let velocity={...spec.state.velocity};
  let targetPosition={...spec.state.targetPosition};
  const targetVelocity={...spec.state.targetVelocity};
  let lastTargetDistance=Math.hypot(
    targetPosition.x-position.x,targetPosition.y-position.y,targetPosition.z-position.z
  );
  let noProgress=spec.state.noProgress;
  let minDistance=Infinity;
  for(let frame=0;frame<spec.frames;frame++){
    targetPosition={
      x:targetPosition.x+targetVelocity.x*spec.dt,
      y:targetPosition.y+targetVelocity.y*spec.dt,
      z:targetPosition.z+targetVelocity.z*spec.dt
    };
    const step=ballistics.stepHomingProjectile({
      position,velocity,targetPosition,targetVelocity,
      turnSpeed:spec.state.turnSpeed,dt:spec.dt,lastTargetDistance,noProgress,maxLead:0.55
    });
    position=step.position;
    velocity=step.velocity;
    lastTargetDistance=step.distance;
    noProgress=step.noProgress;
    minDistance=Math.min(minDistance,step.distance);
  }
  for(const axis of ['x','y','z']){
    close(position[axis],spec.expected.position[axis],1e-6,`rocket position.${axis}`);
    close(velocity[axis],spec.expected.velocity[axis],1e-6,`rocket velocity.${axis}`);
  }
  close(lastTargetDistance,spec.expected.lastDistance,1e-6,'rocket last distance');
  close(noProgress,spec.expected.noProgress,1e-6,'rocket noProgress');
  close(minDistance,spec.expected.minDistance,1e-6,'rocket min distance');
}

console.log('CYBER RACE deterministic replay scenarios passed.');
