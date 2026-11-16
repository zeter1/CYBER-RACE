import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

// The only file read is this owner module. Its registration runs in a VM with
// synthetic audio, fetch and timers: no browser, device, network or state writes.
const source=readFileSync(new URL('../src/audio/audio-system.js',import.meta.url),'utf8');

class AudioParamFake{
  constructor(){this.value=0;}
  setValueAtTime(value,time){assert.ok(Number.isFinite(value)&&Number.isFinite(time));this.value=value;}
  linearRampToValueAtTime(value,time){this.setValueAtTime(value,time);}
  exponentialRampToValueAtTime(value,time){assert.ok(value>0);this.setValueAtTime(value,time);}
  setTargetAtTime(value,time,constant){assert.ok(constant>0);this.setValueAtTime(value,time);}
  cancelScheduledValues(time){assert.ok(Number.isFinite(time));}
}
class AudioNodeFake{
  constructor(ctx){
    this.connections=new Set();ctx.nodes.push(this);
    for(const name of ['gain','frequency','Q','threshold','knee','ratio','attack','release','playbackRate','pan'])this[name]=new AudioParamFake();
  }
  connect(node){this.connections.add(node);return node;}
  disconnect(){this.connections.clear();}
}
class AudioSourceFake extends AudioNodeFake{
  constructor(ctx){super(ctx);this.started=false;this.ended=false;ctx.sources.push(this);}
  start(time=0,offset=0){
    // Web Audio permits start() and times earlier than currentTime.
    assert.ok(!this.started&&Number.isFinite(time)&&time>=0&&offset>=0);this.started=true;
  }
  stop(time=0){assert.ok(this.started&&Number.isFinite(time)&&time>=0);this.stopAt=time;}
  finish(){if(!this.ended){this.ended=true;this.onended?.();}}
}

function harness({protocol='file:',state='running',missing=[],undecodable=[]}={}){
  const contexts=[],requests=[],timers=new Set();
  class AudioContextFake{
    constructor(){
      this.currentTime=0;this.state=state;this.sampleRate=44100;this.resumeCalls=0;
      this.nodes=[];this.sources=[];this.destination={};contexts.push(this);
    }
    createGain(){return new AudioNodeFake(this);}
    createBiquadFilter(){return new AudioNodeFake(this);}
    createDynamicsCompressor(){return new AudioNodeFake(this);}
    createStereoPanner(){return new AudioNodeFake(this);}
    createOscillator(){return new AudioSourceFake(this);}
    createBufferSource(){return new AudioSourceFake(this);}
    createBuffer(channels,length,rate){
      return {duration:length/rate,numberOfChannels:channels,getChannelData:()=>new Float32Array(length)};
    }
    decodeAudioData(data){
      if(new Uint8Array(data)[0]===0)return Promise.reject(new Error('Synthetic unsupported codec'));
      return Promise.resolve({duration:0.25,numberOfChannels:2});
    }
    resume(){this.resumeCalls++;this.state='running';return Promise.resolve();}
    advance(seconds){
      this.currentTime+=seconds;
      for(const node of this.sources)if(node.stopAt<=this.currentTime)node.finish();
    }
  }
  const sandbox={
    window:{AudioContext:AudioContextFake},location:{protocol},URL,AbortController,
    document:{currentScript:{src:'https://game.invalid/src/audio/audio-system.js'}},
    console:{warn:()=>assert.fail('Unexpected audio context warning')},
    setTimeout(fn,ms){const timer={fn,ms};timers.add(timer);return timer;},
    clearTimeout(timer){timers.delete(timer);},
    async fetch(url,options){
      const type=new URL(url).pathname.split('/').at(-1).replace(/\.(ogg|wav)$/,'');
      requests.push({url,options});
      return {ok:!missing.includes(type),arrayBuffer:async()=>Uint8Array.of(undecodable.includes(type)?0:1).buffer};
    }
  };
  vm.runInNewContext(source,sandbox,{filename:'src/audio/audio-system.js'});
  return {audio:new sandbox.CyberRace.audio.AudioSys(),contexts,requests,timers};
}

function assertReleased(audio){
  assert.equal(audio.voices.size,0,'all effect events must leave the active set');
  assert.ok(audio.ctx.sources.every(node=>node.ended&&node.onended===null),'every source must finish and release its callback');
  const persistent=new Set([audio.effectsGain,audio.effectsCompressor,audio.masterGain,audio.masterCompressor]);
  assert.ok(audio.ctx.nodes.every(node=>persistent.has(node)||node.connections.size===0),'all per-event audio nodes must disconnect');
}

