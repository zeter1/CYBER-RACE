import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {createGarageRecords}=require('../src/game/garage-profile.js');
const {playerNumbers,botNumbers,createStageCheckpoint,STAGE_CHECKPOINT_KEY}=require('../src/game/stage-checkpoint.js');
const {CHAMPIONSHIP_STAGES}=require('../src/game/championship.js');
const {createOvertakeTracker}=require('../src/game/overtake-events.js');
const {createDriftMastery}=require('../src/game/drift-mastery.js');
const {createSectorTimer}=require('../src/game/sector-timing.js');
const {createLapGhostTracker,createLapGhostStore}=require('../src/game/lap-ghost.js');
const {sweepCarObstacle2D}=require('../src/game/track-environment.js');

const storage=(initial={})=>{
 const data=new Map(Object.entries(initial));
 return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
};
const legacy='{"bestLap":10,"highScore":900,"bestTotal":110}';
const s=storage({cyberRaceRecords:legacy});
const v2=createGarageRecords(s,'valley-2026-v2');
assert.equal(v2.get('universal').bestLap,Infinity,'old route record must not mix with new circuit');
assert.equal(v2.save('universal',{bestLap:55,score:120,totalTime:200,won:true,finished:true}),true);
assert.equal(createGarageRecords(s,'valley-2026-v2').get('universal').bestLap,55);
assert.equal(createGarageRecords(s,'valley-2027-v3').get('universal').bestLap,Infinity,'new route version isolated');
const v3=createGarageRecords(s,'valley-2027-v3');
assert.equal(v3.save('universal',{bestLap:75,score:40,totalTime:280,won:true,finished:true}),true);
assert.equal(createGarageRecords(s,'valley-2026-v2').get('universal').bestLap,55,'v3 save must retain v2');
assert.equal(s.getItem('cyberRaceRecords'),legacy,'legacy key not modified');
const tuned={classId:'universal',levels:{engine:1,tires:0,armor:0}};
assert.equal(v2.save(tuned,{bestLap:44,score:20,totalTime:160,won:true,finished:true}),true);
assert.equal(v2.get('universal').bestLap,55);
assert.equal(createGarageRecords(s,'valley-2026-v2').get(tuned).bestLap,44);
const silent={getItem:()=>null,setItem(){}};
assert.equal(createGarageRecords(silent,'valley-2026-v2').save('universal',{bestLap:30,score:1}),false,'silent-drop must not report persistence');
assert.throws(()=>createGarageRecords(s,'__proto__'),TypeError);
// Two independent tabs share localStorage but can keep stale in-memory snapshots.
// Later writes must merge, not erase records or downgrade an earned high score.
const multiTabStorage=storage();
const tabA=createGarageRecords(multiTabStorage,'valley-2026-v2');
const tabB=createGarageRecords(multiTabStorage,'valley-2026-v2');
const universal='universal',interceptor='interceptor';
assert.equal(tabA.save(universal,{bestLap:50,score:900,totalTime:700,finished:true,won:true}),true);
assert.equal(tabB.save(interceptor,{bestLap:60,score:700,totalTime:800,finished:true,won:true}),true);
let combined=createGarageRecords(multiTabStorage,'valley-2026-v2');
assert.equal(combined.get(universal).highScore,900,'second tab must retain first car');
assert.equal(combined.get(interceptor).highScore,700,'second tab must retain its own car');
assert.equal(tabB.save(universal,{bestLap:80,score:250,totalTime:1200,finished:true,won:false}),true);
combined=createGarageRecords(multiTabStorage,'valley-2026-v2');
assert.equal(combined.get(universal).bestLap,50,'slower save in stale tab cannot downgrade lap');
assert.equal(combined.get(universal).highScore,900,'stale tab cannot downgrade score');
assert.equal(combined.get(universal).bestTotal,700,'losing race cannot erase earlier winning time');
const otherTrackStorage=storage();
const oldRouteTab=createGarageRecords(otherTrackStorage,'valley-2026-v2');
const newRouteTab=createGarageRecords(otherTrackStorage,'valley-2027-v3');
assert.equal(oldRouteTab.save(universal,{bestLap:55,score:600,totalTime:400,finished:true,won:true}),true);
assert.equal(newRouteTab.save(interceptor,{bestLap:70,score:500,totalTime:500,finished:true,won:true}),true);
assert.equal(createGarageRecords(otherTrackStorage,'valley-2026-v2').get(universal).bestLap,55,'second route must not delete first');
assert.equal(createGarageRecords(otherTrackStorage,'valley-2027-v3').get(interceptor).bestLap,70,'new route must still persist');
console.log('VERSIONED_RECORDS_PASS legacy intact, different route versions/builds, denied write, multi-tab merging');

