import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {isPrecisionInterception,precisionNitroReward,defenseRocketCue}=require('../src/game/defense-pulse.js');

const target={isRocket:true,targetingPlayer:true,radius:90};
assert.equal(isPrecisionInterception({...target,distance:45}),true,'45 is the precision threshold');
assert.equal(isPrecisionInterception({...target,distance:45.01}),false,'outside precision threshold');
assert.equal(isPrecisionInterception({...target,distance:0}),true,'point-blank incoming rocket');
for(const bad of [{isRocket:false},{targetingPlayer:false},{distance:NaN},{distance:-1},{radius:0}]){
  assert.equal(isPrecisionInterception({...target,distance:20,...bad}),false,'invalid or unrelated projectile');
}
assert.equal(precisionNitroReward({precisionCount:2,charges:3}),1,'only one charge per pulse');
assert.equal(precisionNitroReward({precisionCount:1,charges:5}),0,'full storage cannot gain charges');
assert.equal(precisionNitroReward({precisionCount:0,charges:3}),0,'no precision intercept, no reward');
assert.equal(precisionNitroReward({precisionCount:1,charges:-1}),0,'invalid charge input');

const cue=(distance,cooldown=0,charges=3)=>defenseRocketCue({distance,radius:90,cooldown,charges,direction:'СЗАДИ'});
assert.equal(cue(120).phase,'prepare','outside pulse radius: do not invite premature activation');
assert.match(cue(120).text,/ГОТОВЬ ИМПУЛЬС/);
assert.equal(cue(90).phase,'intercept','normal intercept enters at 90');
assert.match(cue(70).text,/ОТРАЗИТЬ/);
assert.equal(cue(45).phase,'precision','precision begins at 45');
assert.match(cue(30).text,/\+1 НИТРО/);
assert.equal(cue(30,0,5).phase,'intercept','do not advertise bonus on full nitro');
assert.doesNotMatch(cue(30,0,5).text,/\+1 НИТРО/);
assert.equal(cue(30,2.64).phase,'cooldown','cooldown overrides precision prompt');
assert.match(cue(30,2.64).text,/2\.6 с/);
assert.equal(cue(30,-1).phase,'precision','completed cooldown is ready');
assert.equal(cue(Infinity),null,'invalid distance must not show warning');
assert.equal(cue(-2),null,'negative distance must not show warning');

import fs from 'node:fs';
import vm from 'node:vm';
// Execute the production pulse action with isolated fake projectiles. No DOM/game store writes.
const runtime=fs.readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
const start=runtime.indexOf('    function activateDefensePulse(){');
const end=runtime.indexOf('\n    }',start);
assert.ok(start>=0&&end>start,'precision bonus is in the real pulse action');
const pulseOwner=runtime.slice(start,end+6);
function pulseCase({distance=40,charges=3,rocket=true,targetsPlayer=true,blocked=false,multiple=false}={}){
  const records={messages:[],removed:0,waves:0};
  const player={pulseCooldown:0,score:0,nitro:charges,invincibleTimer:0,
    pos:{clone(){return {setY(){return this;}}}}};
  const projectile=d=>({owner:'bot',isRocket:rocket,target:targetsPlayer?player:{},
    mesh:{position:{distanceTo(){return d;},clone(){return {};}}}});
  const projectiles=[projectile(distance)];
  if(multiple)projectiles.push(projectile(distance-4));
  const scope={player,projectiles,records,canAcceptGameplayInput:()=>!blocked,
    CONFIG:{DEFENSE_PULSE_COOLDOWN:18,DEFENSE_PULSE_RADIUS:90,DEFENSE_PULSE_SLOW:3.2},
    isPrecisionInterception,precisionNitroReward,
    removeProjectileAt(index){projectiles.splice(index,1);records.removed++;},
    particles:{spawn(){}},opponents:[],qualityMode:'low',
    spawnShockwave(){records.waves++;},incomingWarningEl:{classList:{remove(){}}},
    audio:{play(){}},addCameraShake(){},showMessage(message){records.messages.push(message);}
  };
  vm.createContext(scope);vm.runInContext(pulseOwner,scope);
  vm.runInContext('activateDefensePulse()',scope);
  return {player,records,remaining:projectiles.length};
}
const live=pulseCase();
assert.equal(live.player.nitro,4,'production pulse awards one nitro for close player-targeted rocket');
assert.equal(live.player.score,12,'existing score for interception retained');
assert.equal(live.player.pulseCooldown,18,'pulse still consumes cooldown');
assert.equal(live.remaining,0,'incoming projectile removed');
assert.match(live.records.messages[0],/ТОЧНЫЙ ОТБОЙ/,'feedback is shown in normal game action');
assert.equal(pulseCase({multiple:true}).player.nitro,4,'two rockets cannot award twice');
assert.equal(pulseCase({distance:60}).player.nitro,3,'ordinary interception gives no bonus');
assert.equal(pulseCase({rocket:false}).player.nitro,3,'bullets do not give precision bonus');
assert.equal(pulseCase({targetsPlayer:false}).player.nitro,3,'rocket aimed at AI cannot be farmed');
assert.equal(pulseCase({charges:5}).player.nitro,5,'full nitro remains capped');
assert.equal(pulseCase({blocked:true}).records.removed,0,'pause/modal disables pulse action');

console.log('DEFENSE_PULSE_PASS precision rocket target, production runtime action, once-per-pulse bonus, capacity, distance/cooldown cues');