function assertBoundedBurst(audio){
  for(let i=0;i<100;i++)audio.play('shoot');
  assert.equal(audio.voices.size,18,'combat events must respect the voice limit');
  const createdSources=audio.ctx.sources.length,createdNodes=audio.ctx.nodes.length;
  for(let i=0;i<100;i++)audio.play('shoot');
  assert.equal(audio.ctx.sources.length,createdSources,'saturated bursts must not allocate more sources');
  assert.equal(audio.ctx.nodes.length,createdNodes,'saturated bursts must not allocate more routing nodes');
}

test('audio stays lazy, suspended playback does not resume itself, direct files use procedural audio',async()=>{
  const {audio,contexts,requests}=harness({state:'suspended'});
  assert.equal(contexts.length,0);
  audio.setEnabled(false);audio.play('shoot');audio.setEnabled(true);
  audio.play('unknown');audio.play('shoot',{strength:0});
  assert.equal(contexts.length,0,'muted, unknown and zero-strength events must not create a context');
  audio.play('shoot');
  assert.equal(contexts.length,1);assert.equal(audio.ctx.resumeCalls,0);assert.equal(audio.voices.size,0);
  audio.resume();await audio.loadSamples();
  assert.equal(audio.ctx.resumeCalls,1);assert.equal(requests.length,0,'file:// must not fetch samples');
  audio.play('shoot');assert.ok(audio.voices.size>0);audio.ctx.advance(2);assertReleased(audio);
});

test('every event completes and repeated saturated bursts release all effect nodes',()=>{
  const {audio}=harness();
  for(const type of ['shoot','rocket','explosion','hit','ricochet','bonus','nitro','countdown','go','shield']){
    audio.play(type);assert.equal(audio.voices.size,1,`${type} must produce an event`);
    audio.ctx.advance(2);assertReleased(audio);
  }
  assertBoundedBurst(audio);audio.ctx.advance(2);assertReleased(audio);
  assertBoundedBurst(audio);audio.ctx.advance(2);assertReleased(audio);
});

test('distance and strength attenuate effects; mute stops existing events and unmute permits new ones',()=>{
  const {audio}=harness();
  audio.play('explosion',{distance:0,strength:1});
  const near=[...audio.voices].at(-1).output.gain.value;
  audio.play('explosion',{distance:100,strength:1});
  const distant=[...audio.voices].at(-1).output.gain.value;
  audio.play('explosion',{distance:100,strength:0.5});
  const weak=[...audio.voices].at(-1).output.gain.value;
  assert.ok(near>distant&&distant>weak&&weak>0,'greater distance and lower strength must reduce gain');
  audio.setEnabled(false);
  const count=audio.ctx.sources.length;audio.play('shoot');
  assert.equal(audio.ctx.sources.length,count);assert.equal(audio.effectsGain.gain.value,0);
  audio.ctx.advance(0.1);assertReleased(audio);
  audio.setEnabled(true);audio.play('shoot',null);
  assert.equal(audio.voices.size,1);assert.ok(audio.effectsGain.gain.value>0);
  audio.ctx.advance(2);assertReleased(audio);
});

test('local samples load once; missing files and unsupported codecs retain procedural playback',async()=>{
  const {audio,requests,timers}=harness({protocol:'https:',missing:['hit'],undecodable:['rocket']});
  audio.resume();
  const loading=audio.loadSamples();assert.equal(audio.loadSamples(),loading);
  await loading;
  assert.equal(requests.length,11);assert.equal(new Set(requests.map(item=>item.url)).size,11);
  for(const {url,options} of requests){
    assert.equal(new URL(url).origin,'https://game.invalid');
    assert.ok(new URL(url).pathname.startsWith('/assets/audio/'));
    assert.equal(options.mode,'same-origin');assert.equal(options.credentials,'omit');
  }
  assert.equal(audio.sampleStatus.get('shoot'),'ready');
  assert.equal(audio.sampleStatus.get('hit'),'procedural');assert.equal(audio.sampleStatus.get('rocket'),'procedural');
  assert.equal(timers.size,0,'completed loads must clear timeout handles');
  for(const type of ['shoot','hit','rocket']){
    audio.play(type);assert.equal(audio.voices.size,1);
    if(type==='shoot')assert.ok(audio.ctx.sources.some(node=>node.buffer===audio.samples.get(type)),'a decoded sample must reach a playback source');
    audio.ctx.advance(2);assertReleased(audio);
  }
  await audio.loadSamples();assert.equal(requests.length,11,'playback and repeated load calls must not refetch');
  assertBoundedBurst(audio);audio.setEnabled(false);audio.ctx.advance(0.1);assertReleased(audio);
});

