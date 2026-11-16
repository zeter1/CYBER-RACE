import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const api=require('../src/game/garage-profile.js');
const {stepPlayerDriving}=require('../src/game/player-driving.js');
const {resolveDrivingInput}=require('../src/game/control-input.js');
const {resolveLapCompletion,sweptVehicleContact2D,singleRaceFinishOrder}=require('../src/game/race-state.js');
const hud=require('../src/ui/hud-model.js');
const {canBenefitFromPickup}=require('../src/game/pickup-rules.js');
const {createRaceContractTracker}=require('../src/game/race-contracts.js');
const {createSectorTimer,formatSectorTime,formatSectorDelta}=require('../src/game/sector-timing.js');
const {createLapGhostTracker,createLapGhostStore}=require('../src/game/lap-ghost.js');
const {measureFrameRate}=require('../src/game/frame-quality.js');
const {CAR_PROFILES,normalizeGarage,playerConfig,loadGarage,saveGarage,createGarageRecords,createTuningStore,normalizeBuild,buildProfile,normalizeTuning,buildKey,buildLabel,loadTuning}=api;
// Config IIFE only registers constants; no browser, storage, timers or network.
const configContext={};vm.runInNewContext(fs.readFileSync(new URL('../src/game/config.js',import.meta.url),'utf8'),configContext);
const CONFIG=JSON.parse(JSON.stringify(configContext.CyberRace.game.CONFIG));
const SINGLE_RACE_MODES=JSON.parse(JSON.stringify(configContext.CyberRace.game.SINGLE_RACE_MODES));
assert.deepEqual(playerConfig(CONFIG,'universal'),CONFIG,'stock driving remains byte-for-value equivalent');
assert.equal(CAR_PROFILES.universal.maxHealth,100);
assert.deepEqual(normalizeGarage(null),{classId:'universal',paintId:'red'});
for(const value of [[],false,'armored',{classId:'__proto__',paintId:'#ffffff'},{classId:{toString:1,valueOf:2}}])assert.deepEqual(normalizeGarage(value),{classId:'universal',paintId:'red'});
assert.deepEqual(normalizeGarage({classId:'armored',paintId:'cyan',extra:'drop'}),{classId:'armored',paintId:'cyan'});
function storage(initial={}){const map=new Map(Object.entries(initial));return {map,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};}
const failed={getItem(){throw Error('synthetic denied');},setItem(){throw Error('synthetic denied');}};
assert.deepEqual(loadGarage(failed),normalizeGarage(null));assert.equal(saveGarage(failed,{classId:'armored'}),false);
assert.equal(saveGarage(null,{}),false);
assert.deepEqual(loadGarage(storage({cyberRaceGarage:'{bad'})),normalizeGarage(null));
const saved=storage();assert.equal(saveGarage(saved,{classId:'interceptor',paintId:'violet',ignored:true}),true);
assert.deepEqual(loadGarage(saved),{classId:'interceptor',paintId:'violet'});
assert.deepEqual(Object.keys(JSON.parse(saved.getItem('cyberRaceGarage'))),['classId','paintId']);
// A storage API may silently drop writes. Never claim that a choice or paid upgrade survived reload.
const silentStorage={getItem(){return null;},setItem(){}};
// Actual core settings storage must verify persistence, not just a successful call.
const coreContext={localStorage:silentStorage};
vm.runInNewContext(fs.readFileSync(new URL('../src/core/storage.js',import.meta.url),'utf8'),coreContext);
assert.equal(coreContext.CyberRace.core.saveObject('cyberRaceSettings',{sound:false}),false,'silent settings write must fail readback');
coreContext.localStorage=storage();
assert.equal(coreContext.CyberRace.core.saveObject('cyberRaceSettings',{sound:false}),true,'settings write with readback must succeed');
assert.equal(coreContext.CyberRace.core.loadObject('cyberRaceSettings',{sound:true}).sound,false);
coreContext.localStorage=failed;
assert.equal(coreContext.CyberRace.core.saveObject('cyberRaceSettings',{sound:false}),false,'denied settings storage must fail');
assert.equal(saveGarage(silentStorage,{classId:'armored',paintId:'cyan'}),false,'silent garage write must report not persisted');
const silentShop=createTuningStore(silentStorage);
assert.equal(silentShop.purchase('universal','engine').persisted,false,'silent upgrade write must report not persisted');
assert.equal(silentShop.snapshot().levels.universal.engine,1,'tab-only purchase remains active');
assert.equal(createTuningStore(silentStorage).snapshot().levels.universal.engine,0,'reloaded silently denied shop remains stock');

// Two loaded documents must not overwrite each other's successful shop operations.
const tabStorage=storage(),tabA=createTuningStore(tabStorage),tabB=createTuningStore(tabStorage);
assert.equal(tabA.purchase('universal','engine').persisted,true);
assert.equal(tabB.purchase('universal','tires').persisted,true);
assert.deepEqual(loadTuning(tabStorage),{wallet:500,levels:{
  universal:{engine:1,tires:1,armor:0},interceptor:{engine:0,tires:0,armor:0},armored:{engine:0,tires:0,armor:0}
}},'second tab must keep the first purchase and both debits');
assert.equal(tabA.snapshot().wallet,500,'first tab sees external wallet change');
assert.equal(tabB.getBuild('universal').levels.engine,1,'second tab sees external upgrade');
assert.equal(tabA.award(300).persisted,true);
assert.equal(tabB.award(1500).persisted,true);
assert.equal(loadTuning(tabStorage).wallet,2300,'both tabs preserve race credits');
const fundsStorage=storage({cyberRaceTuning:JSON.stringify({wallet:400})});
const spendA=createTuningStore(fundsStorage),spendB=createTuningStore(fundsStorage);
assert.equal(spendA.purchase('universal','engine').ok,true);
assert.equal(spendB.purchase('universal','tires').reason,'funds','stale second tab must not spend the same credits twice');
assert.equal(loadTuning(fundsStorage).wallet,0);
assert.equal(spendB.syncFromStorage(),false,'unchanged external data reports no refresh');
// Malformed legacy JSON must still recover on a fresh purchase; no schema migration.
const corruptTuning=storage({cyberRaceTuning:'{broken'});
const recoveredTuning=createTuningStore(corruptTuning);
assert.equal(recoveredTuning.purchase('universal','engine').persisted,true);
assert.equal(loadTuning(corruptTuning).wallet,800);
const deniedAfterStart=storage(),beforeDenial=createTuningStore(deniedAfterStart);
deniedAfterStart.setItem=()=>{}; // Simulate permission/silent-drop changing during the session.
assert.equal(beforeDenial.purchase('universal','engine').persisted,false);
assert.equal(beforeDenial.syncFromStorage(),false,'tab-only purchases must not be reloaded over');
assert.equal(beforeDenial.snapshot().levels.universal.engine,1);
assert.equal(beforeDenial.award(300).wallet,1100,'tab-only balance remains usable');
console.log('MULTI_TAB_TUNING_SEQUENTIAL_REBASE_PASS purchases, grants, no double spend, malformed and denied storage');

function drive(classId){
  const config=playerConfig(CONFIG,classId);let state={speed:0,speedLat:0,steerAngle:0,heading:0,maxSpeed:config.MAX_SPEED};
  for(let i=0;i<300;i++)state={...state,...stepPlayerDriving(state,{throttle:true},config,1/60)};
  const turn=stepPlayerDriving({...state,speed:20},{steering:1},config,.1);
  return {speed:state.speed,yaw:Math.abs(turn.heading-state.heading)};
}
const stock=drive('universal'),fast=drive('interceptor'),heavy=drive('armored');
assert.ok(fast.speed>stock.speed&&stock.speed>heavy.speed);
assert.ok(fast.yaw>stock.yaw&&stock.yaw>heavy.yaw);
assert.equal(CONFIG.MAX_SPEED,52,'profile calculations must not mutate bot/global balance');

