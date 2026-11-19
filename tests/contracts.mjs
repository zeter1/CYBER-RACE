import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);

const track=require('../src/game/track-environment.js');
const race=require('../src/game/race-state.js');
const ai=require('../src/ai/opponent-brain.js');
const geometry=require('../src/weapons/geometry.js');
const ballistics=require('../src/weapons/ballistics.js');
const hud=require('../src/ui/hud-model.js');
require('../src/game/config.js');
const {CONFIG}=globalThis.CyberRace.game;
const {stepPlayerDriving}=require('../src/game/player-driving.js');
const {readStandardGamepad,resolveDrivingInput}=require('../src/game/control-input.js');
const {cameraViewPose}=require('../src/game/speed-feedback.js');

const drivingState=overrides=>({speed:0,speedLat:0,steerAngle:0,heading:0,maxSpeed:CONFIG.MAX_SPEED,...overrides});
function drive(initial,input,seconds,fps=60){
  let state=drivingState(initial),x=0,z=0;
  for(let i=0;i<Math.round(seconds*fps);i++){
    state={...state,...stepPlayerDriving(state,input,CONFIG,1/fps)};
    x+=state.deltaX;z+=state.deltaZ;
  }
  return {...state,x,z};
}

// A held accelerator reaches and holds the normal limit, including after a boost.
const cruise=drive({}, {throttle:true},30);
assert.equal(cruise.speed,CONFIG.MAX_SPEED);
assert.equal(stepPlayerDriving(cruise,{throttle:true},CONFIG,1/60).speed,CONFIG.MAX_SPEED);
for(const multiplier of [1.35,1.55,1.35*1.55]){
  const boosted=CONFIG.MAX_SPEED*multiplier;
  const expired=stepPlayerDriving(drivingState({speed:boosted}),{throttle:true},CONFIG,1/60);
  assert.ok(expired.speed>boosted-1,'boost expiry must not cut speed in one frame');
  assert.ok(expired.speed<boosted,'excess speed decays');
  assert.equal(drive({speed:boosted},{throttle:true},10).speed,CONFIG.MAX_SPEED);
}
const boostedCruise=drive({maxSpeed:80.6},{throttle:true},10);
assert.equal(boostedCruise.speed,80.6);
assert.ok(drive({speed:52},{},1).speed<52,'releasing throttle coasts');
const stop=stepPlayerDriving(drivingState({speed:1}),{brake:true},CONFIG,0.1);
assert.equal(stop.speed,0,'brake stops before reversing');
assert.ok(drive(stop,{brake:true},1).speed<0,'holding brake from rest allows reverse');
assert.equal(drive({}, {throttle:true,brake:true},1).speed,0);
assert.equal(drive({}, {steering:1},1).heading,0,'no rotation while stationary');
assert.ok(drive({speed:20},{throttle:true,steering:1},0.5).heading<0);
assert.ok(drive({speed:20},{throttle:true,steering:-1},0.5).heading>0);
assert.ok(drive({speed:-10},{brake:true,steering:1},0.5).heading>0,'reverse steering');
const lowSteer=drive({speed:12},{throttle:true,steering:1},0.25);
const highSteer=drive({speed:52},{throttle:true,steering:1},0.25);
assert.ok(Math.abs(highSteer.steerAngle)<Math.abs(lowSteer.steerAngle));
const drift=drive({speed:40},{throttle:true,handbrake:true,steering:1},0.75);
assert.ok(drift.drifting&&drift.speedLat>3,'handbrake creates outward slip');
assert.ok(Math.abs(drive(drift,{throttle:true},1).speedLat)<0.5,'grip recovers after release');
const normalSlip=drive({speed:40,speedLat:6},{},0.25);
const handbrakeSlip=drive({speed:40,speedLat:6},{handbrake:true},0.25);
assert.ok(handbrakeSlip.speedLat>normalSlip.speedLat,'handbrake reduces lateral grip');
for(const fps of [30,60,144]){
  const reference=drive({}, {throttle:true,steering:0.3},4,60);
  const actual=drive({}, {throttle:true,steering:0.3},4,fps);
  assert.ok(Math.abs(actual.speed-reference.speed)<0.02);
  assert.ok(Math.abs(actual.heading-reference.heading)<0.01);
  assert.ok(Math.hypot(actual.x-reference.x,actual.z-reference.z)<0.5,'similar trajectory across frame rates');
}


