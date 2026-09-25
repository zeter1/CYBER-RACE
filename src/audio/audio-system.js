(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const audioNs=root.audio??=(Object.create(null));
  class AudioSys{
    constructor(){this.ctx=null;this.engineOsc=null;this.engineGain=null;this.engineFilter=null;this.enabled=true;}
    setEnabled(enabled){
      this.enabled=Boolean(enabled);
      if(this.engineGain&&this.ctx&&this.ctx.state!=='closed')this.engineGain.gain.setTargetAtTime(this.enabled?0.0001:0,this.ctx.currentTime,0.03);
    }
    ensureContext(){
      if(this.ctx)return this.ctx;
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextClass)return null;
      try{this.ctx=new AudioContextClass();}catch(err){console.warn('Звук недоступен:',err);}
      return this.ctx;
    }
    resume(){const ctx=this.ensureContext();if(ctx&&ctx.state==='suspended'){const result=ctx.resume();result?.catch?.(()=>{});}}
    ensureEngine(){
      const ctx=this.ensureContext();
      if(!ctx||ctx.state==='closed'||this.engineOsc)return;
      this.engineOsc=ctx.createOscillator();this.engineGain=ctx.createGain();this.engineFilter=ctx.createBiquadFilter();
      this.engineOsc.type='sawtooth';this.engineFilter.type='lowpass';
      this.engineOsc.connect(this.engineFilter);this.engineFilter.connect(this.engineGain);this.engineGain.connect(ctx.destination);
      this.engineGain.gain.value=0.0001;this.engineOsc.frequency.value=55;this.engineFilter.frequency.value=500;this.engineOsc.start();
    }
    updateEngine(speedRatio,active,nitro){
      const ctx=this.ctx;if(!ctx||ctx.state!=='running')return;
      if(!this.enabled){if(this.engineGain)this.engineGain.gain.setTargetAtTime(0,ctx.currentTime,0.03);return;}
      this.ensureEngine();
      const t=ctx.currentTime,ratio=Math.max(0,Math.min(1.4,speedRatio));
      this.engineOsc.frequency.setTargetAtTime(55+ratio*145+(nitro?45:0),t,0.055);
      this.engineFilter.frequency.setTargetAtTime(420+ratio*1200,t,0.08);
      this.engineGain.gain.setTargetAtTime(this.enabled&&active?0.014+ratio*0.026:0.0001,t,0.08);
    }
    play(type){
      if(!this.enabled)return;
      const ctx=this.ensureContext();if(!ctx||ctx.state==='suspended'||ctx.state==='closed')return;
      const t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
      osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
      if(type==='shoot'){osc.type='square';osc.frequency.setValueAtTime(900,t);osc.frequency.exponentialRampToValueAtTime(80,t+0.05);gain.gain.setValueAtTime(0.05,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.05);osc.start(t);osc.stop(t+0.05);}
      else if(type==='rocket'){osc.type='sawtooth';osc.frequency.setValueAtTime(180,t);osc.frequency.linearRampToValueAtTime(50,t+0.5);gain.gain.setValueAtTime(0.1,t);gain.gain.linearRampToValueAtTime(0.001,t+0.5);osc.start(t);osc.stop(t+0.5);}
      else if(type==='explosion'){osc.type='sawtooth';filter.type='lowpass';filter.frequency.setValueAtTime(1000,t);filter.frequency.exponentialRampToValueAtTime(30,t+0.7);osc.frequency.setValueAtTime(100,t);osc.frequency.exponentialRampToValueAtTime(15,t+0.7);gain.gain.setValueAtTime(0.2,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.7);osc.start(t);osc.stop(t+0.7);}
      else if(type==='hit'){osc.type='triangle';osc.frequency.setValueAtTime(350,t);osc.frequency.exponentialRampToValueAtTime(50,t+0.08);gain.gain.setValueAtTime(0.1,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.08);osc.start(t);osc.stop(t+0.08);}
      else if(type==='bonus'){osc.type='sine';osc.frequency.setValueAtTime(500,t);osc.frequency.linearRampToValueAtTime(1400,t+0.15);gain.gain.setValueAtTime(0.07,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.15);osc.start(t);osc.stop(t+0.15);}
      else if(type==='nitro'){osc.type='sawtooth';filter.type='lowpass';filter.frequency.setValueAtTime(2500,t);osc.frequency.setValueAtTime(80,t);osc.frequency.linearRampToValueAtTime(30,t+0.9);gain.gain.setValueAtTime(0.12,t);gain.gain.linearRampToValueAtTime(0.001,t+0.9);osc.start(t);osc.stop(t+0.9);}
      else if(type==='countdown'){osc.type='sine';osc.frequency.setValueAtTime(520,t);gain.gain.setValueAtTime(0.08,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.16);osc.start(t);osc.stop(t+0.16);}
      else if(type==='go'){osc.type='square';osc.frequency.setValueAtTime(640,t);osc.frequency.linearRampToValueAtTime(1100,t+0.28);gain.gain.setValueAtTime(0.09,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.3);osc.start(t);osc.stop(t+0.3);}
      else if(type==='shield'){osc.type='sine';osc.frequency.setValueAtTime(300,t);osc.frequency.linearRampToValueAtTime(900,t+0.25);gain.gain.setValueAtTime(0.08,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.3);osc.start(t);osc.stop(t+0.3);}
    }
  }
  audioNs.AudioSys=AudioSys;
})();