const {createDriftMastery}=require('../src/game/drift-mastery.js');
const source=fs.readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
function extract(name){const start=source.indexOf('    function '+name+'('),end=source.indexOf('\n    }',start);assert.ok(start>=0&&end>start);return source.slice(start,end+6);}
class Vector{
  constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){Object.assign(this,{x,y,z});return this;}
  copy(v){return this.set(v.x,v.y,v.z);}clone(){return new Vector(this.x,this.y,this.z);}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
}
function element(){const attributes={};return {attributes,dataset:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},textContent:'',setAttribute:(name,value)=>{attributes[name]=value;},querySelector:()=>({textContent:''}),closest:()=>element()};}
const model=()=>({group:{position:new Vector(),rotation:{y:0},visible:true},wheels:[],setAppearance(classId,color){this.appearance={classId,color};}});
function fixture(classId){
  const profile=CAR_PROFILES[classId];
  const context={activeChampionship:null,championshipFinishedIds:[],singleRaceFinishedIds:[],singleRaceFinishOrder,singleRaceMode:'classic',SINGLE_RACE_MODES,raceLaps:()=>CONFIG.TOTAL_LAPS,totalLength:5000,raceCountdown:0,rivalGapSample:null,rivalGapDirection:'unknown',drivingAudio:{throttle:0,skid:0,reverse:false},...api,CONFIG:{...CONFIG,NUM_BONUSES:0},window:{},document:{body:element(),getElementById:()=>element()},
    player:{pos:new Vector(),heading:0,speed:0,speedLat:0,steerAngle:0,health:profile.maxHealth,maxHealth:profile.maxHealth,maxSpeed:profile.driving.MAX_SPEED,regenDelay:0,score:0,comboTimer:0,shieldTimer:0,resetCooldown:0,damageCooldown:0,pulseCooldown:0,curLap:0,totalTime:0,prevT:0,wrongWayTimer:0,stuckTimer:0,driftTime:0,nitroTimer:0,speedBoostTimer:0,invincibleTimer:0},
    selectedGarage:{classId,paintId:'red'},activeGarage:{classId,paintId:'red'},activeBuild:normalizeBuild(classId),activeProfile:profile,drivingConfig:playerConfig(CONFIG,classId),
    tuning:createTuningStore(storage()),creditedRaceEvents:new Set(),
    canBenefitFromPickup,selectedRaceContract:'none',raceContractTracker:createRaceContractTracker(),
    sectorTimer:createSectorTimer(),lapGhost:createLapGhostTracker(),lapGhostStore:createLapGhostStore(storage()),currentTrackId:'valley',buildKey,lapGhostRecordResult:null,formatSectorTime,formatSectorDelta,lastSectorNotice:null,
    raceContractNoticeEl:element(),contractGoalAnnounced:false,contractNoticeAt:-Infinity,
    garage:{isOpen:()=>false},gameStarted:true,gameFinished:false,lastRaceWon:false,paused:false,menuOpen:false,keys:{},
    playerCar:model(),playerShieldMesh:{position:new Vector(),rotation:{y:0},material:{}},samples:[new Vector()],tangents:[new Vector(0,0,1)],
    startPerp:new Vector(1,0,0),startGrid:[{t:0,offset:0}],opponents:[],bonusMeshes:[],projectiles:[],
    garageRecords:createGarageRecords(storage()),recordInfoEl:element(),recordStorageNote:element(),
    canControl:()=>true,isGameplayInputBlocked:()=>false,stepPlayerDriving,resolveDrivingInput,touchInput:{},gamepadInput:{},resolveLapCompletion,sweptVehicleContact2D,
    pickupSweepStart:new Vector(),driftMastery:createDriftMastery(),slipstreamTracker:{interrupt(){},reset(){},step(){return null;},view(){return {visible:false,progress:0,rewarded:false};}},overtakeTracker:{interrupt(){},reset(){},contact(){},getSeriesStatus(){return {active:false};}},lastOvertakeNotice:null,segmentSphereHit:require('../src/weapons/geometry.js').segmentSphereHit3D,
    difficulty:()=>({regen:1}),findClosest:()=>({idx:0,t:0,dist:0}),findSafeRespawnIndex:()=>0,
    speedFeedback:{reset(){}},clearHostileProjectilesNear(){},blockGameplayInput(){},beginPlayerDeath(){},
    clearInputs(){},clearBonusRespawnTimers(){},setGameplayCursor(){},clearShockwaves(){},beginCountdown(){},updateUI(){},updateRecordInfo(){},focusGameCanvas(){},
    updateWeaponVis(){},showMessage(){},combatEffects:{clear(){}},skids:{skids:[],pool:[]},minimap:{render(){}},
    damageOverlayTimer:null,damageOverlay:element(),speedVignetteEl:element(),incomingWarningEl:element(),wrongWayEl:element(),hitMarkerEl:element(),comboDisplayEl:element(),finishScreen:element(),finishTitle:element(),finishStats:element(),startScreen:element(),pauseMenu:element(),
    camera:{updateProjectionMatrix(){}},camCur:new Vector(),lookCur:new Vector(),performance:{now:()=>100},nitroFxTimer:0,
    bonusData:{health:{icon:'+',name:'heal',emissive:0}},audio:{play(){}},particles:{spawn(){}},removeBonusAt(index){context.bonusMeshes.splice(index,1);}
  };
  for(const name of ['driftFeedbackEl','driftLabelEl','driftPointsEl','driftProgressEl','speedEl','speedNeedleEl','speedArcEl','lapEl','currTimeEl','bestTimeEl','rocketCountEl','gunAmmoEl','nitroChargesEl','pulseCooldownEl','pulseSlotEl','scoreEl','healthBar','healthTextEl','shieldStatusEl','shieldBarEl','effectNameEl','effectStatusEl','effectRowEl','nitroBar','posEl','raceProgressEl','rivalGapEl','rivalGapLabelEl','rivalGapValueEl','rivalGapTrendEl','overtakeSeriesEl','overtakeMultiplierEl','overtakeNextEl','overtakeTimeEl','overtakeBarEl','overtakeNoticeEl','raceContractHudEl','raceContractTitleEl','raceContractProgressEl','sectorTimingEl','sectorCurrentEl','sectorDeltaEl','sectorDetailEl'])context[name]=element();
  context.healthBar.parentElement=element();Object.assign(context,hud,{getRacePositions:()=>[{who:'player'}],updateTargetHUD(){},renderThreatIndicators(){}});
  vm.createContext(context);
  vm.runInContext(['saveRecords','recordSectorSplit','sectorFinishMarkup','respawnPlayer','awardRaceEvent','completeLap','finishGame','updatePlayer','checkBonuses','resolveMissedMovingContact'].map(extract).join('\n'),context);
  vm.runInContext(extract('updateUI'),context);
  const start=source.indexOf('    window.restartGame=function('),end=source.indexOf('\n    };',start);
  assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end+7),context);
  return context;
}
for(const id of ['universal','interceptor','armored']){
  const c=fixture(id),cap=CAR_PROFILES[id].maxHealth;
  // Actual runtime owner: heal pickup -> manual return -> regeneration -> death/revive.
  c.player.health=cap-10;c.bonusMeshes.push({type:'health',group:{position:new Vector()}});c.checkBonuses();assert.equal(c.player.health,cap,id+' pickup cap');assert.equal(c.bonusMeshes.length,0);
  c.player.health=cap-20;c.player.regenDelay=4;c.respawnPlayer('manual');assert.equal(c.player.health,cap-20,id+' manual reset must not heal');assert.equal(c.player.regenDelay,4);
  c.player.health=cap-.01;c.player.regenDelay=0;c.updatePlayer(.075);assert.equal(c.player.health,cap,id+' regen cap');
  c.player.health=0;c.player.destroyed=true;c.player.deathTimer=.01;c.updatePlayer(.075);assert.equal(c.player.health,cap,id+' revive cap');assert.equal(c.player.destroyed,false);
  c.player.health=cap-1;c.player.lap=3;c.player.curLap=45;c.player.bestLap=Infinity;c.completeLap();assert.equal(c.player.health,cap,id+' lap heal cap');
  c.lastOvertakeNotice={event:{risky:true,points:50,bonusPoints:20},time:8};
  c.window.restartGame();assert.equal(c.lastOvertakeNotice,null,id+' restart clears old pass notice');
  assert.equal(c.overtakeSeriesEl.hidden,true,id+' restart hides inactive pass chain');
  assert.equal(c.player.health,cap,id+' new race health');assert.equal(c.player.maxSpeed,c.drivingConfig.MAX_SPEED);
  c.updateUI();assert.equal(c.healthTextEl.textContent,cap,id+' HUD shows actual HP');assert.equal(c.healthBar.style.width,'100%');assert.equal(c.healthBar.parentElement.attributes['aria-valuemax'],String(cap));
  c.player.health=cap/2;c.updateUI();assert.equal(c.healthTextEl.textContent,cap/2);assert.equal(c.healthBar.style.width,'50%');assert.equal(c.healthBar.parentElement.attributes['aria-valuenow'],String(cap/2));
}

