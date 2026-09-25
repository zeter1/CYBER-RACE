(function attachCyberGeometry(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.weapons??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberGeometry(){
  'use strict';
  function segmentSphereHit3D(start,end,center,radius){
    const sx=Number(start?.x)||0,sy=Number(start?.y)||0,sz=Number(start?.z)||0;
    const ax=(Number(end?.x)||0)-sx,ay=(Number(end?.y)||0)-sy,az=(Number(end?.z)||0)-sz;
    const lenSq=ax*ax+ay*ay+az*az;
    const cx=(Number(center?.x)||0)-sx,cy=(Number(center?.y)||0)-sy,cz=(Number(center?.z)||0)-sz;
    let t=0;if(lenSq>1e-8)t=Math.max(0,Math.min(1,(cx*ax+cy*ay+cz*az)/lenSq));
    const px=sx+ax*t,py=sy+ay*t,pz=sz+az*t;
    const dx=px-(Number(center?.x)||0),dy=py-(Number(center?.y)||0),dz=pz-(Number(center?.z)||0);
    const r=Math.max(0,Number(radius)||0);
    return dx*dx+dy*dy+dz*dz<=r*r;
  }
  function createSegmentSphereHit(){return segmentSphereHit3D;}
  return {segmentSphereHit3D,createSegmentSphereHit};
});