const analogSpeeds=[0.25,0.5,1].map(throttle=>drive({}, {throttle},1).speed);
assert.ok(analogSpeeds[0]>0&&analogSpeeds[0]<analogSpeeds[1]&&analogSpeeds[1]<analogSpeeds[2],
  'analog RT must accelerate in proportion to pressure, not act as a switch');
const analogBrakes=[0.25,0.5,1].map(brake=>drive({speed:35},{brake},0.25).speed);
assert.ok(analogBrakes[0]>analogBrakes[1]&&analogBrakes[1]>analogBrakes[2],
  'analog LT must brake in proportion to pressure');
assert.ok(drive({}, {brake:0.25},0.4).speed<0,'partial LT must allow reverse from rest');
assert.ok(drive({}, {brake:0.25},0.4).speed>drive({}, {brake:1},0.4).speed,
  'partial LT must reverse more slowly than full LT');
assert.equal(stepPlayerDriving(drivingState(),{throttle:true},CONFIG,1/60).speed,
  stepPlayerDriving(drivingState(),{throttle:1},CONFIG,1/60).speed,'digital full throttle remains unchanged');
assert.equal(stepPlayerDriving(drivingState({speed:24}),{brake:true},CONFIG,1/60).speed,
  stepPlayerDriving(drivingState({speed:24}),{brake:1},CONFIG,1/60).speed,'digital full brake remains unchanged');
assert.equal(stepPlayerDriving(drivingState(),{throttle:-1,brake:Number.NaN},CONFIG,.1).speed,0,
  'invalid or negative pedals are neutral');
for(const fps of [30,60,144]){
  const reference=drive({}, {throttle:0.5,steering:0.25},4,60);
  const sample=drive({}, {throttle:0.5,steering:0.25},4,fps);
  assert.ok(Math.abs(sample.speed-reference.speed)<0.03&&Math.abs(sample.heading-reference.heading)<0.01,
    'analog trajectory should remain frame-independent at '+fps+' FPS');
  const brakeRef=drive({speed:35},{brake:0.5},0.5,60);
  const brakeSample=drive({speed:35},{brake:0.5},0.5,fps);
  assert.ok(Math.abs(brakeRef.speed-brakeSample.speed)<0.03,'analog braking consistent at '+fps+' FPS');
}
const samplePad=()=>({
  connected:true,mapping:'standard',axes:[0,0],
  buttons:Array.from({length:17},()=>({pressed:false,value:0}))
});
const pad=samplePad();
pad.buttons[7]={pressed:true,value:0.25};
pad.buttons[6]={pressed:true,value:0.5};
pad.axes[0]=0.180001;
let decoded=readStandardGamepad(pad);
assert.equal(decoded.throttle,0.25,'pressed analog RT is not a binary throttle');
assert.equal(decoded.brake,0.5);
pad.buttons[7].pressed=false;
assert.equal(readStandardGamepad(pad).throttle,0.25,'sub-threshold RT pressure works even when pressed is false');
pad.buttons[7].pressed=true;
assert.ok(decoded.steer>0&&decoded.steer<0.001,'stick crosses deadzone without a jump');
pad.axes[0]=1;
assert.equal(readStandardGamepad(pad).steer,1);
pad.axes[0]=-1;
assert.equal(readStandardGamepad(pad).steer,-1);
pad.axes[0]=0;
pad.buttons[14].pressed=true;
assert.equal(readStandardGamepad(pad).steer,-1,'D-pad takes over at neutral stick');
pad.buttons[12].pressed=true;
pad.buttons[13].pressed=true;
decoded=readStandardGamepad(pad);
assert.equal(decoded.throttle,1,'D-pad up remains a digital full throttle');
assert.equal(decoded.brake,1,'D-pad down remains a digital full brake');
pad.buttons[12].pressed=false;pad.buttons[13].pressed=false;
pad.buttons[7]={pressed:true,value:0};
assert.equal(readStandardGamepad(pad).throttle,1,'digital-only pressed RT retains fallback');
pad.buttons[7]={pressed:false,value:Number.NaN};
assert.equal(readStandardGamepad(pad).throttle,0,'invalid trigger pressure is ignored');
assert.equal(readStandardGamepad({...pad,connected:false}).throttle,0,'disconnect resets pedal input');
assert.equal(readStandardGamepad({...pad,mapping:'unknown'}).steer,0,'unmapped devices are neutral');
assert.equal(readStandardGamepad(null).gun,false);
assert.deepEqual(resolveDrivingInput({}, {}, {throttle:0.25,brake:0.5,steer:0.3}),
  {throttle:0.25,brake:0.5,steering:0.3,handbrake:false},
  'unopposed analog pedals reach physics without rounding');