// Extracted live HUD owner must bind the pure gap model without breaking garage/restart.
const hudGap=fixture('universal');
hudGap.player.lap=2;hudGap.player.prevT=0.4;hudGap.player.totalTime=1;
hudGap.opponents=[{id:12,lap:2,t:0.5,finished:false}];
hudGap.getRacePositions=()=>hud.buildRacePositions(hudGap.player,hudGap.opponents);
hudGap.updateUI();
assert.equal(hudGap.rivalGapEl.hidden,false);
assert.equal(hudGap.rivalGapLabelEl.textContent,'ДО 1-ГО');
assert.equal(hudGap.rivalGapValueEl.textContent,'500 м');
hudGap.slipstreamTracker.view=()=>({visible:true,progress:.65,rewarded:false});
hudGap.updateUI();
assert.equal(hudGap.rivalGapEl.dataset.drafting,'true','real HUD exposes slipstream state');
assert.match(hudGap.rivalGapTrendEl.textContent,/ПОТОК 65%/,'HUD shows charging progress');
hudGap.slipstreamTracker.view=()=>({visible:true,progress:1,rewarded:true});
hudGap.updateUI();
assert.match(hudGap.rivalGapTrendEl.textContent,/\+1 НИТРО/,'HUD confirms awarded charge');
hudGap.slipstreamTracker.view=()=>({visible:false,progress:0,rewarded:false});
hudGap.updateUI();
assert.equal(hudGap.rivalGapEl.dataset.drafting,'false','HUD returns to rival distance');
hudGap.opponents[0].t=0.45;hudGap.player.totalTime=2;hudGap.updateUI();
assert.equal(hudGap.rivalGapTrendEl.textContent,'РАЗРЫВ СОКРАЩАЕТСЯ');
hudGap.singleRaceFinishedIds.push('bot:12');hudGap.opponents[0].finished=true;hudGap.updateUI();
assert.equal(hudGap.rivalGapValueEl.textContent,'ФИНИШ');
assert.match(hudGap.rivalGapTrendEl.textContent,/ФИНИШИРОВАЛ/);
hudGap.overtakeTracker.getSeriesStatus=time=>({active:time<12,combo:1,secondsLeft:12-time,windowSeconds:12,nextPoints:60});
hudGap.player.totalTime=3;
hudGap.lastOvertakeNotice={event:{risky:true,points:50,combo:1,bonusPoints:20},time:3};
hudGap.updateUI();
assert.equal(hudGap.overtakeSeriesEl.hidden,false,'actual runtime HUD must reveal active overtake chain');
assert.equal(hudGap.overtakeMultiplierEl.textContent,'×1');
assert.equal(hudGap.overtakeNextEl.textContent,'+60 очков');
assert.equal(hudGap.overtakeTimeEl.textContent,'9 с');
assert.match(hudGap.overtakeNoticeEl.textContent,/РИСКОВАННЫЙ/);
hudGap.player.totalTime=13;hudGap.updateUI();
assert.equal(hudGap.overtakeSeriesEl.hidden,true,'expired series must hide without timers');
assert.equal(hudGap.overtakeNoticeEl.hidden,true,'stale notification must not linger');
console.log('OVERTAKE_ACTUAL_HUD_OWNER_PASS active, next reward, expiry and dedicated notice');

// High-speed contact is swept: the centre can cross a pickup without ending within its radius.
const sweepPickup=fixture('universal');
sweepPickup.player.health=40;sweepPickup.player.pos.set(4,0,5.5);
sweepPickup.pickupSweepStart.set(-4,0,5.5);
sweepPickup.bonusMeshes.push({type:'health',group:{position:new Vector(0,2.2,0)}});
sweepPickup.checkBonuses();
assert.equal(sweepPickup.player.health,80,'swept player path must collect a crossed pickup');
assert.equal(sweepPickup.bonusMeshes.length,0,'crossed pickup removed exactly once');
const missPickup=fixture('universal');
missPickup.player.health=40;missPickup.player.pos.set(4,0,12);missPickup.pickupSweepStart.set(-4,0,12);
missPickup.bonusMeshes.push({type:'health',group:{position:new Vector(0,2.2,0)}});
missPickup.checkBonuses();assert.equal(missPickup.player.health,40,'nearby lane must not collect a missed pickup');

// The real runtime player owner must advance the same simulated time as the AI at
// 10/15/30/60/144 FPS. It calls the existing 120 Hz-substepped driving function.
const frameResults=new Map();
for(const fps of [10,15,30,60,144]){
  const c=fixture('universal');
  c.keys.KeyW=true;
  for(let frame=0;frame<fps*2;frame++)c.updatePlayer(1/fps);
  assert.ok(Math.abs(c.player.curLap-2)<1e-8,
    'player clock loses time compared with AI at '+fps+' FPS: '+c.player.curLap);
  assert.ok(Math.abs(c.player.totalTime-2)<1e-8,
    'player race time loses time at '+fps+' FPS');
  frameResults.set(fps,{distance:c.player.pos.z,speed:c.player.speed});
}
const baseline60=frameResults.get(60);
for(const [fps,result] of frameResults){
  assert.ok(Math.abs(result.speed-baseline60.speed)<0.25,'speed diverges by FPS: '+fps);
  assert.ok(Math.abs(result.distance-baseline60.distance)<0.5,'travel distance diverges by FPS: '+fps);
}

// A lethal car-to-car collision beside the finish must not make the destroyed
// vehicle visible again or award a fictitious finish in the same frame.
const collision=fixture('universal');
collision.player.health=.03;collision.player.regenDelay=100;collision.player.invincibleTimer=0;
collision.player.lap=CONFIG.TOTAL_LAPS;collision.player.curLap=10;
collision.player.bestLap=Infinity;collision.player.prevT=.8;collision.player.crossedHalf=true;
collision.findClosest=()=>({idx:0,t:.01,dist:0});
collision.trackCurve={getTangentAt:()=>({x:0,z:1,normalize(){return this;}})};
collision.opponents=[{dead:false,health:100,invincibleTimer:1,t:.9,bumpVelocity:0,
  contactFxCooldown:0,car:{group:{position:new Vector(1,0,0)}}}];
