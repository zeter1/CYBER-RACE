(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const core=root.core??=(Object.create(null));
  core.loadThree=async function loadThree(){
    // Vendored, pinned Three.js works when external CDN hosts are unavailable.
    // Keep the existing CDNs as recovery paths for a missing local asset.
    try{
      return await import(new URL('vendor/three/three.module.js',document.baseURI).href);
    }catch(localError){
      try{
        return await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
      }catch(firstError){
        try{
          return await import('https://unpkg.com/three@0.160.0/build/three.module.js');
        }catch(secondError){
          console.error('Local Three.js and both CDN fallbacks failed',localError,firstError,secondError);
          throw secondError;
        }
      }
    }
  };
})();
