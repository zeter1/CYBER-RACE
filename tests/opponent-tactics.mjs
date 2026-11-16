import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const ai=require('../src/ai/opponent-brain.js');
const state=(extra={})=>({id:0,t:.2,offset:0,targetOffset:0,baseSpeed:45,speed:45,health:100,
  rockets:3,gunAmmo:60,nitroCharges:2,nitroTimer:0,speedBoostTimer:0,lap:1,...extra});
const world=(extra={})=>({totalLength:1000,roadHalf:40,totalLaps:15,bend:0,traffic:[],pickups:[],...extra});
const plan=(s=state(),w=world(),dt=1/60)=>ai.planOpponentTactics(s,w,dt);

assert.equal(typeof ai.planOpponentTactics,'function');
assert.deepEqual([0,1,2].map(id=>plan(state({id})).personality),['racer','aggressor','tactician']);
const health={id:1,type:'health',t:.27,offset:11};
assert.equal(plan(state({health:20}),world({pickups:[health]})).goal,'resupply');
assert.equal(plan(state(),world({pickups:[health]})).goal,'race','full health does not detour for repair');
assert.equal(plan(state({health:20,t:.99}),world({pickups:[{...health,t:.03}]})).pickupId,1,'look ahead across start');
assert.equal(plan(state({health:20}),world({pickups:[{...health,t:.19}]})).goal,'race','do not turn back for pickup');
assert.equal(plan(state({health:20}),world({pickups:[{...health,t:.8}]})).goal,'race','ignore distant branch');
assert.equal(plan(state({health:20}),world({pickups:[{...health,t:.205,offset:24}]})).goal,'race','unreachable lateral pickup');

const lead={id:9,t:.225,offset:0,speed:30};
const overtake=plan(state(),world({traffic:[lead]}));
assert.equal(overtake.goal,'overtake');
assert.ok(Math.abs(overtake.targetOffset)>=10,'choose passing corridor');
const rightOccupied={id:10,t:.202,offset:11,speed:45};
const leftPass=plan(state(),world({traffic:[lead,rightOccupied]}));
assert.ok(leftPass.targetOffset<0,'avoid occupied right side');
const blocked=plan(state(),world({traffic:[lead,...[-22,-11,11,22].map((offset,id)=>({id:20+id,t:.206,offset,speed:30}))]}));
assert.ok(blocked.speedLimit<45,'slow when all exits are occupied');
assert.equal(blocked.useNitro,false);
const acrossLine=plan(state({t:.99}),world({traffic:[{...lead,t:.015}]}));
assert.equal(acrossLine.goal,'overtake','traffic across start is still ahead');

const held=plan(state({tacticalPlan:overtake}),world({traffic:[lead]}),.1);
assert.equal(held.targetOffset,overtake.targetOffset,'hold safe passing side');
assert.ok(held.remaining<overtake.remaining);
const interrupted=plan(state({tacticalPlan:overtake}),world({traffic:[lead,{id:11,t:.202,offset:overtake.targetOffset,speed:45}]}),.1);
assert.notEqual(interrupted.targetOffset,overtake.targetOffset,'danger cancels held manoeuvre');
const repair=plan(state({health:20}),world({pickups:[health]}));
assert.equal(plan(state({health:20,tacticalPlan:repair}),world()).goal,'race','lost pickup cancels plan');
assert.equal(plan(state({health:100,tacticalPlan:repair}),world({pickups:[health]})).goal,'race','repair target clears when healed');

// Nitro is a finite resource: an empty straight is not a reason to spend it.
assert.equal(plan().useNitro,false,'solo driver saves nitro without a tactical gain');
const matchedRival={id:17,t:.26,offset:18,targetOffset:18,speed:45};
const passingWorld=world({traffic:[matchedRival]});
assert.equal(plan(state(),passingWorld).useNitro,true,'safe adjacent lane and matched rival justify a pass');
// Nitro must predict the full boost trajectory, not only the nearest ~100 units.
const stoppedAhead={id:18,t:.31,offset:0,targetOffset:0,speed:0};
const blockedBoost=world({traffic:[matchedRival,stoppedAhead]});
assert.ok(plan(state({nitroCharges:0}),world({traffic:[stoppedAhead]})).speedLimit<45,
  'a slow car 110 units ahead requires early controlled deceleration, not a late speed cliff');