collision.applyPlayerDamage=amount=>{collision.player.health=Math.max(0,collision.player.health-amount);return true;};
collision.beginPlayerDeath=()=>{
  collision.player.destroyed=true;collision.player.health=0;collision.playerCar.group.visible=false;
};
collision.updatePlayer(.1);
assert.equal(collision.player.destroyed,true,'car collision causes death');
assert.equal(collision.playerCar.group.visible,false,'dead car must stay hidden until respawn');
assert.equal(collision.gameFinished,false,'a lethal collision cannot award an immediate finish');
assert.equal(collision.player.lap,CONFIG.TOTAL_LAPS,'death cannot advance lap');

// RED regression: 100 m/s player and 80 m/s opponent cross within 0.1s, yet
// neither discrete endpoint sample overlaps the 7.6m contact radius.
assert.equal(sweptVehicleContact2D({x:-9,z:0},{x:1,z:0},{x:8.7,z:0},{x:.7,z:0},7.6),true,'relative contact inside frame');
assert.equal(sweptVehicleContact2D({x:-9,z:0},{x:1,z:0},{x:8.7,z:20},{x:.7,z:20},7.6),false,'parallel missed lane');
assert.equal(sweptVehicleContact2D({x:0,z:0},{x:0,z:0},{x:20,z:0},{x:20,z:0},7.6),false,'static separated cars');
const crossing=fixture('universal');
crossing.player.pos.set(-9,0,0);crossing.player.heading=Math.PI/2;
crossing.player.speed=100;crossing.player.maxSpeed=110; // equivalent high-speed boosted state in synthetic owner
crossing.player.regenDelay=100;crossing.player.health=100;
crossing.trackCurve={getTangentAt:()=>({x:0,z:1,normalize(){return this;}})};
const fastBot={dead:false,health:100,invincibleTimer:0,t:.5,bumpVelocity:0,contactFxCooldown:0,
  car:{group:{position:new Vector(8.7,0,0)}}};
crossing.opponents=[fastBot];
let crossingHits=0;
crossing.applyPlayerDamage=amount=>{crossingHits++;crossing.player.health-=amount;return true;};
crossing.updatePlayer(.1);
assert.ok(crossing.player.pos.x>0&&crossing.player.pos.x<1.3,'player advances 10m in 0.1s');
const oldBotPosition={x:8.7,z:0};
fastBot.car.group.position.set(.7,0,0); // AI moved 8m in the same frame.
crossing.resolveMissedMovingContact(fastBot,oldBotPosition,.1); // called by the real AI owner after movement
crossing.updatePlayer(.1);
assert.ok(crossingHits>0,'GREEN: fast moving AI crosses player path between frame samples and causes contact');


// Independent negative control: the actual legacy respawn expression fails armored health.
const broken=fixture('armored');
const respawnOwner=extract('respawnPlayer'),needle='respawnHealth(previousHealth,player.maxHealth,revive)';assert.ok(respawnOwner.includes(needle));
vm.runInContext(respawnOwner.replace(needle,'revive?100:Math.max(1,previousHealth)'),broken);
broken.respawnPlayer('revive');assert.equal(broken.player.health,100);assert.notEqual(broken.player.health,140);

// Race identity survives a future menu choice. Restart must save the old class first.
const legacy='{"bestLap":50,"highScore":900,"bestTotal":800}';
const recordStorage=storage({cyberRaceRecords:legacy,cyberRaceSettings:'{"difficulty":"hard"}'});
const c=fixture('interceptor');c.garageRecords=createGarageRecords(recordStorage);
c.player.bestLap=45;c.player.score=120;c.player.totalTime=700;c.gameFinished=true;c.lastRaceWon=true;
c.selectedGarage={classId:'armored',paintId:'cyan'};c.window.restartGame();
assert.equal(c.garageRecords.get('interceptor').bestLap,45);assert.equal(c.garageRecords.get('interceptor').bestTotal,700);
assert.equal(c.garageRecords.get('armored').bestLap,Infinity);assert.equal(c.activeGarage.classId,'armored');assert.equal(c.player.health,140);
assert.equal(recordStorage.getItem('cyberRaceRecords'),legacy);assert.equal(recordStorage.getItem('cyberRaceSettings'),'{"difficulty":"hard"}');
c.player.bestLap=60;c.player.score=80;c.saveRecords();assert.equal(c.garageRecords.get('armored').bestLap,60);
const loaded=createGarageRecords(recordStorage);assert.equal(loaded.get('interceptor').bestLap,45);assert.equal(loaded.get('universal').highScore,900);
assert.equal(createGarageRecords(failed).save('armored',{score:10}),false);
const recordFailure=fixture('universal');
recordFailure.garageRecords=createGarageRecords(silentStorage);
recordFailure.player.score=350;
assert.equal(recordFailure.saveRecords(),false,'unpersisted records must report failure');
assert.equal(recordFailure.recordStorageNote.hidden,false,'failed record save shows warning');
assert.equal(recordFailure.garageRecords.get('universal').highScore,350,'current tab keeps earned score');
assert.equal(createGarageRecords(silentStorage).get('universal').highScore,0,'reload does not falsely claim persisted score');
const recordSuccess=fixture('universal');
recordSuccess.player.score=350;
assert.equal(recordSuccess.saveRecords(),true);
assert.equal(recordSuccess.recordStorageNote.hidden,true,'successful record readback hides warning');
// Known-bad selection ownership would contaminate armored records with the 45s lap.
const wrong=fixture('interceptor');wrong.selectedGarage={classId:'armored',paintId:'red'};wrong.player.bestLap=45;wrong.player.score=120;
vm.runInContext(extract('saveRecords').replace('garageRecords.save(activeBuild','garageRecords.save(selectedGarage.classId'),wrong);wrong.saveRecords();
assert.equal(wrong.garageRecords.get('armored').bestLap,45);assert.equal(wrong.garageRecords.get('interceptor').bestLap,Infinity);
// Rev2 tuning: finite normalized wallet, allowlisted levels, price steps, shared currency.
const badInputs=[null,[],false,{wallet:-1,levels:{universal:{engine:Infinity,tires:-1,armor:4}}},
  {wallet:'9999',levels:{universal:{engine:'3'},__proto__:{armor:3}}}];
for(const value of badInputs){
  const normalized=normalizeTuning(value);
  assert.equal(normalized.wallet,1200);
  assert.deepEqual(normalized.levels.universal,{engine:0,tires:0,armor:0});
  assert.equal(Object.keys(normalized.levels).length,3);
}
const contractWallet=createTuningStore(storage());
assert.equal(contractWallet.award(200).wallet,1400,'allowlisted contract credit persists');
assert.equal(contractWallet.award(100).wallet,1500,'allowlisted Blitz victory credit persists');
assert.equal(contractWallet.award(99).ok,false,'arbitrary near-allowlist credits remain rejected');
assert.equal(contractWallet.award(250).ok,false,'arbitrary credits remain rejected');
const shopStorage=storage(),shop=createTuningStore(shopStorage);
assert.equal(shop.snapshot().wallet,1200);
assert.equal(shop.purchase('universal','engine').price,400);
assert.equal(shop.snapshot().wallet,800);
assert.equal(shop.purchase('interceptor','engine').price,400);
assert.equal(shop.snapshot().wallet,400);
assert.equal(shop.getBuild('armored').levels.engine,0,'class levels are independent');
assert.equal(shop.purchase('universal','engine').reason,'funds');
assert.equal(shop.purchase('armored','not-a-slot').reason,'invalid');
assert.equal(shop.purchase('__proto__','engine').reason,'invalid');
assert.equal(shop.snapshot().wallet,400,'rejected transactions do not debit');
assert.equal(shop.award(-500).ok,false);
assert.equal(shop.award(1500).persisted,true);
assert.equal(shop.purchase('universal','engine').price,800);
assert.equal(shop.award(300).ok,true);
assert.equal(shop.purchase('universal','engine').price,1400);
assert.equal(shop.getBuild('universal').levels.engine,3);
assert.equal(shop.purchase('universal','engine').reason,'max');
assert.equal(shop.snapshot().wallet,0,'level 3 pricing charged exactly once');
assert.deepEqual(loadTuning(shopStorage),shop.snapshot(),'reload restores all classes and wallet');
assert.equal(createTuningStore(failed).purchase('universal','engine').persisted,false);
const memoryOnly=createTuningStore(failed);assert.equal(memoryOnly.canPersist(),false);
memoryOnly.purchase('universal','tires');memoryOnly.award(300);
assert.equal(memoryOnly.snapshot().wallet,1200,'denied storage retains purchases and earned credits in tab');
assert.equal(loadTuning(failed).wallet,1200);

