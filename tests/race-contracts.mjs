import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {canBenefitFromPickup}=require('../src/game/pickup-rules.js');
const {RACE_CONTRACTS,RACE_CONTRACT_CREDITS,getRaceContractDefinition,createRaceContractTracker}=require('../src/game/race-contracts.js');
const {segmentSphereHit3D}=require('../src/weapons/geometry.js');

const full={rockets:9,gunAmmo:99,nitro:5,nitroCharges:5,health:161,
  shieldTimer:7,speedBoostTimer:10};
for(const type of ['rocket','machinegun','nitro','health','shield','speedboost']){
  assert.equal(canBenefitFromPickup(type,full,{maxHealth:161}),false,type+' at cap stays');
}
assert.equal(canBenefitFromPickup('rocket',{...full,rockets:8}),true);
assert.equal(canBenefitFromPickup('machinegun',{...full,gunAmmo:98}),true);
assert.equal(canBenefitFromPickup('nitro',{...full,nitro:4}),true);
assert.equal(canBenefitFromPickup('health',{...full,health:160},{maxHealth:161}),true);
assert.equal(canBenefitFromPickup('shield',{...full,shieldTimer:6.9}),true);
assert.equal(canBenefitFromPickup('speedboost',{...full,speedBoostTimer:9.9}),true);
assert.equal(canBenefitFromPickup('health',full,{maxHealth:161}),false);
assert.equal(canBenefitFromPickup('rocket',{...full,rockets:8.5}),true);
assert.equal(canBenefitFromPickup('banana',full),false);
const ai={...full,health:100,nitroCharges:5,shieldTimer:5,speedBoostTimer:8};
for(const type of ['rocket','machinegun','nitro','health','shield','speedboost']){
 assert.equal(canBenefitFromPickup(type,ai,{nitroKey:'nitroCharges',shieldDuration:5,speedBoostDuration:8}),false,'AI '+type+' full');
}
assert.equal(canBenefitFromPickup('nitro',{...ai,nitroCharges:4},{nitroKey:'nitroCharges'}),true);

assert.deepEqual(Object.keys(RACE_CONTRACTS),['hunter','collector','podium']);
assert.equal(getRaceContractDefinition('hunter','blitz').target,1,'blitz hunter goal');
assert.equal(getRaceContractDefinition('hunter','blitz').menuLabel,'1 уничтожение');
assert.equal(getRaceContractDefinition('collector','blitz').target,2,'blitz collector goal');
assert.equal(getRaceContractDefinition('collector','blitz').menuLabel,'2 полезных бонуса');
assert.equal(getRaceContractDefinition('podium','blitz').target,1,'podium unaffected');
assert.equal(getRaceContractDefinition('hunter','sprint').target,2,'sprint unchanged');
assert.equal(getRaceContractDefinition('collector','classic').target,3,'classic unchanged');
assert.equal(getRaceContractDefinition('hunter','other').target,2,'unknown mode fails safe');
assert.equal(getRaceContractDefinition('__proto__','blitz'),null,'untrusted id');
const blitzHunter=createRaceContractTracker();
blitzHunter.start('hunter','blitz');
assert.equal(blitzHunter.status({kills:0}).progressLabel,'0/1');
assert.equal(blitzHunter.finalize({finished:false,kills:1}).credits,0,'no pre-finish blitz reward');
assert.equal(blitzHunter.status({kills:1}).met,true);
assert.equal(blitzHunter.finalize({finished:true,kills:1}).credits,200,'one blitz kill pays after finish');
assert.equal(blitzHunter.finalize({finished:true,kills:2}).credits,0,'no double payout');
blitzHunter.start('hunter','sprint');
assert.equal(blitzHunter.status({kills:1}).met,false,'no carryover to sprint');
const blitzCollector=createRaceContractTracker();
blitzCollector.start('collector','blitz');
assert.equal(blitzCollector.recordUsefulPickup(),true);
assert.equal(blitzCollector.status().progressLabel,'1/2');
assert.equal(blitzCollector.status().met,false);
assert.equal(blitzCollector.recordUsefulPickup(),true);
assert.equal(blitzCollector.status().met,true);
assert.equal(blitzCollector.finalize({finished:true}).credits,200);
blitzCollector.start('collector','classic');
assert.equal(blitzCollector.status().target,3,'classic still needs three');
assert.equal(blitzCollector.status().progress,0,'reset between modes');
blitzCollector.recordUsefulPickup();
assert.equal(blitzCollector.finalize({finished:true}).credits,0,'no payout at one of three');

