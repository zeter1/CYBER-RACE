import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {createLapGhostTracker,createLapGhostVisual,createLapGhostStore}=require('../src/game/lap-ghost.js');
const {resolveLapCompletion}=require('../src/game/race-state.js');

function driveLap(ghost,lap,seconds,fps=60,{valid=true}={}){
  assert.ok(ghost.beginLap(lap,{x:0,z:0,heading:Math.PI-0.1}));
  const steps=Math.ceil(seconds*fps);
  for(let frame=1;frame<steps;frame++){
    const elapsed=seconds*frame/steps;
    ghost.record({lap,elapsed,x:elapsed*2,z:elapsed/3,
      heading:elapsed<seconds/2?Math.PI-0.1:-Math.PI+0.1});
  }
  return ghost.completeLap({lap,elapsed:seconds,x:seconds*2,z:seconds/3,
    heading:-Math.PI+0.1,valid});
}
for(const fps of [30,60,144]){
  const tracker=createLapGhostTracker();
  assert.equal(tracker.poseAt(0),null,'no ghost on the first lap');
  assert.equal(driveLap(tracker,1,27,fps),true);
  assert.equal(tracker.snapshot().bestTime,27);
  assert.ok(tracker.snapshot().sampleCount>100);
  const mid=tracker.poseAt(13.5);
  assert.ok(Math.abs(mid.x-27)<0.25,'interpolated timeline at '+fps+' fps');
  assert.equal(tracker.poseAt(28),null,'ghost finishes at its old finish time');
  assert.equal(driveLap(tracker,2,30,fps),false,'slower lap keeps previous ghost');
  assert.equal(tracker.snapshot().bestLap,1);
  assert.equal(driveLap(tracker,3,22,fps),true,'faster lap replaces previous ghost');
  assert.equal(tracker.snapshot().bestTime,22);
  assert.equal(driveLap(tracker,4,10,fps,{valid:false}),false);
  assert.equal(tracker.snapshot().bestTime,22,'invalid lap never becomes ghost');
  tracker.reset();
  assert.equal(tracker.poseAt(0),null);
  assert.equal(tracker.snapshot().sampleCount,0);
}
console.log('LAP_GHOST_TIMELINE_PASS 30/60/144 FPS, best selection, slow/invalid, reset');

const tracker=createLapGhostTracker();
tracker.beginLap(1,{x:0,z:0,heading:Math.PI-.03});
tracker.record({lap:1,elapsed:.2,x:1,z:0,heading:-Math.PI+.03});
assert.equal(tracker.poseAt(0),null,'even two recorded samples are not a completed lap');
tracker.completeLap({lap:1,elapsed:0.4,x:2,z:0,heading:-Math.PI+.03,valid:true});
const between=tracker.poseAt(.1);
assert.ok(Math.abs(Math.abs(between.heading)-Math.PI)<.05,'shortest yaw arc across +/- PI');
tracker.beginLap(2,{x:0,z:0,heading:0});
tracker.record({lap:2,elapsed:1,x:5,z:0,heading:0});
tracker.invalidate();
assert.equal(tracker.completeLap({lap:2,elapsed:2,x:10,z:0,heading:0,valid:true}),false);
assert.equal(tracker.snapshot().bestLap,1);
tracker.beginLap(3,{x:0,z:0,heading:0});
tracker.record({lap:3,elapsed:2,x:2,z:0,heading:0});
tracker.record({lap:3,elapsed:1,x:1,z:0,heading:0});
assert.equal(tracker.snapshot().recordingValid,false,'clock rollback invalidates recording');
assert.equal(tracker.completeLap({lap:3,elapsed:3,x:3,z:0,heading:0,valid:true}),false);
assert.equal(tracker.snapshot().bestLap,1);
assert.equal(tracker.poseAt(-1),null);
const bounded=createLapGhostTracker();
bounded.beginLap(1,{x:0,z:0,heading:0});
for(let i=1;i<3620;i++)bounded.record({lap:1,elapsed:i*.11,x:i,z:0,heading:0});
assert.equal(bounded.snapshot().recordingValid,false,'six-minute cap stops unbounded recording');
assert.equal(bounded.completeLap({lap:1,elapsed:400,x:400,z:0,heading:0,valid:true}),false);
assert.equal(bounded.snapshot().bestTime,null,'truncated lap never becomes a ghost');
console.log('LAP_GHOST_INVALIDATION_PASS interruption, yaw wrap and bounded memory');