const mixed=resolveDrivingInput({KeyW:true,ShiftLeft:true},{left:true},
  {throttle:0.25,brake:0.5,steer:0.5},true);
assert.deepEqual(mixed,{throttle:1,brake:0.5,steering:-0.5,handbrake:true},
  'keyboard/touch keep priority and analog pad remains available');
assert.equal(resolveDrivingInput({'ц':true},{},{},true).throttle,1,'Russian keyboard layout still accelerates');
assert.equal(resolveDrivingInput({}, {left:true,gun:true}, {}, true, true).throttle,1,'auto gas frees the steering and fire fingers');
assert.deepEqual(resolveDrivingInput({}, {backward:true}, {}, true, true),
  {throttle:0,brake:1,steering:0,handbrake:false},'brake and reverse override auto gas');
assert.equal(resolveDrivingInput({}, {}, {}, false, true).throttle,0,'blocked gameplay disables auto gas');
assert.deepEqual(resolveDrivingInput({KeyW:true},{forward:true},{throttle:1,steer:1},false),
  {throttle:0,brake:0,steering:0,handbrake:false},'menu/input guards must block all devices');
console.log('ANALOG_GAMEPAD_INPUT_PASS 0/25/50/100%, deadzone, digital fallback, disconnect and 30/60/144 FPS');

// Rear glance points backwards without changing the driving axes or the regular chase pose.
for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const car={x:12,y:0,z:-5,heading};
  const view={back:12.8,height:4.45,lookAhead:14};
  const forward=cameraViewPose(car,view,false),rear=cameraViewPose(car,view,true);
  const dot=point=>(point.x-car.x)*Math.sin(heading)+(point.z-car.z)*Math.cos(heading);
  assert.ok(dot(forward.position)<-12&&dot(forward.look)>13,'close chase faces the road');
  const lateral=point=>(point.x-car.x)*Math.cos(heading)-(point.z-car.z)*Math.sin(heading);
  assert.ok(Math.abs(lateral(forward.position))<1e-9,'close chase is centered behind the car');
  assert.ok(dot(rear.position)>13&&dot(rear.look)<-11,'rear glance looks behind the car');
  assert.equal(forward.position.y,4.45,'lower chase height');
  assert.equal(forward.look.y,0.45,'keeps the car above the lower HUD');
  assert.deepEqual(cameraViewPose(car),forward,'restart and initial chase framing agree');
  const portrait=cameraViewPose(car,view,false,390/844);
  assert.ok(dot(portrait.position)<dot(forward.position)-6,'portrait pulls back to keep the car in frame');
  assert.ok(dot(portrait.look)<dot(forward.look)&&portrait.position.y>forward.position.y);
}
pad.buttons[5].pressed=true;
assert.equal(readStandardGamepad(pad).mirror,true,'RB holds rear glance');
assert.equal(readStandardGamepad(pad).steer,-1,'rear glance must not invert steering');
pad.buttons[5].pressed=false;
assert.equal(readStandardGamepad(pad).mirror,false,'RB release restores chase');
assert.equal(readStandardGamepad(null).mirror,false,'disconnected pad cannot latch glance');
console.log('REARVIEW_CAMERA_INPUT_PASS four headings, normal camera parity, RB hold/release');

const samples=Array.from({length:100},(_,i)=>({x:i*10,z:0}));
assert.equal(track.findClosestSample(samples,482,1,48,34,5).idx,48);
assert.equal(track.findClosestSample(samples,995,0,10,10,2).idx,99);