// Tuned active profile is real: acceleration, grip, steering, health and every heal boundary.
const tuned=fixture('armored');
assert.equal(tuned.tuning.purchase('armored','armor').ok,true);
assert.equal(tuned.tuning.purchase('armored','tires').ok,true);
assert.equal(tuned.player.maxHealth,140,'purchase must not affect the active race');
assert.equal(tuned.activeBuild.levels.armor,0);
tuned.window.restartGame();
assert.equal(tuned.activeBuild.levels.armor,1);
assert.equal(tuned.activeProfile.maxHealth,161);
assert.equal(tuned.player.health,161);
assert.ok(tuned.drivingConfig.STEER_RESPONSE>CONFIG.STEER_RESPONSE*.8);
assert.ok(tuned.drivingConfig.GRIP<CONFIG.GRIP);
tuned.player.health=151;
tuned.bonusMeshes.push({type:'health',group:{position:new Vector()}});
tuned.checkBonuses();assert.equal(tuned.player.health,161);
tuned.player.health=150;tuned.player.regenDelay=0;tuned.updatePlayer(.075);
assert.ok(tuned.player.health<=161);
tuned.respawnPlayer('revive');assert.equal(tuned.player.health,161);
tuned.updateUI();assert.equal(tuned.healthBar.parentElement.attributes['aria-valuemax'],'161');
const level1=tuned.activeBuild;
tuned.tuning.award(1500);tuned.tuning.purchase('armored','armor');
assert.equal(tuned.activeProfile.maxHealth,161,'subsequent purchases do not alter active build');
tuned.player.bestLap=34;tuned.player.score=555;tuned.saveRecords();
assert.equal(tuned.garageRecords.get(level1).bestLap,34);
assert.equal(tuned.garageRecords.get(tuned.tuning.getBuild('armored')).bestLap,Infinity,'pending build cannot steal records');
tuned.window.restartGame();assert.equal(tuned.player.maxHealth,182);
assert.equal(tuned.garageRecords.get(level1).bestLap,34);

// Tire upgrade actually damps lateral slip; handbrake drift is not removed.
const first=stepPlayerDriving({speed:25,speedLat:8,steerAngle:.1,heading:0,maxSpeed:50},{steering:1},CONFIG,.1);
const tireCfg=playerConfig(CONFIG,{classId:'universal',levels:{tires:3}});
const grippy=stepPlayerDriving({speed:25,speedLat:8,steerAngle:.1,heading:0,maxSpeed:50},{steering:1},tireCfg,.1);
assert.ok(Math.abs(grippy.speedLat)<Math.abs(first.speedLat));
assert.ok(Math.abs(grippy.steerAngle)>Math.abs(first.steerAngle));
const drift=stepPlayerDriving({speed:25,speedLat:0,steerAngle:.2,heading:0,maxSpeed:50},{steering:1,handbrake:true},tireCfg,.1);
assert.equal(drift.drifting,true);
assert.equal(tireCfg.DRIFT_GRIP,CONFIG.DRIFT_GRIP);
const allEngine=buildProfile({classId:'universal',levels:{engine:3,armor:3}});
assert.equal(allEngine.maxHealth,145);
assert.ok(Math.abs(allEngine.driving.MAX_SPEED/52-1.09)<1e-8);
assert.ok(Math.abs(allEngine.driving.ACCEL/36-1.21)<1e-8);
assert.equal(hud.speedometerReading(125).kmh,450,'digital readout is not clipped to 400');

// Race owners, duplicate callbacks, reload and stock/tuned record isolation.
const earnings=fixture('universal');
earnings.completeLap();assert.equal(earnings.tuning.snapshot().wallet,1200,'no instant lap reward at zero elapsed lap time');
earnings.player.curLap=40;earnings.completeLap();
assert.equal(earnings.tuning.snapshot().wallet,1500);
earnings.completeLap();assert.equal(earnings.tuning.snapshot().wallet,1500,'duplicate completion is ignored');
earnings.saveRecords();assert.equal(earnings.tuning.snapshot().wallet,1500,'saveRecords does not grant credits');
earnings.finishGame(false);earnings.finishGame(true);
assert.equal(earnings.tuning.snapshot().wallet,1500,'defeat and duplicate finish cannot grant victory');
earnings.window.restartGame();assert.equal(earnings.tuning.snapshot().wallet,1500,'restart cannot grant credits');
earnings.player.lap=CONFIG.TOTAL_LAPS;earnings.player.curLap=50;earnings.completeLap();
assert.equal(earnings.tuning.snapshot().wallet,3300,'last lap and victory each grant exactly once');
earnings.completeLap();earnings.finishGame(true);earnings.saveRecords();
assert.equal(earnings.tuning.snapshot().wallet,3300,'final duplicate events do not pay again');

// Standalone formats must have separate records, but share the original garage.
assert.equal(SINGLE_RACE_MODES.classic.laps,CONFIG.TOTAL_LAPS);
assert.equal(SINGLE_RACE_MODES.sprint.laps,3);
assert.equal(SINGLE_RACE_MODES.blitz.laps,1,'quick race must finish after one real lap');
assert.equal(SINGLE_RACE_MODES.blitz.lapCredits,300);
assert.equal(SINGLE_RACE_MODES.blitz.victoryCredits,100,'one-lap prize balances existing 400 credits per lap');
assert.notEqual(SINGLE_RACE_MODES.blitz.recordVersion,SINGLE_RACE_MODES.sprint.recordVersion);
assert.notEqual(SINGLE_RACE_MODES.blitz.recordVersion,SINGLE_RACE_MODES.classic.recordVersion);
assert.equal(SINGLE_RACE_MODES.classic.lapCredits,SINGLE_RACE_MODES.sprint.lapCredits);
assert.equal(SINGLE_RACE_MODES.classic.victoryCredits,5*SINGLE_RACE_MODES.sprint.victoryCredits);
assert.notEqual(SINGLE_RACE_MODES.classic.recordVersion,SINGLE_RACE_MODES.sprint.recordVersion);
const modeContext={activeChampionship:null,singleRaceMode:'classic',SINGLE_RACE_MODES,
  CHAMPIONSHIP_STAGES:require('../src/game/championship.js').CHAMPIONSHIP_STAGES};
