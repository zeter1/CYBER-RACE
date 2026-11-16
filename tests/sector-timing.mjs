import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const {createSectorTimer,formatSectorTime,formatSectorDelta}=require('../src/game/sector-timing.js');
const EPS=1e-5;
const eq=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<EPS,
  label+': '+actual+' != '+expected);

// Simulate exact sector boundaries with many frame sizes. No browser, DOM,
// physics, record storage or game loop shortcuts are required for this owner.
function completeLap(timer,lap,durations,framesPerSector=300){
  const events=[];
  let elapsed=0;
  for(let sector=0;sector<3;sector++){
    for(let frame=1;frame<=framesPerSector;frame++){
      elapsed+=durations[sector]/framesPerSector;
      const t=(sector+frame/framesPerSector)/3;
      const event=sector===2&&frame===framesPerSector
        ?timer.closeLap({lap,t:0,elapsed,onRoad:true,forward:true})
        :timer.observe({lap,t,elapsed,onRoad:true,forward:true});
      if(event)events.push(event);
    }
  }
  return events;
}

for(const fps of [30,60,144]){
  const timer=createSectorTimer();
  const first=completeLap(timer,1,[30,31,29],fps*3);
  assert.equal(first.length,3,'every sector is recorded once at '+fps+' FPS');
  first.forEach((event,i)=>{
    assert.equal(event.sector,i+1);
    eq(event.time,[30,31,29][i],'first lap sector '+i);
    assert.equal(event.delta,null);
  });
  assert.deepEqual(timer.snapshot().best.map(x=>Math.round(x)),[30,31,29]);
  assert.equal(timer.snapshot().lastCompleted.lap,1);
  const second=completeLap(timer,2,[28,35,27],fps*3);
  [-2,4,-2].forEach((delta,i)=>eq(second[i].delta,delta,'delta '+i));
  assert.deepEqual(timer.snapshot().best.map(x=>Math.round(x)),[28,31,27],
    'best split is independent per sector');
  assert.equal(timer.snapshot().lastCompleted.lap,2);
  [-2,4,-2].forEach((delta,i)=>eq(timer.snapshot().lastCompleted.deltas[i],delta,'final delta '+i));
  const third=completeLap(timer,3,[27,30,27],fps*3);
  assert.equal(third.length,3);
  assert.deepEqual(timer.snapshot().best.map(Math.round),[27,30,27]);
}
console.log('SECTOR_TIMING_MULTI_FPS_PASS 30/60/144, split interpolation, best and delta');

const noDuplicate=createSectorTimer();
for(let i=1;i<=32;i++)assert.equal(noDuplicate.observe({lap:1,t:i/100,elapsed:i*15/32}),null);
const one=noDuplicate.observe({lap:1,t:1/3,elapsed:15.7});
assert.equal(one.sector,1);
assert.equal(noDuplicate.observe({lap:1,t:1/3,elapsed:16}),null,'staying on gate cannot count twice');
const next=noDuplicate.observe({lap:1,t:0.34,elapsed:16.5});
assert.equal(next,null);

for(const kind of ['backward','teleport','offroad','reverse','bad-time','bad-lap']){
  const timer=createSectorTimer();
  for(let i=1;i<=5;i++)timer.observe({lap:1,t:i*.02,elapsed:i*1.2});
  let sample={lap:1,t:0.11,elapsed:7,onRoad:true,forward:true};
  if(kind==='backward')sample.t=0.08;
  if(kind==='teleport')sample.t=0.50;
  if(kind==='offroad')sample.onRoad=false;
  if(kind==='reverse')sample.forward=false;
  if(kind==='bad-time')sample.elapsed=-1;
  if(kind==='bad-lap')sample.lap=2;
  assert.equal(timer.observe(sample),null);
  assert.equal(timer.snapshot().valid,false,kind+' invalidates current timing lap');
  assert.equal(timer.closeLap({lap:1,t:0,elapsed:90}),null);
  assert.deepEqual(timer.snapshot().best,[null,null,null],kind+' must never invent best splits');
  assert.equal(timer.snapshot().valid,true,'next lap can be timed');
  assert.equal(completeLap(timer,2,[18,18,18]).length,3);
}
console.log('SECTOR_INVALIDATION_PASS backward, teleport, offroad, reverse, bad clocks/laps');