// Leaving an overlapping branch must not turn the asphalt underneath into offroad.
const branches=Array.from({length:120},(_,i)=>({x:(i%60)*10,z:i<60?0:70}));
assert.equal(track.findClosestSample(branches,200,0,80,34,5).dist,0);
assert.equal(track.findClosestSample(branches,200,0,80,34,5).idx,20);
// Preserve progress continuity when the locally followed branch is still drivable.
const overlapping=branches.map((p,i)=>({...p,z:i<60?0:20}));
assert.equal(track.findClosestSample(overlapping,200,0,80,34,5).idx,80);
assert.ok(track.findClosestSample(branches,200,200,80,34,5).dist>37,'real offroad remains offroad');


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
// Race-distance gap is based on the next place in the actual standings, not 3D distance.
const gapBots=[{id:7,lap:2,t:0.6},{id:8,lap:2,t:0.4},{id:9,lap:2,t:0.1}];
const gapPlayer={lap:2,prevT:0.3};
const gapOrder=hud.buildRacePositions(gapPlayer,gapBots);
assert.equal(gapOrder.findIndex(row=>row.who==='player'),2);
const chasing=hud.buildRivalGapHud(gapPlayer,gapBots,gapOrder,[],5000);
assert.deepEqual({...chasing,distance:Math.round(chasing.distance)},{rivalId:'bot:8',direction:'ahead',place:2,finished:false,distance:500});
const leadingPlayer={lap:3,prevT:0.02};
const trailingBot=[{id:3,lap:2,t:0.98}];
const leadGap=hud.buildRivalGapHud(leadingPlayer,trailingBot,hud.buildRacePositions(leadingPlayer,trailingBot),[],5000);
assert.deepEqual({...leadGap,distance:Math.round(leadGap.distance)},{rivalId:'bot:3',direction:'behind',place:2,finished:false,distance:200});
const nextLapPlayer={lap:2,prevT:0.98};
const nextLapBot=[{id:5,lap:3,t:0.02}];
const lapGap=hud.buildRivalGapHud(nextLapPlayer,nextLapBot,hud.buildRacePositions(nextLapPlayer,nextLapBot),[],5000);
assert.ok(Math.abs(lapGap.distance-200)<1e-9,'crossing the lap boundary must not wrap the gap to a full lap');
const lappedPlayer={lap:2,prevT:0.25};
const lappedBot=[{id:5,lap:3,t:0.5}];
assert.equal(hud.formatRivalDistance(hud.buildRivalGapHud(lappedPlayer,lappedBot,hud.buildRacePositions(lappedPlayer,lappedBot),[],5000).distance),'6,3 км');
assert.equal(hud.formatRivalDistance(999.4),'999 м');
assert.equal(hud.formatRivalDistance(NaN),'—');
const finishedOrder=[{who:'opponent',index:0},{who:'player'}];
const finishedGap=hud.buildRivalGapHud({lap:2,prevT:0.9},[{id:4,lap:2,t:0.01}],finishedOrder,['bot:4'],5000);
assert.deepEqual(finishedGap,{rivalId:'bot:4',direction:'ahead',place:1,finished:true,distance:null});
assert.ok(Math.abs(hud.buildRivalGapHud({lap:1,prevT:0.4},[{id:4,lap:1,t:0.5}],finishedOrder,[],5000).distance-500)<1e-8);
assert.equal(hud.buildRivalGapHud({lap:1,prevT:0.4},[],[{who:'player'}],[],5000),null);
assert.equal(hud.buildRivalGapHud({lap:1,prevT:0.4},trailingBot,hud.buildRacePositions({lap:1,prevT:0.4},trailingBot),[],0),null);
assert.equal(hud.rivalGapTrend(chasing,{...chasing,distance:460}),'closing');
assert.equal(hud.rivalGapTrend(chasing,{...chasing,distance:550}),'opening');
assert.equal(hud.rivalGapTrend(chasing,{...chasing,distance:501}),'steady');
assert.equal(hud.rivalGapTrend(chasing,{...chasing,rivalId:'bot:99'}),'unknown','opponent changes reset the trend');
assert.equal(hud.rivalGapTrend(chasing,finishedGap),'unknown','finished rivals have no pace comparison');
assert.equal(hud.healthPercent(130),100);assert.equal(hud.healthPercent(-5),0);

assert.equal(typeof hud.speedometerReading, 'function', 'HUD must convert actual speed to a bounded needle reading');
for (const [speed, kmh, angle] of [[0,0,-135],[200/3.6,200,0],[400/3.6,400,135],[-10,36,-110.7],[150,540,135],[NaN,0,-135],[Infinity,0,-135]]) {
  const reading = hud.speedometerReading(speed);
  assert.equal(reading.kmh, kmh);
  assert.ok(Math.abs(reading.angle-angle)<1e-8, `needle at ${speed}: ${reading.angle}`);
  assert.ok(reading.fraction>=0 && reading.fraction<=1);
}
for (const [seconds, text] of [[0,'00:00.0'],[60.4,'01:00.4'],[59.99,'00:59.9'],[4000.1,'66:40.1'],[Infinity,'--:--.-'],[-1,'--:--.-']]) {
  assert.equal(hud.formatLapTime(seconds), text);
}