const match={stageIndex:0,trackId:'valley',buildKey:'universal:0-0-0',signature:'{\"runToken\":\"isolated-season-one\"}'};
const player=Object.fromEntries(playerNumbers.map(key=>[key,0]));
Object.assign(player,{x:50,z:-20,heading:1.5,lap:2,health:80,totalTime:130,prevT:.52,
 bestLap:42,gunAmmo:63,rockets:2,nitro:1,crossedHalf:true,destroyed:false});
const bots=Array.from({length:6},(_,id)=>({
 ...Object.fromEntries(botNumbers.map(key=>[key,0])),id,lap:1,t:id/10,health:100,
 dead:false,finished:false,crossedHalf:false
}));
const sample={player,bots,bonuses:[{id:7,type:'health',t:0.4,offset:4,x:55,z:-25}],rewarded:['lap:1'],awardedOvertakeIds:[0,3],finishedIds:['bot:0']};
const checkpoint=createStageCheckpoint(s);
assert.equal(checkpoint.save(match,sample),true,'checkpoint persisted and read back');
const restored=createStageCheckpoint(s).load(match);
assert.equal(restored.player.lap,2);
assert.equal(restored.player.gunAmmo,63);
assert.deepEqual(restored.rewarded,['lap:1'],'reward idempotency keys must round-trip');
assert.deepEqual(restored.awardedOvertakeIds,[0,3],'paid rival ids must round-trip with the checkpoint');
const {awardedOvertakeIds:unusedOldField,...legacySnapshot}=sample;
const legacyStore=createStageCheckpoint(storage());
assert.equal(legacyStore.save(match,legacySnapshot),true,'older V1 checkpoint stays writable and readable');
assert.equal(legacyStore.inspect(match).status,'valid','missing optional overtake list is not corruption');
assert.equal(legacyStore.load(match).awardedOvertakeIds,undefined,'legacy checkpoints keep absent field');
assert.equal(legacyStore.save(match,{...legacySnapshot,awardedOvertakeIds:[2]}),true,'legacy save upgrades in place');
assert.deepEqual(legacyStore.load(match).awardedOvertakeIds,[2],'upgraded checkpoint persists reward history');
assert.equal(restored.bots.length,6);
assert.equal(restored.bonuses[0].type,'health');
// Negative resources and positions outside the game world's sanity radius must never
// reach runtime through a previously saved, but now invalid, checkpoint.
for(const [label,invalid] of [
 ['negative player ammo',{...sample,player:{...player,gunAmmo:-1}}],
 ['negative player rockets',{...sample,player:{...player,rockets:-4}}],
 ['negative player nitro',{...sample,player:{...player,nitro:-2}}],
 ['fractional player ammo',{...sample,player:{...player,gunAmmo:2.5}}],
 ['player outside track world',{...sample,player:{...player,x:9000000}}],
 ['negative AI ammo',{...sample,bots:bots.map((bot,i)=>i?bot:{...bot,gunAmmo:-2})}],
 ['negative AI rockets',{...sample,bots:bots.map((bot,i)=>i?bot:{...bot,rockets:-3})}],
 ['negative AI nitro',{...sample,bots:bots.map((bot,i)=>i?bot:{...bot,nitroCharges:-1})}],
 ['negative AI health',{...sample,bots:bots.map((bot,i)=>i?bot:{...bot,health:-2})}],
 ['AI outside road world',{...sample,bots:bots.map((bot,i)=>i?bot:{...bot,offset:9000000})}],
 ['pickup outside track world',{...sample,bonuses:[{...sample.bonuses[0],x:9000000}]}],
 ['player impossible health',{...sample,player:{...player,health:1000000}}],
 ['AI impossible health',{...sample,bots:bots.map((bot,i)=>i?bot:{...bot,health:1000000})}],
 ['player excess ammo',{...sample,player:{...player,gunAmmo:100}}],
 ['negative current lap time',{...sample,player:{...player,curLap:-90}}],
 ['excessive player speed',{...sample,player:{...player,speed:10000}}],
 ['excessive player health',{...sample,player:{...player,health:1000}}],
 ['negative shield timer',{...sample,player:{...player,shieldTimer:-1}}],
 ['invalid player sample index',{...sample,player:{...player,lastSampleIdx:10000000}}],
 ['beyond valley finish lap',{...sample,player:{...player,lap:4}}],
 ['invalid bot sample index',{...sample,bots:bots.map((bot,i)=>i?bot:{...bot,lastSampleIdx:10000000})}],
 ['excessive bot speed',{...sample,bots:bots.map((bot,i)=>i?bot:{...bot,speed:10000})}],
 ['missing bonus record',{...sample,bonuses:[null]}],
 ['duplicate rewarded rival',{...sample,awardedOvertakeIds:[0,0]}],
 ['invalid rewarded rival negative',{...sample,awardedOvertakeIds:[-1]}],
 ['invalid rewarded rival high',{...sample,awardedOvertakeIds:[6]}],
 ['invalid rewarded rival fraction',{...sample,awardedOvertakeIds:[2.5]}],
 ['invalid rewarded rival string',{...sample,awardedOvertakeIds:['0']}],
 ['invalid rewarded rival null',{...sample,awardedOvertakeIds:null}],
 ['sparse rewarded rival list',{...sample,awardedOvertakeIds:new Array(1)}],
 ['invalid rewarded rival type',{...sample,awardedOvertakeIds:'0'}],
 ['too many rewarded rivals',{...sample,awardedOvertakeIds:[0,1,2,3,4,5,6]}]
]){
 assert.equal(checkpoint.save(match,invalid),false,'reject '+label);
 assert.equal(createStageCheckpoint(s).load(match).player.gunAmmo,63,'invalid save must preserve previous valid data: '+label);
}
assert.equal(checkpoint.inspect(match).status,'valid');
assert.deepEqual(CHAMPIONSHIP_STAGES.map(s=>[s.id,s.laps]),[['valley',3],['city',4],['industrial',5]],'checkpoint stage limits must match actual stage definitions');
for(let stageIndex=0;stageIndex<CHAMPIONSHIP_STAGES.length;stageIndex++){
 const stage=CHAMPIONSHIP_STAGES[stageIndex];
 const stageMatch={...match,stageIndex,trackId:stage.id};
 const stageStorage=storage(),stageCheckpoint=createStageCheckpoint(stageStorage);
 const stageSnapshot={...sample,player:{...player,lap:stage.laps,lastSampleIdx:599}};
 assert.equal(stageCheckpoint.save(stageMatch,stageSnapshot),true,'valid last lap of '+stage.id);
 assert.equal(stageCheckpoint.inspect(stageMatch).status,'valid','last lap is resumable: '+stage.id);
 assert.equal(stageCheckpoint.save(stageMatch,{...stageSnapshot,player:{...stageSnapshot.player,lap:stage.laps+1}}),false,'reject lap past finish: '+stage.id);
}
// A damaged value can also arrive directly from storage, bypassing save().
const injected={...sample,...match,version:1,savedAt:Date.now(),player:{...player,speed:10000}};
s.setItem(STAGE_CHECKPOINT_KEY,JSON.stringify(injected));
assert.equal(checkpoint.inspect(match).status,'invalid','invalid saved physics must be refused on reload');
assert.equal(checkpoint.load(match),null,'bad saved physics cannot reach runtime');
s.setItem(STAGE_CHECKPOINT_KEY,JSON.stringify({...sample,...match,version:1,savedAt:Date.now(),awardedOvertakeIds:[0,0]}));
assert.equal(checkpoint.inspect(match).status,'invalid','directly injected duplicate overtake ids are rejected');
assert.equal(checkpoint.load(match),null,'invalid paid rival history cannot enter runtime');
assert.equal(checkpoint.save(match,sample),true,'valid checkpoint can be saved again after invalid storage');
assert.equal(createStageCheckpoint(s).load({...match,signature:'other-season'}),null,'stale championship denied');
assert.equal(createStageCheckpoint(s).load({...match,buildKey:'armored:0-0-0'}),null,'wrong build denied');
assert.equal(createStageCheckpoint(s).load({...match,stageIndex:1}),null,'wrong stage denied');
assert.equal(checkpoint.save(match,{...sample,player:{...player,health:Infinity}}),false,'reject invalid health');
assert.equal(createStageCheckpoint(s).load(match).player.health,80,'invalid save must not overwrite good checkpoint');
s.setItem(STAGE_CHECKPOINT_KEY,'{broken');
assert.equal(checkpoint.inspect(match).status,'invalid','malformed checkpoint is distinguished from missing storage');
assert.equal(checkpoint.load(match),null,'invalid JSON safely ignored');
assert.equal(createStageCheckpoint({getItem(){throw Error('blocked storage');}}).inspect(match).status,'unavailable');
assert.equal(checkpoint.save(match,sample),true);
assert.equal(checkpoint.clear(),true);
assert.equal(s.getItem(STAGE_CHECKPOINT_KEY),null);
assert.equal(checkpoint.inspect(match).status,'missing','cleared checkpoint must not trigger a warning');
console.log('STAGE_CHECKPOINT_PASS readback, roundtrip, idempotency keys, corrupt/mismatch/clear');

