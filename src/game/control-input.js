(function attachControlInput(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createControlInput(){
  'use strict';
  const STICK_DEADZONE=0.18;
  const clamp01=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;

  function buttonLevel(pad,index){
    const button=pad?.buttons?.[index];
    if(!button)return 0;
    const value=clamp01(button.value);
    // Some digital-only mappings report pressed=true without a usable value.
    return value>0?value:(button.pressed?1:0);
  }
  function isPressed(pad,index){
    return Boolean(pad?.buttons?.[index]?.pressed)||buttonLevel(pad,index)>0.5;
  }
  function stickSteer(raw){
    const value=Number.isFinite(raw)?Math.max(-1,Math.min(1,raw)):0;
    const magnitude=Math.abs(value);
    if(magnitude<=STICK_DEADZONE)return 0;
    // Rescale the range outside the deadzone to avoid jumping to 0.18.
    return Math.sign(value)*(magnitude-STICK_DEADZONE)/(1-STICK_DEADZONE);
  }

  function readStandardGamepad(pad){
    const neutral={throttle:0,brake:0,steer:0,drift:false,gun:false,rocket:false,mirror:false,start:false,nitro:false,pulse:false};
    if(!pad||!pad.connected||pad.mapping!=='standard')return neutral;
    const down=index=>isPressed(pad,index);
    const analogSteer=stickSteer(pad.axes?.[0]);
    return {
      throttle:Math.max(buttonLevel(pad,7),down(12)?1:0),
      brake:Math.max(buttonLevel(pad,6),down(13)?1:0),
      steer:analogSteer||Number(down(15))-Number(down(14)),
      drift:down(4),gun:down(2),rocket:down(3),mirror:down(5),
      start:down(9),nitro:down(0),pulse:down(1)
    };
  }

  function resolveDrivingInput(keys,touch,pad,enabled=true){
    if(!enabled)return {throttle:0,brake:0,steering:0,handbrake:false};
    const key=(...names)=>names.some(name=>Boolean(keys?.[name]));
    const forward=key('KeyW','w','arrowup','ц','ArrowUp')||Boolean(touch?.forward);
    const backward=key('KeyS','s','arrowdown','ы','ArrowDown')||Boolean(touch?.backward);
    const left=key('KeyA','a','arrowleft','ф','ArrowLeft')||Boolean(touch?.left);
    const right=key('KeyD','d','arrowright','в','ArrowRight')||Boolean(touch?.right);
    const padSteer=Number.isFinite(pad?.steer)?Math.max(-1,Math.min(1,pad.steer)):0;
    return {
      throttle:Math.max(Number(forward),clamp01(pad?.throttle)),
      brake:Math.max(Number(backward),clamp01(pad?.brake)),
      steering:Math.max(-1,Math.min(1,Number(right)-Number(left)+padSteer)),
      handbrake:key('shift','ShiftLeft','ShiftRight')||Boolean(touch?.drift)||Boolean(pad?.drift)
    };
  }
  return {readStandardGamepad,resolveDrivingInput};
});