const third=race.resolveLapCompletion({lap:3,curLap:42,bestLap:50,totalLaps:15});
assert.equal(third.lap,4);assert.equal(third.bestLap,42);assert.equal(third.grantLapBonus,true);assert.equal(third.finished,false);
const final=race.resolveLapCompletion({lap:15,curLap:40,bestLap:39,totalLaps:15});
assert.equal(final.finished,true);assert.equal(final.lap,15);assert.equal(final.scoreDelta,50);

const {stepSpeedFeedback,createSpeedFeedback}=require('../src/game/speed-feedback.js');
const feedbackInput={active:true,speed:52,maxSpeed:52,nitro:false,cameraShake:true};
function feedbackFor(input,seconds=3,fps=60,initial=null){
  let state=initial;
  for(let i=0;i<seconds*fps;i++)state=stepSpeedFeedback(state,input,1/fps);
  return state;
}
const rest=feedbackFor({...feedbackInput,speed:0});
const fast=feedbackFor(feedbackInput);
const nitroView=feedbackFor({...feedbackInput,speed:80.6,nitro:true});
assert.equal(rest.fov,58);assert.equal(rest.flow,0);assert.equal(rest.vibration,0);
assert.ok(fast.fov>63&&fast.fov<65&&fast.flow>0.5);
assert.equal(rest.back,12.8,'closer parked chase camera');
assert.equal(rest.height,4.45,'lower chase camera height');
assert.equal(rest.lookAhead,14,'look ahead preserves the road');
assert.ok(fast.back>13.6&&fast.back<13.8&&fast.height<4.45&&fast.height>4,'speed changes framing without jumping');
assert.ok(nitroView.fov>fast.fov+2&&nitroView.fov<70&&nitroView.flow>fast.flow);
assert.equal(feedbackFor({...feedbackInput,speed:-10}).flow,0,'reverse must not look like nitro');
assert.equal(feedbackFor({...feedbackInput,speed:0,nitro:true}).boost,0,'nitro at rest must not create speed');
for(const fps of [30,60,144]){
  const view=feedbackFor(feedbackInput,1,fps);
  assert.ok(Math.abs(view.fov-feedbackFor(feedbackInput,1,60).fov)<1e-9,'time-based envelope');
  const end=feedbackFor({...feedbackInput,speed:0},4,fps,nitroView);
  assert.ok(end.flow<0.001&&Math.abs(end.fov-58)<0.01,'braking clears speed impression');
}
const reduced=feedbackFor({...feedbackInput,speed:100,nitro:true,reducedMotion:true});
assert.equal(reduced.fov,58);assert.equal(reduced.flow,0);assert.equal(reduced.vibration,0);
assert.equal(feedbackFor({...feedbackInput,cameraShake:false}).vibration,0);
assert.equal(stepSpeedFeedback(nitroView,{...feedbackInput,destroyed:true},1/60).flow,0);
assert.equal(stepSpeedFeedback(nitroView,{...feedbackInput,active:false},1/60).speed,0);
// Controller lifecycle with a synthetic canvas: pause freezes the envelope, reset clears it.
let strokes=0,clears=0,appends=0;
const ctx={setTransform(){},clearRect(){clears++;},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;}};
const canvas={style:{},setAttribute(){},getContext(){return ctx;}};
const overlay={style:{},appendChild(){appends++;}};
const feedback=createSpeedFeedback({document:{createElement(){return canvas;}},element:overlay});
feedback.resize(1600,900);
let rendered;
for(let i=0;i<180;i++)rendered=feedback.update(feedbackInput,1/60);
assert.ok(strokes>0&&Number(overlay.style.opacity)>0);
for(let i=0;i<120;i++)feedback.update({...feedbackInput,speed:80.6,nitro:true},1/60);
for(let i=0;i<240;i++)rendered=feedback.update({...feedbackInput,speed:0},1/60);
assert.equal(overlay.style.opacity,'0','boost expiry must fully hide the overlay, not leave an asymptotic tail');
const pausedView=feedback.update({active:false},0.1);
assert.deepEqual(pausedView,rendered);assert.equal(overlay.style.opacity,'0');
assert.ok(clears>0);
feedback.setQuality('low');assert.equal(canvas.width,1040);assert.equal(canvas.height,585);
feedback.update({...feedbackInput,reducedMotion:true},1/60);assert.equal(overlay.style.opacity,'0');
feedback.reset();assert.equal(feedback.update({...feedbackInput,speed:0},1/60).flow,0);
assert.equal(appends,1,'reuse one canvas across resets and quality changes');