test('failed audio downloads retry only missing samples after recovery, without replaying ready assets',async()=>{
  const missing=['hit','rocket'];
  const {audio,requests,timers}=harness({protocol:'https:',missing});
  audio.resume();await audio.loadSamples();
  assert.equal(requests.length,11);
  const ready=audio.samples.get('shoot');
  assert.equal(audio.sampleStatus.get('hit'),'procedural');
  assert.equal(audio.sampleStatus.get('rocket'),'procedural');
  await audio.loadSamples();
  assert.equal(requests.length,11,'cooldown prevents repeated requests while offline');
  missing.length=0;
  audio.sampleRetryAfter=0; // simulate retry interval elapsing without real delay
  await audio.loadSamples();
  assert.equal(requests.length,13,'retry only the two previously failed audio files');
  assert.equal(audio.sampleStatus.get('hit'),'ready');
  assert.equal(audio.sampleStatus.get('rocket'),'ready');
  assert.equal(audio.samples.get('shoot'),ready,'do not replace successful samples');
  await audio.loadSamples();
  assert.equal(requests.length,13,'all decoded files are cached');
  assert.equal(timers.size,0,'retry releases all timeout handles');
});

test('engine has audible gear changes with hysteresis; pause, destruction and mute silence every driving layer',()=>{
  const {audio}=harness();audio.resume();
  audio.updateEngine(.15,true,false,{throttle:1});
  const before=audio.engineOsc.frequency.value;
  audio.updateEngine(.18,true,false,{throttle:1});
  assert.equal(audio.gear,1);assert.ok(audio.engineOsc.frequency.value<before*.75,'upshift must lower RPM');
  for(const ratio of [.16,.17,.16,.17])audio.updateEngine(ratio,true,false,{throttle:1});
  assert.equal(audio.gear,1,'small speed changes must not hunt between gears');
  audio.updateEngine(.75,true,true,{throttle:1,skid:.8});
  assert.ok(audio.wind.gain.gain.value>0&&audio.boost.gain.gain.value>0&&audio.skid.gain.gain.value>0);
  const nodes=audio.ctx.nodes.length,sources=audio.ctx.sources.length;
  for(let i=0;i<200;i++)audio.updateEngine(.8,true,true,{throttle:1,skid:.5});
  assert.equal(audio.ctx.nodes.length,nodes);assert.equal(audio.ctx.sources.length,sources,'driving layers must be reused');
  audio.updateEngine(.8,false,true,{throttle:1,skid:1});
  for(const gain of [audio.engineGain,audio.wind.gain,audio.boost.gain,audio.skid.gain])assert.equal(gain.gain.value,0);
  audio.setEnabled(false);assert.equal(audio.masterGain.gain.value,0);
  audio.updateEngine(1,true,true,{skid:1});assert.equal(audio.ctx.nodes.length,nodes);
  audio.setEnabled(true);audio.updateEngine(.1,true,false,{});
  assert.ok(audio.masterGain.gain.value>0&&audio.engineGain.gain.value>0);
  audio.updateEngine(NaN,false,false,null);
});

test('decoded engine and tire loops attach once, crossfade from synthesis and survive repeated pause/resume',async()=>{
  const {audio,requests}=harness({protocol:'https:'});audio.resume();
  audio.updateEngine(.5,true,false,{throttle:1});const fallback=audio.engineGain.gain.value;
  await audio.loadSamples();audio.updateEngine(.5,true,true,{skid:1,throttle:1});
  assert.equal(audio.engineSample.source.buffer,audio.samples.get('engine-loop'));
  assert.equal(audio.skidSample.source.buffer,audio.samples.get('skid-loop'));
  assert.ok(audio.engineSample.source.loop&&audio.skidSample.source.loop);
  assert.ok(audio.engineGain.gain.value<fallback&&audio.engineSample.gain.gain.value>0);
  assert.equal(audio.skid.gain.gain.value,0,'loaded tire loop replaces the noise fallback');
  const nodes=audio.ctx.nodes.length,sources=audio.ctx.sources.length;
  for(let i=0;i<20;i++){
    audio.updateEngine(1,false,true,{skid:1});
    assert.equal(audio.engineSample.gain.gain.value,0);assert.equal(audio.skidSample.gain.gain.value,0);
    audio.updateEngine(.4,true,false,{skid:.5});
  }
  assert.equal(requests.length,11);assert.equal(audio.ctx.nodes.length,nodes);assert.equal(audio.ctx.sources.length,sources);
});

