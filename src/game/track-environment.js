(function attachCyberTrack(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberTrackModule(){
  'use strict';

  // Visual-only track identity. Keep circuit geometry, physics and seeded placement independent.
  const TRACK_VISUAL_THEMES=Object.freeze({
    valley:Object.freeze({
      groupName:'neon-valley',cool:0x5addec,coolGlow:0x13b7ce,
      warm:0xffc16e,warmGlow:0xff922d,contrast:0xd579c9,contrastGlow:0xa4318c,
      asphalt:0xc4c9d1,shoulder:0xb8aa90,ground:[0x896b50,0x526453,0xac815d],relief:1,
      atmosphere:{
        fogColor:0xbd98a4,fogDensity:0.00066,ambient:0x9ca8c6,ambientPower:0.42,
        key:0xffca92,keyPower:3,skyLight:0xb6c8ed,bounce:0x705443,fill:1.45,lightOffset:[-230,150,150],
        sky:['#29365c','#686e9c','#dfa691','#ffcf92','#998eae'],cloud:'rgba(255,196,159,0.22)',
        glow:['rgba(255,215,148,0.95)','rgba(255,168,108,0.46)'],disc:'#ffe8b0'
      },
      signs:[['VALLEY GP','01 / PIT & GRANDSTAND','#63e5ef'],['RED CANYON','02 / ROCK PASS','#ffb570'],
        ['ION WORKS','03 / ENERGY DISTRICT','#7ae6cd'],['NIGHT CITY','04 / DOWNTOWN LOOP','#e78bdf']]
    }),
    city:Object.freeze({
      groupName:'neon-quarter',cool:0x71cfff,coolGlow:0x188eda,
      warm:0xffbd76,warmGlow:0xe87b35,contrast:0xf08cdd,contrastGlow:0xb33bba,
      asphalt:0x929fba,shoulder:0x708294,ground:[0x354659,0x3d544f,0x56677c],relief:0.22,
      atmosphere:{
        fogColor:0x475074,fogDensity:0.00105,ambient:0xb2bed8,ambientPower:0.66,
        key:0xc1d8ff,keyPower:1.25,skyLight:0xb3c0e6,bounce:0x544d6b,fill:1.5,lightOffset:[120,190,-130],
        sky:['#080f28','#18284e','#3e4d79','#6d547e','#4b506d'],cloud:'rgba(114,141,196,0.18)',
        glow:['rgba(211,230,255,0.78)','rgba(118,157,239,0.24)'],disc:'#d6e5ff',stars:true
      },
      signs:[['NEON QUARTER','01 / CITY GRID','#82dfff'],['METRO LOOP','02 / STREET CIRCUIT','#ff92d7'],
        ['SKYLINE RUN','03 / HIGH RISE','#93beff'],['NIGHT MARKET','04 / DOWNTOWN','#ffc085']]
    }),
    industrial:Object.freeze({
      groupName:'steel-express',cool:0x69d9bf,coolGlow:0x17a68f,
      warm:0xffc064,warmGlow:0xe68725,contrast:0xff906d,contrastGlow:0xc64a32,
      asphalt:0xaeb9b6,shoulder:0x8e978f,ground:[0x68736b,0x4d625a,0x81908b],relief:0.5,
      atmosphere:{
        fogColor:0x8ca4a6,fogDensity:0.00084,ambient:0xc5d3d1,ambientPower:0.53,
        key:0xd5e5d8,keyPower:2.1,skyLight:0xafc6cb,bounce:0x586254,fill:1.55,lightOffset:[225,170,90],
        sky:['#405761','#5b747b','#97adae','#c1c9bf','#879da1'],cloud:'rgba(56,78,88,0.28)',
        glow:['rgba(236,237,211,0.58)','rgba(225,235,215,0.24)']
      },
      signs:[['STEEL EXPRESS','01 / FACTORY STRAIGHT','#ffc064'],['FORGE SECTOR','02 / HEAVY INDUSTRY','#ff906d'],
        ['PIPELINE GP','03 / SERVICE ROAD','#71e2c5'],['REACTOR LOOP','04 / POWER DISTRICT','#ffc064']]
    })
  });

  function createTrackSky(THREE,document,trackId,atmosphere){
    const canvas=document.createElement('canvas');
    const w=canvas.width=1024,h=canvas.height=512;
    const ctx=canvas.getContext('2d');
    const gradient=ctx.createLinearGradient(0,0,0,h);
    [0,0.25,0.42,0.52,0.73].forEach((stop,i)=>gradient.addColorStop(stop,atmosphere.sky[i]));
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    let seed=38119;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    if(atmosphere.stars){
      for(let i=0;i<115;i++){
        const x=random()*w,y=8+random()*193,r=random();
        ctx.fillStyle=r>0.9?'#c7d8f4':'#65779e';ctx.fillRect(x,y,r>0.9?1.25:0.65,r>0.9?1.25:0.65);
      }
    }
    const x=670,y=atmosphere.stars?183:230;
    const glow=ctx.createRadialGradient(x,y,2,x,y,155);
    glow.addColorStop(0,atmosphere.glow[0]);glow.addColorStop(0.22,atmosphere.glow[1]);glow.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=glow;ctx.fillRect(x-155,y-155,310,310);
    if(atmosphere.disc){
      ctx.fillStyle=atmosphere.disc;ctx.beginPath();ctx.arc(x,y,atmosphere.stars?6:9,0,Math.PI*2);ctx.fill();
    }
    for(let i=0;i<36;i++){
      const cx=random()*w,cy=135+random()*113,rx=28+random()*113,ry=2+random()*8;
      const cloud=ctx.createLinearGradient(0,cy-ry,0,cy+ry);
      cloud.addColorStop(0,'rgba(255,255,255,0)');cloud.addColorStop(0.52,atmosphere.cloud);cloud.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=cloud;
      for(const wrap of [-w,0,w]){
        ctx.beginPath();ctx.ellipse(cx+wrap,cy,rx,ry,-0.025,0,Math.PI*2);ctx.fill();
      }
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sky=new THREE.Mesh(new THREE.SphereGeometry(2050,32,24),new THREE.MeshBasicMaterial({
      map:texture,side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false
    }));
    sky.name='track-sky-'+trackId;sky.renderOrder=-10;
    return sky;
  }

  function findClosestSample(samples,x,z,lastIdx=0,roadHalf=34,searchRange=45){
    const n=samples.length;
    if(!n)return {idx:0,t:0,dist:Infinity};
    let min=Infinity,idx=0;
    const center=((Math.round(lastIdx)%n)+n)%n;
    const range=Math.min(searchRange,n-1);
    for(let offset=-range;offset<=range;offset++){
      const i=(center+offset+n)%n;
      const p=samples[i],d=(x-p.x)**2+(z-p.z)**2;
      if(d<min){min=d;idx=i;}
    }
    // A nearby branch may still be asphalt: search globally before applying offroad drag.
    // Keep local progress preference while it remains inside the drivable ribbon.
    if(min>(roadHalf+3)**2){
      min=Infinity;
      for(let i=0;i<n;i++){
        const p=samples[i],d=(x-p.x)**2+(z-p.z)**2;
        if(d<min){min=d;idx=i;}
      }
    }
    return {idx,t:idx/n,dist:Math.sqrt(min)};
  }

  // Swept circle against roadside rotated rectangular solids. The first hit wins.
  // Works with plain x/z objects, independent from Three.js and frame rate.
  function sweepCarObstacle2D(from,to,obstacles,radius=3.8){
    if(!from||!to||!Number.isFinite(radius)||radius<0||!Array.isArray(obstacles))return null;
    let nearest=null;
    const dx=to.x-from.x,dz=to.z-from.z,travel=Math.hypot(dx,dz);
    if(!Number.isFinite(travel))return null;
    for(const box of obstacles){
      const broadRadius=Math.hypot(box.w,box.d)/2+radius+travel+1;
      if(Math.abs(box.x-from.x)>broadRadius||Math.abs(box.z-from.z)>broadRadius)continue;
      const cs=Math.cos(box.rotation||0),sn=Math.sin(box.rotation||0);
      const transform=p=>({x:(p.x-box.x)*cs-(p.z-box.z)*sn,z:(p.x-box.x)*sn+(p.z-box.z)*cs});
      const a=transform(from),b=transform(to),vx=b.x-a.x,vz=b.z-a.z;
      const hx=box.w/2+radius,hz=box.d/2+radius;
      let t0=0,t1=1,inside=Math.abs(a.x)<hx&&Math.abs(a.z)<hz;
      if(!inside){
        for(const [origin,delta,half] of [[a.x,vx,hx],[a.z,vz,hz]]){
          if(Math.abs(delta)<1e-9){if(Math.abs(origin)>half){t0=2;break;}}
          else{
            const enter=(-half-origin)/delta,exit=(half-origin)/delta;
            t0=Math.max(t0,Math.min(enter,exit));t1=Math.min(t1,Math.max(enter,exit));
          }
        }
        if(t0>t1||t0>1)continue;
      }
      const t=inside?0:t0;
      if(nearest&&t>=nearest.t)continue;
      let x,z;
      if(inside){
        const exitX=hx-Math.abs(a.x),exitZ=hz-Math.abs(a.z);
        const localX=exitX<exitZ?(Math.sign(a.x)||1)*(hx+0.05):a.x;
        const localZ=exitX<exitZ?a.z:(Math.sign(a.z)||1)*(hz+0.05);
        x=box.x+localX*cs+localZ*sn;z=box.z-localX*sn+localZ*cs;
      }else{
        const fraction=Math.max(0,t-0.0001);
        x=from.x+dx*fraction;z=from.z+dz*fraction;
      }
      nearest={x,z,t};
    }
    return nearest;
  }

  function createTrackEnvironment({THREE,scene,document,CONFIG,trackId='valley'}){
    const projectileObstacles=[];
    const carObstacles=[];
    const finishBlock=trackId==='valley'?{x:60,z:141,w:128,h:5.2,d:5.4,rotation:Math.PI/2}:null;
    const finishObstacles=finishBlock?[finishBlock]:[];
    const theme=TRACK_VISUAL_THEMES[trackId]||TRACK_VISUAL_THEMES.valley;
    // One long circuit. Only its last bend enters the finish junction.
    const pts=[
      [0,0,0],[28,0,-6],[73,0,-25],[119,0,-52],[143,0,-90],[139,0,-132],[104,0,-167],[49,0,-185],[-12,0,-188],
      [-75,0,-173],[-123,0,-140],[-146,0,-94],[-135,0,-46],[-101,0,-13],[-65,0,9],[-30,0,17],[-12,0,19],[0,0,16]
    ];
    const route=globalThis.CyberRace?.game?.CHAMPIONSHIP_TRACK_POINTS?.[trackId]||pts;
    const trackPoints=route.map(([x,y,z])=>new THREE.Vector3(x*CONFIG.SCALE,y,z*CONFIG.SCALE));
    const trackCurve=new THREE.CatmullRomCurve3(trackPoints,true,'catmullrom',0.5);
    const totalLength=trackCurve.getLength();
    const samples=[], tangents=[];
    for(let i=0;i<CONFIG.NUM_SAMPLES;i++){const t=i/CONFIG.NUM_SAMPLES; samples.push(trackCurve.getPointAt(t)); tangents.push(trackCurve.getTangentAt(t).normalize());}

    // A repeatable world layout keeps placements stable between reloads.
    let seed=74129;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const clearance=(x,z)=>{
      let min=Infinity;
      for(let i=0;i<samples.length;i++){
        const a=samples[i],b=samples[(i+1)%samples.length],dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
        const u=length?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length)):0;
        min=Math.min(min,(x-a.x-dx*u)**2+(z-a.z-dz*u)**2);
      }
      return Math.sqrt(min);
    };
    const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=512;
    const paint=textureCanvas.getContext('2d');paint.fillStyle='#656c79';paint.fillRect(0,0,512,512);
    for(let i=0;i<42000;i++){const c=65+Math.floor(random()*70);paint.fillStyle=`rgba(${c},${c+5},${c+12},0.5)`;paint.fillRect(random()*512,random()*512,1+random()*2,1);}
    // Tiny, low-contrast wear avoids a repeated checkerboard at driving distance.
    // Consume the established RNG draws so this polish cannot rearrange the scenery.
    for(let i=0;i<14;i++){
      const x=random()*512,y=random()*512,w=6+random()*24,h=5+random()*30;
      if(i<2){paint.fillStyle=i%2?'rgba(48,55,66,0.065)':'rgba(159,164,172,0.045)';paint.fillRect(x,y,w,h);}
    }
    for(let i=0;i<10;i++){
      paint.beginPath();let x=random()*512,y=random()*512;paint.moveTo(x,y);
      for(let k=0;k<7;k++){x+=random()*24-8;y+=random()*30;paint.lineTo(x,y);}
      if(i<2){paint.strokeStyle='rgba(34,41,52,0.11)';paint.lineWidth=0.8;paint.stroke();}
    }
    const asphaltTexture=new THREE.CanvasTexture(textureCanvas);
    asphaltTexture.wrapS=asphaltTexture.wrapT=THREE.RepeatWrapping;
    asphaltTexture.repeat.set(1,1);asphaltTexture.colorSpace=THREE.SRGBColorSpace;
    function createRoad() {
      const v=[], idx=[],uv=[];
      for(let i=0;i<CONFIG.NUM_SAMPLES;i++){
        const p=samples[i], tg=tangents[i];
        const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();
        const L=p.clone().addScaledVector(perp,CONFIG.ROAD_HALF);
        const R=p.clone().addScaledVector(perp,-CONFIG.ROAD_HALF);
        L.y=0.02; R.y=0.02; v.push(L.x,L.y,L.z,R.x,R.y,R.z);uv.push(L.x/18,L.z/18,R.x/18,R.z/18);
      }
      for(let i=0;i<CONFIG.NUM_SAMPLES;i++){const j=(i+1)%CONFIG.NUM_SAMPLES,a=i*2,b=i*2+1,c=j*2,d=j*2+1; idx.push(a,c,b,b,c,d);}
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
      geo.setIndex(idx); geo.computeVertexNormals();
      return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:theme.asphalt, map:asphaltTexture, roughness:0.98,metalness:0}));
    }
    const road=createRoad();road.name='road-surface';road.receiveShadow=true;scene.add(road);

    const edgeGroup=new THREE.Group();
    for(let side=-1; side<=1; side+=2){
      const off=side*(CONFIG.ROAD_HALF-0.8); const v=[], idx=[];
      for(let i=0;i<CONFIG.NUM_SAMPLES;i++){const p=samples[i], tg=tangents[i]; const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize(); const A=p.clone().addScaledVector(perp,off-0.2); const B=p.clone().addScaledVector(perp,off+0.2); A.y=0.04; B.y=0.04; v.push(A.x,A.y,A.z,B.x,B.y,B.z);}
      for(let i=0;i<CONFIG.NUM_SAMPLES;i++){const j=(i+1)%CONFIG.NUM_SAMPLES,a=i*2,b=i*2+1,c=j*2,d=j*2+1; idx.push(a,b,c,b,d,c);}
      const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3)); geo.setIndex(idx); geo.computeVertexNormals();
      edgeGroup.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color:0xdffcff,emissive:0x006688,emissiveIntensity:0.32,roughness:0.55
      })));
    }
    scene.add(edgeGroup);

    // Road paint uses one shared plane and three instanced batches, instead of
    // one geometry/material/draw call per center dash. No gameplay RNG is used.
    const markGeometry=new THREE.PlaneGeometry(1,1),markPose=new THREE.Object3D();
    function placeRoadMark(batch,index,x,z,angle,width,length,y){
      markPose.position.set(x,y,z);
      // Match the legacy dash Euler order, so every center stripe keeps its pose.
      markPose.rotation.set(-Math.PI/2,0,angle);
      markPose.scale.set(width,length,1);
      markPose.updateMatrix();batch.setMatrixAt(index,markPose.matrix);
    }
    function finishRoadMarks(mesh){
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      return mesh;
    }
    const dashCount=Math.ceil(CONFIG.NUM_SAMPLES/9);
    const dashMain=new THREE.InstancedMesh(markGeometry,
      new THREE.MeshBasicMaterial({color:0xf3fbff}),dashCount);
    dashMain.name='road-center-dashes';
    const dashGlow=new THREE.InstancedMesh(markGeometry,
      new THREE.MeshBasicMaterial({color:0x18c9e6,transparent:true,opacity:0.25,depthWrite:false}),dashCount);
    dashGlow.name='road-center-glow';
    let dashIndex=0;
    for(let i=0;i<CONFIG.NUM_SAMPLES;i+=9){
      const p=samples[i],tg=tangents[i],angle=Math.atan2(tg.x,tg.z);
      placeRoadMark(dashMain,dashIndex,p.x,p.z,angle,0.6,4,0.06);
      placeRoadMark(dashGlow,dashIndex,p.x,p.z,angle,1.15,5.4,0.05);
      dashIndex++;
    }
    finishRoadMarks(dashMain);finishRoadMarks(dashGlow);

    // Small warm shoulder reflectors clarify road edges at speed. They stay
    // visible in performance mode; only the decorative cyan halo is disabled.
    const reflectorCount=2*Math.ceil(CONFIG.NUM_SAMPLES/24);
    const edgeReflectors=new THREE.InstancedMesh(markGeometry,
      new THREE.MeshBasicMaterial({color:0xffc17b}),reflectorCount);
    edgeReflectors.name='road-edge-reflectors';
    let reflectorIndex=0;
    for(let i=0;i<CONFIG.NUM_SAMPLES;i+=24){
      const p=samples[i],tg=tangents[i],angle=Math.atan2(tg.x,tg.z);
      for(const side of [-1,1]){
        const offset=side*(CONFIG.ROAD_HALF-3.2);
        placeRoadMark(edgeReflectors,reflectorIndex++,
          p.x-tg.z*offset,p.z+tg.x*offset,angle,0.6,3.1,0.055);
      }
    }
    finishRoadMarks(edgeReflectors);

    function createStartGate(){
      const group=new THREE.Group();
      const start=samples[0],tg=tangents[0];
      group.position.set(start.x,0,start.z);
      group.rotation.y=Math.atan2(tg.x,tg.z);

      const darkMat=new THREE.MeshStandardMaterial({color:0x111522,metalness:0.8,roughness:0.35});
      const glowMat=new THREE.MeshStandardMaterial({color:theme.cool,emissive:theme.coolGlow,emissiveIntensity:2.2,metalness:0.5,roughness:0.25});
      [-1,1].forEach(side=>{
        const pillar=new THREE.Mesh(new THREE.BoxGeometry(1.2,12,1.2),darkMat);
        pillar.position.set(side*(CONFIG.ROAD_HALF+2),6,0);pillar.castShadow=true;group.add(pillar);
        const strip=new THREE.Mesh(new THREE.BoxGeometry(1.32,9.5,0.18),glowMat);
        strip.position.set(side*(CONFIG.ROAD_HALF+2),6,-0.66);group.add(strip);
      });
      const bar=new THREE.Mesh(new THREE.BoxGeometry((CONFIG.ROAD_HALF+2)*2,1.0,1.2),darkMat);
      bar.position.y=12;bar.castShadow=true;group.add(bar);
      const barGlow=new THREE.Mesh(new THREE.BoxGeometry((CONFIG.ROAD_HALF+1)*2,0.22,1.32),glowMat);
      barGlow.position.set(0,12,-0.05);group.add(barGlow);

      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=32;
      const ctx=canvas.getContext('2d');
      const cell=16;
      for(let y=0;y<2;y++)for(let x=0;x<16;x++){
        ctx.fillStyle=(x+y)%2===0?'#f4f4f4':'#111111';
        ctx.fillRect(x*cell,y*cell,cell,cell);
      }
      const texture=new THREE.CanvasTexture(canvas);
      texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
      const line=new THREE.Mesh(
        new THREE.PlaneGeometry((CONFIG.ROAD_HALF-3)*2,4.5),
        new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide})
      );
      line.rotation.x=-Math.PI/2;line.position.y=0.075;group.add(line);
      scene.add(group);
    }
    createStartGate();

    const roadCache = new Set();
    samples.forEach(p => {
      const gx = Math.floor(p.x / 20);
      const gz = Math.floor(p.z / 20);
      for(let dx=-2; dx<=2; dx++){
        for(let dz=-2; dz<=2; dz++){
          roadCache.add(`${gx+dx},${gz+dz}`);
        }
      }
    });
    function isOnRoadFast(x,z,m=CONFIG.ROAD_HALF+8){
      const gx = Math.floor(x/20);
      const gz = Math.floor(z/20);
      if(!roadCache.has(`${gx},${gz}`)) return false;
      return samples.some(p=>Math.hypot(x-p.x,z-p.z)<m);
    }

    function createEnvironment(){
      const group=new THREE.Group();group.name=theme.groupName;group.userData.trackId=trackId;group.userData.visualMarkers=0;
      const details=new THREE.Group();details.name='environment-high-details';group.add(details);
      const landmarks=new THREE.Group();landmarks.name='track-landmarks';group.add(landmarks);
      const batches=new Map(),boxGeo=new THREE.BoxGeometry(1,1,1);
      const rockGeo=new THREE.DodecahedronGeometry(1,0),coneGeo=new THREE.ConeGeometry(1,1,7),crownGeo=new THREE.SphereGeometry(1,8,6);
      const cylinderGeo=new THREE.CylinderGeometry(1,1,1,12),planeGeo=new THREE.PlaneGeometry(1,1);
      const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:0.83,...extra});
      const concrete=mat(0xb5aaa0),dark=mat(0x27384c,{metalness:0.5}),metal=mat(0x7895a6,{metalness:0.65,roughness:0.48});
      const stone=mat(0x6a6170,{flatShading:true}),sandstone=mat(0xb77752,{flatShading:true}),ochre=mat(0xd6a071,{flatShading:true});
      const foliage=mat(0x365c57),sage=mat(0x79907a),trunk=mat(0x5c4340),rust=mat(0xad573b),blue=mat(0x286779);
      const cyan=mat(theme.cool,{emissive:theme.coolGlow,emissiveIntensity:1.3});
      const amber=mat(theme.warm,{emissive:theme.warmGlow,emissiveIntensity:1.0});
      const magenta=mat(theme.contrast,{emissive:theme.contrastGlow,emissiveIntensity:0.7});
      const glass=mat(0x527d97,{metalness:0.78,roughness:0.25});
      const cream=mat(0xe0d4b8),white=mat(0xd7dbd1),leaf=mat(0x687949),red=mat(0xb34e3e);
      const tmp=new THREE.Object3D(),shadowCandidates=[],motions=[];
      let optional=false;
      function part(geo,material,x,y,z,w,h,d,rotation=0,scenic=false){
        const radius=geo===boxGeo?Math.hypot(w,d)/2:Math.max(w,d);
        const bottom=y-(geo===boxGeo||geo===cylinderGeo||geo===coneGeo?h/2:h);
        // A conservative footprint checked against every road segment protects intersecting branches.
        if(bottom<8&&clearance(x,z)<CONFIG.ROAD_HALF+radius+0.75)return false;
        if(finishBlock&&bottom<finishBlock.h){
          const center={x,z};
          if(sweepCarObstacle2D(center,center,finishObstacles,radius+2))return false;
        }
        let byMat=batches.get(geo);if(!byMat)batches.set(geo,byMat=new Map());
        const parent=optional?details:scenic?landmarks:group;
        const key=material.uuid+':'+parent.id;
        let batch=byMat.get(key);if(!batch)byMat.set(key,batch={material,list:[],parent});
        batch.list.push({x,y,z,w,h,d,rotation});
        if(scenic)return true;
        if(geo===boxGeo&&h>=0.25&&bottom<8&&material!==cyan&&material!==amber&&material!==glass&&material!==magenta){
          projectileObstacles.push({x,y,z,w,h,d,rotation,surface:material===metal||material===dark||material===rust?'metal':'stone'});
        }
        if(geo===boxGeo&&h>=4&&bottom<2&&bottom+h>1&&material!==cyan&&material!==amber&&material!==glass&&material!==magenta){
          carObstacles.push({x,z,w,h,d,rotation});
        }
        if(!optional&&geo===boxGeo&&bottom<1&&h>9&&radius<32&&shadowCandidates.length<100){
          shadowCandidates.push({x,y,z,w,h,d,rotation});
        }
        return true;
      }
      const box=(material,x,y,z,w,h,d,r=0)=>part(boxGeo,material,x,y,z,w,h,d,r);
      function block(material,x,z,w,h,d,r=0){return box(material,x,h/2,z,w,h,d,r);}
      function local(x,z,r,dx,dz){return [x+Math.cos(r)*dx+Math.sin(r)*dz,z-Math.sin(r)*dx+Math.cos(r)*dz];}
      function detail(material,x,z,r,dx,y,dz,w,h,d){const q=local(x,z,r,dx,dz);return box(material,q[0],y,q[1],w,h,d,r);}
      function trim(material,x,z,r,dx,y,dz,w,h,d,geo=boxGeo){
        const [px,pz]=local(x,z,r,dx,dz);
        return part(geo,material,px,y,pz,w,h,d,r,true);
      }
      const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=64;
      const contactCtx=contactCanvas.getContext('2d'),gradient=contactCtx.createRadialGradient(32,32,5,32,32,32);
      gradient.addColorStop(0,'rgba(13,18,31,0.48)');gradient.addColorStop(0.6,'rgba(13,18,31,0.24)');gradient.addColorStop(1,'rgba(13,18,31,0)');
      contactCtx.fillStyle=gradient;contactCtx.fillRect(0,0,64,64);
      const contactMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(contactCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
      const contactTransforms=[];
      function contact(x,z,w,d,r=0){contactTransforms.push({x,z,w,d,r});}

      // Coarse terrain is flattened generously around asphalt, including triangle interiors.
      const terrainGeo=new THREE.PlaneGeometry(2800,2800,112,112);terrainGeo.rotateX(-Math.PI/2);
      const pos=terrainGeo.attributes.position,colors=[],color=new THREE.Color();
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),z=pos.getZ(i),distance=clearance(x,z);
        const blend=THREE.MathUtils.smoothstep(distance,CONFIG.ROAD_HALF+150,CONFIG.ROAD_HALF+360);
        const wave=(Math.sin(x*0.009+z*0.005)+Math.cos(z*0.013-x*0.007)+2)*11;
        pos.setY(i,-0.65+blend*wave*theme.relief);
        const patches=Math.sin(x*0.025+Math.cos(z*0.012)*2)*Math.cos(z*0.02);
        color.set(theme.ground[patches>0.1?0:patches< -0.3?1:2]);
        color.multiplyScalar(0.84+0.13*Math.sin(x*0.017+z*0.019));colors.push(color.r,color.g,color.b);
      }
      terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrainGeo.computeVertexNormals();
      const terrain=new THREE.Mesh(terrainGeo,mat(0xffffff,{vertexColors:true}));
      terrain.name='track-terrain';terrain.receiveShadow=true;group.add(terrain);

      // The distant silhouettes use the same seeded layout on every restart.
      const farRock=mat(0x5d6e8f,{flatShading:true}),midRock=mat(0x826c7a,{flatShading:true});
      for(let ring=0;ring<3;ring++)for(let i=0;i<34;i++){
        const a=(i+ring*0.31)/34*Math.PI*2,rad=1050+ring*210+random()*80;
        const h=120+random()*180+ring*35,w=90+random()*100;
        const x=Math.cos(a)*rad,z=Math.sin(a)*rad-120;
        if(trackId==='city'){
          const distance=rad+145;
          const sx=Math.cos(a)*distance,sz=Math.sin(a)*distance-120;
          const height=h*(i%5===0?1.15:0.68),width=w*0.44;
          part(boxGeo,i%3?dark:blue,sx,height/2,sz,width,height,width*0.8,a,true);
          part(boxGeo,i%5?glass:magenta,sx,height+2,sz,width*0.68,4,width*0.6,a,true);
          if(i%3===0)part(boxGeo,amber,sx,height*0.72,sz,width*1.01,1.6,width*0.83,a,true);
        }else if(trackId==='industrial'){
          const height=h*0.28;
          part(boxGeo,i%3?dark:concrete,x,height/2,z,w,height,w*0.58,a,true);
          if(i%2===0)part(cylinderGeo,metal,x,height+36,z,9,75,9,a,true);
        }else{
          part(rockGeo,ring===2?farRock:ring===1?midRock:sandstone,x,h*0.28-15,z,w,h,w*0.75,a);
          if(ring===0)part(rockGeo,stone,x,12,z,w*1.25,65,w,a);
        }
      }

      function makeSign(title,subtitle,accent){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#102137';ctx.fillRect(0,0,512,192);
        ctx.strokeStyle=accent;ctx.lineWidth=8;ctx.strokeRect(8,8,496,176);
        ctx.fillStyle=accent;ctx.fillRect(24,27,9,104);ctx.font='bold 49px Arial';ctx.fillText(title,49,88);
        ctx.font='21px Arial';ctx.fillStyle='#e8e8da';ctx.fillText(subtitle,50,135);
        for(let k=0;k<9;k++){ctx.fillStyle=k%3===0?accent:'#314353';ctx.fillRect(355+k*13,149,8,13);}
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
      }
      const sectorSigns=theme.signs.map(([title,subtitle,accent],index)=>{
        const sign=makeSign(title,subtitle,accent);
        sign.name='track-sign-'+trackId+'-'+index;
        return sign;
      });
      function signFace(material,x,y,z,w,h,r){const m=new THREE.Mesh(planeGeo,material);m.position.set(x,y,z);m.rotation.y=r;m.scale.set(w,h,1);group.add(m);return m;}
      function landmarkAt(t,side,offset,radius=30){
        const p=trackCurve.getPointAt(t),d=trackCurve.getTangentAt(t),x=p.x-d.z*offset*side,z=p.z+d.x*offset*side;
        return clearance(x,z)>CONFIG.ROAD_HALF+radius+6?{x,z,r:Math.atan2(d.x,d.z),side}:null;
      }

      const reserved=[];
      function roadside(t,radius){
        // Search only a small neighborhood; never force a plot into a neighboring road branch.
        for(let step=0;step<10;step++)for(const side of [-1,1]){
          const u=(t+step*0.004)%1,p=trackCurve.getPointAt(u),tg=trackCurve.getTangentAt(u),r=Math.atan2(tg.x,tg.z);
          const offset=CONFIG.ROAD_HALF+radius+17+(step%3)*10;
          const x=p.x+tg.z*offset*side,z=p.z-tg.x*offset*side;
          if(clearance(x,z)<CONFIG.ROAD_HALF+radius+9||reserved.some(q=>Math.hypot(q.x-x,q.z-z)<q.radius+radius+8))continue;
          reserved.push({x,z,radius});return {x,z,r,side,t:u};
        }
        return null;
      }
      function anchor(name,q){const node=new THREE.Group();node.name=name;node.position.set(q.x,0,q.z);node.rotation.y=q.r;group.add(node);}
      function facingSign(material,q,dx,y,dz,w,h){const p=local(q.x,q.z,q.r,dx,dz);return signFace(material,p[0],y,p[1],w,h,q.r-q.side*Math.PI/2);}
      const shopSigns=[makeSign('МАРКЕТ','ПРОДУКТЫ / 24 ЧАСА','#89dab8'),makeSign('КАФЕ','КОФЕ / ВЫПЕЧКА','#f4be79'),makeSign('АВТОСЕРВИС','ШИНЫ / МАСЛО / РЕМОНТ','#7dd7ec')];
      const fuelSigns=[makeSign('VOLT / АЗС','95  2.19   /   98  2.39','#6ee0d5'),makeSign('ORBIT / АЗС','95  2.17   /   ДТ  2.09','#f6b96e')];
      function parkedVan(q,dx,dz,bodyMaterial){
        const p=local(q.x,q.z,q.r,dx,dz),r=q.r;
        if(clearance(p[0],p[1])<CONFIG.ROAD_HALF+12)return;
        box(dark,p[0],1,p[1],4.2,1.2,8,r);box(bodyMaterial,p[0],2.5,p[1],4.1,3,7.3,r);
        detail(glass,p[0],p[1],r,0,3,-3.72,3.6,1.4,0.15);
        for(const side of [-1,1])for(const dz2 of [-2.3,2.3]){const v=local(p[0],p[1],r,side*2.1,dz2);part(rockGeo,dark,v[0],0.9,v[1],0.7,0.9,0.9);}
        detail(amber,p[0],p[1],r,-1.25,1.5,-4.06,0.7,0.5,0.15);detail(amber,p[0],p[1],r,1.25,1.5,-4.06,0.7,0.5,0.15);
      }
      function streetFurniture(q,dx,dz){
        const p=local(q.x,q.z,q.r,dx,dz),r=q.r;
        box(trunk,p[0],1.25,p[1],1.5,0.3,5,r);detail(trunk,p[0],p[1],r,0.65,2,0,0.25,1.3,5);
        for(const s of [-1,1])detail(metal,p[0],p[1],r,0,0.65,s*1.8,1.2,1.1,0.3);
        const bin=local(p[0],p[1],r,0,4.1);part(cylinderGeo,dark,bin[0],1.1,bin[1],0.8,2.2,0.8);part(cylinderGeo,metal,bin[0],2.25,bin[1],0.85,0.2,0.85);
      }
      // Small familiar destinations sit nearest to the camera, ahead of larger district scenery.
      for(const [index,t] of [0.075,0.18,0.48,0.735,0.845,0.935].entries()){
        const q=roadside(t,23);if(!q)continue;anchor(['market','cafe','auto-service'][index%3]+'-'+index,q);
        const {x,z,r,side}=q,w=15,d=30,h=index%3===2?10:7.5;
        block(index%3===1?cream:index%3===2?blue:white,x,z,w,h,d,r);contact(x,z,27,42,r);
        box(dark,x,h+0.4,z,w+1,0.8,d+2,r);
        detail(concrete,x,z,r,-side*11,0.18,0,6,0.3,d+6);
        for(const dz of [-9,0,9])detail(glass,x,z,r,-side*(w/2+0.12),3.6,dz,0.3,4.6,7.5);
        detail(metal,x,z,r,-side*(w/2+0.25),3.1,4.2,0.2,5.8,0.3);
        detail(index%3===1?red:blue,x,z,r,-side*10,h-1.6,0,5,0.5,d+1);
        facingSign(shopSigns[index%3],q,-side*7.75,h+1.15,0,27,3.1);
        if(index%3===1)streetFurniture(q,-side*12,-9);
        else parkedVan(q,side*16,8,index%3===2?rust:white);
        if(index%3===2)for(let k=0;k<3;k++)detail(dark,x,z,r,-side*8,1+k*0.8,15.8,2,0.7,1.7);
      }
      for(const [index,t] of [0.135,0.79].entries()){
        const q=roadside(t,39);if(!q)continue;anchor('fuel-station-'+(index+1),q);
        const {x,z,r,side}=q,brand=index?amber:cyan;
        block(concrete,x,z,42,0.35,55,r);contact(x,z,64,77,r);
        box(white,x,10.7,z,34,1.1,43,r);box(brand,x,10.25,z,34.4,0.7,43.4,r);box(dark,x,11.35,z,35,0.3,44,r);
        for(const dx of [-12,12])for(const dz of [-16,16])detail(metal,x,z,r,dx,5.2,dz,0.7,10.4,0.7);
        for(const dz of [-10,10]){
          detail(white,x,z,r,0,0.65,dz,6,0.5,6);detail(brand,x,z,r,0,2.3,dz,2.5,3.2,2.2);
          detail(white,x,z,r,0,4.1,dz,2.8,1,2.4);detail(dark,x,z,r,-side*1.45,4.1,dz,0.2,0.5,1.4);
          detail(dark,x,z,r,-side*1.8,2.4,dz+1.4,0.2,2.2,0.25);detail(metal,x,z,r,-side*1.6,3.5,dz+1.4,0.4,0.7,0.3);
          for(const dx of [-3.7,3.7])detail(rust,x,z,r,dx,1,dz,0.25,2,0.25);
        }
        facingSign(fuelSigns[index],q,-side*17.25,10.5,0,33,3.2);
        const shop=local(x,z,r,side*26,0);block(cream,shop[0],shop[1],10,7,30,r);detail(glass,shop[0],shop[1],r,-side*5.1,3.4,0,0.2,4.5,25);
        const price=local(x,z,r,-side*19,23);box(metal,price[0],6.5,price[1],1,13,1,r);
        signFace(fuelSigns[index],price[0],12,price[1],12,4.5,r+Math.PI);
        parkedVan(q,-side*9,13,index?rust:white);
      }
      const busSign=makeSign('ОСТАНОВКА','VALLEY / ROUTE 07','#99d5ec');
      for(const [index,t] of [0.025,0.56,0.91].entries()){
        const q=roadside(t,16);if(!q)continue;anchor('bus-shelter-'+index,q);const {x,z,r,side}=q;
        block(concrete,x,z,9,0.35,22,r);box(dark,x,6.3,z,9,0.6,20,r);
        for(const dz of [-9,9]){detail(metal,x,z,r,side*3.8,3,dz,0.3,6,0.3);detail(glass,x,z,r,0,3,dz,7.3,5.3,0.2);}
        detail(glass,x,z,r,side*3.8,3,0,0.2,5.3,18);streetFurniture(q,side*1.8,-3);
        facingSign(busSign,q,-side*4.6,6.2,0,17,2.1);
      }
      const unlitSignal=mat(0x172c2b),signalGreen=mat(0x3ce398,{emissive:0x1bd475,emissiveIntensity:1.7}),signalRed=mat(0xdd583c,{emissive:0xd83a21,emissiveIntensity:1.1});
      const signalGeo=new THREE.SphereGeometry(0.42,8,6);
      for(let i=0;i<12;i++){
        const t=(0.015+i*0.083)%1,p=trackCurve.getPointAt(t),tg=trackCurve.getTangentAt(t),r=Math.atan2(tg.x,tg.z),side=i%2?1:-1;
        const q=local(p.x,p.z,r,side*(CONFIG.ROAD_HALF+15),0);
        if(clearance(q[0],q[1])<CONFIG.ROAD_HALF+13)continue;
        box(metal,q[0],4.2,q[1],0.45,8.4,0.45);box(dark,q[0],7.8,q[1],1.7,4.2,1,r);
        for(let lamp=0;lamp<3;lamp++){
          const m=new THREE.Mesh(signalGeo,lamp===2?signalGreen:unlitSignal),front=local(q[0],q[1],r,0,-0.55);
          m.position.set(front[0],9-lamp*1.2,front[1]);m.name='race-traffic-light-'+i+'-'+lamp;group.add(m);
        }
        // A perpendicular service signal stays red while the racing lane has green priority.
        if(i%3===0){const head=local(q[0],q[1],r,side*1.5,0);box(dark,head[0],7.8,head[1],0.9,3.6,1.5,r);const m=new THREE.Mesh(signalGeo,signalRed);m.position.set(head[0]+Math.cos(r)*side*0.5,8.8,head[1]-Math.sin(r)*side*0.5);m.name='service-entry-red-'+i;group.add(m);}
      }

      // Each district has its own silhouette, materials, large details and roadside language.
      for(let i=0;i<76;i++){
        const t=i/76,p=trackCurve.getPointAt(t),tg=trackCurve.getTangentAt(t),side=i%2?1:-1;
        const offset=CONFIG.ROAD_HALF+43+random()*43,x=p.x+tg.z*offset*side,z=p.z-tg.x*offset*side,r=Math.atan2(tg.x,tg.z);
        if(clearance(x,z)<CONFIG.ROAD_HALF+31||reserved.some(q=>Math.hypot(x-q.x,z-q.z)<q.radius+29))continue;
        const district=trackId==='city'?3:trackId==='industrial'?2:t<0.20?0:t<0.46?1:t<0.72?2:3;
        if(district===0){
          if(i%3===0){
            const w=27,d=38,h=10+random()*5;
            if(!block(i%2?blue:concrete,x,z,w,h,d,r))continue;
            contact(x,z,w*1.5,d*1.4,r);detail(dark,x,z,r,0,h+0.5,0,w+3,1.5,d+3);
            for(let k=0;k<4;k++){
              detail(dark,x,z,r,-side*(w/2+0.1),3.8,-13+k*9,0.3,7,7);
              detail(cyan,x,z,r,-side*(w/2+0.3),7.5,-13+k*9,0.4,0.5,7);
              optional=true;for(let stripe=0;stripe<4;stripe++)detail(metal,x,z,r,-side*(w/2+0.2),1.3+stripe*1.5,-13+k*9,0.25,0.15,6.6);optional=false;
            }
            detail(glass,x,z,r,-side*(w/2+0.15),h-1.7,0,0.3,2.2,30);
            detail(amber,x,z,r,0,h+1.6,0,17,0.6,4);
          }else{
            if(!block(concrete,x,z,30,3,40,r))continue;
            contact(x,z,44,52,r);
            for(let k=0;k<5;k++){
              detail(concrete,x,z,r,side*(-10+k*4),3+k*1.6,0,4,2.5,38);
              optional=true;for(let seat=0;seat<12;seat++)detail((seat+k)%4?blue:rust,x,z,r,side*(-10+k*4),4.5+k*1.6,-17+seat*3,2,0.5,2);optional=false;
            }
            detail(dark,x,z,r,side*2,16,0,39,1,45);
            for(const dz of [-18,18])detail(metal,x,z,r,side*16,8,dz,1,16,1);
            detail(cyan,x,z,r,-side*17,15.7,0,0.6,0.7,43);
          }
        }else if(district===1){
          const h=25+random()*43,w=16+random()*9;
          for(let tier=0;tier<4;tier++){
            const tx=x+side*tier*3,tz=z+tier*2;
            part(rockGeo,tier===0?stone:tier===3?ochre:sandstone,tx,h*(0.17+tier*0.16),tz,w*(1.3-tier*0.12),h*(0.42-tier*0.03),w*1.4,r+tier*0.18);
          }
          contact(x,z,w*2.6,w*3,r);
          optional=true;
          for(let k=0;k<5;k++){const q=local(x,z,r,(random()-0.5)*40,(random()-0.5)*55);part(rockGeo,k%2?ochre:stone,q[0],1.4,q[1],2+random()*3,2+random()*3,2+random()*3,random()*6);}
          optional=false;
        }else if(district===2){
          const w=26+random()*12,d=24+random()*12,h=13+random()*13;
          if(!block(i%2?blue:dark,x,z,w,h,d,r))continue;
          contact(x,z,w*1.5,d*1.5,r);detail(metal,x,z,r,0,h+0.6,0,w+2,1.2,d+2);
          detail(cyan,x,z,r,-side*(w/2+0.2),h-2,0,0.3,0.8,d-2);
          for(let k=0;k<3;k++){
            detail(rust,x,z,r,side*(w/2+6),4,-9+k*10,9,8,9);
            detail(metal,x,z,r,-side*(w/2+0.2),h*0.5,-8+k*8,0.4,h-5,0.5);
          }
          const q=local(x,z,r,4,2);part(cylinderGeo,metal,q[0],h+8,q[1],3,16,3);part(cylinderGeo,dark,q[0],h+16,q[1],4,1.3,4);
          if(i%3===0){const vent=new THREE.Group();vent.name='industrial-ventilator-'+i;vent.position.set(q[0],h+17,q[1]);for(let k=0;k<3;k++){const blade=new THREE.Mesh(boxGeo,metal);blade.scale.set(7,0.3,0.9);blade.rotation.y=k*Math.PI/3;vent.add(blade);}details.add(vent);motions.push({type:'fan',mesh:vent,phase:random()*6});}
          optional=true;for(let k=0;k<3;k++)detail(amber,x,z,r,-side*(w/2+0.6),4,-8+k*8,0.3,1.4,2);optional=false;
          if(trackId==='industrial'){
            const face=-side*(w/2+0.45);
            if(i%3===0){
              // Sawtooth roof and tall warm openings on the workshop frontage.
              for(const z0 of [-d*0.31,0,d*0.31]){
                trim(metal,x,z,r,0,h+3,z0,w+1,4,d*0.24);
                trim(amber,x,z,r,face,6,z0,0.85,7,d*0.19);
              }
            }else if(i%3===1){
              // Service hangar with wide loading canopy and a raised rooftop drum.
              trim(metal,x,z,r,face,12,0,7,1.35,d*0.92);
              trim(rust,x,z,r,0,h+5,d*0.18,w*0.21,9,d*0.22,cylinderGeo);
              trim(dark,x,z,r,face,5,0,0.6,9,d*0.54);
            }else{
              // Ribbed equipment shed with exposed ducts along its visible wall.
              for(const z0 of [-d*0.37,-d*0.12,d*0.12,d*0.37]){
                trim(rust,x,z,r,face,9,z0,1.3,16,1.4);
              }
              trim(metal,x,z,r,face,15,0,2.1,2.1,d+2);
            }
          }
        }else{
          const w=20+random()*11,d=21+random()*12,h=38+random()*77;
          if(!block(i%3===0?blue:i%3===1?dark:concrete,x,z,w,h,d,r))continue;
          contact(x,z,w*1.6,d*1.6,r);
          detail(dark,x,z,r,0,h+0.5,0,w+3,1.5,d+3);
          detail(i%2?cyan:magenta,x,z,r,-side*(w/2+0.2),h*0.5,-d*0.36,0.5,h-3,0.7);
          for(let floor=8;floor<h-5;floor+=8){
            detail(glass,x,z,r,-side*(w/2+0.15),floor,0,0.25,3.1,d-4);
            optional=true;
            for(let win=0;win<5;win++)if(random()>0.34)detail((win+i)%4?amber:cyan,x,z,r,-side*(w/2+0.35),floor,-d*0.38+win*d*0.19,0.2,1.6,1.4);
            detail(metal,x,z,r,0,floor,-d/2-0.05,w,0.4,0.2);optional=false;
          }
          if(i%3===0){detail(dark,x,z,r,0,h+5,0,w*0.6,9,d*0.55);detail(cyan,x,z,r,0,h+10,0,w*0.65,0.5,d*0.6);}
          if(i%4===0)detail(metal,x,z,r,w*0.2,h+10,0,0.4,20,0.4);
          if(trackId==='city'){
            const face=-side*(w/2+0.55);
            if(i%3===0){
              // Stepped hotel with a warm crown and a continuous entrance awning.
              trim(cream,x,z,r,0,h+6,0,w*0.79,12,d*0.83);
              trim(glass,x,z,r,0,h+17,0,w*0.48,11,d*0.55);
              trim(amber,x,z,r,0,h+22.7,0,w*0.51,0.7,d*0.6);
              trim(cyan,x,z,r,face,8,0,7,0.6,d*0.88);
            }else if(i%3===1){
              // Glass office tower with full-height light fins and a split roof.
              for(const z0 of [-d*0.32,0,d*0.32]){
                trim(glass,x,z,r,face,h*0.53,z0,1.2,h*0.86,2.5);
              }
              trim(blue,x,z,r,0,h+9,-d*0.24,w*0.76,17,d*0.38);
              trim(magenta,x,z,r,0,h+17.5,-d*0.24,w*0.78,0.8,d*0.4);
            }else{
              // Residential terraces and a lower rooftop greenhouse.
              for(let y=15;y<h-5;y+=14){
                trim(cream,x,z,r,face,y,0,3.3,0.65,d*0.86);
                trim(sage,x,z,r,face-side*1.6,y+0.8,d*0.24,1.1,1.0,d*0.28);
              }
              trim(glass,x,z,r,0,h+3.5,0,w*0.78,7,d*0.73);
              trim(amber,x,z,r,0,h+7.2,0,w*0.82,0.6,d*0.76);
            }
          }
        }
      }

      // Large readable silhouettes distinguish the championship circuits without extra draw batches.
      // All pieces reuse the existing geometries/materials and stay outside the racing ribbon.
      if(trackId==='city'||trackId==='industrial')for(const [index,t] of [0.11,0.34,0.58,0.84].entries()){
        const q=landmarkAt(t,index%2?1:-1,CONFIG.ROAD_HALF+92,25);
        if(!q)continue;
        group.userData.visualMarkers++;
        const {x,z,r}=q;
        if(trackId==='city'){
          const height=32+(index%2)*12;
          box(dark,x,height/2,z,5,height,5,r);
          box(glass,x,height-4,z,7,9,7,r);
          box(magenta,x,height+0.7,z,12,1.4,12,r);
          box(cyan,x,height-11,z,7,1.1,7,r);
          for(const side of [-1,1])box(blue,x+side*9,10,z,2.5,20,2.5,r);
        }else{
          const height=24+(index%3)*5;
          part(cylinderGeo,metal,x,height/2,z,9,height,9,r);
          part(cylinderGeo,rust,x,height+1,z,11,3,11,r);
          part(cylinderGeo,amber,x,height+3,z,10,1.2,10,r);
          box(dark,x+17,12,z,3,24,3,r);
          box(amber,x+17,24,z,11,1.2,1.5,r);
        }
      }

      // Signs stand outside every asphalt branch, rather than on the preferred local branch.
      for(const [t,sector] of [[0.025,0],[0.205,1],[0.475,2],[0.755,3]]){
        const q=landmarkAt(t,-1,CONFIG.ROAD_HALF+24,17);if(!q)continue;
        box(dark,q.x,12,q.z,1.3,24,1.3);box(metal,q.x,24,q.z,28,10,1.5,q.r);
        signFace(sectorSigns[sector],q.x-Math.sin(q.r)*0.8,24,q.z-Math.cos(q.r)*0.8,27,10,q.r+Math.PI);
      }
      // A race-control tower, with stacked glazing and an illuminated rooftop crown.
      const tower=landmarkAt(0.055,1,100,24);
      if(tower){const {x,z,r}=tower;block(concrete,x,z,14,28,18,r);box(dark,x,32,z,29,8,25,r);box(glass,x,33,z,30,4,26,r);box(cyan,x,37.5,z,31,0.7,27,r);box(metal,x,45,z,0.5,15,0.5);contact(x,z,46,46,r);}

      // Truss bridges and a short, open-sided canyon gallery retain generous overhead clearance.
      function bridge(t,gallery=false){
        const p=trackCurve.getPointAt(t),tg=trackCurve.getTangentAt(t),r=Math.atan2(tg.x,tg.z),width=CONFIG.ROAD_HALF+15,length=gallery?46:11;
        const supports=[];for(const side of [-1,1])for(const dz of [-length/2+2,length/2-2])supports.push(local(p.x,p.z,r,side*width,dz));
        if(supports.some(q=>clearance(q[0],q[1])<CONFIG.ROAD_HALF+10))return;
        for(const q of supports){box(concrete,q[0],12,q[1],3,24,3,r);contact(q[0],q[1],8,8,r);}
        box(gallery?sandstone:dark,p.x,25,p.z,width*2+6,2,length+3,r);
        if(gallery){
          for(let k=0;k<7;k++){const q=local(p.x,p.z,r,0,-length/2+k*length/6);box(metal,q[0],23.7,q[1],width*2,1.1,1.2,r);}
          for(const side of [-1,1])detail(cyan,p.x,p.z,r,side*(width-1),23,0,0.5,0.5,length);
        }else{
          for(const side of [-1,1]){
            detail(metal,p.x,p.z,r,0,29,side*5,width*2,0.7,0.6);
            for(let k=0;k<13;k++)detail(metal,p.x,p.z,r,-width+k*width/6,27.5,side*5,0.6,4,0.6);
          }
          box(amber,p.x,23.8,p.z,width*1.8,0.3,0.6,r);
        }
      }
      bridge(0.32);bridge(0.64);bridge(0.39,true);

      // Industrial focal point: cooling stacks, ring reactor, pipe rack and a small moving fan.
      const reactor=landmarkAt(0.61,-1,154,43);
      if(reactor){const {x,z}=reactor;
        part(cylinderGeo,concrete,x,23,z,23,46,23);part(cylinderGeo,dark,x,47,z,27,4,27);
        part(cylinderGeo,cyan,x,43,z,23.5,2,23.5);part(cylinderGeo,metal,x,67,z,10,36,10);box(amber,x,86,z,6,2,6);contact(x,z,88,88);
        for(let k=0;k<4;k++){const a=k*Math.PI/2;box(metal,x+Math.cos(a)*28,22,z+Math.sin(a)*28,3,44,3);}
        for(let k=0;k<3;k++){const sx=x+52+k*17,sz=z+12;if(clearance(sx,sz)<CONFIG.ROAD_HALF+18)continue;part(cylinderGeo,concrete,sx,28,sz,8,56,8);part(cylinderGeo,rust,sx,47,sz,8.2,7,8.2);part(cylinderGeo,dark,sx,56,sz,10,2,10);}
      }
      for(const t of [0.52,0.68]){const q=landmarkAt(t,1,118,38);if(!q)continue;
        box(rust,q.x,24,q.z,4,48,4);box(rust,q.x+17,47,q.z,58,3,3);box(dark,q.x-17,44,q.z,13,6,7);box(metal,q.x+40,32,q.z,0.3,28,0.3);
        optional=true;for(let k=0;k<7;k++)box(metal,q.x-8+k*7,49,q.z,0.7,4,0.7);optional=false;
      }
      // A split skyline gives the city a memorable silhouette beyond its street blocks.
      const city=landmarkAt(0.86,-1,185,52);
      if(city){const {x,z,r}=city;for(const side of [-1,1]){
        const q=local(x,z,r,side*26,0);block(dark,q[0],q[1],23,145-side*12,32,r);box(glass,q[0],75,q[1],23.2,113,32.2,r);detail(magenta,q[0],q[1],r,-12,80,0,0.7,135,1);box(cyan,q[0],147-side*12,q[1],27,1,36,r);
      }box(metal,x,108,z,40,6,20,r);contact(x,z,125,85,r);}

      // Keep these art pieces outside the racing ribbon, including low supports.
      function scenicSite(t,radius){
        for(const gap of [22,46,68,94]){
          for(const shift of [0,0.016,-0.016,0.034,-0.034]){
            for(const side of [-1,1]){
              const q=landmarkAt(t+shift,side,CONFIG.ROAD_HALF+radius+gap,radius);
              if(q&&!carObstacles.some(obstacle=>
                Math.hypot(obstacle.x-q.x,obstacle.z-q.z)<radius+Math.hypot(obstacle.w,obstacle.d)/2+2
              ))return q;
            }
          }
        }
        return null;
      }
      function overheadSite(t){
        const p=trackCurve.getPointAt(t),d=trackCurve.getTangentAt(t);
        return {x:p.x,z:p.z,r:Math.atan2(d.x,d.z),side:1};
      }
      function signature(name,q,build){
        if(!q)return;
        const site=new THREE.Group();
        site.name=name;site.position.set(q.x,0,q.z);site.rotation.y=q.r;
        landmarks.add(site);
        const piece=(material,dx,y,dz,w,h,d,geo=boxGeo)=>{
          const [x,z]=local(q.x,q.z,q.r,dx,dz);
          return part(geo,material,x,y,z,w,h,d,q.r,true);
        };
        build(piece,q.side,site);
      }
      if(trackId==='valley'){
        signature('pit-pavilion',scenicSite(0.035,62),(piece,side)=>{
          piece(cream,0,6,0,39,14,87);
          piece(glass,side*20,9,0,0.8,5,78);
          for(const z of [-33,-11,11,33]){
            piece(metal,-side*27,13,z,2.2,28,2.2);
            piece(dark,0,25,z,61,3.5,5);
          }
          piece(blue,0,23,0,57,2.2,95);
          piece(cyan,side*28,23,0,1.1,0.7,92);
        });
        signature('canyon-arch',overheadSite(0.352),piece=>{
          const span=CONFIG.ROAD_HALF+28;
          for(const side of [-1,1]){
            piece(sandstone,side*span,10,0,19,21,14,rockGeo);
            piece(ochre,side*(span-7),28,1,19,13,11,rockGeo);
          }
          piece(sandstone,0,39,0,span+4,9,12,rockGeo);
          piece(ochre,-11,43,0,span*0.58,5,7,rockGeo);
        });
        signature('canyon-overlook',scenicSite(0.456,51),(piece,side)=>{
          piece(sandstone,0,9,0,34,16,42,rockGeo);
          piece(ochre,0,20,0,28,9,33,rockGeo);
          piece(dark,0,27,0,36,2.5,45);
          piece(glass,0,33,0,31,10,37);
          piece(cream,-side*4,39,0,45,2.3,49);
          piece(amber,side*17,27.8,0,1.1,0.8,43);
          piece(metal,-side*11,46,-12,1.4,16,1.4);
        });
      }else if(trackId==='city'){
        signature('market-hall',scenicSite(0.063,63),(piece,front)=>{
          piece(cream,0,8,0,44,18,95);
          piece(blue,-front*8,21,0,31,10,64);
          piece(dark,0,17,0,49,2,98);
          for(const [i,z] of [-36,-18,0,18,36].entries()){
            piece(glass,front*22.3,8.3,z,0.9,9,14.5);
            piece(i%2?amber:magenta,front*22.9,4.6,z,0.4,0.65,14);
            piece(i%2?blue:rust,front*26,14,z,9,1.25,16);
            piece(cream,front*22.8,8.7,z+8.3,1.0,11,1.4);
          }
          piece(magenta,front*6,25.8,0,1.2,0.8,63);
        });
        signature('metro-viaduct',overheadSite(0.355),(piece,_side,site)=>{
          const span=CONFIG.ROAD_HALF+30;
          for(const side of [-1,1]){
            piece(concrete,side*span,14,0,8,29,12);
            piece(dark,side*span,21,0,10,4,13);
          }
          piece(metal,0,28,0,2*span+86,3.5,12);
          piece(cyan,0,27,-6.1,2*span+85,0.55,0.65);
          const train=new THREE.Group();train.name='district-metro';
          site.add(train);train.position.set(0,31.5,0);
          const carriage=[
            [cream,0,0,14.7,3.1,6.8],
            [glass,0.5,-3.45,12.7,1.25,0.3],
            [glass,0.5,3.45,12.7,1.25,0.3],
            [magenta,-0.83,-3.48,14.2,0.42,0.34],
            [dark,1.68,0,13.3,0.45,5.6]
          ];
          for(const [material,y,z,w,h,d] of carriage){
            const mesh=new THREE.InstancedMesh(boxGeo,material,3);
            for(const [index,x] of [-16,0,16].entries()){
              tmp.position.set(x,y,z);tmp.rotation.set(0,0,0);tmp.scale.set(w,h,d);tmp.updateMatrix();
              mesh.setMatrixAt(index,tmp.matrix);
            }
            mesh.computeBoundingSphere();train.add(mesh);
          }
          motions.push({type:'train',mesh:train,phase:0,span:span+18});
        });
        signature('canal-waterfront',scenicSite(0.655,85),(piece,front)=>{
          const water=mat(0x284c67,{roughness:0.4,emissive:0x162a46,emissiveIntensity:0.55});
          piece(water,0,1.25,0,67,0.25,138);
          for(const side of [-1,1]){
            piece(concrete,side*36,1,0,6.5,4.4,145);
            piece(cyan,side*35,3.45,0,0.75,0.55,144);
          }
          for(const z of [-52,-24,16,52]){
            piece(dark,front*37,8.5,z,1.6,12,1.6);
            piece(amber,front*33,14,z,9,0.7,1.4);
          }
          for(let i=0;i<17;i++)piece(i%4?glass:cyan,(i%5-2)*9,1.43,(i-8)*7,9+(i%3)*3,0.13,0.48);
        });
      }else if(trackId==='industrial'){
        signature('cargo-terminal',scenicSite(0.075,68),(piece,front)=>{
          const paint=[blue,rust,concrete];
          for(const [row,x] of [-16,0,16].entries()){
            for(const [column,z] of [-33,-11,11,33].entries()){
              const levels=1+(row+column*2)%3;
              for(let level=0;level<levels;level++){
                const y=4+level*7;
                piece(paint[(row+column+level)%3],x,y,z,11,6.85,20.5);
                for(const rail of [-1,1])piece(metal,x+rail*5.2,y+2.9,z,0.7,0.45,20.8);
              }
            }
          }
          piece(rust,-front*31,23,23,6.5,47,7);
          piece(metal,0,46,23,83,5,7);
          piece(amber,front*31,44,23,15,0.8,7.5);
        });
        signature('forge-hall',scenicSite(0.408,67),(piece,front)=>{
          piece(dark,0,13,0,61,26,100);
          for(const [i,z] of [-36,-12,12,36].entries()){
            piece(i%2?metal:concrete,0,29,z,63,6+i%2*7,21);
            piece(amber,front*31,10,z,1.2,13,14);
            piece(rust,front*32,12,z+9,2,22,2.4);
            piece(dark,front*34,18,z,8,1.8,18);
          }
          piece(rust,-front*18,44,27,6,32,6,cylinderGeo);
          piece(metal,-front*18,60,27,7.5,3,7.5,cylinderGeo);
        });
        signature('cooling-towers',scenicSite(0.723,83),piece=>{
          const tower=new THREE.CylinderGeometry(0.59,1,1,18,1,true);
          for(const [i,z] of [-34,30].entries()){
            const size=1+i*0.16;
            piece(concrete,0,35*size,z,27*size,67*size,27*size,tower);
            piece(dark,0,68*size,z,16.7*size,3,16.7*size,cylinderGeo);
            piece(amber,0,69.6*size,z,16.9*size,0.6,16.9*size,cylinderGeo);
            piece(dark,0,4,z,29*size,8,29*size,cylinderGeo);
          }
          piece(metal,31,6,0,6,11,97);
          piece(rust,31,15,-46,6.2,29,7.5);
        });
      }

      // Groves grow in clusters, interleaved with scree and low scrub; no uniform tree confetti.
      for(let cluster=0;cluster<58;cluster++){
        const t=random(),side=cluster%2?1:-1,p=trackCurve.getPointAt(t),tg=trackCurve.getTangentAt(t),offset=CONFIG.ROAD_HALF+35+random()*90;
        const cx=p.x-tg.z*offset*side,cz=p.z+tg.x*offset*side;
        for(let k=0;k<7;k++){
          const x=cx+(random()-0.5)*55,z=cz+(random()-0.5)*55,dist=clearance(x,z);
          if(dist<CONFIG.ROAD_HALF+13||dist>190||reserved.some(q=>Math.hypot(x-q.x,z-q.z)<q.radius+8))continue;
          const h=6+random()*12;
          optional=k>3;
          if(t>0.20&&t<0.46){part(rockGeo,k%3?stone:ochre,x,1,z,2+random()*5,2+random()*4,2+random()*5,random()*6);}
          else if(k<5){
            const kind=cluster%4;
            part(cylinderGeo,kind===2?white:trunk,x,h*0.34,z,kind===2?0.35:0.5,h*0.68,kind===2?0.35:0.5);
            if(kind===0){for(let tier=0;tier<3;tier++)part(coneGeo,foliage,x,h*(0.48+tier*0.19),z,h*(0.25-tier*0.055),h*0.5,h*(0.25-tier*0.055));}
            else if(kind===1){
              part(crownGeo,leaf,x,h*0.79,z,h*0.35,h*0.32,h*0.34);
              part(crownGeo,sage,x-h*0.19,h*0.67,z+h*0.05,h*0.25,h*0.22,h*0.25);
              part(crownGeo,leaf,x+h*0.17,h*0.71,z-h*0.1,h*0.24,h*0.26,h*0.23);
            }else if(kind===2){
              for(let band=0;band<5;band++)part(cylinderGeo,dark,x,h*(0.12+band*0.105),z,0.36,0.13,0.36);
              part(crownGeo,sage,x,h*0.86,z,h*0.27,h*0.34,h*0.27);
              part(crownGeo,leaf,x+h*0.19,h*0.74,z,h*0.19,h*0.22,h*0.2);
            }else{for(let tier=0;tier<3;tier++)part(crownGeo,leaf,x,h*(0.56+tier*0.21),z,h*(0.16-tier*0.025),h*0.3,h*(0.16-tier*0.025));}
            if(k===0)contact(x,z,h*0.8,h*0.8);
          }
          else part(rockGeo,sage,x,0.7,z,2.7,1.8,2.7);
          optional=false;
        }
      }

      // Curbs, shoulder slabs and directional chevrons remain outside the full road footprint.
      const gravel=mat(theme.shoulder),curbRed=mat(trackId==='industrial'?0xb98d43:0xad5549),curbWhite=mat(0xd4c9b3);
      for(let i=0;i<CONFIG.NUM_SAMPLES;i+=3){
        const p=samples[i],tg=tangents[i],r=Math.atan2(tg.x,tg.z);
        for(const side of [-1,1]){
          const q=local(p.x,p.z,r,side*(CONFIG.ROAD_HALF+9),0);
          box(gravel,q[0],-0.18,q[1],7,0.32,8,r);
          const q2=local(p.x,p.z,r,side*(CONFIG.ROAD_HALF+4.5),0);
          box(i%6?curbRed:curbWhite,q2[0],0.12,q2[1],1.6,0.2,6,r);
          if(i%18===0){const q3=local(p.x,p.z,r,side*(CONFIG.ROAD_HALF+11),0);box(metal,q3[0],1.1,q3[1],0.4,2.2,0.4);box(cyan,q3[0],2.2,q3[1],0.8,0.25,0.8);}
        }
      }
      // Restrained skid arcs and glossy repair strips lie on the asphalt, without collision.
      const skidMaterial=new THREE.MeshBasicMaterial({color:0x15202c,transparent:true,opacity:0.23,depthWrite:false});
      const wetMaterial=mat(trackId==='city'?0x7d92b6:0x627181,{
        roughness:0.22,metalness:0.32,transparent:true,opacity:trackId==='city'?0.35:0.19,depthWrite:false
      });
      for(let i=16;i<CONFIG.NUM_SAMPLES;i+=29){
        const p=samples[i],tg=tangents[i],r=Math.atan2(tg.x,tg.z);
        for(const side of [-1,1]){
          const q=local(p.x,p.z,r,side*4.5,0),m=new THREE.Mesh(planeGeo,skidMaterial);m.rotation.set(-Math.PI/2,0,r);m.position.set(q[0],0.035,q[1]);m.scale.set(0.5,12+random()*16,1);details.add(m);
        }
        if(i%3===1){
          const width=3+random()*3;
          const q=local(p.x,p.z,r,trackId==='city'?CONFIG.ROAD_HALF*0.72:14,0);
          const mesh=new THREE.Mesh(planeGeo,wetMaterial);
          mesh.rotation.set(-Math.PI/2,0,r);mesh.position.set(q[0],0.034,q[1]);
          mesh.scale.set(width,trackId==='city'?22:12,1);details.add(mesh);
        }
      }
      const arrowCanvas=document.createElement('canvas');arrowCanvas.width=128;arrowCanvas.height=64;
      const ac=arrowCanvas.getContext('2d');ac.fillStyle='#182539';ac.fillRect(0,0,128,64);ac.fillStyle='#ffc073';
      for(let i=0;i<3;i++){ac.beginPath();ac.moveTo(12+i*39,8);ac.lineTo(31+i*39,32);ac.lineTo(12+i*39,56);ac.lineTo(25+i*39,56);ac.lineTo(44+i*39,32);ac.lineTo(25+i*39,8);ac.closePath();ac.fill();}
      const arrowTex=new THREE.CanvasTexture(arrowCanvas);arrowTex.colorSpace=THREE.SRGBColorSpace;
      const arrowMat=new THREE.MeshBasicMaterial({map:arrowTex,side:THREE.DoubleSide});
      if(finishBlock){
        // Permanent closure on the outside of the finish turn.
        const finishBarricades=new THREE.Group();
        carObstacles.push(finishBlock);
        const {x,z,w,h,d,rotation}=finishBlock,sections=6,width=w/sections;
        const feet=new THREE.InstancedMesh(boxGeo,dark,sections);
        const bodies=new THREE.InstancedMesh(boxGeo,concrete,sections);
        const arrows=new THREE.InstancedMesh(planeGeo,arrowMat,sections);
        for(let i=0;i<sections;i++){
          const sectionZ=z-w/2+width*(i+0.5);
          tmp.rotation.set(0,rotation,0);
          tmp.position.set(x,0.225,sectionZ);tmp.scale.set(width-0.18,1.75,d);
          tmp.updateMatrix();feet.setMatrixAt(i,tmp.matrix);
          tmp.position.set(x,(h+1.1)/2,sectionZ);tmp.scale.set(width-0.18,h-1.1,d-1.4);
          tmp.updateMatrix();bodies.setMatrixAt(i,tmp.matrix);
          tmp.position.set(x-(d-1.4)/2-0.02,3,sectionZ);tmp.scale.set(width-1.5,2.7,1);
          tmp.updateMatrix();arrows.setMatrixAt(i,tmp.matrix);
        }
        finishBarricades.name='finish-barricades';
        finishBarricades.add(feet,bodies,arrows);group.add(finishBarricades);
      }
      for(let i=12;i<CONFIG.NUM_SAMPLES;i+=23){
        const tg=tangents[i],next=tangents[(i+9)%samples.length],bend=tg.x*next.z-tg.z*next.x;if(Math.abs(bend)<0.12)continue;
        const side=bend>0?1:-1,p=samples[i],r=Math.atan2(tg.x,tg.z),q=local(p.x,p.z,r,side*(CONFIG.ROAD_HALF+18),0);
        if(clearance(q[0],q[1])<CONFIG.ROAD_HALF+13)continue;
        box(metal,q[0],2.5,q[1],0.4,5,0.4);signFace(arrowMat,q[0],5.8,q[1],9,4.5,r+Math.PI+(side<0?Math.PI:0));
      }
      const streetLightPools=[];
      for(let i=0;i<CONFIG.LAMP_COUNT;i++){
        const t=i/CONFIG.LAMP_COUNT,p=trackCurve.getPointAt(t),tg=trackCurve.getTangentAt(t),side=i%2?1:-1,r=Math.atan2(tg.x,tg.z);
        const q=local(p.x,p.z,r,side*(CONFIG.ROAD_HALF+15),0);if(clearance(q[0],q[1])<CONFIG.ROAD_HALF+11)continue;
        box(dark,q[0],9,q[1],0.6,18,0.6);box(metal,q[0],18,q[1],7,0.5,1.2,r);box(amber,q[0],17.6,q[1],6,0.15,1,r);
        if(trackId==='city'&&i%3!==2){
          const [x,z]=local(p.x,p.z,r,side*(CONFIG.ROAD_HALF-4),0);
          streetLightPools.push({x,z,r});
        }
      }
      if(streetLightPools.length){
        const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
        const ctx=canvas.getContext('2d'),fade=ctx.createRadialGradient(32,32,2,32,32,32);
        fade.addColorStop(0,'rgba(255,202,138,0.66)');fade.addColorStop(0.29,'rgba(255,190,137,0.28)');
        fade.addColorStop(1,'rgba(255,174,127,0)');
        ctx.fillStyle=fade;ctx.fillRect(0,0,64,64);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,opacity:0.63});
        const glow=new THREE.InstancedMesh(planeGeo,material,streetLightPools.length);
        streetLightPools.forEach(({x,z,r},index)=>{
          tmp.position.set(x,0.038,z);tmp.rotation.set(-Math.PI/2,0,r);tmp.scale.set(24,43,1);
          tmp.updateMatrix();glow.setMatrixAt(index,tmp.matrix);
        });
        glow.computeBoundingSphere();group.add(glow);
      }

      // Flags need their own double-sided materials: do not mutate batched building materials.
      let flagCool=null,flagContrast=null;
      for(const t of [0.04,0.13,0.54,0.8]){
        const q=landmarkAt(t,1,CONFIG.ROAD_HALF+27,8);if(!q)continue;
        box(metal,q.x,10,q.z,0.45,20,0.45);
        const material=t<0.2?(flagCool??=cyan.clone()):(flagContrast??=magenta.clone());
        material.side=THREE.DoubleSide;
        const flag=new THREE.Mesh(planeGeo,material);flag.name='roadside-flag-'+t;flag.position.set(q.x+3,18,q.z);flag.scale.set(6,2.4,1);details.add(flag);motions.push({type:'flag',mesh:flag,phase:random()*6});
      }
      for(const t of [0.24,0.7]){
        const p=trackCurve.getPointAt(t),drone=new THREE.Group();drone.name='survey-drone-'+t;drone.position.set(p.x,45,p.z);
        const body=new THREE.Mesh(boxGeo,dark);body.scale.set(3,0.8,2);drone.add(body);
        for(const side of [-1,1]){const wing=new THREE.Mesh(boxGeo,metal);wing.position.x=side*2.2;wing.scale.set(2,0.25,0.7);drone.add(wing);const led=new THREE.Mesh(boxGeo,cyan);led.position.set(side*2.7,0,0);led.scale.set(0.3,0.3,0.6);drone.add(led);}
        details.add(drone);motions.push({type:'drone',mesh:drone,x:p.x,z:p.z,phase:random()*6});
      }
      for(const [geo,byMat] of batches)for(const {material,list,parent} of byMat.values()){
        const mesh=new THREE.InstancedMesh(geo,material,list.length);
        list.forEach((p,i)=>{tmp.position.set(p.x,p.y,p.z);tmp.rotation.set(0,p.rotation,0);tmp.scale.set(p.w,p.h,p.d);tmp.updateMatrix();mesh.setMatrixAt(i,tmp.matrix);});
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);
      }
      const contacts=new THREE.InstancedMesh(planeGeo,contactMaterial,contactTransforms.length);
      contactTransforms.forEach((p,i)=>{tmp.position.set(p.x,0.013,p.z);tmp.rotation.set(-Math.PI/2,0,p.r);tmp.scale.set(p.w,p.d,1);tmp.updateMatrix();contacts.setMatrixAt(i,tmp.matrix);});contacts.computeBoundingSphere();group.add(contacts);
      // Only a fixed pool of nearby silhouettes enters the dynamic shadow pass.
      const shadowMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false});
      const shadowProxies=[];for(let i=0;i<28;i++){const mesh=new THREE.Mesh(boxGeo,shadowMaterial);mesh.castShadow=true;mesh.visible=false;mesh.name='environment-shadow-proxy';group.add(mesh);shadowProxies.push(mesh);}
      scene.add(group);
      let quality='high',cosmeticTime=0,shadowClock=1;
      return {
        atmosphere:theme.atmosphere,
        blocksFinishBarricade(from,to=from){
          return finishObstacles.length>0&&Boolean(sweepCarObstacle2D(from,to,finishObstacles,CONFIG.CAR_RADIUS));
        },
        setQuality(mode){quality=mode;details.visible=mode!=='low';dashGlow.visible=mode!=='low';if(mode==='low')for(const mesh of shadowProxies)mesh.visible=false;shadowClock=1;},
        update(dt,position,active,reducedMotion){
          if(active&&!reducedMotion&&quality!=='low'){
            cosmeticTime+=Math.min(Math.max(dt,0),0.1);
            for(const item of motions){const t=cosmeticTime+item.phase;
              if(item.type==='fan')item.mesh.rotation.y=t*1.5;
              else if(item.type==='flag'){item.mesh.rotation.y=Math.sin(t*1.8)*0.17;item.mesh.rotation.z=Math.sin(t*2.1)*0.045;}
              else if(item.type==='train'){item.mesh.position.x=Math.sin(t*0.31)*item.span;}
              else{item.mesh.position.set(item.x+Math.sin(t*0.2)*13,45+Math.sin(t*0.8)*1.5,item.z+Math.cos(t*0.2)*13);item.mesh.rotation.y=-t*0.2;}
            }
          }
          if(quality==='low'||!position)return;
          shadowClock+=dt;if(shadowClock<0.2)return;shadowClock=0;
          let count=0;
          for(const candidate of shadowCandidates){
            if((candidate.x-position.x)**2+(candidate.z-position.z)**2>190**2)continue;
            const mesh=shadowProxies[count++];mesh.visible=true;mesh.position.set(candidate.x,candidate.y,candidate.z);mesh.rotation.y=candidate.rotation;mesh.scale.set(candidate.w,candidate.h,candidate.d);if(count===shadowProxies.length)break;
          }
          for(let i=count;i<shadowProxies.length;i++)shadowProxies[i].visible=false;
        }
      };
    }
    scene.add(createTrackSky(THREE,document,trackId,theme.atmosphere));
    const scenery=createEnvironment();
    const findClosest=(x,z,lastIdx=0)=>findClosestSample(samples,x,z,lastIdx,CONFIG.ROAD_HALF,45);
    return {trackPoints,trackCurve,totalLength,samples,tangents,isOnRoadFast,findClosest,projectileObstacles,carObstacles,scenery};
  }

  return {findClosestSample,sweepCarObstacle2D,createTrackEnvironment};
});
