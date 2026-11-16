// Deterministic overtakes: pure state, FPS, wrap, contact, teleport and actual runtime wiring.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createOvertakeTracker}=require('../src/game/overtake-events.js');
const LENGTH=1000;
function car(distance,props={}){
  const phase=(distance%LENGTH+LENGTH)%LENGTH/LENGTH*Math.PI*2;
  return {lap:Math.floor(distance/LENGTH)+1,t:((distance%LENGTH)+LENGTH)%LENGTH/LENGTH,
    x:160*Math.cos(phase),z:160*Math.sin(phase),...props};
}
function play(tracker,{fps=60,duration=4,start=200,playerSpeed=55,bots=[{id:0,start:222,speed:20}],
  contactAt=-1,deathAt=-1,teleportAt=-1,active=true,forward=true}={}){
  let rewards=[],previousContact=false;
  const stop=Math.round(duration*fps);
  for(let i=0;i<=stop;i++){
    const time=i/fps;
    const jump=teleportAt>=0&&time>=teleportAt?120:0;
    const player=car(start+playerSpeed*time+jump);
    const rivals=bots.map(b=>{
      const c=car(b.start+b.speed*time);
      const lateral=b.lateralTeleportAt>=0&&time>=b.lateralTeleportAt?b.lateralTeleportTo:(b.lateralOffset||0);
      const radius=(160-lateral)/160;
      return {...c,x:c.x*radius,z:c.z*radius,id:b.id,active:deathAt<0||time<deathAt};
    });
    if(contactAt>=0&&time>=contactAt&&!previousContact){
      tracker.contact(bots[0].id);previousContact=true;
    }
    rewards.push(...tracker.step({time,totalLength:LENGTH,player,rivals,active,forward}));
  }
  return rewards;
}
for(const fps of [30,60,144]){
  const tracker=createOvertakeTracker();
  const rewards=play(tracker,{fps});
  assert.equal(rewards.length,1,'single clean overtake at '+fps+' FPS');
  assert.equal(rewards[0].points,30);
  assert.equal(rewards[0].combo,1);
  assert.equal(play(tracker,{fps,start:200}).length,0,'same rival must not pay twice');
}
console.log('OVERTAKE_MULTI_FPS_PASS 30/60/144 and one reward per opponent');

for(const fps of [30,60,144]){
  const tracker=createOvertakeTracker();
  const rewards=play(tracker,{fps,bots:[{id:0,start:222,speed:20,lateralOffset:12}]});
  assert.equal(rewards.length,1,'one near miss at '+fps+' FPS');
  assert.deepEqual([rewards[0].points,rewards[0].combo,rewards[0].risky,rewards[0].bonusPoints],
    [50,1,true,20],'near pass adds fixed 20 points, not an extra combo step');
  assert.equal(play(tracker,{fps,bots:[{id:0,start:222,speed:20,lateralOffset:12}]}).length,0,
    'same opponent cannot farm the near-miss bonus');
  tracker.interrupt();
  assert.equal(play(tracker,{fps,bots:[{id:0,start:222,speed:20,lateralOffset:12}]}).length,0,
    'pause and respawn must not re-open a paid opponent');
  tracker.reset();
  assert.equal(play(tracker,{fps,bots:[{id:0,start:222,speed:20,lateralOffset:12}]})[0].points,50,
    'new race can earn a new near-miss bonus');
}
{
  const tracker=createOvertakeTracker();
  assert.equal(play(tracker,{bots:[{id:0,start:222,speed:20,lateralOffset:25}]})[0].points,30,
    'a distant pass earns ordinary points only');
  tracker.reset();
  assert.equal(play(tracker,{bots:[{id:0,start:222,speed:20,lateralOffset:0}]})[0].points,30,
    'an overlapping path must never earn near-miss bonus without collision event');
  tracker.reset();
  assert.equal(play(tracker,{bots:[{id:0,start:222,speed:20,lateralOffset:8}]})[0].points,30,
    'a path closer than safety clearance cannot be rewarded as a near miss');
  tracker.reset();
  assert.deepEqual(play(tracker,{bots:[{id:0,start:222,speed:20,lateralOffset:12}],contactAt:0.83}),[],
    'contact during confirmation cancels ordinary and risky rewards');
  tracker.reset();
  assert.deepEqual(play(tracker,{bots:[{id:0,start:222,speed:20,lateralOffset:12}],teleportAt:0.3}),[],
    'player teleport cannot earn risky points');
  tracker.reset();
  assert.equal(play(tracker,{bots:[{id:0,start:222,speed:20,lateralOffset:25,
    lateralTeleportAt:0.5,lateralTeleportTo:12}]})[0].points,30,
    'opponent lateral teleport near the pass cannot create risky points');
  tracker.reset();
  assert.deepEqual(play(tracker,{bots:[{id:0,start:222,speed:20,lateralOffset:12}],forward:false}),[],
    'wrong-way driving cannot earn risky points');
}
{
  const tracker=createOvertakeTracker();
  const rewards=play(tracker,{duration:4.5,bots:[
    {id:0,start:222,speed:20,lateralOffset:12},
    {id:1,start:280,speed:20,lateralOffset:25}
  ]});
  assert.deepEqual(rewards.map(({points,combo,bonusPoints})=>[points,combo,bonusPoints]),
    [[50,1,20],[60,2,0]],'risky bonus does not multiply or alter clean-pass combo');
}
console.log('RISKY_OVERTAKE_PASS 30/60/144, safe clearance, anti-farm, collision, pause, restart and combo');

