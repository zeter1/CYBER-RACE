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
  function segmentSphereEntry3D(start,end,center,radius){
    const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
    const x=start.x-center.x,y=start.y-center.y,z=start.z-center.z;
    const c=x*x+y*y+z*z-radius*radius;if(c<=0)return 0;
    const a=dx*dx+dy*dy+dz*dz;if(a<1e-12)return null;
    const b=x*dx+y*dy+z*dz,disc=b*b-a*c;if(disc<0)return null;
    const t=(-b-Math.sqrt(disc))/a;return t>=0&&t<=1?t:null;
  }
  // Finite segment against a yaw-rotated box. Plain data, no scene or damage side effects.
  function segmentBoxHit3D(start,end,box){
    const c=Math.cos(box.rotation||0),s=Math.sin(box.rotation||0);
    const local=p=>{const x=p.x-box.x,z=p.z-box.z;return {x:c*x-s*z,y:p.y-box.y,z:s*x+c*z};};
    const a=local(start),b=local(end),half={x:box.w/2,y:box.h/2,z:box.d/2};
    let enter=0,exit=1,axis=null,sign=0;
    for(const k of ['x','y','z']){
      const delta=b[k]-a[k];
      if(Math.abs(delta)<1e-10){if(Math.abs(a[k])>half[k])return null;continue;}
      let t1=(-half[k]-a[k])/delta,t2=(half[k]-a[k])/delta,n=-1;
      if(t1>t2){[t1,t2]=[t2,t1];n=1;}
      if(t1>enter){enter=t1;axis=k;sign=n;}
      exit=Math.min(exit,t2);if(enter>exit)return null;
    }
    if(exit<0||enter>1)return null;
    const normal={x:0,y:0,z:0};if(axis)normal[axis]=sign;else normal.y=1;
    return {t:enter,point:{x:start.x+(end.x-start.x)*enter,y:start.y+(end.y-start.y)*enter,z:start.z+(end.z-start.z)*enter},normal:{x:c*normal.x+s*normal.z,y:normal.y,z:-s*normal.x+c*normal.z}};
  }
  function createObstacleIndex(boxes,cellSize=48){
    const cells=new Map();
    for(const box of boxes){
      const r=Math.hypot(box.w,box.d)/2;
      for(let x=Math.floor((box.x-r)/cellSize);x<=Math.floor((box.x+r)/cellSize);x++)for(let z=Math.floor((box.z-r)/cellSize);z<=Math.floor((box.z+r)/cellSize);z++){
        const key=`${x},${z}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(box);
      }
    }
    return {hit(start,end){
      let best=null;const seen=new Set();
      if(start.y>=0.06&&end.y<0.06){const t=(start.y-0.06)/(start.y-end.y);best={t,point:{x:start.x+(end.x-start.x)*t,y:0.06,z:start.z+(end.z-start.z)*t},normal:{x:0,y:1,z:0},surface:'ground'};}
      for(let x=Math.floor(Math.min(start.x,end.x)/cellSize);x<=Math.floor(Math.max(start.x,end.x)/cellSize);x++)for(let z=Math.floor(Math.min(start.z,end.z)/cellSize);z<=Math.floor(Math.max(start.z,end.z)/cellSize);z++){
        for(const box of cells.get(`${x},${z}`)||[]){if(seen.has(box))continue;seen.add(box);const h=segmentBoxHit3D(start,end,box);if(h&&(!best||h.t<best.t))best={...h,surface:box.surface||'metal'};}
      }
      return best;
    }};
  }
  return {segmentSphereHit3D,createSegmentSphereHit,segmentSphereEntry3D,segmentBoxHit3D,createObstacleIndex};
});
