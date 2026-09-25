(function attachCyberTrack(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberTrackModule(){
  'use strict';

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
    if(min>(roadHalf*3.5)**2){
      min=Infinity;
      for(let i=0;i<n;i++){
        const p=samples[i],d=(x-p.x)**2+(z-p.z)**2;
        if(d<min){min=d;idx=i;}
      }
    }
    return {idx,t:idx/n,dist:Math.sqrt(min)};
  }

  function createTrackEnvironment({THREE,scene,document,CONFIG}){
    const groundCanvas=document.createElement('canvas'); groundCanvas.width=512; groundCanvas.height=512;
    const gctx=groundCanvas.getContext('2d');
    gctx.fillStyle='#1a2a15'; gctx.fillRect(0,0,512,512);
    for(let i=0;i<2000;i++){gctx.fillStyle=`hsl(100,${30+Math.random()*20}%,${10+Math.random()*15}%)`;gctx.fillRect(Math.random()*512,Math.random()*512,2+Math.random()*5,2+Math.random()*5);}
    const groundTex=new THREE.CanvasTexture(groundCanvas);
    groundTex.wrapS=groundTex.wrapT=THREE.RepeatWrapping; groundTex.repeat.set(50,50);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(1200,1200), new THREE.MeshStandardMaterial({map:groundTex, roughness:0.95}));
    ground.rotation.x=-Math.PI/2; ground.position.y=-0.3; ground.receiveShadow=true; scene.add(ground);

    const pts=[[0,0,0],[28,0,-6],[50,0,-25],[65,0,-55],[55,0,-80],[30,0,-90],[-10,0,-85],[-40,0,-68],[-60,0,-38],[-50,0,-6],[-25,0,14],[6,0,20],[32,0,13],[55,0,-2],[68,0,-28],[58,0,-58],[32,0,-72],[0,0,-68],[-32,0,-55],[-50,0,-30],[-40,0,4],[-18,0,18],[0,0,16]];
    const trackPoints=pts.map(([x,y,z])=>new THREE.Vector3(x*CONFIG.SCALE,y,z*CONFIG.SCALE));
    const trackCurve=new THREE.CatmullRomCurve3(trackPoints,true,'catmullrom',0.5);
    const totalLength=trackCurve.getLength();
    const samples=[], tangents=[];
    for(let i=0;i<CONFIG.NUM_SAMPLES;i++){const t=i/CONFIG.NUM_SAMPLES; samples.push(trackCurve.getPointAt(t)); tangents.push(trackCurve.getTangentAt(t).normalize());}

    function createRoad() {
      const v=[], idx=[];
      for(let i=0;i<CONFIG.NUM_SAMPLES;i++){
        const p=samples[i], tg=tangents[i];
        const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize();
        const L=p.clone().addScaledVector(perp,CONFIG.ROAD_HALF);
        const R=p.clone().addScaledVector(perp,-CONFIG.ROAD_HALF);
        L.y=0.02; R.y=0.02; v.push(L.x,L.y,L.z,R.x,R.y,R.z);
      }
      for(let i=0;i<CONFIG.NUM_SAMPLES;i++){const j=(i+1)%CONFIG.NUM_SAMPLES,a=i*2,b=i*2+1,c=j*2,d=j*2+1; idx.push(a,b,c,b,d,c);}
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
      geo.setIndex(idx); geo.computeVertexNormals();
      return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:0x2a2a2a, roughness:0.7}));
    }
    scene.add(createRoad());

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

    const dashGroup=new THREE.Group();
    for(let i=0;i<CONFIG.NUM_SAMPLES;i+=18){const t=i/CONFIG.NUM_SAMPLES; const p=trackCurve.getPointAt(t); const tg=trackCurve.getTangentAt(t).normalize(); const dash=new THREE.Mesh(new THREE.PlaneGeometry(0.5,2.5), new THREE.MeshBasicMaterial({color:0xffffff, opacity:0.9, transparent:true})); dash.rotation.x=-Math.PI/2; dash.rotation.z=Math.atan2(tg.x,tg.z); dash.position.set(p.x,0.06,p.z); dashGroup.add(dash);}
    scene.add(dashGroup);

    function createStartGate(){
      const group=new THREE.Group();
      const start=samples[0],tg=tangents[0];
      group.position.set(start.x,0,start.z);
      group.rotation.y=Math.atan2(tg.x,tg.z);

      const darkMat=new THREE.MeshStandardMaterial({color:0x111522,metalness:0.8,roughness:0.35});
      const glowMat=new THREE.MeshStandardMaterial({color:0x00bbdd,emissive:0x00ddff,emissiveIntensity:2.2,metalness:0.5,roughness:0.25});
      [-1,1].forEach(side=>{
        const pillar=new THREE.Mesh(new THREE.BoxGeometry(1.2,12,1.2),darkMat);
        pillar.position.set(side*(CONFIG.ROAD_HALF-4),6,0);pillar.castShadow=true;group.add(pillar);
        const strip=new THREE.Mesh(new THREE.BoxGeometry(1.32,9.5,0.18),glowMat);
        strip.position.set(side*(CONFIG.ROAD_HALF-4),6,-0.66);group.add(strip);
      });
      const bar=new THREE.Mesh(new THREE.BoxGeometry((CONFIG.ROAD_HALF-4)*2,1.0,1.2),darkMat);
      bar.position.y=12;bar.castShadow=true;group.add(bar);
      const barGlow=new THREE.Mesh(new THREE.BoxGeometry((CONFIG.ROAD_HALF-5)*2,0.22,1.32),glowMat);
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
      const trees=[], bushes=[];
      for(let i=0;i<CONFIG.ENVIRONMENT_ATTEMPTS;i++){
        const ang=Math.random()*Math.PI*2, rad=50+Math.random()*250;
        const x=Math.cos(ang)*rad, z=Math.sin(ang)*rad;
        const distToRoad=Math.sqrt(samples.reduce((min,p)=>Math.min(min,(x-p.x)**2+(z-p.z)**2),Infinity));
        const spawnChance=Math.min(0.95,0.3+distToRoad*0.015);
        if(Math.random()>=spawnChance||isOnRoadFast(x,z,CONFIG.ROAD_HALF+6))continue;
        if(Math.random()<0.7){
          trees.push({x,z,s:0.8+Math.random()*2.5,r:Math.random()*Math.PI*2,h:0.28+Math.random()*0.08,l:0.18+Math.random()*0.15});
        }else{
          bushes.push({x,z,s:0.8+Math.random()*1.4,r:Math.random()*Math.PI*2,l:0.15+Math.random()*0.15});
        }
      }

      const group=new THREE.Group();
      group.name='optimized-environment';
      const tmp=new THREE.Object3D(), color=new THREE.Color();

      const trunkMesh=new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.25,0.35,4,6),
        new THREE.MeshStandardMaterial({color:0x5c3a21,roughness:1}),
        trees.length
      );
      const foliageMeshes=[0,1,2].map(()=>new THREE.InstancedMesh(
        new THREE.ConeGeometry(2,2.5,6),
        new THREE.MeshStandardMaterial({color:0x254d20,roughness:1}),
        trees.length
      ));

      trees.forEach((tree,i)=>{
        tmp.position.set(tree.x,2*tree.s,tree.z);
        tmp.rotation.set(0,tree.r,0);
        tmp.scale.setScalar(tree.s);
        tmp.updateMatrix();
        trunkMesh.setMatrixAt(i,tmp.matrix);

        foliageMeshes.forEach((mesh,level)=>{
          const widthScale=1-level*0.28, heightScale=1-level*0.14;
          tmp.position.set(tree.x,(4.4+level*1.1)*tree.s,tree.z);
          tmp.rotation.set(0,tree.r+level*0.35,0);
          tmp.scale.set(tree.s*widthScale,tree.s*heightScale,tree.s*widthScale);
          tmp.updateMatrix();
          mesh.setMatrixAt(i,tmp.matrix);
          color.setHSL(tree.h,0.65,Math.min(0.38,tree.l+level*0.025));
          mesh.setColorAt(i,color);
        });
      });

      const bushMesh=new THREE.InstancedMesh(
        new THREE.SphereGeometry(1,5,5),
        new THREE.MeshStandardMaterial({color:0x24491f,roughness:1}),
        bushes.length
      );
      bushes.forEach((bush,i)=>{
        tmp.position.set(bush.x,0.45*bush.s,bush.z);
        tmp.rotation.set(0,bush.r,0);
        tmp.scale.set(bush.s,bush.s*0.72,bush.s);
        tmp.updateMatrix();
        bushMesh.setMatrixAt(i,tmp.matrix);
        color.setHSL(0.28,0.7,bush.l);
        bushMesh.setColorAt(i,color);
      });

      [trunkMesh,...foliageMeshes,bushMesh].forEach(mesh=>{
        mesh.castShadow=false; mesh.receiveShadow=false;
        mesh.instanceMatrix.needsUpdate=true;
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
        mesh.computeBoundingSphere?.();
        group.add(mesh);
      });
      scene.add(group);
    }
    createEnvironment();

    for(let i=0;i<CONFIG.LAMP_COUNT;i++){
      const t=i/CONFIG.LAMP_COUNT, pt=trackCurve.getPointAt(t), tg=trackCurve.getTangentAt(t).normalize();
      const perp=new THREE.Vector3(-tg.z,0,tg.x).normalize(); const side=i%2===0?1:-1;
      const lampGroup=new THREE.Group();
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.3,10,6), new THREE.MeshStandardMaterial({color:0x444444})); pole.position.y=5; lampGroup.add(pole);
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.5,6,6), new THREE.MeshStandardMaterial({color:0xffeedd, emissive:0xffdd88, emissiveIntensity:1.2})); bulb.position.y=10.2; lampGroup.add(bulb);
      if(i%6===0){const point=new THREE.PointLight(0xffdd88,1.5,18);point.position.y=10;lampGroup.add(point);}
      lampGroup.position.set(pt.x+perp.x*(CONFIG.ROAD_HALF+5)*side,0,pt.z+perp.z*(CONFIG.ROAD_HALF+5)*side); scene.add(lampGroup);
    }


    const findClosest=(x,z,lastIdx=0)=>findClosestSample(samples,x,z,lastIdx,CONFIG.ROAD_HALF,45);
    return {trackPoints,trackCurve,totalLength,samples,tangents,isOnRoadFast,findClosest};
  }

  return {findClosestSample,createTrackEnvironment};
});
