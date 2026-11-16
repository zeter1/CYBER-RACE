(function attachCyberRaceFrameQuality(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberRaceFrameQuality(){
  'use strict';

  // Count callbacks against actual rAF wall time, not an assumed one-second window.
  function measureFrameRate(frames,elapsedMs){
    if(!Number.isFinite(frames)||frames<0||!Number.isFinite(elapsedMs)||elapsedMs<=0)return 0;
    return frames*1000/elapsedMs;
  }

  // Pure quality decision: existing 3-low / 8-high hysteresis and configured thresholds.
  function stepAdaptiveQuality(state,fps,lowThreshold,highThreshold){
    let {mode,lowFpsWindows,highFpsWindows}=state;
    if(!Number.isFinite(fps)||fps<=0)return {mode,lowFpsWindows,highFpsWindows};
    if(fps<lowThreshold){lowFpsWindows++;highFpsWindows=0;}
    else if(fps>highThreshold){highFpsWindows++;lowFpsWindows=0;}
    else{
      lowFpsWindows=Math.max(0,lowFpsWindows-1);
      highFpsWindows=Math.max(0,highFpsWindows-1);
    }
    if(mode==='high'&&lowFpsWindows>=3){mode='low';lowFpsWindows=0;}
    else if(mode==='low'&&highFpsWindows>=8){mode='high';highFpsWindows=0;}
    return {mode,lowFpsWindows,highFpsWindows};
  }

  return {measureFrameRate,stepAdaptiveQuality};
});
