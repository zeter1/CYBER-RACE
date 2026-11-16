(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const audioNs=root.audio??=(Object.create(null));
  const generatedTypes=['shoot','shoot-alt','rocket','explosion','hit','shield','bonus','nitro','engine-loop','skid-loop'];
  const sampleTypes=[...generatedTypes,'ricochet'];
  const sampleBase=typeof document!=='undefined'&&document.currentScript?.src?new URL('../../assets/audio/',document.currentScript.src).href:'assets/audio/';
  class AudioSys{
    constructor(){
      this.ctx=null;this.engineOsc=null;this.engineGain=null;this.engineFilter=null;this.enabled=true;
      this.effectsGain=null;this.effectsCompressor=null;this.noiseBuffer=null;this.voices=new Set();this.maxVoices=18;
      this.samples=new Map();this.sampleStatus=new Map();this.samplesLoading=null;this.sampleRetryAfter=0;
      this.masterGain=null;this.masterCompressor=null;this.engineBass=null;
      this.engineSample=null;this.skidSample=null;this.wind=null;this.skid=null;this.boost=null;
      this.gear=0;this.shiftUntil=0;this.shotVariant=0;
    }
    setEnabled(enabled){
      this.enabled=Boolean(enabled);
      if(this.masterGain&&this.ctx&&this.ctx.state!=='closed')this.masterGain.gain.setTargetAtTime(this.enabled?0.85:0,this.ctx.currentTime,0.015);
      if(this.effectsGain&&this.ctx&&this.ctx.state!=='closed'){
        const t=this.ctx.currentTime;
        this.effectsGain.gain.cancelScheduledValues(t);
        this.effectsGain.gain.setTargetAtTime(this.enabled?0.8:0,t,0.008);
        if(!this.enabled)for(const voice of this.voices){
          voice.output.gain.cancelScheduledValues(t);
          voice.output.gain.setTargetAtTime(0,t,0.005);
          for(const source of voice.sources)source.stop(t+0.025);
        }
      }
    }
    ensureContext(){
      if(this.ctx)return this.ctx;
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextClass)return null;
      try{this.ctx=new AudioContextClass();}catch(err){console.warn('Звук недоступен:',err);}
      return this.ctx;
    }
    resume(){
      const ctx=this.ensureContext();
      if(ctx&&ctx.state==='suspended'){const result=ctx.resume();result?.catch?.(()=>{});}
      if(ctx&&this.enabled)this.loadSamples();
    }
    loadSamples(){
      if(this.samplesLoading)return this.samplesLoading;
      // Direct file launches retain the complete procedural soundtrack without CORS requests.
      if(!this.ctx||this.ctx.state==='closed'||!['http:','https:'].includes(globalThis.location?.protocol))return Promise.resolve();
      const pending=sampleTypes.filter(type=>!this.samples.has(type));
      if(!pending.length||Date.now()<this.sampleRetryAfter)return Promise.resolve();
      const ctx=this.ctx;
      this.samplesLoading=Promise.all(pending.map(async type=>{
        const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
        try{
          const file=generatedTypes.includes(type)?'generated/'+type+'.wav':type+'.ogg';
          const response=await fetch(sampleBase+file,{credentials:'omit',mode:'same-origin',cache:'force-cache',signal:controller.signal});
          if(!response.ok)throw new Error('Sample unavailable');
          const data=await response.arrayBuffer();
          if(data.byteLength>500000)throw new Error('Sample too large');
          const buffer=await ctx.decodeAudioData(data);
          if(buffer.duration>6||buffer.numberOfChannels>2)throw new Error('Unexpected sample format');
          this.samples.set(type,buffer);this.sampleStatus.set(type,'ready');
        }catch{
          // A missing file or unsupported codec changes only the optional sample layer.
          this.sampleStatus.set(type,'procedural');
        }finally{clearTimeout(timeout);}
      })).finally(()=>{
        this.samplesLoading=null;
        // Retry on a later user gesture, not every frame or every sound event.
        this.sampleRetryAfter=pending.some(type=>!this.samples.has(type))?Date.now()+15000:0;
      });
      return this.samplesLoading;
    }
    ensureEngine(){
      const ctx=this.ensureContext();
      if(!ctx||ctx.state==='closed'||this.engineOsc)return;
      this.ensureEffects();
      this.engineOsc=ctx.createOscillator();this.engineGain=ctx.createGain();this.engineFilter=ctx.createBiquadFilter();
      this.engineBass=ctx.createOscillator();this.engineBass.type='triangle';
      this.engineOsc.type='sawtooth';this.engineFilter.type='lowpass';
      this.engineOsc.connect(this.engineFilter);this.engineBass.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);this.engineGain.connect(this.masterGain);
      this.engineGain.gain.value=0;this.engineOsc.frequency.value=45;this.engineBass.frequency.value=22.5;
      this.engineFilter.frequency.value=500;this.engineOsc.start();this.engineBass.start();
      this.wind=this.createLoop(this.getNoiseBuffer(),'lowpass',1800);
      this.skid=this.createLoop(this.getNoiseBuffer(),'bandpass',1900);
      this.skid.filter.Q.value=0.9;
      this.boost=this.createLoop(this.getNoiseBuffer(),'bandpass',1000);
    }
    createLoop(buffer,filterType,cutoff){
      const ctx=this.ctx,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      source.buffer=buffer;source.loop=true;filter.type=filterType;filter.frequency.value=cutoff;gain.gain.value=0;
      source.connect(filter);filter.connect(gain);gain.connect(this.masterGain);source.start();
      return {source,filter,gain};
    }
    updateEngine(speedRatio,active,nitro,driving={}){
      const ctx=this.ctx;if(!ctx||ctx.state!=='running')return;
      if(!this.enabled)return;
      this.ensureEngine();
      if(!this.engineSample&&this.samples.has('engine-loop'))this.engineSample=this.createLoop(this.samples.get('engine-loop'),'lowpass',2400);
      if(!this.skidSample&&this.samples.has('skid-loop'))this.skidSample=this.createLoop(this.samples.get('skid-loop'),'highpass',500);
      const t=ctx.currentTime,ratio=Number.isFinite(speedRatio)?Math.max(0,Math.min(1.6,speedRatio)):0;
      const throttle=Math.max(0,Math.min(1,Number(driving?.throttle)||0));
      const slip=Math.max(0,Math.min(1,Number(driving?.skid)||0));
      const bounds=[0,.16,.32,.50,.72,1.02];
      const previousGear=this.gear;
      if(!active||ratio<.015||driving?.reverse)this.gear=0;
      else{
        while(this.gear<4&&ratio>bounds[this.gear+1]+.012)this.gear++;
        while(this.gear>0&&ratio<bounds[this.gear]-.025)this.gear--;
      }
      if(active&&this.gear!==previousGear)this.shiftUntil=t+.1;
      const band=Math.max(0,Math.min(1,(ratio-bounds[this.gear])/(bounds[this.gear+1]-bounds[this.gear])));
      const rpm=.18+band*.72+throttle*.1;
      const load=.48+throttle*.52,shift=t<this.shiftUntil ? .65 : 1;
      const target=(param,value,time=.065)=>param.setTargetAtTime(value,t,time);
      target(this.engineOsc.frequency,36+rpm*108+(nitro?12:0));
      target(this.engineBass.frequency,18+rpm*54);
      target(this.engineFilter.frequency,330+rpm*1650+throttle*750);
      target(this.engineGain.gain,active?(this.engineSample ? .014 : .035)*load*shift:0);
      if(this.engineSample){
        target(this.engineSample.source.playbackRate,.52+rpm*1.05+(nitro ? .1 : 0));
        target(this.engineSample.filter.frequency,900+rpm*1900+throttle*600);
        target(this.engineSample.gain.gain,active?(.075+rpm*.07)*load*shift:0);
      }
      target(this.wind.gain.gain,active?Math.min(.065,ratio*ratio*.037):0,.12);
      target(this.wind.filter.frequency,700+ratio*1900,.12);
      target(this.boost.gain.gain,active&&nitro ? .055 : 0,.06);
      target(this.boost.filter.frequency,850+ratio*700);
      target(this.skid.gain.gain,active&&!this.skidSample?slip*.09:0,.04);
      if(this.skidSample){
        target(this.skidSample.gain.gain,active?slip*.115:0,.04);
        target(this.skidSample.source.playbackRate,.85+Math.min(1,ratio)*.3);
      }
    }
    ensureEffects(){
      if(this.effectsGain)return;
      const ctx=this.ctx;
      this.masterGain=ctx.createGain();this.masterCompressor=ctx.createDynamicsCompressor();
      this.masterGain.gain.value=this.enabled ? .85 : 0;
      this.masterCompressor.threshold.value=-8;this.masterCompressor.knee.value=8;this.masterCompressor.ratio.value=12;
      this.masterCompressor.attack.value=.002;this.masterCompressor.release.value=.14;
      this.masterGain.connect(this.masterCompressor);this.masterCompressor.connect(ctx.destination);
      this.effectsGain=ctx.createGain();this.effectsCompressor=ctx.createDynamicsCompressor();
      this.effectsGain.gain.value=this.enabled?0.8:0;
      this.effectsCompressor.threshold.value=-14;this.effectsCompressor.knee.value=12;
      this.effectsCompressor.ratio.value=5;this.effectsCompressor.attack.value=0.003;this.effectsCompressor.release.value=0.22;
      this.effectsGain.connect(this.effectsCompressor);this.effectsCompressor.connect(this.masterGain);
    }
    getNoiseBuffer(){
      if(!this.noiseBuffer){
        const ctx=this.ctx,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*1.5),ctx.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        this.noiseBuffer=buffer;
      }
      return this.noiseBuffer;
    }
    trackSource(voice,source,nodes){
      voice.sources.add(source);
      source.onended=()=>{
        source.onended=null;voice.sources.delete(source);
        for(const node of nodes)node.disconnect();
        if(voice.sources.size===0){for(const node of voice.routing)node.disconnect();this.voices.delete(voice);}
      };
    }
    addSample(voice,type){
      const key=type==='shoot'&&this.shotVariant++%2&&this.samples.has('shoot-alt')?'shoot-alt':type;
      const buffer=this.samples.get(key);if(!buffer)return false;
      const ctx=this.ctx,t=ctx.currentTime,source=ctx.createBufferSource(),gain=ctx.createGain();
      const duration=Math.min(buffer.duration,type==='explosion'?1.6:1.4);
      const level={shoot:.28,rocket:.28,explosion:.43,hit:.24,shield:.18,ricochet:.14,bonus:.17,nitro:.25}[type];
      source.buffer=buffer;source.connect(gain);gain.connect(voice.output);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+0.003);
      gain.gain.setValueAtTime(level,t+Math.max(0.004,duration-0.05));gain.gain.linearRampToValueAtTime(0,t+duration);
      this.trackSource(voice,source,[source,gain]);source.start(t);source.stop(t+duration+0.005);
      return true;
    }
    addLayer(voice,{noise=false,wave='sine',frequency=150,endFrequency=50,duration=0.15,level=0.1,attack=0.002,filterType='lowpass',cutoff=12000,endCutoff=cutoff,q=0.7}){
      const ctx=this.ctx,t=ctx.currentTime,source=noise?ctx.createBufferSource():ctx.createOscillator();
      const filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      if(noise)source.buffer=this.getNoiseBuffer();
      else{source.type=wave;source.frequency.setValueAtTime(frequency,t);source.frequency.exponentialRampToValueAtTime(endFrequency,t+duration);}
      filter.type=filterType;filter.Q.value=q;filter.frequency.setValueAtTime(cutoff,t);
      filter.frequency.exponentialRampToValueAtTime(endCutoff,t+duration);
      gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+attack);
      gain.gain.exponentialRampToValueAtTime(0.0001,t+duration);
      source.connect(filter);filter.connect(gain);gain.connect(voice.output);
      this.trackSource(voice,source,[source,filter,gain]);
      if(noise)source.start(t,Math.random()*Math.max(0,source.buffer.duration-duration));else source.start(t);
      source.stop(t+duration+0.012);
    }
    play(type,options={}){
      if(!this.enabled||!['shoot','rocket','explosion','hit','ricochet','bonus','nitro','countdown','go','shield'].includes(type))return;
      const distance=Number.isFinite(options?.distance)?Math.max(0,options.distance):0;
      const strength=Number.isFinite(options?.strength)?Math.max(0,Math.min(1.6,options.strength)):1;
      const level=strength/(1+Math.pow(distance/65,1.5));
      if(level<0.012||this.voices.size>=this.maxVoices||(distance>45&&this.voices.size>=this.maxVoices-4))return;
      const ctx=this.ensureContext();if(!ctx||ctx.state!=='running')return;
      this.ensureEffects();this.loadSamples();
      const output=ctx.createGain(),filter=ctx.createBiquadFilter();output.gain.value=level;
      filter.type='lowpass';filter.frequency.value=16000/(1+distance/75);output.connect(filter);
      const routing=[output,filter];
      if(ctx.createStereoPanner){
        const panner=ctx.createStereoPanner();panner.pan.value=Number.isFinite(options?.pan)?Math.max(-.85,Math.min(.85,options.pan)):0;
        filter.connect(panner);panner.connect(this.effectsGain);routing.push(panner);
      }else filter.connect(this.effectsGain);
      const voice={output,routing,sources:new Set()};this.voices.add(voice);
      const sampled=this.addSample(voice,type);
      const layer=spec=>this.addLayer(voice,{...spec,level:spec.level*(sampled ? .23 : 1)});
      if(type==='shoot'){
        layer({noise:true,filterType:'bandpass',cutoff:3400,endCutoff:800,duration:0.085,level:0.12});
        layer({wave:'square',frequency:950,endFrequency:90,duration:0.055,level:0.035,cutoff:3200,endCutoff:500});
        layer({frequency:165,endFrequency:65,duration:0.11,level:0.065});
      }else if(type==='rocket'){
        layer({noise:true,cutoff:3800,endCutoff:300,duration:0.62,level:0.18,attack:0.009});
        layer({wave:'sawtooth',frequency:180,endFrequency:42,duration:0.45,level:0.055,cutoff:900,endCutoff:180});
        layer({noise:true,filterType:'highpass',cutoff:1800,duration:0.07,level:0.065});
      }else if(type==='explosion'){
        layer({noise:true,cutoff:4200,endCutoff:75,duration:1.15,level:0.3,attack:0.004});
        layer({frequency:110,endFrequency:27,duration:0.95,level:0.24,attack:0.006});
        layer({noise:true,filterType:'bandpass',cutoff:1800,endCutoff:380,duration:0.16,level:0.16});
      }else if(type==='hit'){
        layer({noise:true,filterType:'bandpass',cutoff:2600,endCutoff:550,duration:0.13,level:0.16});
        layer({wave:'triangle',frequency:300,endFrequency:55,duration:0.18,level:0.12});
        layer({frequency:1700,endFrequency:750,duration:0.075,level:0.035});
      }else if(type==='ricochet'){
        layer({wave:'triangle',frequency:2300,endFrequency:600,duration:0.16,level:0.055});
        layer({noise:true,filterType:'highpass',cutoff:2800,duration:0.045,level:0.08});
      }else if(type==='shield'){
        layer({frequency:260,endFrequency:1050,duration:0.38,level:0.075,attack:0.012});
        layer({frequency:520,endFrequency:1500,duration:0.3,level:0.035,attack:0.012});
        layer({noise:true,filterType:'bandpass',cutoff:900,endCutoff:2400,duration:0.28,level:0.08,attack:0.016,q:2});
      }else if(type==='bonus')layer({frequency:500,endFrequency:1400,duration:0.15,level:0.07});
      else if(type==='nitro'){
        layer({noise:true,filterType:'bandpass',cutoff:1800,endCutoff:600,duration:.8,level:.17,attack:.015});
        layer({frequency:65,endFrequency:110,duration:.55,level:.09});
      }
      else if(type==='countdown')layer({frequency:520,endFrequency:520,duration:0.16,level:0.08});
      else if(type==='go')layer({wave:'square',frequency:640,endFrequency:1100,duration:0.3,level:0.09,cutoff:4500});
    }
  }
  audioNs.AudioSys=AudioSys;
})();