assert.equal(plan(state(),blockedBoost).useNitro,false,
  'do not boost into a stopped car 110 units ahead even when an adjacent overtake is tempting');
assert.equal(plan(state({t:.97}),world({traffic:[{...matchedRival,t:.03},{...stoppedAhead,t:.08}]})).useNitro,false,
  'nitro hazard detection must work across the lap wrap');
assert.equal(plan(state(),world({traffic:[matchedRival,{...stoppedAhead,t:.3,offset:18,targetOffset:0,speed:35}]})).useNitro,false,
  'do not boost through a rival merging into the chosen corridor');
assert.equal(plan(state({speed:68,baseSpeed:68}),world({traffic:[
  {...matchedRival,speed:68},{...stoppedAhead,t:.44}
]})).useNitro,false,
  'high-speed nitro must detect a stationary car beyond the old 200-unit planner window');
assert.equal(plan(state({speed:68,baseSpeed:68}),world({traffic:[
  {...matchedRival,speed:68},{...stoppedAhead,t:.425}
]})).useNitro,false,
  'continuous closest approach catches a collision between discrete look-ahead samples');
assert.equal(plan(state(),world({traffic:[matchedRival,{...stoppedAhead,t:.55}]})).useNitro,true,
  'a distant unrelated car must not prevent a useful safe pass');
assert.equal(plan(state({t:.97}),world({traffic:[{...matchedRival,t:.03}]})).useNitro,true,
  'passing opportunity survives the start/finish wrap');
assert.equal(plan(state(),world({traffic:[{...matchedRival,offset:0,targetOffset:0}]})).useNitro,false,
  'never accelerate directly into a car ahead');
assert.equal(plan(state(),world({traffic:[matchedRival,{id:18,t:.23,offset:0,speed:45}]})).useNitro,false,
  'a second car blocks the passing corridor');
for(const rival of [
  {...matchedRival,t:.38},
  {...matchedRival,t:.16},
  {...matchedRival,speed:25},
  {...matchedRival,speed:90}
]){
  assert.equal(plan(state(),world({traffic:[rival]})).useNitro,false,
    'nitro needs a reachable opponent with a useful speed difference: '+JSON.stringify(rival));
}
for(const extra of [{nitroTimer:1},{nitroCharges:0},{speedBoostTimer:1},{slowTimer:1}]){
  assert.equal(plan(state(extra),passingWorld).useNitro,false,'do not waste nitro '+JSON.stringify(extra));
}
assert.equal(plan(state(),world({traffic:[matchedRival],bend:.8})).useNitro,false,
  'no nitro before sharp bend');
assert.ok(plan(state(),world({bend:.8})).speedFactor<plan().speedFactor,'preview affects corner speed');
const shotTarget={id:'player',t:.28,offset:11,speed:45};
assert.equal(plan(state({id:1}),world({traffic:[shotTarget]})).goal,'attack','aggressor positions for player ahead');
assert.notEqual(plan(state({id:1,rockets:0,gunAmmo:0}),world({traffic:[shotTarget]})).goal,'attack');