// Actual input owners, synthetic DOM/audio/storage: no browser or saved user state.
const inputSource=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
const inputStart=inputSource.indexOf("    window.addEventListener('keydown',e=>{");
const inputEnd=inputSource.indexOf("    window.addEventListener('mousedown',e=>{",inputStart);
assert.ok(inputStart>=0&&inputEnd>inputStart);
const handlers={},actions={fullscreen:0,reset:0,restart:0,pulse:0},inputKeys={};
const inputContext={
  window:{addEventListener:(name,fn)=>{handlers[name]=fn;},restartGame(){actions.restart++;}},
  garage:{isOpen:()=>false},gameStarted:true,gameFinished:false,menuOpen:false,paused:false,
  startScreen:{classList:{contains:()=>true}},finishScreen:{classList:{contains:()=>true}},
  document:{activeElement:null},HTMLElement:class{},isInteractiveTarget:()=>false,focusGameCanvas(){},
  fullscreenTransition:false,fullscreenElement:()=>null,clearInputs(){},
  restartConfirmDialog:{open:false},requestRaceRestart(){actions.restart++;},
  openMenu(){inputContext.menuOpen=true;inputContext.paused=true;},closeMenu(){inputContext.menuOpen=false;inputContext.paused=false;},
  toggleFullscreen(){actions.fullscreen++;},settings:{sound:true},saveSettings(){},syncSettingsUI(){},
  audio:{setEnabled(){},resume(){}},showMessage(){},canControl:()=>true,
  player:{destroyed:false,resetCooldown:0},CONFIG,keys:inputKeys,
  activateDefensePulse(){actions.pulse++;},respawnPlayer(){actions.reset++;},activateNitro(){}
};
const returnStart=inputSource.indexOf('    function returnCarToTrack(){');
const returnEnd=inputSource.indexOf('\n    }',returnStart)+6;
assert.ok(returnStart>=0&&returnEnd>returnStart);
vm.runInNewContext(inputSource.slice(returnStart,returnEnd)+'\n'+inputSource.slice(inputStart,inputEnd),inputContext);
const keyEvent=(code,key,repeat=false)=>({code,key,repeat,target:null,preventDefault(){}});
for(const [code,key] of [['KeyM','ь'],['KeyT','е'],['KeyR','к'],['KeyF','а'],['KeyQ','й']])handlers.keydown(keyEvent(code,key));
assert.equal(inputContext.settings.sound,false,'mute must work in Russian layout');
assert.deepEqual(actions,{fullscreen:1,reset:1,restart:1,pulse:1},'actions use physical keys in Russian layout');
for(const [code,key] of [['KeyM','ь'],['KeyT','е'],['KeyR','к'],['KeyF','а'],['KeyQ','й']])handlers.keydown(keyEvent(code,key,true));
assert.equal(inputContext.settings.sound,false,'auto-repeat must not toggle sound');
assert.deepEqual(actions,{fullscreen:1,reset:1,restart:1,pulse:1},'auto-repeat must not repeat actions');
handlers.keydown(keyEvent('KeyW','ц'));handlers.keyup(keyEvent('KeyW','ц'));
assert.equal(inputKeys.KeyW,false);assert.equal(inputKeys['ц'],false,'layout-aware key release must not stick');
handlers.keydown(keyEvent('Escape','Escape'));assert.equal(inputContext.paused,true);
handlers.keydown(keyEvent('Escape','Escape',true));assert.equal(inputContext.paused,true,'holding Escape must keep pause');
handlers.keydown(keyEvent('Escape','Escape'));assert.equal(inputContext.paused,false,'a new Escape press resumes');

console.log('CYBER RACE gameplay contract tests passed.');
