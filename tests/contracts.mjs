import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const track=require('../src/game/track-environment.js');
const race=require('../src/game/race-state.js');
const ai=require('../src/ai/opponent-brain.js');
const geometry=require('../src/weapons/geometry.js');
const ballistics=require('../src/weapons/ballistics.js');
const hud=require('../src/ui/hud-model.js');

const samples=Array.from({length:100},(_,i)=>({x:i*10,z:0}));
assert.equal(track.findClosestSample(samples,482,1,48,34,5).idx,48);
assert.equal(track.findClosestSample(samples,995,0,10,10,2).idx,99);

assert.equal(ai.chooseLaneTarget(0.5,34),0);
assert.ok(Math.abs(ai.chooseLaneTarget(1,34))<=34*0.62);
assert.equal(ai.rubberBandMultiplier(10,0,0.88,1.12),1.12);
assert.equal(ai.rubberBandMultiplier(0,10,0.88,1.12),0.88);
assert.ok(ai.computeOpponentSpeed({baseSpeed:40,difficultySpeed:1,slowed:true,nitro:false,speedBoost:false,playerProgress:0,botProgress:0,minRubberBand:0.88,maxRubberBand:1.12,maxSpeed:52})<20);
const attack=ai.opponentAttackGeometry({x:0,z:0},{x:0,z:10},{x:0,z:1});
assert.equal(attack.distance,10);assert.equal(attack.facing,1);
const lead=ai.computeLeadShot2D({origin:{x:0,z:0},target:{x:0,z:100},targetVelocity:{x:10,z:0},projectileSpeed:100,maxLead:0.34,spreadRadians:0});
assert.ok(lead.x>0);assert.ok(Math.abs(Math.hypot(lead.x,lead.z)-1)<1e-9);

assert.equal(geometry.segmentSphereHit3D({x:0,y:0,z:0},{x:10,y:0,z:0},{x:5,y:0,z:0},1),true);
assert.equal(geometry.segmentSphereHit3D({x:0,y:0,z:0},{x:10,y:0,z:0},{x:5,y:2,z:0},1),false);
assert.equal(ballistics.estimateLeadTime(200,100,0.55),0.55);
assert.equal(ballistics.homingBlend(8,0.2),1);
assert.equal(ballistics.updateRocketProgress(12,10,0.55,0.1).stalled,true);
const targetA={health:100,dead:false,pos:{x:0,y:0,z:50}};
const targetB={health:100,dead:false,pos:{x:30,y:0,z:20}};
assert.equal(ballistics.selectRocketTarget([targetA,targetB],{x:0,y:0,z:0},{x:0,y:0,z:1},100,0.5,item=>item.pos),targetA);

const positions=hud.buildRacePositions({lap:2,prevT:0.25},[{lap:2,t:0.5},{lap:1,t:0.9}]);
assert.equal(positions[0].who,'opponent');assert.equal(positions[0].index,0);
assert.equal(hud.raceProgressPercent({lap:2,prevT:0.5},5),30);
assert.equal(hud.healthPercent(130),100);assert.equal(hud.healthPercent(-5),0);

const third=race.resolveLapCompletion({lap:3,curLap:42,bestLap:50,totalLaps:15});
assert.equal(third.lap,4);assert.equal(third.bestLap,42);assert.equal(third.grantCombatPack,true);assert.equal(third.finished,false);
const final=race.resolveLapCompletion({lap:15,curLap:40,bestLap:39,totalLaps:15});
assert.equal(final.finished,true);assert.equal(final.lap,15);assert.equal(final.scoreDelta,50);

console.log('CYBER RACE gameplay contract tests passed.');
