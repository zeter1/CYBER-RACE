// Live runtime frame-loop regression: synthetic timestamps, no renderer or browser storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {measureFrameRate,stepAdaptiveQuality}=require('../src/game/frame-quality.js');

const source=fs.readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
const begin=source.indexOf('    function loop(now){');
const end=source.indexOf("\n    window.addEventListener('resize'",begin);
assert.ok(begin>=0&&end>begin,'the real runtime loop must be available');
const loopSource=source.slice(begin,end);

function simulateFrameLoop(timestamps){
  const samples=[];
  const state={
    lastTime:0,lastFpsTime:0,frameCount:0,uiAccumulator:0,minimapAccumulator:0,lightAccumulator:0,lastIdleRender:0,
    paused:false,gameStarted:true,gameFinished:false,raceCountdown:3,CONFIG:{IDLE_RENDER_INTERVAL_MS:66},
    qualityMode:'high',settings:{lapGhost:true},lapGhost:{poseAt(){return null;},paceAt(){return null;},snapshot(){return {bestTime:null};}},lapGhostBadge:{hidden:true},lapGhostBadgeTime:{textContent:''},lapGhostBadgePace:{textContent:'',dataset:{}},lapGhostPaceLastTime:-Infinity,lapGhostPaceDelta:null,lapGhostVisual:{update(){}},
    requestAnimationFrame(){},fpsEl:{textContent:''},measureFrameRate,lowFpsWindows:1,highFpsWindows:2,
    updateAdaptiveQuality(value){samples.push(value);},
    updateCountdown(){},updateCamera(){},incomingWarningEl:{classList:{remove(){}}},
    rearviewIndicatorEl:{hidden:true},
    player:{pos:{x:0,z:0},speed:0,nitroTimer:0,destroyed:false},
    audio:{updateEngine(){}},drivingConfig:{MAX_SPEED:52},canControl:()=>true,drivingAudio:{},
    particles:{update(){}},skids:{update(){}},updateShockwaves(){},
    pickupFactory:{update(){}},bonusMeshes:[],scenery:{update(){}},sceneryMotionPreference:{matches:false},speedFeedback:{update(){}},
    sun:{position:{set(){}},target:{position:{copy(){}},updateMatrixWorld(){}}},
    minimap:{render(){}},updateUI(){},combatRenderer:{render(){}},scene:{},camera:{}
  };
  vm.createContext(state);
  vm.runInContext(loopSource,state);
  for(const entry of timestamps){
    if(typeof entry==='number')state.loop(entry);
    else{state.paused=entry.paused;state.loop(entry.time);}
  }
  return {hud:state.fpsEl.textContent,samples,frameCount:state.frameCount,
    lowFpsWindows:state.lowFpsWindows,highFpsWindows:state.highFpsWindows,lastFpsTime:state.lastFpsTime};
}

// The final frame arrives after a half-second stall: 60 callbacks over 1500 ms = 40 FPS.
const timestamps=Array.from({length:59},(_,i)=>(i+1)*990/59).concat(1500);
const result=simulateFrameLoop(timestamps);
assert.equal(result.hud,'FPS: 40','FPS counter must divide frame count by actual wall time');
assert.ok(Math.abs(result.samples[0]-40)<0.001,'adaptive quality must receive actual, unrounded FPS');
console.log('FPS_ACTUAL_RUNTIME_LOOP_PASS wall-time normalization after delayed frame');

// The actual runtime HUD branch must show a signed pace, and clear it when
// inactive. This is a synthetic owner test, not a driven browser lap.
{
 const start=source.indexOf('      const ghostActive=activeFrame&&raceCountdown<=0');
 const end=source.indexOf('      scenery.update(dt,player.pos',start);
 assert.ok(start>=0&&end>start,'ghost HUD runtime branch must remain accessible');
 const snippet=source.slice(start,end);
 let measured=1.2,reads=0;
 const badge={hidden:true},label={textContent:'',dataset:{}},time={textContent:''};
 const state=vm.createContext({
   activeFrame:true,raceCountdown:0,gameFinished:false,
   player:{destroyed:false,curLap:6,speed:20,wrongWayTimer:0,pos:{x:50,z:0},heading:Math.PI/2},
   settings:{lapGhost:true},qualityMode:'high',
   lapGhost:{snapshot:()=>({bestTime:10}),paceAt:()=>{reads++;return measured;},poseAt:()=>({x:50,z:0,heading:Math.PI/2})},
   lapGhostBadge:badge,lapGhostBadgeTime:time,lapGhostBadgePace:label,
   lapGhostPaceLastTime:-Infinity,lapGhostPaceDelta:null,
   lapGhostVisual:{update(){}}
 });
 const run=()=>vm.runInContext('{'+snippet+'}',state);
 run();
 assert.equal(badge.hidden,false);
 assert.equal(label.dataset.pace,'behind');
 assert.match(label.textContent,/ПОЗАДИ ≈1.2 с/);
 assert.equal(time.textContent,'10.0 с');
 run();assert.equal(reads,1,'pacing capped for consecutive frames');
 state.player.curLap=6.2;measured=-0.8;run();
 assert.equal(label.dataset.pace,'ahead');
 assert.match(label.textContent,/ВПЕРЕДИ ≈0.8 с/);
 state.activeFrame=false;run();
 assert.equal(badge.hidden,true);
 assert.equal(label.textContent,'','pause hides stale delta');
 state.activeFrame=true;state.player.curLap=0.5;measured=null;run();
 assert.equal(label.textContent,'','no spatial match suppresses claim');
 state.settings.lapGhost=false;run();
 assert.equal(badge.hidden,true);
 console.log('GHOST_PACE_RUNTIME_HUD_PASS positive/negative, throttle, pause, no match, switch');
}