const box={x:0,z:0,w:4,d:6,rotation:0};
const hit=sweepCarObstacle2D({x:-20,z:0},{x:20,z:0},[box],1);
assert.ok(hit&&hit.x<-2.9&&hit.x>-3.5,'swept collision catches tunnelling');
assert.equal(sweepCarObstacle2D({x:-20,z:12},{x:20,z:12},[box],1),null,'near miss must pass');
const rotated=sweepCarObstacle2D({x:-20,z:0},{x:20,z:0},[{...box,w:2,d:10,rotation:Math.PI/2}],1);
assert.ok(rotated&&rotated.x<0&&rotated.x>-8,'rotated wall stops player');
const escape=sweepCarObstacle2D({x:0,z:0},{x:.1,z:0},[box],1);
assert.ok(escape&&Math.abs(escape.x)>2.99||escape&&Math.abs(escape.z)>3.99,'trapped player moves outside solid');
assert.equal(sweepCarObstacle2D({x:-20,z:0},{x:-10,z:0},[box],1),null,'approach without collision clear');
console.log('ROADSIDE_COLLISION_PASS swept/rotated/negative/inside-recovery');

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const hud=readFileSync(new URL('../assets/hud.css',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
assert.match(index,/#incoming-warning\.show,#wrong-way\.show \{ animation:none!important/);
for(const action of ['forward','backward','left','right','drift','gun','rocket','nitro','pulse','pause'])
 assert.ok(index.includes('data-touch="'+action+'"'),'missing mobile button: '+action);
assert.match(hud,/@media \(pointer:coarse\)/);
assert.ok(runtime.includes('function pollGamepad()')&&runtime.includes('function saveStageCheckpoint()'));
console.log('ACCESSIBILITY_AND_CONTROLS_STATIC_PASS reduced motion, ten touch buttons, gamepad/stage wiring');

// Execute the real runtime checkpoint owners with isolated storage and scene stubs.
{
 const from=runtime.indexOf('    function saveStageCheckpoint(){');
 const to=runtime.indexOf('    function championshipTable(',from);
 assert.ok(from>=0&&to>from,'runtime checkpoint save and restore owners must be present');
 const checkpointStore=createStageCheckpoint(storage());
 const tracker=createOvertakeTracker();
 assert.equal(tracker.restoreAwardedIds([0,3]),true);
 const point=()=>({set(){}});
 const runtimePlayer={...player,score:150,pos:{x:player.x,z:player.z,set(x,_y,z){this.x=x;this.z=z;}}};
 const runtimeBots=bots.map(bot=>({...bot,car:{group:{position:point(),rotation:{},visible:true}},healthPlane:{visible:true}}));
 const env={
  activeChampionship:{stageIndex:0},gameStarted:true,gameFinished:false,raceCountdown:0,
  currentTrackId:'valley',stageCheckpointMatch:()=>match,stageCheckpoint:checkpointStore,
  checkpointPlayerNumbers:playerNumbers,checkpointBotNumbers:botNumbers,
  player:runtimePlayer,opponents:runtimeBots,bonusMeshes:[],
  creditedRaceEvents:new Set(['lap:1']),championshipFinishedIds:[],overtakeTracker:tracker,
  driftMastery:createDriftMastery(),slipstreamTracker:{awarded:[],snapshotAwardedIds(){return this.awarded.slice();},restoreAwardedIds(ids){this.awarded=Array.from(ids);return true;},reset(){this.awarded=[];}}, 
  sectorTimer:createSectorTimer(),lapGhost:createLapGhostTracker(),lapGhostStore:createLapGhostStore(storage()),buildKey:()=>match.buildKey,activeBuild:{},lapGhostRecordResult:null,lastSectorNotice:null,
  pickupSweepStart:{copy(){}},playerCar:{group:{position:point(),rotation:{}}},
  playerShieldMesh:{position:point()},
  trackCurve:{getPointAt:()=>({x:0,z:0}),getTangentAt:()=>({x:0,z:1,normalize(){return this;}})},
  THREE:{Vector3:class {constructor(x,y,z){this.x=x;this.y=y;this.z=z;}normalize(){return this;}}},
  nextBonusId:0,removeBonusAt(){},createBonusIcon(){return {position:point()};},scene:{add(){}},
  document:{body:{dataset:{}}},updateWeaponVis(){},updateUI(){},minimap:{render(){}}
 };
 vm.createContext(env);
 vm.runInContext(runtime.slice(from,to),env,{filename:'runtime-checkpoint-owners.js'});
 env.slipstreamTracker.restoreAwardedIds([1,4]);
 assert.equal(env.saveStageCheckpoint(),true,'actual runtime must save checkpoint');
 const saved=checkpointStore.load(match);
 assert.deepEqual(saved.awardedOvertakeIds,[0,3],'runtime save persists exactly the paid rivals');
 assert.deepEqual(saved.awardedDraftIds,[1,4],'runtime save persists charged slipstream rivals');
 assert.equal(checkpointStore.save(match,{...saved,awardedDraftIds:[1,1]}),false,'reject duplicate draft awards');
 assert.equal(checkpointStore.save(match,{...saved,awardedDraftIds:[6]}),false,'reject unknown draft rival');
 assert.equal(saved.player.score,150,'score persists unchanged');
 tracker.reset();env.slipstreamTracker.reset();runtimePlayer.score=0;
 env.restoreStageCheckpoint(saved);
 assert.deepEqual(tracker.snapshotAwardedIds(),[0,3],'actual runtime restore re-arms anti-farm protection');
 assert.deepEqual(env.slipstreamTracker.snapshotAwardedIds(),[1,4],'actual runtime restore protects paid nitro rivals');
 assert.equal(runtimePlayer.score,150,'restored score is unchanged');
 assert.equal(env.document.body.dataset.stageResumed,'true');
 assert.equal(env.sectorTimer.snapshot().valid,false,'a restored partial lap cannot invent sector times');
 const {awardedOvertakeIds:oldField,awardedDraftIds:oldDraftField,...olderSaved}=saved;
 tracker.restoreAwardedIds([1]);env.slipstreamTracker.restoreAwardedIds([3]);env.restoreStageCheckpoint(olderSaved);
 assert.deepEqual(tracker.snapshotAwardedIds(),[],'old V1 checkpoint resumes without an overtake history');
 assert.deepEqual(env.slipstreamTracker.snapshotAwardedIds(),[],'old V1 checkpoint resumes without drafting history');
}
console.log('OVERTAKE_RUNTIME_CHECKPOINT_PASS actual save/restore, old V1 fallback, score and anti-farm state');