// Position-based pacing: signed seconds at the same location, not elapsed-time
// comparison at different points. Refuse wrong direction and distant tracks.
{
  const pace=createLapGhostTracker();
  assert.equal(pace.paceAt({elapsed:5,x:50,z:0,heading:Math.PI/2}),null);
  const frames=Array.from({length:11},(_,i)=>({
    elapsed:i,x:i*10,z:0,heading:Math.PI/2
  }));
  assert.equal(pace.importBest({lap:1,time:10,frames}),true);
  assert.equal(pace.paceAt({elapsed:6,x:50,z:3,heading:Math.PI/2}),1,'one second behind at 50m');
  assert.equal(pace.paceAt({elapsed:4,x:50,z:0,heading:Math.PI/2}),-1,'one second ahead at 50m');
  assert.equal(pace.paceAt({elapsed:5,x:50,z:0,heading:Math.PI/2}),0,'even with ghost');
  assert.equal(pace.paceAt({elapsed:12,x:100,z:0,heading:Math.PI/2}),2,'slower than old finish still comparable');
  assert.equal(pace.paceAt({elapsed:6,x:50,z:40,heading:Math.PI/2}),null,'far from ghost route');
  assert.equal(pace.paceAt({elapsed:6,x:50,z:0,heading:-Math.PI/2}),null,'opposite driving direction');
  assert.equal(pace.paceAt({elapsed:NaN,x:50,z:0,heading:Math.PI/2}),null,'bad timing');
  assert.equal(pace.paceAt({elapsed:6,x:Infinity,z:0,heading:Math.PI/2}),null,'bad coordinates');
  pace.reset();
  assert.equal(pace.paceAt({elapsed:6,x:50,z:0,heading:Math.PI/2}),null,'reset clears reference');
  console.log('LAP_GHOST_PACE_PASS position, signed delta, far/reverse/invalid, reset');
}

const invalid=resolveLapCompletion({lap:2,curLap:12,bestLap:45,totalLaps:3,validLap:false});
assert.equal(invalid.bestLap,45,'invalid sector lap must not replace saved best lap');
assert.equal(invalid.scoreDelta,50,'invalid best-lap timing must not remove lap points');
assert.equal(invalid.lap,3,'invalid best-lap timing must not affect finish progress');
const valid=resolveLapCompletion({lap:2,curLap:12,bestLap:45,totalLaps:3,validLap:true});
assert.equal(valid.bestLap,12,'legitimate lap improves best');
console.log('LAP_GHOST_RECORD_FILTER_PASS invalid lap never earns best-time record');

const runtime=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
for(const token of ['lapGhost.beginLap','lapGhost.completeLap','lapGhost.record','lapGhost.invalidate',
  'lapGhost.reset','lapGhostVisual.update','validLap:lapWasValid']){
  assert.ok(runtime.includes(token),'missing live owner hook '+token);
}
console.log('LAP_GHOST_RUNTIME_WIRING_PASS recording, completion, validity and visual lifecycle');

const disposals={geometry:0,material:0};
class BaseGeometry{dispose(){disposals.geometry++;}}
class BoxGeometry extends BaseGeometry{}
class CylinderGeometry extends BaseGeometry{}
class EdgesGeometry extends BaseGeometry{}
class RingGeometry extends BaseGeometry{}
class BaseMaterial{constructor(options){Object.assign(this,options);}dispose(){disposals.material++;}}
class Node{
  children=[];userData={};visible=true;rotation={x:0,y:0,z:0};
  position={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}};
  add(child){this.children.push(child);}
}
class Group extends Node{}
class Mesh extends Node{constructor(geometry,material){super();this.geometry=geometry;this.material=material;}}
class LineSegments extends Mesh{}
const scene={children:[],add(g){this.children.push(g);},remove(g){this.children=this.children.filter(v=>v!==g);}};
const THREE={Group,Mesh,LineSegments,BoxGeometry,CylinderGeometry,EdgesGeometry,RingGeometry,
  MeshBasicMaterial:BaseMaterial,LineBasicMaterial:BaseMaterial,DoubleSide:2,AdditiveBlending:3};
const visual=createLapGhostVisual({THREE,scene});
assert.equal(visual.group.visible,false);
assert.equal(scene.children.length,1,'ghost group allocated once');
visual.update({x:11,z:12,heading:1},{enabled:true,active:true,quality:'high'});
assert.equal(visual.group.visible,true);
assert.equal(visual.group.position.x,11);
assert.ok(visual.group.children.some(c=>c.renderOrder===2&&c.visible!==false),'high quality outline');
visual.update({x:1,z:2,heading:2},{enabled:true,active:true,quality:'low'});
assert.ok(visual.group.children.filter(c=>c.renderOrder===2).every(c=>c.visible===false),'low quality hides details');
visual.update({x:1,z:2,heading:2},{enabled:false});
assert.equal(visual.group.visible,false,'user switch disables display');
visual.update(null,{enabled:true});
assert.equal(visual.group.visible,false,'no personal ghost before first lap');
visual.dispose();
assert.equal(scene.children.length,0);
assert.ok(disposals.geometry>0&&disposals.material===3,'owned GPU resources disposed');
console.log('LAP_GHOST_VISUAL_PASS settings, quality, mesh isolation and disposal');