{
  const tracker=createOvertakeTracker();
  const rewards=play(tracker,{duration:4.5,bots:[{id:0,start:222,speed:20},{id:1,start:280,speed:20}]});
  assert.deepEqual(rewards.map(({points,combo})=>[points,combo]),[[30,1],[60,2]]);
  tracker.reset();
  assert.equal(play(tracker).length,1,'restart re-enables a new race reward');
  assert.equal(play(tracker)[0],undefined,'repeated pass remains blocked after restart reward');
}
console.log('OVERTAKE_COMBO_RESTART_PASS sequence and reset');

{
  const tracker=createOvertakeTracker();
  const rewards=play(tracker,{duration:8,bots:[
    {id:0,start:222,speed:20},{id:1,start:280,speed:20},
    {id:2,start:340,speed:20},{id:3,start:400,speed:20}
  ]});
  assert.deepEqual(rewards.map(({points,combo})=>[points,combo]),
    [[30,1],[60,2],[90,3],[90,3]],'combo multiplier is capped at x3');
}
{
  const tracker=createOvertakeTracker();
  const rewards=play(tracker,{duration:24,bots:[
    {id:0,start:222,speed:20},{id:1,start:310,speed:20},{id:2,start:900,speed:20}
  ]});
  assert.deepEqual(rewards.map(({points,combo})=>[points,combo]),
    [[30,1],[60,2],[30,1]],'12 gameplay seconds without another pass end the chain');
}
console.log('OVERTAKE_COMBO_LIMIT_AND_EXPIRY_PASS max x3 and 12-second timeout');

{
  const tracker=createOvertakeTracker();
  assert.equal(play(tracker,{start:960,bots:[{id:0,start:982,speed:20}]}).length,1,
    'start/finish wrap must not break a valid pass');
  tracker.reset();
  assert.equal(play(tracker,{start:960,bots:[{id:0,start:982,speed:20,lateralOffset:12}]})[0].points,50,
    'near miss crossing start/finish must still add the fixed risk bonus');
}
{
  const tracker=createOvertakeTracker();
  assert.deepEqual(play(tracker,{contactAt:0.62}),[],'a collision voids a clean overtake');
  tracker.reset();
  assert.deepEqual(play(tracker,{deathAt:0.75}),[],'destroyed rival cannot be overtaken for points');
  tracker.reset();
  assert.deepEqual(play(tracker,{teleportAt:0.3}),[],'player teleport must not earn points');
  tracker.reset();
  assert.deepEqual(play(tracker,{active:false}),[],'inactive race cannot award');
  tracker.reset();
  assert.deepEqual(play(tracker,{forward:false}),[],'reverse/wrong-way travel cannot award');
}
console.log('OVERTAKE_NEGATIVE_PASS wrap, contact, death, teleport, pause and wrong direction');

{
  const tracker=createOvertakeTracker();
  let maxScore=0;
  // Large temporal gaps expire the chain; reset/interrupt preserves already awarded ids.
  const first=play(tracker,{duration:2});
  assert.equal(first.length,1);maxScore+=first[0].points;
  tracker.interrupt();
  assert.deepEqual(play(tracker,{start:200,bots:[{id:0,start:222,speed:20}]}),[]);
  assert.equal(maxScore,30);
  tracker.reset();
  const delayed=play(tracker,{duration:2,bots:[{id:1,start:222,speed:20}]});
  assert.equal(delayed[0].points,30);
}
console.log('OVERTAKE_INTERRUPT_PASS no farming on interruption');

// A championship checkpoint must preserve paid rival ids, while a new race resets them.
{
  const beforeSave=createOvertakeTracker();
  assert.equal(play(beforeSave).length,1);
  assert.deepEqual(beforeSave.snapshotAwardedIds(),[0],'paid rival list must be serializable');
  const savedIds=JSON.parse(JSON.stringify(beforeSave.snapshotAwardedIds()));
  const afterReload=createOvertakeTracker();
  assert.equal(afterReload.restoreAwardedIds(savedIds),true);
  assert.deepEqual(afterReload.snapshotAwardedIds(),[0],'resume must restore paid rival history');
  assert.deepEqual(play(afterReload),[],'resumed stage must not pay a rival twice');
  for(const invalid of [[0,0],[6],[-1],[1.5],['0'],new Array(1),null]){
    assert.equal(afterReload.restoreAwardedIds(invalid),false,'invalid reward ids must be rejected');
    assert.deepEqual(afterReload.snapshotAwardedIds(),[0],'rejected restore cannot erase paid history');
  }
  afterReload.reset();
  assert.equal(play(afterReload).length,1,'a genuinely new race re-enables rewards');
}
console.log('OVERTAKE_CHECKPOINT_AWARDS_PASS save, resume, invalid input and fresh race');

