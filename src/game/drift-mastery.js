(function attachDriftMastery(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createDriftMasteryApi(){
  'use strict';
  const MIN_SECONDS=0.9,MAX_POINTS=90,MAX_DT=0.1;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  // Pure gameplay state: time is advanced only by actual active-frame dt.
  // Score is earned only when the driver ends a valid continuous drift.
  function createDriftMastery(){
    let seconds=0,bank=0,locked=false,notice='',noticeLeft=0,noticePoints=0;
    function clearBank(){seconds=0;bank=0;}
    function reset(){clearBank();locked=false;notice='';noticeLeft=0;noticePoints=0;}
    function interrupt(){
      if(seconds>=0.45){notice='ДРИФТ ПРЕРВАН';noticeLeft=0.85;noticePoints=0;}
      else {notice='';noticeLeft=0;noticePoints=0;}
      clearBank();
      locked=true; // Re-entering the road cannot revive a broken attempt.
    }
    function step({drifting=false,speed=0,speedLat=0,steerAngle=0,onRoad=false,forward=false,contact=false,dt=0}={}){
      const delta=Number.isFinite(dt)?clamp(dt,0,MAX_DT):0;
      if(delta<=0)return 0;
      noticeLeft=Math.max(0,noticeLeft-delta);
      if(contact||!onRoad||!forward){
        if(!locked&&(seconds>0||drifting))interrupt();
        if(!drifting)locked=false;
        return 0;
      }
      if(!drifting){
        const awarded=!locked&&seconds>=MIN_SECONDS?Math.min(MAX_POINTS,Math.floor(bank)):0;
        clearBank();locked=false;
        if(awarded>0){notice='ЧИСТЫЙ ДРИФТ';noticeLeft=2;noticePoints=awarded;}
        return awarded;
      }
      if(locked||!Number.isFinite(speed)||!Number.isFinite(speedLat)||!Number.isFinite(steerAngle))return 0;
      const slip=Math.abs(speedLat);
      if(speed>=20&&slip>=2.2&&Math.abs(steerAngle)>=0.08){
        seconds+=delta;
        const quality=0.8+clamp(slip/12,0,1)*0.4;
        bank=Math.min(MAX_POINTS,bank+(7+clamp(speed,20,75)*0.2)*quality*delta);
      }
      return 0;
    }
    function view(){
      if(seconds>0&&!locked){
        const ready=seconds>=MIN_SECONDS;
        return {visible:true,active:true,label:ready?'ОТПУСТИ РУЧНИК':'УДЕРЖИВАЙ ДРИФТ',
          points:Math.floor(bank),progress:clamp(seconds/MIN_SECONDS*100,0,100),ready};
      }
      return noticeLeft>0
        ?{visible:true,active:false,label:notice,points:noticePoints,progress:0,ready:false}
        :{visible:false,active:false,label:'',points:0,progress:0,ready:false};
    }
    return {step,view,interrupt,reset};
  }
  return {createDriftMastery};
});
