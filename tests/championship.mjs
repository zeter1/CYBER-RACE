import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const api=require('../src/game/championship.js');
const {resolveLapCompletion,sweptVehicleContact2D,singleRaceFinishOrder}=require('../src/game/race-state.js');
const {stepOpponentFrame}=require('../src/ai/opponent-brain.js');
const {stepPlayerDriving}=require('../src/game/player-driving.js');
const {resolveDrivingInput}=require('../src/game/control-input.js');
const {findClosestSample}=require('../src/game/track-environment.js');
const {createTuningStore,createGarageRecords,buildKey}=require('../src/game/garage-profile.js');
const {createSectorTimer,formatSectorTime,formatSectorDelta}=require('../src/game/sector-timing.js');
const {createLapGhostTracker,createLapGhostStore}=require('../src/game/lap-ghost.js');
const {createDriftMastery}=require('../src/game/drift-mastery.js');
const {CHAMPIONSHIP_KEY,CHAMPIONSHIP_STAGES,CHAMPIONSHIP_TRACK_POINTS,CHAMPIONSHIP_DRIVERS,createChampionshipStore,validateChampionship,championshipStandings,championshipFinishOrder}=api;
// All persistence is a synthetic Map; no browser, network, renderer or real profile.
function storage(initial={}){const map=new Map(Object.entries(initial));return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};}
const ids=CHAMPIONSHIP_DRIVERS.map(d=>d.id);
const order=['bot:4','player','bot:1','bot:5','bot:0','bot:3','bot:2'];
const saved=storage({cyberRaceRecords:'legacy sentinel',cyberRaceSettings:'settings sentinel'});
const store=createChampionshipStore(saved);
assert.equal(store.snapshot(),null);assert.equal(store.status(),'empty');
store.start('hard');
assert.equal(store.record(0,order,301).accepted,true);
assert.equal(store.record(0,ids,401).accepted,false,'duplicate/restart cannot score the same stage twice');
assert.equal(store.record(2,ids,401).accepted,false,'cannot skip a stage');
assert.equal(store.record(1,[...ids.slice(0,6),'player'],401).accepted,false,'reject duplicate/missing driver');
assert.equal(store.snapshot().results.length,1);
assert.equal(championshipStandings(store.snapshot()).find(d=>d.id==='player').points,12);
const resumed=createChampionshipStore(saved);
assert.deepEqual(resumed.snapshot(),store.snapshot(),'reload resumes next stage, never race progress');
assert.equal(resumed.record(1,ids,400).accepted,true);assert.equal(resumed.record(2,ids,500).accepted,true);
assert.equal(resumed.record(3,ids,500).accepted,false);
assert.equal(championshipStandings(resumed.snapshot())[0].id,'player');
assert.equal(championshipStandings(resumed.snapshot()).find(d=>d.id==='player').points,42,'independent scoring oracle: 12+15+15');
assert.equal(championshipStandings(resumed.snapshot()).find(d=>d.id==='bot:4').points,23,'independent scoring oracle: 15+4+4');
assert.equal(saved.getItem('cyberRaceRecords'),'legacy sentinel');assert.equal(saved.getItem('cyberRaceSettings'),'settings sentinel');
assert.equal(saved.map.size,3,'only the new championship key is written');
const copy=resumed.snapshot();copy.results[0].order[0]='tampered';assert.equal(resumed.snapshot().results[0].order[0],'bot:4','callers cannot mutate saved standings');
const tied={version:1,difficulty:'normal',results:[{order:ids,playerTime:300},{order:['bot:0','player',...ids.slice(2)],playerTime:300}]};
assert.equal(championshipStandings(tied)[0].id,'bot:0','ties: wins, then last stage place');
for(const malformed of ['{bad','null','[]','{"version":2,"difficulty":"normal","results":[]}',JSON.stringify({...tied,results:[{order:ids,playerTime:-1}]}),JSON.stringify({...tied,results:[{order:ids.slice(1),playerTime:300}]})]){
  const invalid=createChampionshipStore(storage({[CHAMPIONSHIP_KEY]:malformed}));assert.equal(invalid.snapshot(),null);assert.equal(invalid.status(),'invalid');
}
assert.equal(validateChampionship({...tied,results:Array(4).fill(tied.results[0])}),null);
for(const unavailable of [null,{getItem(){throw Error('denied');},setItem(){throw Error('denied');}},{getItem(){return null;},setItem(){throw Error('quota');}},{getItem(){return null;},setItem(){}}]){
  const denied=createChampionshipStore(unavailable);assert.equal(denied.start().persisted,false);
  assert.equal(denied.record(0,ids,300).accepted,true);assert.equal(denied.status(),'denied');
  assert.equal(denied.record(0,ids,300).accepted,false);
  assert.equal(denied.record(1,ids,400).accepted,true,'no reload: continue in memory after denied persistence');
  assert.equal(denied.snapshot().results.length,2);
}
assert.deepEqual(CHAMPIONSHIP_STAGES.map(s=>s.laps),[3,4,5]);
// Independent shape checks: truly different topology/bounds, no linear segment crossing.
function intersects(a,b,c,d){const cross=(p,q,r)=>(q[0]-p[0])*(r[2]-p[2])-(q[2]-p[2])*(r[0]-p[0]);return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;}
for(const pts of Object.values(CHAMPIONSHIP_TRACK_POINTS))for(let i=0;i<pts.length;i++)for(let j=i+2;j<pts.length;j++)if(!(i===0&&j===pts.length-1))assert.equal(intersects(pts[i],pts[(i+1)%pts.length],pts[j],pts[(j+1)%pts.length]),false,'new route control polygon must not self-cross');
assert.notDeepEqual(CHAMPIONSHIP_TRACK_POINTS.city,CHAMPIONSHIP_TRACK_POINTS.industrial);
assert.ok(Math.max(...CHAMPIONSHIP_TRACK_POINTS.industrial.map(p=>p[0]))-Math.min(...CHAMPIONSHIP_TRACK_POINTS.industrial.map(p=>p[0]))>220);
assert.ok(CHAMPIONSHIP_TRACK_POINTS.city.length>CHAMPIONSHIP_TRACK_POINTS.industrial.length);
const opponents=Array.from({length:6},(_,id)=>({id,lap:2,t:id/10}));
assert.deepEqual(championshipFinishOrder(opponents,['bot:4','bot:0']),['bot:4','bot:0','player','bot:5','bot:3','bot:2','bot:1'],'finished order wins over IDs/progress, unfinished use distance');