const context=world({maxSpeed:52,difficultySpeed:1,playerProgress:.2,minRubberBand:.88,maxRubberBand:1.12});
// Following a stopped vehicle should brake progressively at different update rates.
for(const fps of [30,60,144]){
  let follower=state({nitroCharges:0}),prevSpeed=follower.speed,maxDrop=0,minSeparation=Infinity;
  for(let frame=0;frame<fps*3;frame++){
    const tactics=plan(follower,world({traffic:[stoppedAhead]}),1/fps);
    const motion=ai.stepOpponentFrame(follower,{...context,tactics},1/fps);
    maxDrop=Math.max(maxDrop,prevSpeed-motion.effSpeed);
    follower={...follower,...motion,speed:motion.effSpeed,tacticalPlan:tactics};
    prevSpeed=motion.effSpeed;
    minSeparation=Math.min(minSeparation,Math.hypot((stoppedAhead.t-follower.t)*1000,follower.offset));
  }
  assert.ok(maxDrop<3,'early following avoids abrupt braking at '+fps+' FPS: '+maxDrop);
  assert.ok(minSeparation>11,'following keeps a physical clearance at '+fps+' FPS: '+minSeparation);
}
const one=ai.stepOpponentFrame(state(),{...context,tactics:plan(state(),passingWorld)},1/60,()=>{throw Error('tactical frame must not choose random lane/nitro');});
assert.equal(one.usedNitro,true);
assert.equal(one.nitroCharges,1);
const two=ai.stepOpponentFrame({...state(),...one},{...context,tactics:plan(state({...one}))},1/60,()=>{throw Error('random');});
assert.equal(two.usedNitro,false);assert.equal(two.nitroCharges,1);
for(const fps of [30,60,144]){
  let s=state({nitroCharges:0});
  for(let frame=0;frame<fps*8;frame++){
    const tactics=plan(s,world({bend:.35}),1/fps);
    s={...s,...ai.stepOpponentFrame(s,{...context,tactics},1/fps),tacticalPlan:tactics};
    assert.ok(Number.isFinite(s.t)&&Number.isFinite(s.offset));
    assert.ok(Math.abs(s.offset)<=40*.62);
  }
  assert.ok(s.t>.35,'makes progress at '+fps+' FPS');

  // Six seconds of an empty straight must not drain either charge at any FPS.
  let solo=state();
  let contender=state();
  let rival={...matchedRival};
  let duelBoosts=0;
  for(let frame=0;frame<fps*6;frame++){
    const soloPlan=plan(solo,world(),1/fps);
    solo={...solo,...ai.stepOpponentFrame(solo,{...context,tactics:soloPlan},1/fps),tacticalPlan:soloPlan};
    const contested=world({traffic:[rival]});
    const duelPlan=plan(contender,contested,1/fps);
    const motion=ai.stepOpponentFrame(contender,{...context,tactics:duelPlan},1/fps);
    if(motion.usedNitro)duelBoosts++;
    contender={...contender,...motion,tacticalPlan:duelPlan};
    rival={...rival,t:rival.t+rival.speed/1000/fps};
  }
  assert.equal(solo.nitroCharges,2,'solo six-second run preserves nitro at '+fps+' FPS');
  assert.equal(duelBoosts,1,'one useful boost, no waste after passing at '+fps+' FPS');
  assert.equal(contender.nitroCharges,1,'boost consumes exactly one charge at '+fps+' FPS');
  assert.ok(contender.t>rival.t,'timed boost results in an overtake at '+fps+' FPS');
}
// Execute actual runtime owners in a synthetic world, without booting a renderer/storage.
const runtime=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
function extract(name){
  const start=runtime.indexOf('function '+name+'(');assert.ok(start>=0);
  const open=runtime.indexOf('{',start);let depth=1,end=open+1;
  for(;depth&&end<runtime.length;end++){if(runtime[end]==='{')depth++;else if(runtime[end]==='}')depth--;}
  assert.equal(depth,0);return runtime.slice(start,end);
}
class Vector{
  constructor(x=0,y=0,z=0){this.set(x,y,z);}
  set(x,y,z){Object.assign(this,{x,y,z});return this;}
  normalize(){const n=Math.hypot(this.x,this.y,this.z)||1;return this.set(this.x/n,this.y/n,this.z/n);}
  dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
}
const bot={...state({health:20}),bumpOffset:0,bumpVelocity:0,slowTimer:0,shieldTimer:0,attackCooldown:100,
  laneChangeTimer:0,car:{group:{position:new Vector(0,0,200),rotation:{}},wheels:[]},
  healthCtx:{clearRect(){},fillRect(){}},healthTex:{},healthPlane:{lookAt(){}}};