vm.createContext(modeContext);
const modeFn=source.match(/    function raceLaps\(\)\{[^\n]+\}/)?.[0];
assert.ok(modeFn,'actual raceLaps owner must be testable');
vm.runInContext(modeFn,modeContext);
assert.equal(modeContext.raceLaps(),15);
modeContext.singleRaceMode='sprint';assert.equal(modeContext.raceLaps(),3);
modeContext.singleRaceMode='blitz';assert.equal(modeContext.raceLaps(),1);
modeContext.activeChampionship={stageIndex:2};
assert.equal(modeContext.raceLaps(),5,'championship stage wins over menu selection');
const modeStorage=storage();
const classicRecords=createGarageRecords(modeStorage,SINGLE_RACE_MODES.classic.recordVersion);
classicRecords.save('universal',{bestLap:90,score:500,totalTime:1200,won:true,finished:true});
const sprintRun=fixture('universal');
sprintRun.singleRaceMode='sprint';
sprintRun.raceLaps=()=>3;
sprintRun.garageRecords=createGarageRecords(modeStorage,SINGLE_RACE_MODES.sprint.recordVersion);
sprintRun.player.lap=3;sprintRun.player.curLap=39;sprintRun.player.bestLap=42;
// This isolated finish fixture has no simulated driving frames: provide a
// completed valid sector result to exercise the real best-lap update branch.
sprintRun.sectorTimer.snapshot=()=>({lastCompleted:{lap:3,times:[12,13,14],deltas:[null,null,null]}});
sprintRun.lapGhost.beginLap(3,{x:0,z:0,heading:0});
for(let t=1;t<39;t++)sprintRun.lapGhost.record({lap:3,elapsed:t,x:t,z:0,heading:0});
sprintRun.player.pos.x=39;
sprintRun.player.totalTime=180;sprintRun.player.score=210;sprintRun.completeLap();
assert.equal(sprintRun.lapGhost.snapshot().bestTime,39,'actual completeLap owner commits valid ghost route');
assert.equal(sprintRun.gameFinished,true,'third sprint lap finishes the race');
assert.match(sprintRun.finishStats.innerHTML,/3\/3/,'sprint finish displays 3/3');
assert.match(sprintRun.finishStats.innerHTML,/победа \+300/,'sprint finish shows its smaller victory reward');
assert.equal(sprintRun.tuning.snapshot().wallet,1800,'last sprint lap and win credit exactly once');
sprintRun.completeLap();sprintRun.finishGame(true);
assert.equal(sprintRun.tuning.snapshot().wallet,1800,'duplicate sprint finish never mints credits');
sprintRun.singleRaceFinishedIds=['bot:1'];sprintRun.window.restartGame();
assert.deepEqual(Array.from(sprintRun.singleRaceFinishedIds),[],'restart must reset finished opponents');
// Single-race places are determined by crossing order, not current bot array order.
const grid=Array.from({length:6},(_,id)=>({id,lap:3,t:.1+id*.08}));
assert.deepEqual(singleRaceFinishOrder(grid,['bot:4','bot:1','bot:4','bot:99']),
  ['bot:4','bot:1','player','bot:5','bot:3','bot:2','bot:0'],'finished order, unique IDs, then distance');
assert.deepEqual(singleRaceFinishOrder(grid,[]),
  ['player','bot:5','bot:4','bot:3','bot:2','bot:1','bot:0'],'no finishers means player first');
const tiedGrid=grid.map(o=>({...o,lap:2,t:.5}));
assert.deepEqual(singleRaceFinishOrder(tiedGrid,[]),['player','bot:0','bot:1','bot:2','bot:3','bot:4','bot:5'],
  'unfinished equal progress uses stable numeric ID ordering');
for(const [place,mode] of [[1,'sprint'],[2,'sprint'],[7,'classic']]){
  const run=fixture('universal');
  run.singleRaceMode=mode;run.raceLaps=()=>SINGLE_RACE_MODES[mode].laps;
  run.player.lap=run.raceLaps();run.player.curLap=40;run.player.totalTime=500;run.player.bestLap=45;
  run.opponents=grid;run.singleRaceFinishedIds=Array.from({length:place-1},(_,id)=>'bot:'+id);
  run.completeLap();
  const won=place===1,expectedCredits=1500+(won?SINGLE_RACE_MODES[mode].victoryCredits:0);
  assert.equal(run.gameFinished,true,'finishing is always allowed for place '+place);
  assert.equal(run.lastRaceWon,won,'only first place counts as victory');
  assert.match(run.finishStats.innerHTML,new RegExp('Позиция: <b>'+place+'/7</b>'),'accurate 1–7 finish place');
  assert.match(run.finishTitle.textContent,won?/ПОБЕДА/:/ФИНИШ/,'non-winners see a finish, not an early defeat');
  assert.equal(run.tuning.snapshot().wallet,expectedCredits,'only winning place earns bonus');
  assert.equal(run.garageRecords.get('universal').bestTotal,won?500:Infinity,
    'non-winners must not overwrite best victorious race time');
  run.finishGame(true);run.completeLap();
  assert.equal(run.tuning.snapshot().wallet,expectedCredits,'duplicate finish cannot award twice');
}
console.log('SINGLE_RACE_FINISH_POSITIONS_PASS first/second/seventh, payout and duplicate guards');
// Actual runtime finish owner: optional contracts add credits exactly once
// and do not replace ordinary victory/lap rewards.
for(const [id,place,kills,pickups,bonus] of [
  ['hunter',1,2,0,200],['collector',1,0,3,200],
  ['podium',3,0,0,200],['podium',4,0,0,0],['hunter',1,1,0,0]
]){
  const run=fixture('universal');
  run.selectedRaceContract=id;run.window.restartGame();
  assert.equal(run.raceContractTracker.status({kills:2})?.id,id,'restart selects '+id);
  run.singleRaceMode='sprint';run.raceLaps=()=>3;
  run.player.lap=3;run.player.curLap=40;run.player.totalTime=500;run.player.kills=kills;
  run.opponents=grid;run.singleRaceFinishedIds=Array.from({length:place-1},(_,index)=>'bot:'+index);
  for(let i=0;i<pickups;i++)run.raceContractTracker.recordUsefulPickup();
  const before=run.tuning.snapshot().wallet;
  run.completeLap();
  const expected=before+300+(place===1?300:0)+bonus;
  assert.equal(run.tuning.snapshot().wallet,expected,id+' '+place+' contract reward');
  assert.equal(run.finishStats.innerHTML.includes('+'+200+' кредитов'),bonus===200,id+' finish contract row');
  run.finishGame(true);
  assert.equal(run.tuning.snapshot().wallet,expected,id+' anti-double-pay');
}
console.log('RACE_CONTRACT_ACTUAL_FINISH_OWNER_PASS hunter, collector, podium, incomplete and duplicate');
// Blitz uses the same actual restart/finish/credit owners with shorter targets.
for(const [id,kills,pickups,bonus] of [
  ['hunter',1,0,200],['collector',0,2,200],['hunter',0,0,0],['collector',0,1,0]
]){
  const run=fixture('universal');
  run.singleRaceMode='blitz';run.raceLaps=()=>1;
  run.selectedRaceContract=id;run.window.restartGame();
  assert.equal(run.raceContractTracker.status().target,id==='hunter'?1:2,'Blitz target applied by runtime restart');
  run.player.lap=1;run.player.curLap=88;run.player.totalTime=88;run.player.kills=kills;
  run.opponents=grid;
  for(let i=0;i<pickups;i++)run.raceContractTracker.recordUsefulPickup();
  const before=run.tuning.snapshot().wallet;
  run.completeLap();
  const expected=before+300+100+bonus;
  assert.equal(run.tuning.snapshot().wallet,expected,id+' Blitz exact total and one-time contract reward');
  assert.equal(run.finishStats.innerHTML.includes('+200 кредитов'),bonus===200,'Blitz finish contract row');
  run.finishGame(true);run.completeLap();
  assert.equal(run.tuning.snapshot().wallet,expected,id+' Blitz repeat does not grant again');
}
console.log('BLITZ_CONTRACT_ACTUAL_FINISH_PASS 1 kill / 2 useful pickups, incomplete/duplicate guarded');
// One-lap Blitz must finish at the first real crossing, pay once and keep
// its own records without mutating the existing Sprint/Classic record stores.
const blitzRun=fixture('universal');
blitzRun.singleRaceMode='blitz';blitzRun.raceLaps=()=>1;
blitzRun.garageRecords=createGarageRecords(modeStorage,SINGLE_RACE_MODES.blitz.recordVersion);
blitzRun.player.lap=1;blitzRun.player.curLap=88;blitzRun.player.totalTime=88;
blitzRun.sectorTimer.snapshot=()=>({lastCompleted:{lap:1,times:[25,30,33],deltas:[null,null,null]}});
blitzRun.completeLap();
assert.equal(blitzRun.gameFinished,true,'first completed Blitz lap ends the race');
assert.match(blitzRun.finishStats.innerHTML,/1\/1/,'Blitz finish shows 1/1');
assert.match(blitzRun.finishStats.innerHTML,/победа \+100/,'Blitz win displays 100 credits');
assert.equal(blitzRun.tuning.snapshot().wallet,1600,'300 lap + 100 win once');
assert.equal(blitzRun.garageRecords.get('universal').bestLap,88);
assert.equal(blitzRun.garageRecords.get('universal').bestTotal,88);
blitzRun.completeLap();blitzRun.finishGame(true);
assert.equal(blitzRun.tuning.snapshot().wallet,1600,'duplicate Blitz finish cannot award twice');
blitzRun.window.restartGame();
assert.equal(blitzRun.player.lap,1,'Blitz replay starts from the first lap');
assert.equal(blitzRun.gameFinished,false,'Blitz replay is playable');
const reloadedBlitz=createGarageRecords(modeStorage,SINGLE_RACE_MODES.blitz.recordVersion);
assert.equal(reloadedBlitz.get('universal').bestTotal,88,'Blitz record persisted independently');
const reloadedSprint=createGarageRecords(modeStorage,SINGLE_RACE_MODES.sprint.recordVersion);
const reloadedClassic=createGarageRecords(modeStorage,SINGLE_RACE_MODES.classic.recordVersion);
assert.equal(reloadedSprint.get('universal').bestLap,39);
assert.equal(reloadedSprint.get('universal').highScore,260,'third lap awards 50 score');
assert.equal(reloadedSprint.get('universal').bestTotal,180);
assert.equal(reloadedClassic.get('universal').bestLap,90,'classic lap record intact');
assert.equal(reloadedClassic.get('universal').highScore,500,'classic score intact');
assert.equal(reloadedClassic.get('universal').bestTotal,1200,'classic total time intact');
assert.equal(reloadedSprint.get('interceptor').bestLap,Infinity,'different build stays separate');
console.log('SPRINT_RULES_AND_RECORDS_PASS 3/15 laps, championship isolation, 300+300 credits, reload');

