import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {createDriftMastery}=require('../src/game/drift-mastery.js');
const good={drifting:true,speed:45,speedLat:7,steerAngle:.2,onRoad:true,forward:true};
const released={...good,drifting:false};
const drive=(tracker,seconds,fps=60,frame=good)=>{
  const frames=Math.round(seconds*fps);
  for(let i=0;i<frames;i++)tracker.step({...frame,dt:1/fps});
};
const tracker=createDriftMastery();
assert.equal(tracker.view().visible,false,'no HUD before first drift');
drive(tracker,.3);
assert.equal(tracker.step({...released,dt:1/60}),0,'brief handbrake press earns nothing');
drive(tracker,1.2);
assert.equal(tracker.view().ready,true,'valid drift reaches award threshold');
assert.ok(tracker.view().points>0,'HUD previews the banked amount');
const score=tracker.step({...released,dt:1/60});
assert.ok(score>=10&&score<=90,'clean release banks bounded points once');
assert.equal(tracker.step({...released,dt:1/60}),0,'release cannot pay again');
assert.deepEqual([tracker.view().label,tracker.view().points],['ЧИСТЫЙ ДРИФТ',score]);
drive(tracker,2.1,60,released);
assert.equal(tracker.view().visible,false,'notification times out on active time');

for(const [name,bad] of [
  ['shoulder',{onRoad:false}],['reverse',{forward:false}],['collision',{contact:true}]
]){
  tracker.reset();drive(tracker,1.2);
  tracker.step({...good,...bad,dt:1/60});
  assert.equal(tracker.step({...released,dt:1/60}),0,name+' cancels the bank');
  drive(tracker,1.2,60,good);
  assert.equal(tracker.step({...released,dt:1/60})>0,true,name+' can start a fresh attempt');
}
tracker.reset();drive(tracker,1.2);
tracker.interrupt();
assert.equal(tracker.step({...released,dt:1/60}),0,'damage cancels a pending drift');
tracker.reset();drive(tracker,1.2);
tracker.reset();
assert.equal(tracker.step({...released,dt:1/60}),0,'restart/respawn clears the pending drift');
for(const frame of [
  {...good,speed:0}, {...good,speed:15}, {...good,speedLat:0},
  {...good,steerAngle:0}, {...good,drifting:false}
]){
  tracker.reset();drive(tracker,2,60,frame);
  assert.equal(tracker.step({...released,dt:1/60}),0,'invalid steering/speed/slip cannot farm points');
}
tracker.reset();drive(tracker,.5);
const before=tracker.view();
assert.equal(tracker.step({...good,dt:0}),0);
assert.deepEqual(tracker.view(),before,'pause cannot advance the bank');
assert.equal(tracker.step({...good,dt:Number.NaN}),0);
assert.deepEqual(tracker.view(),before,'invalid frame time is ignored');

const scores=[30,60,144].map(fps=>{
  const t=createDriftMastery();drive(t,2,fps);
  return t.step({...released,dt:1/fps});
});
assert.ok(scores.every(s=>s>0),'all frame rates score valid drifts');
assert.ok(Math.max(...scores)-Math.min(...scores)<=1,'scoring independent of 30/60/144 FPS: '+scores);

tracker.reset();drive(tracker,10);
assert.ok(tracker.view().points<=90,'bank is capped while drifting');
assert.equal(tracker.step({...released,dt:1/60}),90,'released bank stops at the cap');

// The integration must not regress into unconditional score increments in runtime.
const runtime=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
assert.ok(runtime.includes('player.score+=driftAward;'));
assert.ok(runtime.includes('onRoad:closest.dist<=CONFIG.ROAD_HALF-CONFIG.CAR_RADIUS'));
assert.ok(runtime.includes('driftMastery.interrupt();'));
assert.ok(!runtime.includes('player.driftScoreCarry+='),'old per-frame drift reward is removed');
assert.ok(runtime.includes('driftScoreCarry:0'),'legacy championship checkpoint field remains numeric');
// A swept AI collision or real projectile hit may arrive later in the very same frame
// than handbrake release. The isolated *actual runtime functions* must revoke that credit.
const extract=name=>{
 const start=runtime.indexOf('    function '+name+'('),end=runtime.indexOf('\n    }',start);
 assert.ok(start>=0&&end>start,'runtime owner '+name);
 return runtime.slice(start,end+6);
};
const collisionContext={
 gameFinished:false,CONFIG:{CAR_RADIUS:3.8},
 player:{pos:{x:0,z:0},score:100,driftAwardThisFrame:35,destroyed:false,health:100,invincibleTimer:2},
 pickupSweepStart:{},sweptVehicleContact2D:()=>true,
 overtakeTracker:{contact(){}},driftMastery:createDriftMastery()
};
vm.createContext(collisionContext);
vm.runInContext(extract('resolveMissedMovingContact'),collisionContext);
const passingBot={id:0,dead:false,finished:false,invincibleTimer:2,car:{group:{position:{x:0,z:0}}}};
collisionContext.resolveMissedMovingContact(passingBot,{x:100,z:0},.1);
assert.equal(collisionContext.player.score,65,'late swept contact revokes same-frame drift bank');
assert.equal(collisionContext.player.driftAwardThisFrame,0,'second contact cannot revoke twice');
collisionContext.resolveMissedMovingContact(passingBot,{x:100,z:0},.1);
assert.equal(collisionContext.player.score,65,'repeated contact does not double charge');

const damageContext={
 gameFinished:false,CONFIG:{SHIELD_DAMAGE_MULTIPLIER:.5,PLAYER_REGEN_DELAY:3,DAMAGE_GRACE:.5},
 player:{score:100,driftAwardThisFrame:25,health:100,invincibleTimer:0,
   damageCooldown:0,destroyed:false,shieldTimer:0,totalTime:0},
 difficulty:()=>({botDamage:1}),driftMastery:createDriftMastery(),
 flashDamage(){},addCameraShake(){}
};
vm.createContext(damageContext);
vm.runInContext(extract('applyPlayerDamage'),damageContext);
assert.equal(damageContext.applyPlayerDamage(2),true);
assert.equal(damageContext.player.score,75,'real impact revokes release award in the same frame');
assert.equal(damageContext.player.driftAwardThisFrame,0);
console.log('DRIFT_MASTERY_PASS clean/broken/restart/pause/cap, late collisions and 30/60/144 FPS');
