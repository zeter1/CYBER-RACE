import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root='G:/МОЯ Веб-разработка/CYBER RACE CAR WARS';
const source=readFileSync(new URL('../src/game/slipstream.js',import.meta.url),'utf8');
const context=vm.createContext({globalThis:{}});
vm.runInContext(source,context,{filename:'slipstream.js'});
const create=context.globalThis.CyberRace.game.createSlipstreamTracker;
assert.equal(typeof create,'function');

const player=(extra={})=>({x:0,z:0,heading:0,speed:53,nitro:2,onRoad:true,forward:true,undamaged:true,...extra});
const rival=(extra={})=>({id:0,x:0,z:65,heading:0,speed:45,active:true,...extra});
const step=(tracker,{p=player(),r=[rival()],dt=0.1,now=0,active=true}={})=>
  tracker.step({dt,now,active,player:p,rivals:r});
function earn(tracker,{p=player(),r=[rival()],fps=60}={}){
  let reward=null;
  for(let i=0;i<Math.ceil(2*fps);i++){
    const result=step(tracker,{p,r,dt:1/fps,now:(i+1)/fps});
    if(result!==null){reward=result;break;}
  }
  return reward;
}

for(const fps of [30,60,144]){
  const t=create();
  assert.equal(earn(t,{fps}),0,'one valid draft pays at '+fps+'fps');
  assert.equal(t.view(1.6).rewarded,true);
  assert.equal(t.view(1.6).progress,1);
  assert.equal(t.view(9).visible,false);
  assert.equal(earn(t,{fps}),null,'same rival cannot be farmed at '+fps+'fps');
  assert.equal(earn(t,{fps,r:[rival({id:1})]}),1,'a different rival can reward');
  t.reset();
  assert.equal(earn(t,{fps}),0,'restart makes a new race');
}
for(const [name,wrong] of [
  ['outside road',{p:player({onRoad:false})}],
  ['backwards',{p:player({forward:false})}],
  ['too slow',{p:player({speed:12})}],
  ['damaged',{p:player({undamaged:false})}],
  ['full stock',{p:player({nitro:5})}],
  ['too close',{r:[rival({z:8})]}],
  ['too far',{r:[rival({z:160})]}],
  ['different lane',{r:[rival({x:20})]}],
  ['opposite heading',{r:[rival({heading:Math.PI})]}],
  ['slow rival',{r:[rival({speed:4})]}],
  ['destroyed rival',{r:[rival({active:false})]}],
  ['negative movement',{r:[rival({z:-40})]}],
]){
  assert.equal(earn(create(),wrong),null,name+' must not grant nitro');
}
{
  const t=create();
  for(let i=0;i<12;i++) step(t,{now:i*0.1});
  assert.ok(t.view(1.2).progress>0.7,'progress reaches advanced stage');
  step(t,{active:false,now:1.3});
  assert.equal(t.view(1.3).progress,0,'pause interrupts a partial chain');
  assert.equal(earn(t),0,'progress can be restarted');
}
{
  const t=create();
  for(let i=0;i<11;i++) step(t,{now:i*0.1});
  assert.equal(step(t,{r:[rival({id:1})],now:1.2}),null,'switch rival resets partial progress');
  assert.ok(t.view(1.2).progress<0.2);
  t.interrupt();
  assert.equal(t.view(1.3).visible,false);
}
{
  const tracker=create();
  assert.equal(earn(tracker),0);
  assert.equal(tracker.restoreAwardedIds([0,0]),false,'duplicate checkpoint ids rejected');
  assert.equal(tracker.restoreAwardedIds([7]),false,'unknown checkpoint rival rejected');
  assert.deepEqual([...tracker.snapshotAwardedIds()],[0],'invalid restore preserves existing protection');
  const restored=create();
  assert.equal(restored.restoreAwardedIds(tracker.snapshotAwardedIds()),true);
  assert.equal(earn(restored),null,'restored checkpoint cannot pay same rival again');
  assert.equal(earn(restored,{r:[rival({id:2})]}),2,'different rival remains payable');
  restored.reset();
  assert.equal(earn(restored),0,'fresh race clears checkpoint anti-farm history');
}
const runtime=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(runtime,/updatePlayer\(dt\); updateOpponents\(dt\); updateSlipstream\(dt\)/,'live driving integrates drafting after rival positions');
assert.match(runtime,/slipstreamTracker\.reset\(\)/,'race start resets earned rival set');
assert.match(runtime,/player\.nitro=Math\.min\(5,player\.nitro\+1\)/,'real player stock receives reward');
assert.match(index,/<script src="src\/game\/slipstream\.js"><\/script>/,'browser loads tracker');
console.log('SLIPSTREAM_PASS 30/60/144 FPS, safety boundaries, per-rival anti-farming, resets and live integration');

function extractRuntimeOwner(name){
  const start=runtime.indexOf('    function '+name+'(');
  const end=runtime.indexOf('\n    }',start);
  assert.ok(start>=0&&end>start,'missing runtime owner '+name);
  return runtime.slice(start,end+6);
}
{
  const owner=vm.createContext({
    player:{pos:{x:0,z:0},heading:0,lastSampleIdx:0,speed:53,nitro:2,
      damageCooldown:0,invincibleTimer:0,totalTime:0,destroyed:false},
    samples:[{x:0,z:0}],tangents:[{x:0,z:1}],
    CONFIG:{ROAD_HALF:40,CAR_RADIUS:3},
    opponents:[{id:0,dead:false,finished:false,invincibleTimer:0,speed:45,
      car:{group:{position:{x:0,z:65},rotation:{y:Math.PI}}}}],
    slipstreamTracker:create(),canControl:()=>true
  });
  vm.runInContext(extractRuntimeOwner('updateSlipstream'),owner);
  for(let i=0;i<90;i++){owner.player.totalTime=(i+1)/60;owner.updateSlipstream(1/60);}
  assert.equal(owner.player.nitro,3,'actual owner credits one real charge');
  for(let i=90;i<180;i++){owner.player.totalTime=(i+1)/60;owner.updateSlipstream(1/60);}
  assert.equal(owner.player.nitro,3,'actual owner cannot farm same rival');
  owner.opponents[0].id=1;
  for(let i=180;i<275;i++){owner.player.totalTime=(i+1)/60;owner.updateSlipstream(1/60);}
  assert.equal(owner.player.nitro,4,'another opponent earns another charge');
  owner.opponents[0].id=2;owner.player.pos.x=100;
  for(let i=275;i<370;i++){owner.player.totalTime=(i+1)/60;owner.updateSlipstream(1/60);}
  assert.equal(owner.player.nitro,4,'off-road player cannot earn');
  owner.player.pos.x=0;owner.player.nitro=5;
  for(let i=370;i<465;i++){owner.player.totalTime=(i+1)/60;owner.updateSlipstream(1/60);}
  assert.equal(owner.player.nitro,5,'real owner respects inventory cap');
  owner.player.nitro=4;owner.player.draftContact=true;
  for(let i=465;i<555;i++){owner.player.totalTime=(i+1)/60;owner.updateSlipstream(1/60);}
  assert.equal(owner.player.nitro,4,'scraping an obstacle or rival blocks draft');
  owner.player.draftContact=false;
  for(let i=555;i<645;i++){owner.player.totalTime=(i+1)/60;owner.updateSlipstream(1/60);}
  assert.equal(owner.player.nitro,5,'clean follow after contact earns normally');
}
console.log('SLIPSTREAM_RUNTIME_OWNER_PASS charged, non-farm, offroad, contact, stock cap');