test('spatial effects pan and darken with distance; distant fire leaves four slots for local feedback',()=>{
  const {audio}=harness();audio.play('shoot',{pan:-2});
  const left=[...audio.voices][0];assert.equal(left.routing[2].pan.value,-.85);
  const nearCutoff=left.routing[1].frequency.value;audio.ctx.advance(2);assertReleased(audio);
  for(let i=0;i<100;i++)audio.play('shoot',{distance:100,pan:2});
  assert.equal(audio.voices.size,14);
  const distant=[...audio.voices][0];assert.equal(distant.routing[2].pan.value,.85);
  assert.ok(distant.routing[1].frequency.value<nearCutoff);
  for(const type of ['bonus','shield','nitro','go'])audio.play(type);
  assert.equal(audio.voices.size,18);audio.ctx.advance(2);assertReleased(audio);
});

test('runtime sound position follows heading and distance without changing world coordinates',()=>{
  const runtime=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
  const helper=runtime.match(/    function soundAt\(pos,strength=1\)\{[\s\S]*?\n    \}/)?.[0];
  assert.ok(helper,'runtime must own position-to-listener conversion');
  const sandbox={player:{pos:{x:0,y:0,z:0},heading:0}};vm.runInNewContext(helper,sandbox);
  const right=sandbox.soundAt({x:100,y:0,z:0});assert.equal(right.distance,100);assert.equal(right.pan,.8);
  assert.equal(sandbox.soundAt({x:-100,y:0,z:0}).pan,-.8);
  sandbox.player.heading=Math.PI/2;
  assert.ok(sandbox.soundAt({x:0,y:0,z:-100}).pan>.79);
  assert.equal(sandbox.soundAt(sandbox.player.pos).pan,0);
});

test('generated assets match their manifest, have headroom, decaying impacts and continuous loop boundaries',()=>{
  const base=new URL('../assets/audio/generated/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
  const expected={'shoot.wav':.18,'shoot-alt.wav':.18,'rocket.wav':.8,'explosion.wav':1.6,'hit.wav':.28,'nitro.wav':.8,'bonus.wav':.46,'shield.wav':.6,'engine-loop.wav':2,'skid-loop.wav':2};
  assert.equal(manifest.files.length,Object.keys(expected).length);
  const rms=a=>Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);
  const data=new Map();
  for(const item of manifest.files){
    const file=readFileSync(new URL(item.file,base));
    assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WAVE');
    assert.equal(file.readUInt16LE(20),1);assert.equal(file.readUInt16LE(22),1);
    assert.equal(file.readUInt32LE(24),44100);assert.equal(file.readUInt16LE(34),16);
    assert.equal(file.readUInt32LE(40),file.length-44);
    assert.equal(createHash('sha256').update(file).digest('hex'),item.sha256);
    const samples=Array.from({length:(file.length-44)/2},(_,i)=>file.readInt16LE(44+i*2)/32768);
    assert.ok(Math.abs(samples.length/44100-expected[item.file])<1/44100,item.file+' has the intended duration');
    const level=rms(samples);assert.ok(level>.02&&level<.5,item.file+' must have useful signal and headroom');
    assert.ok(samples.every(x=>Math.abs(x)<.81),'no clipped samples');
    assert.ok(Math.abs(samples.reduce((sum,x)=>sum+x,0)/samples.length)<.015,'DC offset is bounded');
    if(item.loop){
      const deltas=samples.slice(1).map((x,i)=>Math.abs(x-samples[i])).sort((a,b)=>a-b);
      assert.ok(Math.abs(samples[0]-samples.at(-1))<deltas[Math.floor(deltas.length*.99)],'loop seam must not exceed ordinary signal transitions');
    }else{assert.equal(samples[0],0);assert.equal(samples.at(-1),0);}
    data.set(item.file,samples);
  }
  const explosion=data.get('explosion.wav');
  assert.ok(rms(explosion.slice(0,8820))>rms(explosion.slice(-8820))*8,'explosion has an impact and a decaying tail');
  const engine=data.get('engine-loop.wav'),lag=588;
  const correlation=engine.slice(lag).reduce((sum,x,i)=>sum+x*engine[i],0)/((engine.length-lag)*rms(engine)**2);
  assert.ok(correlation>.6,'engine must retain its combustion cycle');
  assert.notDeepEqual(data.get('shoot.wav'),data.get('shoot-alt.wav'),'gun variants must differ');
});
