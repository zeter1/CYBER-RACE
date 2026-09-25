(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const core=root.core??=(Object.create(null));
  core.loadThree=async function loadThree(){
    try{
      return await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    }catch(firstError){
      try{
        return await import('https://unpkg.com/three@0.160.0/build/three.module.js');
      }catch(secondError){
        console.error('Three.js primary and fallback CDN failed',firstError,secondError);
        throw secondError;
      }
    }
  };
})();
