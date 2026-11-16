import assert from 'node:assert/strict';
import cornerSpotter from '../src/game/corner-spotter.js';
import championship from '../src/game/championship.js';
import * as THREE from '../vendor/three/three.module.js';
const {createCornerSpotter}=cornerSpotter;

// Four equidistant 240-unit straights, 60 arc-length samples per side.
const square=[];
for(let i=0;i<60;i++)square.push({x:i*4,z:0});
for(let i=0;i<60;i++)square.push({x:240,z:i*4});
for(let i=0;i<60;i++)square.push({x:240-i*4,z:240});
for(let i=0;i<60;i++)square.push({x:0,z:240-i*4});
const planner=createCornerSpotter(square);
assert.equal(planner.turns.length,4,'four distinct right-angle corners');
assert.ok(planner.turns.every(t=>t.direction==='left'&&t.severity==='sharp'),'square bends are sharp lefts');
const early=planner.predict({sampleIndex:20,speed:8});
assert.equal(early,null,'no distant alert at low speed');
const approaching=planner.predict({sampleIndex:20,speed:52});
assert.ok(approaching&&approaching.direction==='left'&&approaching.distance>100,'speed-sensitive preview of the next bend');
assert.ok(approaching.displayDistance>=approaching.distance,'distance rounded conservatively');
assert.ok(approaching.progress>0&&approaching.progress<1);
const now=planner.predict({sampleIndex:60,speed:35});
assert.ok(now?.active&&now.displayDistance===0,'inside the bend shows NOW');
const wrap=planner.predict({sampleIndex:237,speed:35});
assert.ok(wrap?.active||wrap?.displayDistance<=30,'first and last samples belong to the same corner');
assert.equal(planner.predict({sampleIndex:60,speed:35,forward:false}),null,'no warning in reverse/wrong direction');
assert.equal(planner.predict({sampleIndex:60,speed:35,onRoad:false}),null,'no warning off the road');
assert.equal(planner.predict({sampleIndex:60,speed:0}),null,'no warning at rest');
assert.equal(planner.predict({sampleIndex:Number.NaN,speed:35}),null,'invalid position is safe');
assert.equal(createCornerSpotter([]).predict({sampleIndex:0,speed:30}),null,'missing track safe');
const reversed=createCornerSpotter([...square].reverse());
assert.ok(reversed.turns.every(t=>t.direction==='right'),'turn direction reverses with route');
assert.ok(planner.predict({sampleIndex:260,speed:52})?.direction==='left','sample indices wrap');
console.log('CORNER_SPOTTER_PASS 4 corners, direction, severity, lookahead, wrap, guards');

for(const trackId of ['city','industrial']){
 const controlPoints=championship.CHAMPIONSHIP_TRACK_POINTS[trackId]
   .map(([x,y,z])=>new THREE.Vector3(x*7,y,z*7));
 const curve=new THREE.CatmullRomCurve3(controlPoints,true,'catmullrom',0.5);
 const samples=Array.from({length:600},(_,i)=>curve.getPointAt(i/600));
 const actual=createCornerSpotter(samples);
 assert.ok(actual.turns.length>=(trackId==='city'?4:2),trackId+' has independently detected bends');
 assert.ok(actual.turns.some(turn=>turn.severity!=='gentle'),trackId+' includes noticeable turns');
 assert.ok(actual.predict({sampleIndex:actual.turns[0].start,speed:45})?.active,
  trackId+' shows an active real-curve turn');
}
console.log('CORNER_REAL_CHAMPIONSHIP_ROUTES_PASS city and industrial Catmull-Rom samples');