const source=fs.readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
function extract(name){const start=source.indexOf('    function '+name+'('),end=source.indexOf('\n    }',start);assert.ok(start>=0&&end>start,name);return source.slice(start,end+6);}
function element(){return {textContent:'',innerHTML:'',hidden:true,style:{},classList:{remove(){},add(){}}};}
function race(storageImpl=storage()){
  const championship=createChampionshipStore(storageImpl);championship.start();
  const tuning=createTuningStore(storage());
  let recordCalls=0;
  const c={...api,championship,tuning,activeChampionship:{stageIndex:0},championshipFinishedIds:['bot:4'],
    player:{lap:3,curLap:100,bestLap:Infinity,totalTime:300,score:0,kills:0,deaths:0,pos:{x:0,z:0},heading:0},opponents:Array.from({length:6},(_,id)=>({id,lap:id===4?4:2,t:id/10})),
    gameStarted:true,gameFinished:false,paused:false,menuOpen:false,lastRaceWon:false,creditedRaceEvents:new Set(),overtakeTracker:{interrupt(){},reset(){},contact(){}},driftMastery:createDriftMastery(),
    raceContractTracker:require('../src/game/race-contracts.js').createRaceContractTracker(),resolveLapCompletion,
    sectorTimer:createSectorTimer(),lapGhost:createLapGhostTracker(),lapGhostStore:createLapGhostStore(storage()),lapGhostRecordResult:null,currentTrackId:'valley',buildKey,formatSectorTime,formatSectorDelta,
    raceLaps:()=>CHAMPIONSHIP_STAGES[c.activeChampionship.stageIndex].laps,
    clearInputs(){},setGameplayCursor(){},showMessage(){},updateChampionshipMenu(){},championshipStorageMessage:()=>championship.status(),
    document:{body:{classList:{remove(){}}}},playerShieldMesh:{},damageOverlayTimer:null,damageOverlay:element(),
    incomingWarningEl:element(),wrongWayEl:element(),hitMarkerEl:element(),comboDisplayEl:element(),speedVignetteEl:element(),pauseMenu:element(),finishScreen:element(),finishTitle:element(),finishStats:element(),championshipResults:element(),
    saveRecords(){recordCalls++;},getRacePositions:()=>[{who:'player'}],
    garageRecords:{save(){recordCalls++;}},activeBuild:'universal',updateRecordInfo(){}
  };
  vm.createContext(c);
  vm.runInContext(['championshipTable','awardRaceEvent','sectorFinishMarkup','recordSectorSplit','completeLap','finishChampionshipStage','finishGame','saveRecords'].map(extract).join('\n'),c);
  return {c,tuning,championship,records:()=>recordCalls};
}
for(const persistence of [storage(),null]){
  const {c,tuning,championship,records}=race(persistence);
  c.completeLap();assert.equal(c.gameFinished,true);assert.equal(c.paused,true);assert.equal(championship.snapshot().results.length,1);
  assert.equal(championship.snapshot().results[0].order[0],'bot:4');assert.equal(championship.snapshot().results[0].order[1],'player');
  assert.equal(c.lastRaceWon,false,'finishing is not automatically a victory');assert.equal(tuning.snapshot().wallet,1500,'lap credit only, no false victory reward');
  assert.equal(records(),0,'championship never writes legacy/build race records');
  c.completeLap();c.finishGame(true);c.saveRecords();assert.equal(championship.snapshot().results.length,1);assert.equal(tuning.snapshot().wallet,1500,'duplicate finish/lap does not award twice');
  assert.equal(c.championshipResults.hidden,false);assert.match(c.finishStats.innerHTML,/12/);assert.match(c.championshipResults.innerHTML,/Вольт/);
  c.activeChampionship={stageIndex:1};c.gameFinished=false;c.championshipFinishedIds=[];c.player.lap=4;c.player.curLap=100;c.player.totalTime=400;c.completeLap();
  assert.equal(championship.snapshot().results.length,2);assert.equal(c.lastRaceWon,true);assert.equal(tuning.snapshot().wallet,3300,'new stage lap + winning credit awarded once');
  c.finishGame(true);assert.equal(tuning.snapshot().wallet,3300);
  c.activeChampionship={stageIndex:2};c.gameFinished=false;c.championshipFinishedIds=[];c.player.lap=5;c.player.curLap=100;c.player.totalTime=500;c.completeLap();
  assert.equal(championship.snapshot().results.length,3);assert.match(c.finishTitle.textContent,/ЧЕМПИОНАТ/);
  assert.equal(championshipStandings(championship.snapshot()).find(d=>d.id==='player').points,42);
}
// A credited non-final lap checkpoints the new lap index and credited event together.
{
  const {c}=race();
  c.player.lap=1;c.player.curLap=75;c.player.totalTime=75;
  const seen=[];
  c.saveStageCheckpoint=()=>{seen.push({lap:c.player.lap,rewarded:[...c.creditedRaceEvents]});return true;};
  c.completeLap();
  assert.equal(seen.length,1,'successful non-final lap triggers an immediate checkpoint');
  assert.equal(seen[0].lap,2,'checkpoint must record the advanced lap, not the previous lap');
  assert.deepEqual(seen[0].rewarded,['lap:1'],'checkpoint includes idempotency token for granted credits');
}
// Actual runtime AI finish owner: one bot finishes, race continues, no respawn/duplicate.
const bot={id:4,lap:3,t:.999,baseSpeed:50,speed:50,offset:0,targetOffset:0,bumpOffset:0,bumpVelocity:0,health:100,slowTimer:0,shieldTimer:0,invincibleTimer:0,lastAttackerTimer:0,respawnTimer:0,dead:false,
  car:{group:{visible:true,position:{distanceTo:()=>1000}},wheels:[]},healthPlane:{visible:true}};