const calls=[];
const c={canControl:()=>true,opponents:[bot],gameFinished:false,
  player:{destroyed:false,lastSampleIdx:0,prevT:.21,pos:new Vector(22,0,210),speed:25,heading:0,lap:1},
  samples:[new Vector(0,0,210)],tangents:[new Vector(0,0,1)],totalLength:1000,
  CONFIG:{ROAD_HALF:40,CAR_RADIUS:3.8,MAX_SPEED:52,TOTAL_LAPS:15,NUM_SAMPLES:600,BOT_MIN_RUBBER_BAND:.88,BOT_MAX_RUBBER_BAND:1.12},
  bonusMeshes:[{...health,group:{position:new Vector(-11,0,270)}}],removeBonusAt(i){c.bonusMeshes.splice(i,1);},
  segmentSphereHit:require('../src/weapons/geometry.js').segmentSphereHit3D,
  canBenefitFromPickup:require('../src/game/pickup-rules.js').canBenefitFromPickup,
  THREE:{Vector3:Vector,MathUtils:{clamp:(n,a,b)=>Math.max(a,Math.min(b,n))}},camera:{position:new Vector()},
  trackCurve:{getPointAt:t=>new Vector(0,0,t*1000),getTangentAt:()=>new Vector(0,0,1)},
  difficulty:()=>({botSpeed:1}),findClosest:()=>({idx:0,t:bot.t}),Math,
  planOpponentTactics(s,w,dt){calls.push(w);return ai.planOpponentTactics(s,w,dt);},stepOpponentFrame:ai.stepOpponentFrame
};
c.activeChampionship=null;c.singleRaceFinishedIds=[];c.raceLaps=()=>c.CONFIG.TOTAL_LAPS;
c.pickupSweepStart={...c.player.pos};
c.sweptVehicleContact2D=require('../src/game/race-state.js').sweptVehicleContact2D;
c.applyPlayerDamage=()=>{};
vm.createContext(c);vm.runInContext(extract('updateOpponents')+'\n'+extract('respawnOpponent')+'\n'+extract('resolveMissedMovingContact'),c);
c.updateOpponents(1/60);
assert.equal(calls.length,1);assert.equal(calls[0].traffic.find(t=>t.id==='player').offset,-22);
assert.equal(bot.tacticalPlan.goal,'resupply');assert.ok(bot.t>.2&&bot.offset>0);
assert.ok(Math.abs(bot.speed-45*(1+.01*.08))<1e-9,'motion output, including rubber band, is stored for next snapshot');
c.canControl=()=>false;const oldT=bot.t;c.updateOpponents(1);assert.equal(bot.t,oldT,'pause freezes AI');
c.respawnOpponent(bot);assert.equal(bot.tacticalPlan,null,'respawn drops old plan');assert.equal(bot.speed,bot.baseSpeed);
// An AI car must collect an item crossed between consecutive sampled positions.
c.canControl=()=>true;bot.health=20;bot.car.group.position.set(4,0,5.5);
bot.pickupSweepStart={x:-4,y:0,z:5.5};
c.bonusMeshes=[{id:88,type:'health',t:.25,offset:0,group:{position:new Vector(0,2.2,0)}}];
c.updateOpponents(1/60);
assert.equal(bot.health,60,'AI crossed a pickup between frames');
assert.equal(c.bonusMeshes.length,0,'AI pickup consumed exactly once');
// Regression: a critical repair must not pull a car into adjacent rear traffic.
let injured=state({id:2,health:1,nitroCharges:0});
let rear={id:'player',t:.196,offset:11,targetOffset:11,speed:45};
let minDistance=Infinity,pickups=[{id:8,type:'health',t:.24,offset:11}];
for(let frame=0;frame<180;frame++){
  const tactics=plan(injured,world({traffic:[rear],pickups}));
  injured={...injured,...ai.stepOpponentFrame(injured,{...context,tactics},1/60),tacticalPlan:tactics};
  rear={...rear,t:rear.t+45/1000/60};
  minDistance=Math.min(minDistance,Math.hypot((injured.t-rear.t)*1000,injured.offset-rear.offset));
  if(pickups.length&&Math.hypot((injured.t-.24)*1000,injured.offset-11)<8)pickups=[];
}
assert.ok(minDistance>=7.6,'critical pickup cannot override safe corridor; min distance '+minDistance);
console.log('CYBER RACE tactical goals, passing, resources, runtime lifecycle and multi-FPS scenarios passed.');