{
  const source=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
  const from=source.indexOf('    function updateOvertakes(){');
  const to=source.indexOf('\n    function checkBonuses(){',from);
  assert.ok(from>=0&&to>from,'runtime must use the new overtake owner');
  const messages=[],tracker=createOvertakeTracker();
  const state={
    player:{...car(200),prevT:0.2,speed:55,heading:0,invincibleTimer:0,score:0,totalTime:0,destroyed:false,lastSampleIdx:0},
    opponents:[{id:0,lap:1,t:0.222,speed:20,dead:false,finished:false,invincibleTimer:0,car:{group:{position:{x:0,z:0}}}}],
    tangents:[{x:0,z:1}],totalLength:LENGTH,gameFinished:false,canControl:()=>true,
    overtakeTracker:tracker,showMessage:text=>messages.push(text),lastOvertakeNotice:null,Math
  };
  vm.createContext(state);vm.runInContext(source.slice(from,to),state);
  for(const [offset,expectedScore,label] of [[0,30,'ЧИСТЫЙ'],[12,50,'РИСКОВАННЫЙ']]){
    tracker.reset();messages.length=0;state.player.score=0;state.lastOvertakeNotice=null;
    for(let i=0;i<=3*60;i++){
      const time=i/60;
      const pp=car(200+55*time),bb=car(222+20*time);
      Object.assign(state.player,{lap:pp.lap,prevT:pp.t,pos:{x:pp.x,z:pp.z},totalTime:time});
      Object.assign(state.opponents[0],{lap:bb.lap,t:bb.t});
      const radius=(160-offset)/160;
      state.opponents[0].car.group.position={x:bb.x*radius,z:bb.z*radius};
      state.updateOvertakes();
    }
    assert.equal(state.player.score,expectedScore,'actual runtime integration must credit score');
    assert.equal(messages.length,0,'overtakes must not replace the central gameplay message');
    assert.equal(state.lastOvertakeNotice.event.points,expectedScore,'runtime keeps the awarded event');
    const {buildOvertakeSeriesHud}=require('../src/ui/hud-model.js');
    const projection=buildOvertakeSeriesHud(tracker.getSeriesStatus(state.player.totalTime),
      state.lastOvertakeNotice,state.player.totalTime,true);
    assert.ok(projection.notice.includes(label+' ОБГОН')&&projection.notice.includes('+'+expectedScore),
      'dedicated HUD feedback must show correct points and type');
    if(offset)assert.match(projection.notice,/РИСК \+20/,
      'risk points must be explained without replacing combat messages');
  }
}
console.log('OVERTAKE_ACTUAL_RUNTIME_OWNER_PASS points + separate HUD event without central message override');


// Series HUD contract: one gameplay clock, no wall-clock timers, no score mutations.
{
  const tracker=createOvertakeTracker();
  assert.equal(tracker.getSeriesStatus(0).active,false,'series starts hidden');
  const first=play(tracker,{duration:2});
  assert.equal(first.length,1);
  const state=tracker.getSeriesStatus(2);
  assert.equal(state.active,true);
  assert.equal(state.combo,1);
  assert.equal(state.nextPoints,60);
  assert.ok(state.secondsLeft>0&&state.secondsLeft<=12);
  assert.equal(tracker.getSeriesStatus(2).secondsLeft,state.secondsLeft,'pause freezes the gameplay clock');
  assert.equal(tracker.getSeriesStatus(25).active,false,'series expires without UI timers');
  assert.deepEqual(tracker.snapshotAwardedIds(),[0],'view reads must not change anti-farm history');
  tracker.contact(1);
  assert.equal(tracker.getSeriesStatus(2).active,false,'collision cancels a combo');
  tracker.reset();
  assert.equal(tracker.getSeriesStatus(2).active,false,'restart clears combo');
  assert.deepEqual(tracker.snapshotAwardedIds(),[]);
}
{
  const hud=require('../src/ui/hud-model.js');
  const state={active:true,combo:2,secondsLeft:8.2,windowSeconds:12,nextPoints:90};
  const notice={event:{risky:true,points:80,combo:2,bonusPoints:20},time:10};
  const view=hud.buildOvertakeSeriesHud(state,notice,10.5,true);
  assert.equal(view.visible,true);
  assert.equal(view.multiplier,'×2');
  assert.equal(view.nextReward,'+90 очков');
  assert.equal(view.remaining,'9 с');
  assert.ok(view.progress>68&&view.progress<69);
  assert.match(view.notice,/РИСКОВАННЫЙ/);
  assert.match(view.notice,/РИСК \+20/);
  assert.equal(hud.buildOvertakeSeriesHud(state,notice,12.3,true).notice,'','old event message expires');
  assert.equal(hud.buildOvertakeSeriesHud(state,notice,10.5,false).visible,false,'inactive screen hides combo');
  assert.equal(hud.buildOvertakeSeriesHud({active:false},notice,10.5,true).visible,false);
}
console.log('OVERTAKE_SERIES_HUD_CONTRACT_PASS gameplay clock, reset, collision, next reward and feedback');
