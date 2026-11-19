(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(globalThis,function(){
  'use strict';
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=(min,max,value)=>{const t=clamp((value-min)/(max-min));return t*t*(3-2*t);};

  // Presentation only: never changes physics, timers, storage or the gameplay RNG.
  function stepSpeedFeedback(previous,input,dt){
    const moving=input.active&&!input.destroyed;
    const ratio=moving?Math.max(0,Math.min(2.1,input.speed/Math.max(1,input.maxSpeed))):0;
    const k=1-Math.exp(-5*Math.max(0,Math.min(0.1,dt)));
    const speed=moving?(previous?.speed||0)+(ratio-(previous?.speed||0))*k:0;
    const boost=moving?(previous?.boost||0)+((input.nitro?smooth(0.15,0.8,ratio):0)-(previous?.boost||0))*k:0;
    const cruise=smooth(0.05,1,speed),over=smooth(1,2.1,speed);
    const reduced=Boolean(input.reducedMotion);
    return {
      speed,boost,
      fov:reduced?58:58+6*cruise+4*over+2*boost,
      back:reduced?12.8:12.8+0.9*cruise+0.6*over,
      height:reduced?4.45:4.45-0.25*cruise,
      lookAhead:reduced?14:14-1.2*cruise,
      flow:reduced?0:smooth(0.3,1.3,speed)*(0.75+0.25*boost),
      vibration:!reduced&&input.cameraShake?smooth(0.65,1.65,speed)*(0.018+0.012*boost):0
    };
  }

  // Pure camera targeting: switch viewpoints without touching steering or physics.
  // In a rear glance the camera sits in front of the car and looks behind it.
  function cameraViewPose(player,view=stepSpeedFeedback(null,{active:false},0),rear=false,aspect=16/9){
    const fx=Math.sin(player.heading),fz=Math.cos(player.heading);
    const direction=rear?-1:1,side=rear?-2:0;
    // Keep the car in frame in portrait and above the bottom-center touch HUD.
    const narrow=1-smooth(0.48,1.3,aspect);
    const distance=(rear?16:view.back)+7.5*narrow;
    const height=rear?7.2+1.35*narrow:view.height+2.25*narrow;
    const lookAhead=(rear?12:view.lookAhead)-5*narrow;
    const lookHeight=rear?1.65:0.45+1.2*narrow;
    return {
      position:{x:player.x-direction*fx*distance+fz*side,
        y:player.y+height,z:player.z-direction*fz*distance-fx*side},
      look:{x:player.x+direction*fx*lookAhead,
        y:player.y+lookHeight,z:player.z+direction*fz*lookAhead}
    };
  }

  function createSpeedFeedback({document,element}){
    const canvas=document.createElement('canvas');
    canvas.setAttribute('aria-hidden','true');
    canvas.style.cssText='display:block;width:100%;height:100%;';
    element.appendChild(canvas);
    const ctx=canvas.getContext('2d');
    // Fixed, independent distribution: no particles allocated or random calls per frame.
    const rays=Array.from({length:48},(_,i)=>({angle:(i*2.3999632297)%(Math.PI*2),phase:((i*37)%101)/101,length:0.035+(i%5)*0.009}));
    let state=stepSpeedFeedback(null,{active:false},0),time=0,width=1,height=1,scale=1,quality='high',visible=false;
    function resize(w,h){
      width=Math.max(1,w);height=Math.max(1,h);scale=quality==='low'?0.65:1;
      canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
      ctx?.setTransform(scale,0,0,scale,0,0);
    }
    function clear(){
      if(visible)ctx?.clearRect(0,0,width,height);
      visible=false;element.style.opacity='0';
    }
    function reset(){state=stepSpeedFeedback(null,{active:false},0);time=0;clear();}
    function update(input,dt){
      // Pause freezes the envelope and flow phase; resume continues without a kick.
      if(!input.active){clear();return state;}
      state=stepSpeedFeedback(state,input,dt);
      if(!input.active||input.destroyed||input.reducedMotion){clear();return state;}
      time+=Math.max(0,Math.min(dt,0.1))*(0.5+state.speed*0.85);
      ctx?.clearRect(0,0,width,height);
      visible=true;
      const opacity=state.flow<0.005&&state.boost<0.005?0:Math.min(0.85,state.flow*0.75+state.boost*0.16);
      element.style.opacity=String(opacity);
      if(!ctx||state.flow<0.005)return state;
      const count=quality==='low'?24:rays.length;
      const cx=width*0.5,cy=height*0.4;
      ctx.strokeStyle=state.boost>0.3?'#b9f6ff':'#edf7ff';
      ctx.lineWidth=quality==='low'?1.2:1.5;
      for(let i=0;i<count;i++){
        const ray=rays[i],p=(ray.phase+time)%1;
        const radius=0.5+p*p*1.05;
        const dx=Math.cos(ray.angle)*width*0.68,dy=Math.sin(ray.angle)*height*0.85;
        // Keep road, car and aiming area clear, including in tall windows.
        if(Math.abs(dx*radius)<width*0.27)continue;
        const tail=radius+ray.length*(0.5+state.speed)*(0.4+p);
        ctx.globalAlpha=Math.sin(p*Math.PI)*(0.16+state.flow*0.46);
        ctx.beginPath();ctx.moveTo(cx+dx*radius,cy+dy*radius);
        ctx.lineTo(cx+dx*tail,cy+dy*tail);ctx.stroke();
      }
      ctx.globalAlpha=1;
      return state;
    }
    return {update,reset,resize,setQuality(mode){quality=mode;resize(width,height);}};
  }
  return {stepSpeedFeedback,cameraViewPose,createSpeedFeedback};
});