for(const fps of [30,60,144])assert.equal(measureFrameRate(fps*2,2000),fps);
assert.equal(measureFrameRate(60,1500),40);
assert.equal(measureFrameRate(10,0),0);
assert.equal(measureFrameRate(Infinity,1000),0);
assert.equal(measureFrameRate(10,NaN),0);
console.log('FPS_PURE_TIME_MATH_PASS 30/60/144, stall and invalid inputs');

let state={mode:'high',lowFpsWindows:0,highFpsWindows:0};
const step=fps=>state=stepAdaptiveQuality(state,fps,42,56);
step(39);step(39);
assert.equal(state.mode,'high','two slow windows must not switch quality');
step(50);
assert.equal(state.lowFpsWindows,1,'neutral FPS must decay the low counter');
step(39);step(39);
assert.equal(state.mode,'low','three consecutive low-pressure windows after decay switch to low');
step(144);assert.equal(state.mode,'low','single fast spike must not restore high');
for(let i=0;i<7;i++)step(70);
assert.equal(state.mode,'high','eight high windows restore high');
step(20);assert.equal(state.mode,'high','one slow spike must not drop quality');
const invalidBefore={...state};
step(Number.NaN);assert.deepEqual(state,invalidBefore,'invalid samples must not trigger quality changes');
console.log('QUALITY_HYSTERESIS_PASS low 3/high 8, neutral and invalid samples');

const afterPause=simulateFrameLoop([
  {time:300,paused:false},{time:400,paused:false},
  {time:500,paused:true},{time:600,paused:false}
]);
assert.equal(afterPause.frameCount,1,'resume must start a fresh active-frame count');
assert.equal(afterPause.lastFpsTime,500,'pause must reset the FPS window origin');
assert.equal(afterPause.lowFpsWindows,0,'pause must reset slow-window evidence');
assert.equal(afterPause.highFpsWindows,0,'pause must reset fast-window evidence');
console.log('FPS_PAUSE_ISOLATION_PASS counters and time origin reset on pause');

    
// Exercise the actual runtime owner, including the manual-quality guard.
const adaptiveSourceStart=source.indexOf('    function updateAdaptiveQuality(fps){');
const adaptiveSourceEnd=source.indexOf('\n    }',adaptiveSourceStart);
assert.ok(adaptiveSourceStart>=0&&adaptiveSourceEnd>adaptiveSourceStart);
const qualityContext=vm.createContext({
  settings:{quality:'auto'},CONFIG:{LOW_FPS_THRESHOLD:42,HIGH_FPS_THRESHOLD:56},
  qualityMode:'high',lowFpsWindows:0,highFpsWindows:0,stepAdaptiveQuality
});
vm.runInContext(source.slice(adaptiveSourceStart,adaptiveSourceEnd+6)+
  '\nfunction setQualityMode(mode){qualityMode=mode;}',qualityContext);
for(let i=0;i<3;i++)qualityContext.updateAdaptiveQuality(40);
assert.equal(qualityContext.qualityMode,'low','runtime should apply three low-FPS samples');
for(let i=0;i<8;i++)qualityContext.updateAdaptiveQuality(65);
assert.equal(qualityContext.qualityMode,'high','runtime should apply eight high-FPS samples');
qualityContext.settings.quality='high';
for(let i=0;i<10;i++)qualityContext.updateAdaptiveQuality(10);
assert.equal(qualityContext.qualityMode,'high','manual choice must ignore automatic quality decisions');
console.log('QUALITY_ACTUAL_RUNTIME_OWNER_PASS auto transitions and manual quality');