const r={canControl:()=>true,gameFinished:false,activeChampionship:{stageIndex:0},championshipFinishedIds:[],opponents:[bot],player:{destroyed:true,lap:2,prevT:0},
  bonusMeshes:[],projectiles:[{ownerRef:bot,life:1}],CONFIG:{ROAD_HALF:40},totalLength:1000,raceLaps:()=>3,
  trackCurve:{getTangentAt:()=>({normalize(){return this;},dot:()=>1})},THREE:{MathUtils:{clamp:n=>n}},
  planOpponentTactics:()=>({}),stepOpponentFrame:()=>({t:0,lap:4,effSpeed:50,finished:true}),difficulty:()=>({botSpeed:1}),respawnOpponent(){throw Error('finished bot must not respawn');},finishGame(){throw Error('leading bot must not end championship race');},Math};
vm.createContext(r);vm.runInContext(extract('resolveMissedMovingContact')+'\n'+extract('updateOpponents'),r);r.updateOpponents(.1);r.updateOpponents(1/60);r.updateOpponents(10);
assert.equal(r.gameFinished,false);assert.deepEqual(Array.from(r.championshipFinishedIds),['bot:4']);assert.equal(bot.finished,true);assert.equal(bot.dead,true);assert.equal(bot.car.group.visible,false);assert.equal(r.projectiles[0].life,0);
// Regression: in a single race a leading AI finisher must not end the player's drive.
bot.finished=false;bot.dead=false;r.activeChampionship=null;r.singleRaceFinishedIds=[];
r.finishGame=()=>{throw Error('AI finish must not end the single race');};
r.updateOpponents(.1);
assert.equal(r.gameFinished,false,'single race remains active after AI finish');
assert.deepEqual(Array.from(r.singleRaceFinishedIds),['bot:4'],'single-race finish order captures the first finisher');
// Both finish in one frame: remaining distance / actual speed determines order,
// independently of the order of the runtime's opponent array.
for(const reversed of [false,true])for(const mode of ['championship','single']){
  const racers=[.9995,.9999].map((t,id)=>({...bot,id,t,lap:3,finished:false,dead:false,
    speed:50,baseSpeed:50,car:{group:{visible:true,position:{distanceTo:()=>1000}},wheels:[]},healthPlane:{visible:true}}));
  const c={...r,activeChampionship:mode==='championship'?{stageIndex:0}:null,championshipFinishedIds:[],singleRaceFinishedIds:[],
    opponents:reversed?[...racers].reverse():racers,totalLength:4900,stepOpponentFrame,
    projectiles:[],CONFIG:{ROAD_HALF:40},Math:Object.assign(Object.create(Math),{random:()=>.5})};
  vm.createContext(c);vm.runInContext(extract('resolveMissedMovingContact')+'\n'+extract('updateOpponents'),c);c.updateOpponents(.1);
  const finished=mode==='championship'?c.championshipFinishedIds:c.singleRaceFinishedIds;
  assert.ok(racers.every(o=>o.finished),mode+' both racers must cross the finish');
  assert.deepEqual(Array.from(finished),['bot:1','bot:0'],mode+' crossing time, not array order');
  c.updateOpponents(.1);assert.equal(finished.length,2,mode+' no duplicate finish on following frame');
}
// The player must not publish a result before bots earlier in the same frame.
const configContext={};vm.runInNewContext(fs.readFileSync(new URL('../src/game/config.js',import.meta.url),'utf8'),configContext);
const CONFIG=configContext.CyberRace.game.CONFIG;
for(const mode of ['championship','single'])for(const dt of [1/30,1/60,1/144])for(const botEarlier of [true,false]){
  const {c,championship,tuning}=race();
  if(mode==='single')Object.assign(c,{activeChampionship:null,singleRaceFinishedIds:[],singleRaceFinishOrder,
    singleRaceMode:'sprint',SINGLE_RACE_MODES:{sprint:{lapCredits:300,victoryCredits:300}},raceLaps:()=>3,
    garageRecords:createGarageRecords(storage()),recordStorageNote:element()});
  const position=(x=0,z=0)=>({x,z,set(x,y,z){this.x=x;this.z=z;},distanceTo:()=>1000});
  const tangent={x:0,z:1,normalize(){return this;},dot:()=>1};
  const node=()=>({position:position(),rotation:{y:0},visible:true});
  const distance=4900/1200+50*dt*.8;
  const botDistance=50*dt*(botEarlier?.1:.95);
  const samples=Array.from({length:600},(_,i)=>({x:20,z:(i<300?i:i-600)*4900/600}));
  Object.assign(c,{CONFIG,drivingConfig:CONFIG,stepPlayerDriving,resolveDrivingInput,stepOpponentFrame,drivingAudio:{},keys:{},touchInput:{},gamepadInput:{},isGameplayInputBlocked:()=>false,
    canControl:()=>c.gameStarted&&!c.gameFinished&&!c.paused,difficulty:()=>({regen:1,botSpeed:1}),
    findClosest:(x,z,i)=>findClosestSample(samples,x,z,i,40,45),samples,tangents:Array(600).fill(tangent),
    playerCar:{group:node(),wheels:[]},playerShieldMesh:node(),pickupSweepStart:{copy(p){this.x=p.x;this.z=p.z;return this;}},sweptVehicleContact2D,performance:{now:()=>100},raceStartHint:false,nitroFxTimer:0,
    totalLength:4900,bonusMeshes:[],projectiles:[],planOpponentTactics:()=>({}),
    trackCurve:{getTangentAt:()=>tangent,getPointAt:t=>({x:20,z:t*4900})},camera:{position:{}},
    THREE:{MathUtils:{clamp:n=>n},Vector3:class{constructor(x,y,z){Object.assign(this,{x,y,z});}normalize(){return this;}}},Math:Object.assign(Object.create(Math),{random:()=>.5})});
  for(const el of [c.comboDisplayEl,c.wrongWayEl])el.classList.toggle=()=>{};
  Object.assign(c.player,{pos:position(20,-distance),speed:50,speedLat:0,steerAngle:0,heading:0,maxSpeed:52,maxHealth:100,health:100,
    resetCooldown:0,damageCooldown:0,pulseCooldown:0,comboTimer:0,regenDelay:100,shieldTimer:0,speedBoostTimer:0,nitroTimer:0,driftTime:0,invincibleTimer:0,wrongWayTimer:0,stuckTimer:0,
    prevT:599/600,crossedHalf:true,lastSampleIdx:599});
  c.championshipFinishedIds=[];c.paused=false;
  c.opponents=c.opponents.map((o,id)=>({...bot,id,lap:3,t:1-botDistance/4900,finished:false,dead:id!==0,respawnTimer:100,
    attackCooldown:100,lastHealthDrawn:'100|0',healthCtx:{clearRect(){},fillRect(){}},healthTex:{},
    car:{group:{...node(),position:position(-20,-botDistance)},wheels:[]},healthPlane:{visible:true,lookAt(){}}}));
  vm.runInContext(extract('resolveMissedMovingContact')+'\n'+extract('updatePlayer')+'\n'+extract('updateOpponents'),c);
  c.updatePlayer(dt);const finishT=c.opponents[0].t;c.updateOpponents(dt);
  assert.equal(c.opponents[0].t,finishT,'no second AI update after player finish');
  if(mode==='championship'){
    assert.equal(championship.snapshot().results[0].order[0],botEarlier?'bot:0':'player','same-frame championship order at '+dt);
    assert.equal(tuning.snapshot().wallet,botEarlier?1500:3000,'championship victory credits at '+dt);
  }else{
    assert.equal(championship.snapshot().results.length,0,'single race must not modify championship');
    assert.equal(c.lastRaceWon,!botEarlier,'same-frame single victory only if player crosses first at '+dt);
    assert.match(c.finishStats.innerHTML,new RegExp('Позиция: <b>'+(botEarlier?'2':'1')+'/7</b>'),'single finish place');
    assert.equal(tuning.snapshot().wallet,botEarlier?1500:1800,'single sprint payout at '+dt);
  }
}
console.log('CYBER RACE championship passed: validated/denied storage, resume, 3-stage scoring, stable identities, actual lap/finish/AI owners and legacy isolation.');