for(const id of ['none','hunter','collector','podium']){
 const tracker=createRaceContractTracker();
 assert.equal(tracker.start(id),id);
 assert.equal(tracker.finalize({finished:false,kills:100,place:1}).credits,0,'unfinished run cannot pay');
 assert.equal(tracker.finalize({finished:true,kills:100,place:1}).credits,id==='none'?0:id==='hunter'||id==='podium'?200:0);
 assert.equal(tracker.finalize({finished:true,kills:100,place:1}).credits,0,'pay only once');
}
const hunter=createRaceContractTracker();hunter.start('hunter');
assert.equal(hunter.status({kills:1}).progress,1);
assert.equal(hunter.status({kills:2}).met,true);
assert.equal(hunter.finalize({finished:true,kills:2}).credits,RACE_CONTRACT_CREDITS);
hunter.start('hunter');assert.equal(hunter.status({kills:0}).progress,0);
const collector=createRaceContractTracker();collector.start('collector');
for(let i=0;i<6;i++)collector.recordUsefulPickup();
assert.equal(collector.status().progress,3,'capped collectible progress');
assert.equal(collector.finalize({finished:true}).credits,200);
assert.equal(collector.recordUsefulPickup(),false,'completed contract freezes count');
const podium=createRaceContractTracker();podium.start('podium');
assert.equal(podium.status({place:2,finished:false}).met,false,'no premature podium payout');
assert.equal(podium.finalize({finished:true,place:4}).credits,0);
podium.start('podium');
assert.equal(podium.finalize({finished:true,place:3}).credits,200);
assert.equal(podium.finalize({finished:true,place:1}).credits,0);
podium.start('__proto__');assert.equal(podium.status(),null);

const src=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
function extract(name){
 const start=src.indexOf('    function '+name+'('),end=src.indexOf('\n    }',start);
 assert.ok(start>=0&&end>start,name);return src.slice(start,end+6);
}
const collect=src.slice(src.indexOf('    function checkBonuses(){'),src.indexOf('    function handleShooting('));
const state={
  canControl:()=>true,player:{pos:{x:0,y:0,z:0},maxHealth:161,health:161,
    rockets:9,gunAmmo:99,nitro:5,shieldTimer:7,speedBoostTimer:10,destroyed:false},
  pickupSweepStart:{x:0,y:0,z:0},bonusMeshes:[],canBenefitFromPickup,segmentSphereHit:segmentSphereHit3D,
  CONFIG:{SHIELD_DURATION:7},raceContractTracker:collector,
  healPlayerHealth:(health,max,add)=>Math.min(max,health+add),
  updateWeaponVis(){},showMessage(){},audio:{play(){}},
  particles:{spawn(){}},bonusData:{
   health:{icon:'+',name:'здоровье',emissive:0},
   rocket:{icon:'>',name:'ракеты',emissive:0},
   shield:{icon:'#',name:'щит',emissive:0}
  },
  removeBonusAt(i){state.bonusMeshes.splice(i,1)},
  THREE:{Vector3:class{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z})}}},
  gameStarted:true,gameFinished:false
};
state.player.pos.clone=()=>({x:0,y:0,z:0});
vm.createContext(state);
vm.runInContext(collect,state);
for(const type of ['health','rocket','shield']){
 state.bonusMeshes.push({type,group:{position:{x:0,y:0,z:0}}});
 state.checkBonuses();
 assert.equal(state.bonusMeshes.length,1,'full '+type+' not consumed in actual runtime');
 state.bonusMeshes.length=0;
}
collector.start('collector');
state.player.health=120;
state.bonusMeshes.push({type:'health',group:{position:{x:0,y:0,z:0}}});
state.checkBonuses();
assert.equal(state.player.health,160);
assert.equal(state.bonusMeshes.length,0);
assert.equal(collector.status().progress,1);
console.log('USEFUL_PICKUPS_AND_RACE_CONTRACTS_PASS caps, AI, optional targets, once-only credits, actual runtime pickup');