// Persistence is separate from the physics/simulation: a completed valid lap is
// exported, bounded, stored under route+car build, then loaded in a new tracker.
{
 const memory=new Map();
 const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
 const first=createLapGhostTracker();
 assert.equal(driveLap(first,1,28,60),true);
 const original=first.exportBest();
 const library=createLapGhostStore(storage);
 const one=library.put('valley','universal:0-0-0',original);
 assert.deepEqual(one,{improved:true,persisted:true});
 assert.ok(memory.has('cyberRaceLapGhostV1'),'versioned key written only after a clean lap');
 const otherSession=createLapGhostStore(storage);
 const second=createLapGhostTracker();
 assert.equal(second.importBest(otherSession.get('valley','universal:0-0-0')),true);
 assert.equal(second.snapshot().bestTime,28);
 assert.ok(Math.abs(second.poseAt(14).x-28)<.25,'replayed path interpolates in new race');
 assert.equal(otherSession.get('city','universal:0-0-0'),null,'different track has no ghost');
 assert.equal(otherSession.get('valley','interceptor:0-0-0'),null,'different car has no ghost');
 assert.equal(library.put('valley','universal:0-0-0',original).improved,false,'same lap cannot downgrade best');
 assert.equal(driveLap(second,2,32,30),false,'slower lap does not override stored record');
 assert.equal(otherSession.put('valley','universal:0-0-0',second.exportBest()).improved,false);
 assert.equal(driveLap(second,3,23,144),true);
 assert.equal(otherSession.put('valley','universal:0-0-0',second.exportBest()).persisted,true);
 assert.equal(createLapGhostStore(storage).get('valley','universal:0-0-0').time,23);
 const damaged=structuredClone(original);
 damaged.frames[10].elapsed=-5;
 assert.equal(library.put('city','universal:0-0-0',damaged).improved,false,'corrupt frame rejected');
 assert.equal(library.put('city','universal:0-0-0',{time:1,frames:[]}).improved,false,'empty trace rejected');
 assert.equal(second.importBest(damaged),false,'invalid imported data cannot replace current ghost');
 assert.equal(second.snapshot().bestTime,23);
 assert.equal(memory.has('cyberRaceSettings'),false,'unrelated settings untouched');
 const noWrite={getItem:()=>null,setItem:()=>{throw Error('quota');}};
 const denied=createLapGhostStore(noWrite);
 assert.deepEqual(denied.put('valley','universal:0-0-0',original),{improved:true,persisted:false});
 assert.ok(denied.get('valley','universal:0-0-0'),'storage denied still works in active tab');
 assert.equal(createLapGhostStore({getItem:()=>'{bad'}).get('valley','universal:0-0-0'),null);
 assert.equal(createLapGhostStore({getItem:()=>JSON.stringify({version:9,entries:[]})}).get('valley','universal:0-0-0'),null);
 assert.equal(createLapGhostStore({getItem:()=> 'x'.repeat(1500001)}).get('valley','universal:0-0-0'),null);
 console.log('LAP_GHOST_PERSISTENCE_PASS next race, faster/slower, track/build isolation, tamper/blocked storage');
}

{
 const map=new Map();
 const storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
 const early=createLapGhostStore(storage),late=createLapGhostStore(storage);
 const a=createLapGhostTracker(),b=createLapGhostTracker(),fast=createLapGhostTracker();
 driveLap(a,1,26);driveLap(b,1,31);driveLap(fast,1,20);
 assert.equal(early.put('valley','universal:0-0-0',a.exportBest()).persisted,true);
 assert.equal(late.put('city','interceptor:0-0-0',b.exportBest()).persisted,true);
 assert.equal(createLapGhostStore(storage).get('valley','universal:0-0-0').time,26,'late tab preserves first track');
 assert.equal(createLapGhostStore(storage).get('city','interceptor:0-0-0').time,31);
 assert.equal(late.put('valley','universal:0-0-0',b.exportBest()).improved,false,'late slow tab cannot downgrade');
 assert.equal(early.put('valley','universal:0-0-0',fast.exportBest()).persisted,true);
 assert.equal(late.get('valley','universal:0-0-0').time,20,'late tab sees best from other tab');
 console.log('LAP_GHOST_MULTI_TAB_PASS preserved other routes and faster trace');
}