const death=createSectorTimer();
completeLap(death,1,[22,23,24]);
for(let i=1;i<=10;i++)death.observe({lap:2,t:i*.015,elapsed:i});
death.invalidate();
assert.equal(death.closeLap({lap:2,t:0,elapsed:90}),null);
assert.deepEqual(death.snapshot().best.map(Math.round),[22,23,24],
  'death cancels only the current lap, not earlier bests');
assert.equal(completeLap(death,3,[21,22,23]).length,3);
death.reset();
assert.deepEqual(death.snapshot().best,[null,null,null]);
assert.equal(death.snapshot().lastCompleted,null);
assert.equal(death.snapshot().sector,1);

const restored=createSectorTimer();
completeLap(restored,1,[18,19,20]);
restored.resume({lap:4,t:0.51,elapsed:45});
assert.equal(restored.snapshot().valid,false,'restored incomplete lap cannot gain split times');
assert.deepEqual(restored.snapshot().best,[null,null,null],
  'unsaved sector history must not be guessed on resume');
restored.observe({lap:4,t:.55,elapsed:50});
assert.equal(restored.closeLap({lap:4,t:0,elapsed:78}),null);
assert.equal(completeLap(restored,5,[26,27,28]).length,3);
console.log('SECTOR_LIFECYCLE_PASS death, reset, checkpoint resume and next clean lap');

assert.equal(formatSectorTime(31.456),'31,46 с');
assert.equal(formatSectorTime(78.234),'1:18,23');
assert.equal(formatSectorTime(null),'—');
assert.equal(formatSectorDelta(-.42),'−0,42 с');
assert.equal(formatSectorDelta(1.18),'+1,18 с');
assert.equal(formatSectorDelta(0),'±0,00 с');

const runtime=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const token of ['sectorTimer.observe(sectorSample)','sectorTimer.closeLap(sectorSample)',
  'sectorTimer.invalidate()','sectorTimer.reset()','sectorTimer.resume({lap:player.lap',
  'finishStats.innerHTML+=sectorFinishMarkup()','sectorTimingEl.hidden=!sectorVisible']){
  assert.ok(runtime.includes(token),'missing runtime ownership '+token);
}
for(const token of ['id="sector-timing"','id="sector-current"','id="sector-delta"',
  'src="src/game/sector-timing.js"']){
  assert.ok(html.includes(token),'missing browser wiring '+token);
}
console.log('SECTOR_RUNTIME_WIRING_PASS real owner references and HTML');

const timerForFinish=createSectorTimer();
completeLap(timerForFinish,1,[30,31,29]);
completeLap(timerForFinish,2,[28,35,27]);
const start=runtime.indexOf('    function sectorFinishMarkup(){');
const end=runtime.indexOf('\n    }',start);
assert.ok(start>=0&&end>start,'finish markup owner exists');
const finishContext={sectorTimer:timerForFinish,formatSectorTime,formatSectorDelta};
vm.createContext(finishContext);
vm.runInContext(runtime.slice(start,end+6),finishContext);
const finishView=finishContext.sectorFinishMarkup();
assert.match(finishView,/ТЕМП ПО СЕКТОРАМ · КРУГ 2/);
assert.match(finishView,/data-tone="faster"/);
assert.match(finishView,/data-tone="slower"/);
assert.match(finishView,/Больше всего времени потеряно в секторе 2: \+4,00 с/);
assert.equal((finishView.match(/class="finish-sector"/g)||[]).length,3);
timerForFinish.reset();
assert.match(finishContext.sectorFinishMarkup(),/Нет полного корректного замера/);
console.log('SECTOR_FINISH_VIEW_PASS real runtime owner, loss advice, three cards and empty state');
