(function attachLapGhost(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createLapGhostModule(){
  'use strict';

  // Bounded lap telemetry, optional best-trace persistence via injected storage.
  // No RNG, DOM, physics or damage.
  const SAMPLE_SECONDS=0.1;
  const MAX_SAMPLES=3600;
  const EPS=1e-6;
  const finitePose=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&
    Number.isFinite(p.heading)&&Number.isFinite(p.elapsed)&&p.elapsed>=0;
  const normalizeDelta=angle=>((angle+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  const STORAGE_KEY='cyberRaceLapGhostV1',MAX_SAVED=10;
  const round=(value,places)=>Number(value.toFixed(places));
  function normalizeBest(trace){
    if(!trace||!Number.isSafeInteger(trace.lap)||trace.lap<1||trace.lap>50||
      !Number.isFinite(trace.time)||trace.time<=0||trace.time>600||
      !Array.isArray(trace.frames)||trace.frames.length<2||trace.frames.length>MAX_SAMPLES)return null;
    let previous=-Infinity;
    const frames=[];
    for(const frame of trace.frames){
      if(!finitePose(frame)||Math.abs(frame.x)>100000||Math.abs(frame.z)>100000||
        frame.elapsed<=previous||frame.elapsed>trace.time+EPS)return null;
      previous=frame.elapsed;
      frames.push({elapsed:frame.elapsed,x:frame.x,z:frame.z,heading:frame.heading});
    }
    if(frames[0].elapsed!==0||Math.abs(previous-trace.time)>0.002)return null;
    return {lap:trace.lap,time:trace.time,frames};
  }
  function compactBest(trace){
    const clean=normalizeBest(trace);
    if(!clean)return null;
    const frames=clean.frames.map(f=>({elapsed:round(f.elapsed,3),x:round(f.x,2),
      z:round(f.z,2),heading:round(f.heading,3)}));
    const result={lap:clean.lap,time:round(clean.time,3),frames};
    return normalizeBest(result);
  }
  // Keep only recent track/build pairs. Corrupted or oversized storage is ignored;
  // no legacy keys are read, removed or changed.
  function createLapGhostStore(storage){
    const entries=new Map();
    function mergeStored(){
      try{
        const raw=storage?.getItem(STORAGE_KEY);
        if(!raw||raw.length>1500000)return;
        const saved=JSON.parse(raw);
        if(saved?.version!==1||!Array.isArray(saved.entries))return;
        for(const item of saved.entries.slice(-MAX_SAVED)){
          if(!Array.isArray(item)||typeof item[0]!=='string'||!/^[-\w:]{1,90}$/.test(item[0]))continue;
          const valid=normalizeBest(item[1]);
          if(!valid||entries.get(item[0])?.time<=valid.time+EPS)continue;
          entries.delete(item[0]);entries.set(item[0],valid);
        }
        while(entries.size>MAX_SAVED)entries.delete(entries.keys().next().value);
      }catch{}
    }
    mergeStored();
    const identity=(track,build)=>typeof track==='string'&&typeof build==='string'&&
      /^[-\w]{1,30}$/.test(track)&&/^[-\w:]{1,60}$/.test(build)?track+':'+build:null;
    function get(track,build){
      mergeStored();
      const id=identity(track,build),value=id&&entries.get(id);
      return value?normalizeBest(value):null;
    }
    function put(track,build,trace){
      mergeStored(); // Rebase concurrent tabs before overwriting their records.
      const id=identity(track,build),value=compactBest(trace);
      if(!id||!value||entries.get(id)?.time<=value.time+EPS)return {improved:false,persisted:false};
      entries.delete(id);entries.set(id,value);
      while(entries.size>MAX_SAVED)entries.delete(entries.keys().next().value);
      let persisted=false;
      try{
        if(storage){
          let text=JSON.stringify({version:1,entries:[...entries]});
          // The same bound used on reads must also hold after multiple saves.
          while(text.length>1500000&&entries.size>1){
            entries.delete(entries.keys().next().value);
            text=JSON.stringify({version:1,entries:[...entries]});
          }
          if(text.length>1500000)return {improved:true,persisted:false};
          storage.setItem(STORAGE_KEY,text);
          persisted=storage.getItem(STORAGE_KEY)===text;
        }
      }catch{}
      return {improved:true,persisted};
    }
    return {get,put};
  }

  function createLapGhostTracker(){
    let current=null,best=null;
    function reset(){current=null;best=null;}
    function invalidate(){if(current)current.invalid=true;}
    function record({lap,elapsed,x,z,heading}={},force=false){
      if(!current||current.invalid||lap!==current.lap)return false;
      const pose={elapsed,x,z,heading};
      if(!finitePose(pose)){invalidate();return false;}
      const last=current.frames.at(-1);
      if(last&&elapsed+EPS<last.elapsed){invalidate();return false;}
      if(last&&elapsed-last.elapsed<SAMPLE_SECONDS-EPS&&!force)return false;
      if(current.frames.length>=MAX_SAMPLES){invalidate();return false;}
      // A forced end sample at the same timestamp replaces its predecessor.
      if(last&&Math.abs(elapsed-last.elapsed)<EPS){
        if(force)current.frames[current.frames.length-1]=pose;
        return force;
      }
      current.frames.push(pose);
      return true;
    }
    function beginLap(lap,pose){
      current=null;
      if(!Number.isSafeInteger(lap)||lap<1||!pose)return false;
      current={lap,frames:[],invalid:false};
      return record({lap,elapsed:0,x:pose.x,z:pose.z,heading:pose.heading},true);
    }
    function completeLap({lap,elapsed,x,z,heading,valid=false}={}){
      if(!current||current.lap!==lap){current=null;return false;}
      if(valid)record({lap,elapsed,x,z,heading},true);
      const frames=current.frames;
      const complete=valid&&!current.invalid&&Number.isFinite(elapsed)&&elapsed>0&&
        frames.length>=2&&frames[0].elapsed===0&&
        Math.abs(frames[frames.length-1].elapsed-elapsed)<EPS;
      const improved=complete&&(!best||elapsed<best.time-EPS);
      if(improved){
        best={lap,time:elapsed,frames:frames.map(frame=>({...frame}))};
      }
      current=null;
      return improved;
    }
    function poseAt(elapsed){
      if(!best||!Number.isFinite(elapsed)||elapsed<0||elapsed>best.time)return null;
      const frames=best.frames;
      let low=0,high=frames.length-1;
      while(low<high){
        const mid=(low+high)>>1;
        if(frames[mid].elapsed<elapsed)low=mid+1;else high=mid;
      }
      const end=frames[low],start=frames[Math.max(0,low-1)];
      const span=end.elapsed-start.elapsed;
      const mix=span>EPS?Math.min(1,Math.max(0,(elapsed-start.elapsed)/span)):0;
      return {x:start.x+(end.x-start.x)*mix,z:start.z+(end.z-start.z)*mix,
        heading:start.heading+normalizeDelta(end.heading-start.heading)*mix};
    }
    function exportBest(){return best?normalizeBest(best):null;}
    function importBest(trace){
      const valid=normalizeBest(trace);
      if(!valid)return false;
      best=valid;
      return true;
    }
    // Approximate the ghost's time at the player's current location. A nearby,
    // similarly facing trajectory segment is required; otherwise show no delta.
    // No gameplay state is changed and the saved trace format stays intact.
    function paceAt(pose){
      if(!best||!finitePose(pose))return null;
      const matches=[];
      let nearest=Infinity;
      for(let i=1;i<best.frames.length;i++){
        const a=best.frames[i-1],b=best.frames[i];
        const dx=b.x-a.x,dz=b.z-a.z,lenSq=dx*dx+dz*dz;
        if(lenSq<0.01||Math.cos(normalizeDelta(pose.heading-a.heading))<0.4)continue;
        const mix=Math.max(0,Math.min(1,((pose.x-a.x)*dx+(pose.z-a.z)*dz)/lenSq));
        const offX=pose.x-(a.x+mix*dx),offZ=pose.z-(a.z+mix*dz);
        const distSq=offX*offX+offZ*offZ;
        if(distSq>900)continue;
        const time=a.elapsed+mix*(b.elapsed-a.elapsed);
        if(distSq<nearest-9){
          nearest=distSq;
          matches.length=0;
        }
        if(distSq<=nearest+9){
          nearest=Math.min(nearest,distSq);
          matches.push({distSq,time});
        }
      }
      if(!matches.length)return null;
      const close=matches.filter(match=>match.distSq<=nearest+0.000001)
        .sort((a,b)=>Math.abs(pose.elapsed-a.time)-Math.abs(pose.elapsed-b.time));
      if(!close.length)return null;
      // On crossing/self-overlapping paths, suppress an ambiguous comparison.
      if(close.some((item,index)=>index>0&&Math.abs(item.time-close[0].time)>3&&
          Math.abs(Math.abs(pose.elapsed-item.time)-Math.abs(pose.elapsed-close[0].time))<1.5))return null;
      return Math.round((pose.elapsed-close[0].time)*10)/10;
    }
    function snapshot(){
      return {bestLap:best?.lap??null,bestTime:best?.time??null,
        sampleCount:best?.frames.length??0,recordingLap:current?.lap??null,
        recordingValid:current?!current.invalid:false};
    }
    return {reset,invalidate,beginLap,record,completeLap,poseAt,paceAt,snapshot,exportBest,importBest};
  }

  // A lightweight, standalone hologram: own meshes/materials, no borrowed
  // car-factory resources, shadows, sounds, collision volumes or GPU timers.
  function createLapGhostVisual({THREE,scene}){
    const group=new THREE.Group();
    group.name='lap-ghost';group.visible=false;
    group.userData.lapGhost=true;
    const fill=new THREE.MeshBasicMaterial({color:0x32dcff,transparent:true,opacity:0.16,
      depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const glass=new THREE.MeshBasicMaterial({color:0x9ffcff,transparent:true,opacity:0.23,
      depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    const edges=new THREE.LineBasicMaterial({color:0x6ef8ff,transparent:true,opacity:0.64,
      depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const geometries=new Set();
    const add=(geometry,material,position,detail=false)=>{
      geometries.add(geometry);
      const mesh=new THREE.Mesh(geometry,material);
      mesh.position.set(...position);mesh.castShadow=false;mesh.receiveShadow=false;
      mesh.renderOrder=1;
      group.add(mesh);
      if(detail)detailParts.push(mesh);
      return mesh;
    };
    const detailParts=[];
    const bodyGeometry=new THREE.BoxGeometry(3.7,0.85,7.7);
    add(bodyGeometry,fill,[0,1.05,0]);
    const roofGeometry=new THREE.BoxGeometry(2.9,0.8,3.2);
    add(roofGeometry,glass,[0,1.8,0.45]);
    add(new THREE.BoxGeometry(3.35,0.23,1.8),fill,[0,1.56,-2.35]);
    const wheels=new THREE.CylinderGeometry(0.7,0.7,0.36,10);
    geometries.add(wheels);
    for(const x of [-1.9,1.9])for(const z of [-2.3,2.3]){
      const wheel=add(wheels,glass,[x,0.72,z]);
      wheel.rotation.z=Math.PI/2;
    }
    function outline(geometry,position){
      const shape=new THREE.EdgesGeometry(geometry);geometries.add(shape);
      const wire=new THREE.LineSegments(shape,edges);
      wire.position.set(...position);wire.renderOrder=2;group.add(wire);
      detailParts.push(wire);
    }
    outline(bodyGeometry,[0,1.05,0]);
    outline(roofGeometry,[0,1.8,0.45]);
    const ring=add(new THREE.RingGeometry(2.25,2.37,24),glass,[0,0.07,0],true);
    ring.rotation.x=-Math.PI/2;
    scene.add(group);
    function update(pose,{enabled=true,quality='high',active=true}={}){
      group.visible=Boolean(enabled&&active&&pose);
      if(!group.visible)return;
      group.position.set(pose.x,0.02,pose.z);
      group.rotation.y=pose.heading+Math.PI;
      for(const part of detailParts)part.visible=quality!=='low';
    }
    function dispose(){
      scene.remove(group);group.visible=false;
      for(const geometry of geometries)geometry.dispose();
      fill.dispose();glass.dispose();edges.dispose();
    }
    return {group,update,dispose};
  }

  return {createLapGhostTracker,createLapGhostVisual,createLapGhostStore};
});