// Real menu owner must point to the correct store, reject unknown modes and
// ignore attempts to switch an already active session.
const switchContext={gameStarted:false,singleRaceMode:'classic',SINGLE_RACE_MODES,
  raceRecordsByMode:{classic:classicRecords,sprint:reloadedSprint,blitz:reloadedBlitz},garageRecords:classicRecords,
  recordStorageNote:{hidden:false},uiSync:0,recordSync:0,
  syncRaceModeUI(){switchContext.uiSync++;},updateRecordInfo(){switchContext.recordSync++;}};
vm.createContext(switchContext);
vm.runInContext(extract('selectSingleRaceMode'),switchContext);
switchContext.selectSingleRaceMode('sprint');
assert.equal(switchContext.singleRaceMode,'sprint');
assert.equal(switchContext.garageRecords,reloadedSprint,'sprint uses its own record owner');
assert.equal(switchContext.recordStorageNote.hidden,true);
switchContext.selectSingleRaceMode('__proto__');
assert.equal(switchContext.singleRaceMode,'sprint','invalid prototype-name mode rejected');
switchContext.gameStarted=true;switchContext.selectSingleRaceMode('classic');
assert.equal(switchContext.singleRaceMode,'sprint','active race cannot switch mode');
switchContext.gameStarted=false;switchContext.selectSingleRaceMode('blitz');
assert.equal(switchContext.garageRecords,reloadedBlitz,'Blitz points to its own record owner');
switchContext.selectSingleRaceMode('classic');
assert.equal(switchContext.garageRecords,classicRecords,'classic reuses old record owner');
assert.equal(switchContext.uiSync,3);assert.equal(switchContext.recordSync,3);
console.log('MODE_SWITCH_GUARDS_PASS active race and invalid mode guarded');

const separateStorage=storage({cyberRaceRecords:legacy,cyberRaceSettings:'{"difficulty":"hard"}'});
const separate=createGarageRecords(separateStorage);
const race={bestLap:40,score:500,totalTime:500,finished:true,won:true};
const b1={classId:'universal',levels:{engine:1}};
const b2={classId:'universal',levels:{engine:2}};
const b3={classId:'armored',levels:{tires:1}};
separate.save(b1,race);separate.save(b2,{...race,bestLap:38});separate.save(b3,{...race,bestLap:42});
assert.equal(separate.get(b1).bestLap,40);
assert.equal(separate.get(b2).bestLap,38);
assert.equal(separate.get(b3).bestLap,42);
assert.equal(separate.get('universal').bestLap,50,'legacy stock untouched');
assert.equal(separateStorage.getItem('cyberRaceRecords'),legacy);
assert.equal(separateStorage.getItem('cyberRaceSettings'),'{"difficulty":"hard"}');
assert.equal(createGarageRecords(separateStorage).get(b2).bestLap,38,'build record survives reload');
assert.match(buildLabel(b1),/Д1/);
assert.notEqual(buildKey(b1),buildKey(b2));
const forged=storage({cyberRaceBuildRecords:JSON.stringify({'universal:9-9-9':{bestLap:1},'universal:1-0-0':{bestLap:-4,highScore:Infinity}})});
assert.equal(createGarageRecords(forged).get(b1).bestLap,Infinity,'malformed times normalized');
const savedWallet=shop.snapshot().wallet;
const capped=createTuningStore(storage({cyberRaceTuning:JSON.stringify({wallet:10000000})}));
capped.award(1500);assert.equal(capped.snapshot().wallet,10000000);

