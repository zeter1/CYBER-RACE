'use strict';
// Offline asset tool. Only writes assets/audio/generated; never runs in the game.
// Usage: node scripts/build-audio.cjs <path-to-official-jsfxr-sfxr.js>
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const tool=process.argv[2];
if(!tool)throw new Error('Pass the official sfxr.js path; see docs/AUDIO_ASSETS.md');
const code=fs.readFileSync(tool,'utf8');
const toolHash='6095a6358e654bc3ffd55d9ccecf694f187953d78b1391ee2823a6fcb92551c5';
if(crypto.createHash('sha256').update(code).digest('hex')!==toolHash)throw new Error('Unexpected jsfxr source version');
let seed=0x43524143;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const math=Object.create(Math);math.random=random;
const synth={Math:math};vm.runInNewContext(code,synth,{timeout:1000});
const rate=44100,tau=Math.PI*2;
const out=path.resolve(__dirname,'../assets/audio/generated');fs.mkdirSync(out,{recursive:true});
const n=seconds=>new Float64Array(Math.round(seconds*rate));
function noise(seconds,cutoff){
  const a=n(seconds),k=1-Math.exp(-tau*cutoff/rate);let low=0;
  for(let i=0;i<a.length;i++){low+=k*((random()*2-1)-low);a[i]=low;}
  return a;
}
function tone(seconds,start,end,decay,harmonics=0){
  const a=n(seconds);let phase=0;
  for(let i=0;i<a.length;i++){
    const t=i/rate,f=end+(start-end)*Math.exp(-t*12);
    phase+=tau*f/rate;
    a[i]=(Math.sin(phase)+harmonics*Math.sin(phase*2))*Math.exp(-t*decay)*(1-Math.exp(-t*1500));
  }
  return a;
}
function fx(params){
  const p=Object.assign(new synth.Params(),{sample_size:16,sample_rate:rate,sound_vol:0.45},params);
  return new synth.SoundEffect(p).getRawBuffer().normalized;
}
function mix(seconds,parts){
  const a=n(seconds);
  for(const [b,level,offset=0] of parts){const start=Math.round(offset*rate);for(let i=0;i<b.length&&i+start<a.length;i++)a[i+start]+=b[i]*level;}
  return a;
}
function envelope(a,decay){for(let i=0;i<a.length;i++)a[i]*=(1-Math.exp(-i/rate*850))*Math.exp(-i/rate*decay);return a;}
const records=[];
function save(name,a,{loop=false,peak=0.8}={}){
  // Remove DC, set headroom and fade event boundaries. Loop crossfade is equal-gain
  // (correlated engine components must not get a +3 dB seam boost).
  if(loop){
    const overlap=Math.round(rate*0.04),b=new Float64Array(a.length-overlap);
    for(let i=0;i<b.length;i++)b[i]=a[i];
    for(let i=0;i<overlap;i++){const w=i/overlap;b[i]=a[b.length+i]*(1-w)+a[i]*w;}
    a=b;
  }
  const mean=a.reduce((sum,v)=>sum+v,0)/a.length;let max=0;
  for(let i=0;i<a.length;i++){a[i]-=mean;max=Math.max(max,Math.abs(a[i]));}
  const wav=Buffer.alloc(44+a.length*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(a.length*2,40);
  for(let i=0;i<a.length;i++){
    const fade=loop?1:Math.min(1,i/(rate*.002),(a.length-1-i)/(rate*.018));
    wav.writeInt16LE(Math.round(a[i]/Math.max(max,1e-9)*peak*fade*32767),44+i*2);
  }
  fs.writeFileSync(path.join(out,name+'.wav'),wav);
  records.push({file:name+'.wav',duration:a.length/rate,bytes:wav.length,sha256:crypto.createHash('sha256').update(wav).digest('hex'),loop});
}
for(let variant=0;variant<2;variant++){
  save(variant?'shoot-alt':'shoot',mix(.18,[
    [fx({wave_type:3,p_env_sustain:.12,p_env_decay:.19,p_base_freq:.48+variant*.03,p_freq_ramp:-.28,p_lpf_freq:.72,p_hpf_freq:.13}),.8],
    [tone(.18,185+variant*15,62,32,.28),.7],
    [envelope(noise(.12,6500),60),.5]
  ]));
}
save('rocket',mix(.8,[[envelope(noise(.8,1900),4),.8],[tone(.35,140,48,10,.3),.5],
  [fx({wave_type:3,p_env_sustain:.23,p_env_decay:.36,p_base_freq:.32,p_freq_ramp:-.18,p_lpf_freq:.6}),.2]]));
save('explosion',mix(1.6,[[tone(1.6,125,32,4,.2),.85],[envelope(noise(1.6,900),3.6),2],
  [fx({wave_type:3,p_env_sustain:.27,p_env_decay:.57,p_env_punch:.25,p_base_freq:.15,p_freq_ramp:-.15,p_lpf_freq:.65}),.45],
  [envelope(noise(.45,3500),15),.55]]));
save('hit',mix(.28,[[tone(.28,330,82,25,.6),.6],[envelope(noise(.28,4200),30),1],
  [tone(.18,1750,910,35),.12]]));
save('nitro',mix(.8,[[envelope(noise(.8,3200),3.5),1.4],[tone(.8,65,105,5,.25),.5],
  [fx({wave_type:1,p_env_attack:.1,p_env_sustain:.18,p_env_decay:.34,p_base_freq:.16,p_freq_ramp:.22,p_lpf_freq:.55}),.15]]));
save('bonus',mix(.46,[[tone(.16,660,660,14),.6],[tone(.18,880,880,14),.5,.08],[tone(.22,1320,1320,15),.35,.17]]),{peak:.65});
save('shield',mix(.6,[[tone(.6,240,960,6,.35),.45],[envelope(noise(.6,1800),7),.4],
  [fx({wave_type:2,p_env_attack:.09,p_env_sustain:.17,p_env_decay:.3,p_base_freq:.23,p_freq_ramp:.23}),.3]]));
// A stable combustion cycle and tuned exhaust harmonics, with no seam reset.
const engine=n(2.04);
for(let i=0;i<engine.length;i++){
  const t=i/rate,phase=tau*75*t+.09*Math.sin(tau*2*t);let pulse=0;
  for(let h=1;h<=14;h++)pulse+=Math.sin(phase*h+.17*h)/Math.pow(h,1.05);
  engine[i]=Math.tanh(pulse*1.1)*(.82+.1*Math.sin(tau*37.5*t))+.22*Math.sin(phase*.5);
}
save('engine-loop',engine,{loop:true,peak:.65});
const skid=noise(2.04,6200);let low=0;
for(let i=0;i<skid.length;i++){
  const t=i/rate;low+=.04*(skid[i]-low);
  skid[i]=(skid[i]-low)*.65+.2*Math.sin(tau*1550*t+1.8*Math.sin(tau*37*t));
  skid[i]*=.8+.2*Math.sin(tau*6*t);
}
save('skid-loop',skid,{loop:true,peak:.65});
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({generator:'scripts/build-audio.cjs',jsfxrSourceSha256:toolHash,sampleRate:rate,files:records},null,2)+'\n');
console.log(JSON.stringify({generated:records.length,bytes:records.reduce((sum,x)=>sum+x.bytes,0)}));
