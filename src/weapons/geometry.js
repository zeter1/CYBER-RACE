(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const weapons=root.weapons??=(Object.create(null));
  weapons.createSegmentSphereHit=function createSegmentSphereHit(THREE){
    const tmpA=new THREE.Vector3(),tmpB=new THREE.Vector3(),tmpC=new THREE.Vector3();
    return function segmentSphereHit(start,end,center,radius){
      tmpA.subVectors(end,start);
      const lenSq=tmpA.lengthSq();
      if(lenSq<1e-8)return start.distanceToSquared(center)<=radius*radius;
      tmpB.subVectors(center,start);
      const t=Math.max(0,Math.min(1,tmpB.dot(tmpA)/lenSq));
      tmpC.copy(start).addScaledVector(tmpA,t);
      return tmpC.distanceToSquared(center)<=radius*radius;
    };
  };
})();