// Actual shooting owners must use the model muzzle, including its world-space Y.
// A fixed car-centre offset is deliberately distinguishable from these sentinels.
class ShotVector {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new ShotVector(this.x,this.y,this.z);}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
  addScaledVector(v,k){this.x+=v.x*k;this.y+=v.y*k;this.z+=v.z*k;return this;}
  multiplyScalar(k){this.x*=k;this.y*=k;this.z*=k;return this;}
  normalize(){const n=Math.hypot(this.x,this.y,this.z)||1;this.x/=n;this.y/=n;this.z/=n;return this;}
  setY(y){this.y=y;return this;}
}
function shotHarness(code,heading){
  const origins={gun:new ShotVector(71,3.2,-18),rocket:new ShotVector(69,3.8,-19)},calls=[];
  const mesh=()=>({position:{copy(p){this.x=p.x;this.y=p.y;this.z=p.z;}},lookAt(){}});
  const c=vm.createContext({THREE:{Vector3:ShotVector},CONFIG:{MAX_PROJECTILES:20,PLAYER_ROCKET_SPEED:155,PLAYER_ROCKET_LIFE:3.2},
    player:{gunAmmo:2,rockets:2,heading,pos:new ShotVector(20,0,30)},projectiles:[],
    playerCar:{getMuzzle(rocket){calls.push(rocket);return origins[rocket?'rocket':'gun'].clone();}},
    createBulletMesh:mesh,createRocketMesh:mesh,acquirePlayerRocketTarget:()=>null,scene:{add(){}},updateWeaponVis(){},audio:{play(){}},combatEffects:{muzzle(){}},showMessage(){}});
  vm.runInContext(code,c);return {c,origins,calls};
}
function assertGunOrigin(code){
  for(const heading of [0,.8,2.4]){const {c,origins,calls}=shotHarness(code,heading);c.fireGun();const p=c.projectiles[0].mesh.position;assert.deepEqual([p.x,p.y,p.z],[origins.gun.x,origins.gun.y,origins.gun.z]);assert.deepEqual(calls,[false]);}
}
assertGunOrigin(extract('fireGun'));
assert.throws(()=>assertGunOrigin(extract('fireGun').replace('playerCar.getMuzzle(false)','player.pos.clone().add(new THREE.Vector3(dx*3,1.0,dz*3))')),'negative control detects old below-roof origin');
for(const heading of [0,.8,2.4]){const {c,origins,calls}=shotHarness(extract('fireRocket'),heading);c.fireRocket();const p=c.projectiles[0].mesh.position;assert.ok(Math.abs(p.x-origins.rocket.x-Math.sin(heading)*.9)<1e-10);assert.equal(p.y,origins.rocket.y);assert.ok(Math.abs(p.z-origins.rocket.z-Math.cos(heading)*.9)<1e-10);assert.deepEqual(calls,[true]);}

// Actual shooting owner must preserve 12.5 shots/s regardless of render FPS (0.08s cadence).
function firedInTenSeconds(fps){
  let shots=0;
  const c=vm.createContext({gunFireTimer:0,mouseLeft:true,mouseRight:false,rocketFired:false,
    player:{gunAmmo:1000,rockets:0},canAcceptGameplayInput:()=>true,
    fireGun(){shots++;},fireRocket(){throw Error('no rocket input');}});
  vm.runInContext(extract('handleShooting'),c);
  for(let frame=0;frame<fps*10;frame++)c.handleShooting(1/fps);
  c.mouseLeft=false;c.handleShooting(1/fps);
  assert.equal(c.gunFireTimer,0,'release must discard firing debt');
  return shots;
}
const gunShots=[10,15,30,60,144].map(firedInTenSeconds);
for(const shots of gunShots)assert.ok(Math.abs(shots-125)<=2,'gun rate should be frame-independent: '+JSON.stringify(gunShots));
console.log('FRAME_INDEPENDENT_FIRE_TEST '+JSON.stringify(gunShots));
// Regression: exercise actual updatePlayer + applyPlayerDamage, not just an arithmetic model.
function actualContactDamage(fps){
  const c=fixture('universal');
  c.player.health=100;c.player.regenDelay=100;c.player.invincibleTimer=0;
  c.difficulty=()=>({regen:1,botDamage:1});
  c.flashDamage=()=>{};c.addCameraShake=()=>{};
  c.trackCurve={getTangentAt:()=>({x:0,z:1,normalize(){return this;}})};
  vm.runInContext(extract('applyPlayerDamage'),c);
  const bot={dead:false,health:100,invincibleTimer:100,contactFxCooldown:100,t:.1,bumpVelocity:0,
    car:{group:{position:new Vector(),visible:true}}};
  c.opponents=[bot];
  for(let frame=0;frame<fps*5;frame++){
    bot.car.group.position.set(c.player.pos.x+2,0,c.player.pos.z+2);
    c.updatePlayer(1/fps);
  }
  return Number((100-c.player.health).toFixed(3));
}
const contactLosses=[15,30,60,144].map(actualContactDamage);
console.log('CONTACT_ACTUAL_FPS '+JSON.stringify(contactLosses));
for(const damage of contactLosses)assert.ok(Math.abs(damage-40)<1.5,'continuous car contact should deal 8 HP/s at every FPS: '+JSON.stringify(contactLosses));
const damageGate=fixture('universal');
damageGate.difficulty=()=>({regen:1,botDamage:1});
damageGate.flashDamage=()=>{};damageGate.addCameraShake=()=>{};
vm.runInContext(extract('applyPlayerDamage'),damageGate);
assert.equal(damageGate.applyPlayerDamage(20),true,'first projectile applies damage');
assert.equal(damageGate.applyPlayerDamage(20),false,'projectile grace still blocks immediate second hit');
assert.equal(damageGate.player.health,80,'projectile damage must not stack during grace');
assert.equal(damageGate.applyPlayerDamage(1,true),true,'ongoing contact does not lose damage to projectile grace');
assert.equal(damageGate.player.health,79);
damageGate.player.invincibleTimer=1;
assert.equal(damageGate.applyPlayerDamage(5,true),false,'invincibility protects against collision damage');
assert.equal(damageGate.player.health,79);
console.log('PROJECTILE_GRACE_AND_CONTACT_NEGATIVE_CONTROLS PASS');

// Countdown must use wall-clock intervals even when the physics step is capped.
function countdownAfterFourSeconds(fps){
  const c=vm.createContext({
    lastTime:0,lastFpsTime:0,frameCount:0,uiAccumulator:0,minimapAccumulator:0,lightAccumulator:0,lastIdleRender:0,
    paused:false,gameStarted:true,gameFinished:false,raceCountdown:3.15,countdownLastNumber:null,checkpointRecoveryNotice:'',
    CONFIG,requestAnimationFrame(){},fpsEl:element(),measureFrameRate,updateAdaptiveQuality(){},
    incomingWarningEl:element(),updateCamera(){},showMessage(){},focusGameCanvas(){},
    audio:{play(){},updateEngine(){}},opponents:[],player:{pos:new Vector(),speed:0,maxSpeed:52,nitroTimer:0,destroyed:false},
    drivingConfig:{MAX_SPEED:52},canControl:()=>true,drivingAudio:{},
    updatePlayer(){},updateOpponents(){},updateSlipstream(){},updateOvertakes(){},checkBonuses(){},handleShooting(){},updateProjectiles(){},
    particles:{update(){}},skids:{update(){}},updateShockwaves(){},pickupFactory:{update(){}},bonusMeshes:[],
    sun:{position:{set(){}},target:{position:{copy(){}},updateMatrixWorld(){}}},
    scenery:{update(){}},sceneryMotionPreference:{matches:false},speedFeedback:{update(){}},
    minimap:{render(){}},updateUI(){},scene:{},camera:{},combatRenderer:{render(){}},settings:{quality:'high',lapGhost:true},
    qualityMode:'high',lapGhost:{poseAt(){return null;},paceAt(){return null;},snapshot(){return {bestTime:null};}},lapGhostBadge:element(),lapGhostBadgeTime:element(),lapGhostBadgePace:{textContent:'',dataset:{}},lapGhostPaceLastTime:-Infinity,lapGhostPaceDelta:null,lapGhostVisual:{update(){}}
  });
  vm.runInContext(extract('updateCountdown')+'\n'+extract('loop'),c);
  for(let step=1;step<=fps*4;step++)c.loop(step*1000/fps);
  return Number(c.raceCountdown.toFixed(3));
}
const countdowns=[5,15,30,60].map(countdownAfterFourSeconds);
console.log('COUNTDOWN_ACTUAL_LOOP '+JSON.stringify(countdowns));
assert.ok(countdowns.every(v=>v===0),'countdown should finish in four elapsed seconds even at 5 FPS: '+JSON.stringify(countdowns));
console.log('CYBER RACE garage passed: purchases, tuned physics/health, rewards/records, model-owned gun/rocket origins and negative controls.');
