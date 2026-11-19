(function(root){
  'use strict';
  const game=(root.CyberRace??={}).game??={};
  game.createCombatEffects=function({THREE,scene,camera,document}){
    let high=true,time=0;
    const reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
    const random=()=>Math.random();
    const vector=()=>new THREE.Vector3();
    const color=new THREE.Color(), right=vector(), side=vector(), direction=vector(), view=vector();
    const batches={}, trails=[], marks=[], recoils=[];
    const plane=new THREE.PlaneGeometry(1,1), up=new THREE.Vector3(0,1,0);

    function texture(kind){
      const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
      const ctx=canvas.getContext('2d');
      if(kind==='smoke'){
        // Deterministic texture noise does not consume gameplay's random stream.
        let seed=731;const noise=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
        for(let i=0;i<70;i++){
          const x=36+noise()*56,y=36+noise()*56,r=12+noise()*23;
          const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,0.11)');g.addColorStop(1,'rgba(255,255,255,0)');
          ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
        }
      }else{
        const g=ctx.createRadialGradient(64,64,0,64,64,64);
        for(const [stop,alpha] of (kind==='spark'?[[0,1],[0.12,0.95],[0.45,0.25],[1,0]]:[[0,1],[0.2,0.95],[0.48,0.48],[0.8,0.07],[1,0]]))g.addColorStop(stop,`rgba(255,255,255,${alpha})`);
        ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
      }
      const result=new THREE.CanvasTexture(canvas);result.colorSpace=THREE.NoColorSpace;return result;
    }
    const softTexture=texture('glow'),smokeTexture=texture('smoke'),sparkTexture=texture('spark');
    const fireTexture=texture('fire');
    // A ragged alpha silhouette gives each rotating fire lobe a distinct edge.
    {
      const canvas=fireTexture.image,ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,128,128);
      for(let y=0;y<128;y++)for(let x=0;x<128;x++){
        const a=Math.atan2(y-64,x-64),r=Math.hypot(x-64,y-64)/64;
        const edge=0.76+Math.sin(a*5+0.5)*0.12+Math.sin(a*9)*0.05;
        pixels.data[(y*128+x)*4+3]*=Math.max(0,Math.min(1,(edge-r)*6));
      }
      ctx.putImageData(pixels,0,0);fireTexture.needsUpdate=true;
    }
    function makeBatch(name,max,map,additive){
      const groundSmoke=name==='tireSmoke';
      const geometry=new THREE.InstancedBufferGeometry();
      geometry.setAttribute('position',plane.attributes.position);geometry.setAttribute('uv',plane.attributes.uv);geometry.setIndex(plane.index);
      const data={center:new Float32Array(max*3),tint:new Float32Array(max*3),shape:new Float32Array(max*4),motion:new Float32Array(max*3)};
      for(const [key,array] of Object.entries(data))geometry.setAttribute(key,new THREE.InstancedBufferAttribute(array,key==='shape'?4:3).setUsage(THREE.DynamicDrawUsage));
      geometry.instanceCount=0;
      const material=new THREE.ShaderMaterial({
        uniforms:{map:{value:map}},transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
        vertexShader:`attribute vec3 center;attribute vec3 tint;attribute vec4 shape;attribute vec3 motion;
          varying vec2 vUv;varying vec3 vTint;varying float vAlpha,vHeight;
          void main(){vUv=uv;vTint=tint;vAlpha=shape.w;vec4 p=modelViewMatrix*vec4(center,1.0);
            vec2 axis=(modelViewMatrix*vec4(motion,0.0)).xy;float a=shape.z;
            if(dot(axis,axis)>0.0001)a=atan(axis.y,axis.x)-1.5707963;
            vec2 q=position.xy*shape.xy;q=mat2(cos(a),sin(a),-sin(a),cos(a))*q;
            vHeight=center.y+dot(viewMatrix[1].xy,q);
            p.xy+=q;gl_Position=projectionMatrix*p;}`,
        fragmentShader:`uniform sampler2D map;varying vec2 vUv;varying vec3 vTint;varying float vAlpha,vHeight;
          void main(){float a=texture2D(map,vUv).a*vAlpha;
            ${groundSmoke?'a*=smoothstep(0.035,0.34,vHeight);':''}
            if(a<0.003)discard;gl_FragColor=vec4(vTint,a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
      });
      const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=additive?2:1;scene.add(mesh);
      return batches[name]={max,data,geometry,material,items:[],pool:[],mesh};
    }
    makeBatch('fire',160,fireTexture,true);makeBatch('smoke',170,smokeTexture,false);
    makeBatch('spark',300,sparkTexture,true);makeBatch('glow',100,softTexture,true);
    makeBatch('tireSmoke',144,smokeTexture,false).mesh.name='Tire smoke';
    function emit(name,pos,options={}){
      const b=batches[name],limit=high?b.max:Math.floor(b.max*0.5);
      if(b.items.length>=limit)return;
      const p=b.pool.pop()||{pos:vector(),vel:vector(),tint:new THREE.Color()};
      p.pos.copy(pos);p.vel.copy(options.vel||up).multiplyScalar(options.speed??1);
      p.tint.set(options.color??0xffa322);p.delay=options.delay??0;p.life=p.duration=(options.life??0.45)+p.delay;p.age=0;
      p.size=options.size??1;p.growth=options.growth??0;p.gravity=options.gravity??0;p.drag=options.drag??1;
      p.alpha=options.alpha??1;p.rotation=random()*Math.PI*2;p.spin=(random()-0.5)*1.8;p.stretch=options.stretch??0;
      p.hot=options.hot??false;p.bounce=options.bounce??false;
      p.anchor=options.anchor||null;if(p.anchor){p.local??=vector();p.local.copy(options.local);}
      b.items.push(p);return p;
    }
    function burst(pos,count,normal=up,strength=1){
      for(let i=0;i<(high?count:Math.ceil(count*0.5));i++){
        const vel=new THREE.Vector3((random()-0.5)*10,random()*7,(random()-0.5)*10).addScaledVector(normal,6).multiplyScalar(strength);
        emit('spark',pos,{vel,color:i%3?0xffb43e:0xffedbb,life:0.22+random()*0.55,size:0.1+random()*0.09,gravity:13,drag:1.1,stretch:0.026,bounce:true,hot:true});
      }
    }
    const lights=Array.from({length:3},()=>{const light=new THREE.PointLight(0xff8b35,0,38,2);scene.add(light);return {light,life:0,duration:0,power:0};});
    const debris=[],debrisMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,0.12,0.7),new THREE.MeshStandardMaterial({color:0x58444a,metalness:0.65,roughness:0.6}),24),debrisDummy=new THREE.Object3D();
    debrisMesh.count=0;debrisMesh.frustumCulled=false;debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(debrisMesh);
    function illuminate(pos,power=10,radius=30,duration=0.2){
      if(reduced())power*=0.35;
      const allowed=high?lights:lights.slice(0,1);
      const entry=allowed.find(x=>x.life<=0)||allowed.reduce((a,b)=>a.life<b.life?a:b);
      entry.light.position.copy(pos);entry.light.distance=radius;entry.power=power;entry.life=entry.duration=duration;
    }
    const decalTextures={scorch:smokeTexture,hit:softTexture};
    const decalPool=[];
    function decal(pos,normal,size=0.3,duration=1.8,anchor=null,kind='hit'){
      if(marks.length>=(high?36:16)){const old=marks.shift();old.mesh.removeFromParent();decalPool.push(old);}
      const m=decalPool.pop()||{mesh:new THREE.Mesh(plane,new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide}))};
      const mesh=m.mesh;mesh.material.map=decalTextures[kind];mesh.material.color.set(kind==='scorch'?0x19171a:0x30221a);mesh.material.opacity=0.8;
      mesh.position.copy(pos).addScaledVector(normal,0.025);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);mesh.scale.setScalar(size);
      mesh.visible=true;scene.add(mesh);if(anchor)anchor.attach(mesh);
      Object.assign(m,{life:duration,duration,anchor});marks.push(m);
    }
    const rippleGeo=new THREE.RingGeometry(0.85,1,40),ripples=[],ripplePool=[];
    function shield(pos,normal,anchor){
      if(ripples.length>=12){const old=ripples.shift();old.mesh.removeFromParent();ripplePool.push(old);}
      const r=ripplePool.pop()||{mesh:new THREE.Mesh(rippleGeo,new THREE.MeshBasicMaterial({color:0x68eaff,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}))};
      r.mesh.position.copy(pos);r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);scene.add(r.mesh);if(anchor)anchor.attach(r.mesh);
      r.mesh.scale.setScalar(anchor?0.2:0.4);r.life=r.duration=0.48;r.anchor=anchor;ripples.push(r);
      emit('glow',pos,{size:2.4,life:0.16,color:0x5adfff,alpha:0.7});
      burst(pos,7,normal,0.45);
    }

    // All ribbons share one dynamic buffer; the path stays in world coordinates.
    const ribbonMax=80*48*6,ribbonGeo=new THREE.BufferGeometry();
    const ribbonPos=new Float32Array(ribbonMax*3),ribbonCol=new Float32Array(ribbonMax*3),ribbonUV=new Float32Array(ribbonMax*2),ribbonAlpha=new Float32Array(ribbonMax);
    ribbonGeo.setAttribute('position',new THREE.BufferAttribute(ribbonPos,3).setUsage(THREE.DynamicDrawUsage));
    ribbonGeo.setAttribute('color',new THREE.BufferAttribute(ribbonCol,3).setUsage(THREE.DynamicDrawUsage));
    ribbonGeo.setAttribute('uv',new THREE.BufferAttribute(ribbonUV,2).setUsage(THREE.DynamicDrawUsage));
    ribbonGeo.setAttribute('alpha',new THREE.BufferAttribute(ribbonAlpha,1).setUsage(THREE.DynamicDrawUsage));
    const ribbonMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'attribute vec3 color;attribute float alpha;varying vec3 vColor;varying float vAlpha;varying vec2 vUv;void main(){vColor=color;vAlpha=alpha;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`varying vec3 vColor;varying float vAlpha;varying vec2 vUv;void main(){float edge=pow(max(0.0,1.0-abs(vUv.x*2.0-1.0)),1.7);gl_FragColor=vec4(vColor,vAlpha*edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
    const ribbonMesh=new THREE.Mesh(ribbonGeo,ribbonMaterial);ribbonMesh.frustumCulled=false;scene.add(ribbonMesh);
    function createTrail(rocket,owner,pos){
      // Detached fading trails count towards the same hard cap.
      if(trails.length>=100)trails.shift();
      const trail={rocket,owner,points:[{pos:pos.clone(),age:0}],last:pos.clone(),smokeDistance:0,detached:false};trails.push(trail);return trail;
    }
    function moveTrail(trail,from,to){
      if(!trail)return;
      const distance=from.distanceTo(to),steps=Math.min(24,Math.max(1,Math.ceil(distance/(trail.rocket?1.2:1.8))));
      for(let i=1;i<=steps;i++){
        const pos=from.clone().lerp(to,i/steps);trail.points.push({pos,age:0});
        if(trail.rocket){
          trail.smokeDistance+=distance/steps;
          if(trail.smokeDistance>=(high?2:4)){
            trail.smokeDistance=0;
            emit('smoke',pos,{size:0.7,growth:2.6,life:high?0.95:0.65,color:0x858b94,alpha:0.45,vel:new THREE.Vector3((random()-0.5)*0.7,0.8,(random()-0.5)*0.7),drag:1.8});
          }
        }
      }
      trail.points.splice(0,Math.max(0,trail.points.length-48));trail.last.copy(to);
      if(trail.rocket){emit('fire',to,{size:0.8,life:0.07,color:0xffc064,hot:true});emit('glow',to,{size:1.8,life:0.07,color:0xff6c22,alpha:0.4});}
    }
    function drawTrails(dt){
      let count=0;
      for(let ti=trails.length-1;ti>=0;ti--){
        const t=trails[ti],duration=t.rocket?0.33:0.065;
        t.points.forEach(p=>p.age+=dt);while(t.points.length&&t.points[0].age>duration)t.points.shift();
        if(t.detached&&!t.points.length){trails.splice(ti,1);continue;}
        for(let i=1;i<t.points.length&&count+6<=ribbonMax;i++){
          const a=t.points[i-1],b=t.points[i];direction.subVectors(b.pos,a.pos);if(direction.lengthSq()<0.00001)continue;
          view.subVectors(camera.position,b.pos);side.crossVectors(direction,view).normalize();
          if(side.lengthSq()<0.01)side.setFromMatrixColumn(camera.matrixWorld,0);
          const fadeA=Math.max(0,1-a.age/duration),fadeB=Math.max(0,1-b.age/duration);
          const width=t.rocket?0.18:0.12;
          color.set(t.owner==='player'?(t.rocket?0xff9b46:0xffd56b):0xff653b).multiplyScalar(2.3);
          for(const [p,sign,fade,u] of [[a,-1,fadeA,0],[a,1,fadeA,1],[b,1,fadeB,1],[a,-1,fadeA,0],[b,1,fadeB,1],[b,-1,fadeB,0]]){
            const w=width*(0.18+0.82*fade);ribbonPos[count*3]=p.pos.x+side.x*sign*w;ribbonPos[count*3+1]=p.pos.y+side.y*sign*w;ribbonPos[count*3+2]=p.pos.z+side.z*sign*w;
            ribbonCol[count*3]=color.r;ribbonCol[count*3+1]=color.g;ribbonCol[count*3+2]=color.b;ribbonAlpha[count]=fade*0.9;ribbonUV[count*2]=u;ribbonUV[count*2+1]=0;count++;
          }
        }
      }
      ribbonGeo.setDrawRange(0,count);for(const a of Object.values(ribbonGeo.attributes))a.needsUpdate=true;
    }

    function muzzle(car,rocket=false){
      const weapon=rocket?car.rocketLauncher:car.machineGun;
      weapon.updateWorldMatrix(true,false);
      const local=new THREE.Vector3(0,0,weapon.userData?.muzzleZ??(rocket?-0.45:-0.88)),pos=weapon.localToWorld(local.clone());
      emit('glow',pos,{size:rocket?2.8:1.25,life:rocket?0.12:0.055,color:0xffe7a1,hot:true,anchor:weapon,local});
      for(let i=0;i<(rocket?4:2);i++)emit('fire',pos,{size:(rocket?0.9:0.45)*(0.7+random()),life:0.065+random()*0.035,color:0xffbe53,vel:new THREE.Vector3(0,1,0),growth:0.6,hot:true,anchor:weapon,local});
      if(!reduced()){
        let recoil=recoils.find(r=>r.weapon===weapon);if(!recoil){recoil={weapon,z:weapon.position.z,amount:0};recoils.push(recoil);}recoil.amount=rocket?0.09:0.065;
      }
      if(rocket)illuminate(pos,6,12,0.12);
    }
    function explosion(pos,scale=1,ground=true){
      emit('glow',pos,{size:11*scale,life:reduced()?0.07:0.12,color:0xffe6b0,alpha:reduced()?0.25:0.8,hot:true});
      const count=high?12:7;
      for(let i=0;i<count;i++){
        const dir=new THREE.Vector3((random()-0.5)*2,0.25+random(),(random()-0.5)*2).normalize();
        emit('fire',pos.clone().addScaledVector(dir,0.5*scale),{vel:dir,speed:(5+random()*10)*scale,size:(1.5+random()*2)*scale,growth:2.5*scale,life:0.28+random()*0.45,color:i%3?0xff6315:0xffc45e,hot:true,drag:3});
        emit('smoke',pos,{vel:dir,speed:(1+random()*2)*scale,size:(1.6+random()*1.5)*scale,growth:4.5*scale,life:1.4+random()*0.9,delay:0.17,color:i%2?0x494651:0x6f6360,alpha:0.65,drag:1.6});
      }
      burst(pos,Math.round(28*scale),up,scale);
      // Larger dark sparks read as tumbling hot fragments rather than smoke cubes.
      for(let i=0;i<(high?7:3)*scale;i++)emit('spark',pos,{vel:new THREE.Vector3((random()-0.5)*18,6+random()*10,(random()-0.5)*18).multiplyScalar(scale),life:0.8+random()*0.7,size:0.25*scale,color:0xe16b20,gravity:18,bounce:true,stretch:0.006,drag:0.5});
      if(scale>1.2)for(let i=0;i<(high?7:4)&&debris.length<(high?24:12);i++)debris.push({pos:pos.clone(),vel:new THREE.Vector3((random()-0.5)*22,8+random()*12,(random()-0.5)*22),rot:new THREE.Vector3(random()*6,random()*6,random()*6),spin:new THREE.Vector3(random()*8,random()*8,random()*8),life:1.8+random(),size:0.4+random()*0.7});
      if(ground){const p=pos.clone().setY(0.065);decal(p,up,9*scale,7,null,'scorch');for(let i=0;i<(high?7:3);i++)emit('smoke',p,{vel:new THREE.Vector3((random()-0.5)*12,0.2,(random()-0.5)*12),size:2*scale,growth:4*scale,life:1.1,color:0xb29b86,alpha:0.27,drag:3});}
      illuminate(pos,35*scale,38*scale,0.32);
    }
    function impact(pos,normal=up,{rocket=false,anchor=null,shielded=false,surface='metal',ground=true}={}){
      if(shielded){shield(pos,normal,anchor);if(rocket)explosion(pos,0.65,false);return;}
      if(rocket){explosion(pos,1,ground);return;}
      emit('glow',pos,{size:1.8,life:0.065,color:0xfff1ba,alpha:0.8,hot:true});
      burst(pos,surface==='metal'?13:6,normal,surface==='metal'?0.9:0.55);
      emit('smoke',pos,{size:0.55,growth:1.4,life:0.45,color:surface==='soil'?0xb29b81:0x777479,vel:normal,alpha:0.45});
      decal(pos,normal,surface==='metal'?0.22:0.7,surface==='metal'?1.7:3,anchor);
    }
    const jetGeometry=new THREE.CylinderGeometry(1,1,1,12,10,true).rotateX(Math.PI/2);
    const jetUniforms={power:{value:0},clock:{value:0},flutter:{value:1}};
    const jetMaterial=new THREE.ShaderMaterial({
      uniforms:jetUniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`
        uniform float power,clock,flutter;
        varying float age,core;
        void main(){
          age=uv.y;
          float wave=sin(clock*42.0-age*11.0);
          float radius=(0.066+0.057*sin(age*3.141593))*pow(1.0-age,0.68);
          vec2 bend=vec2(sin(clock*27.0-age*9.0),wave)*0.023*age*age*flutter;
          vec3 p=vec3(position.xy*radius+bend,age*min(1.4,1.14*power)*(1.0+0.065*wave*flutter));
          vec4 v=modelViewMatrix*vec4(p,1.0);
          core=abs(dot(normalize(normalMatrix*normal),normalize(-v.xyz)));
          gl_Position=projectionMatrix*v;
        }`,
      fragmentShader:`
        uniform float power;
        varying float age,core;
        void main(){
          float hot=(1.0-smoothstep(0.03,0.62,age))*mix(0.43,1.0,core);
          vec3 flame=mix(vec3(0.025,0.27,1.05),vec3(1.9,3.1,4.1),hot);
          float softEdge=mix(0.35,1.0,smoothstep(0.04,0.55,core));
          gl_FragColor=vec4(flame,(1.0-smoothstep(0.20,1.0,age))*min(1.0,power)*softEdge*0.84);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const roadGlow=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map:softTexture,color:0x298dff,
      transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
    roadGlow.rotation.x=-Math.PI/2;roadGlow.scale.set(3.3,4.6,1);roadGlow.visible=false;
    scene.add(roadGlow);
    const glowCenter=new THREE.Vector3(0,0,2.75);
    let jets=[],wheelPaths=[],nitroAge=0,nitroActive=false;

    // A short ring buffer draws both tire tracks in one pass, fading each segment in place.
    const markLimit=240,markGeometry=new THREE.InstancedBufferGeometry();
    markGeometry.setAttribute('position',plane.attributes.position);markGeometry.setIndex(plane.index);
    const markStart=new THREE.InstancedBufferAttribute(new Float32Array(markLimit*4),4).setUsage(THREE.DynamicDrawUsage);
    const markEnd=markStart.clone();
    const markBirth=new THREE.InstancedBufferAttribute(new Float32Array(markLimit),1).setUsage(THREE.DynamicDrawUsage);
    markGeometry.setAttribute('markStart',markStart);markGeometry.setAttribute('markEnd',markEnd);
    markGeometry.setAttribute('markBirth',markBirth);markGeometry.instanceCount=0;markGeometry.setDrawRange(0,0);
    const markClock={value:0};
    const tireMarks=new THREE.Mesh(markGeometry,new THREE.ShaderMaterial({
      uniforms:{clock:markClock,rubber:{value:new THREE.Color(0x18171c)}},
      transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
      vertexShader:`
        attribute vec4 markStart,markEnd;
        attribute float markBirth;
        uniform float clock;
        varying float opacity,edge;
        varying vec2 surface;
        void main(){
          vec4 joint=mix(markStart,markEnd,position.y+0.5);
          vec2 p=joint.xy+joint.zw*position.x*0.50;
          edge=position.x;
          surface=p;
          opacity=0.73*clamp((markBirth+7.5-clock)/2.5,0.0,1.0);
          gl_Position=projectionMatrix*viewMatrix*vec4(p.x,0.049,p.y,1.0);
        }`,
      fragmentShader:`
        uniform vec3 rubber;
        varying float opacity,edge;
        varying vec2 surface;
        void main(){
          float grain=fract(sin(dot(floor(surface*34.0),vec2(12.9898,78.233)))*43758.5453);
          float a=opacity*(1.0-smoothstep(0.26,0.5,abs(edge)))*mix(0.80,1.0,grain);
          if(a<0.002)discard;
          gl_FragColor=vec4(rubber,a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    }));
    tireMarks.name='Tire marks';tireMarks.frustumCulled=false;scene.add(tireMarks);
    let markSlot=0;
    function addTireMark(wheel,to){
      const from=wheel.mark;
      const dx=to.x-from.x,dz=to.z-from.z;
      const distance=Math.hypot(dx,dz);
      if(distance<0.001)return;
      const sideX=-dz/distance,sideZ=dx/distance;
      // Adjacent segments use the same cross-section at the joint.
      markStart.setXYZW(markSlot,from.x,from.z,wheel.markJoined?wheel.sideX:sideX,wheel.markJoined?wheel.sideZ:sideZ);
      markEnd.setXYZW(markSlot,to.x,to.z,sideX,sideZ);
      wheel.markJoined=true;wheel.sideX=sideX;wheel.sideZ=sideZ;
      markBirth.setX(markSlot,time);
      markSlot=(markSlot+1)%markLimit;
      markGeometry.instanceCount=Math.min(markLimit,markGeometry.instanceCount+1);
      markGeometry.setDrawRange(0,6);
      markStart.needsUpdate=markEnd.needsUpdate=markBirth.needsUpdate=true;
    }

    const sample=vector(),smokeVelocity=vector();
    function emitTireSmoke(pos,dust,slip,forward){
      smokeVelocity.set(forward.x*1.1+(random()-.5)*1.0,0.20+random()*.42,
        forward.z*1.1+(random()-.5)*1.0);
      emit('tireSmoke',pos,{vel:smokeVelocity,color:dust?0xb99a76:0xc3c7ce,
        size:0.62+slip*0.44+random()*0.35,growth:1.3+slip*1.1,drag:2.1,
        life:(high?.96:.59)+random()*(high?.45:.23),alpha:(dust?.54:.60)*(.52+slip*.48)});
    }

    function updateTire(wheel,slip,isAsphalt){
      wheel.group.getWorldPosition(wheel.contact);
      wheel.contact.y=0.25;
      const length=wheel.contact.distanceTo(wheel.previous);
      if(!wheel.tracking||length>16){
        wheel.tracking=true;wheel.markJoined=false;wheel.distance=0;wheel.smoke=0.68;
        wheel.onRoad=isAsphalt(wheel.contact);
        wheel.previous.copy(wheel.contact);wheel.mark.copy(wheel.contact);
        return;
      }
      const spacing=1.10;
      wheel.forward.subVectors(wheel.contact,wheel.previous).normalize();
      for(let offset=spacing-wheel.distance;offset<=length;offset+=spacing){
        sample.lerpVectors(wheel.previous,wheel.contact,offset/length);
        const onRoad=isAsphalt(sample);
        if(onRoad&&wheel.onRoad)addTireMark(wheel,sample);
        else wheel.markJoined=false;
        wheel.onRoad=onRoad;
        wheel.mark.copy(sample);
        wheel.smoke+=slip*spacing;
        const interval=high?1.65:3.1;
        if(wheel.smoke>=interval){
          wheel.smoke-=interval;
          emitTireSmoke(sample,!onRoad,slip,wheel.forward);
        }
      }
      wheel.distance=(wheel.distance+length)%spacing;
      wheel.previous.copy(wheel.contact);
    }
    function updateDriving(car,{nitro,drifting,speed,speedLat,isAsphalt},dt){
      if(!jets.length){
        jets=car.exhaustOutlets.map(outlet=>{
          const jet=new THREE.Mesh(jetGeometry,jetMaterial);
          jet.position.copy(outlet);jet.frustumCulled=false;jet.renderOrder=2;car.group.add(jet);
          return jet;
        });
        wheelPaths=car.wheels.filter(wheel=>!wheel.isFront).map(({group})=>({group,
          contact:vector(),previous:vector(),mark:vector(),forward:vector(),tracking:false}));
      }
      nitroAge=nitro&&nitroActive?nitroAge+dt:0;
      nitroActive=nitro;
      const allowMotion=!reduced();
      jetUniforms.power.value=nitro?1+(allowMotion?0.36*Math.exp(-36*nitroAge):0)
        :Math.max(0,jetUniforms.power.value-dt*7);
      jetUniforms.clock.value=time;
      jetUniforms.flutter.value=allowMotion?1:0;
      const firing=jetUniforms.power.value>0;
      for(const jet of jets)jet.visible=firing;
      roadGlow.visible=high&&firing&&car.group.visible;
      if(roadGlow.visible){
        car.group.localToWorld(roadGlow.position.copy(glowCenter));
        roadGlow.position.y=0.055;
        roadGlow.material.opacity=0.19*Math.min(1,jetUniforms.power.value);
      }
      const slip=Math.min(1,Math.max(0,(Math.abs(speedLat)-.55)/7.5))*Math.min(1,speed/28);
      for(const wheel of wheelPaths){
        if(drifting&&slip>0.04)updateTire(wheel,slip,isAsphalt);
        else wheel.tracking=false;
      }
    }
    function resetDriving(){
      nitroActive=false;nitroAge=0;jetUniforms.power.value=0;roadGlow.visible=false;
      for(const jet of jets)jet.visible=false;
      for(const wheel of wheelPaths)wheel.tracking=false;
    }
    function spawn(pos,tint,count,speed,life,size,gravity,glow){
      const name=glow?'spark':'smoke';
      for(let i=0;i<(high?count:Math.ceil(count/2));i++)emit(name,pos,{color:tint,vel:new THREE.Vector3((random()-0.5)*speed,(0.3+random()*0.5)*speed,(random()-0.5)*speed),life,size:Math.max(size*(glow?2:6),0.2),growth:glow?0:1.5,gravity:gravity?12:0,stretch:glow?0.02:0,alpha:glow?1:0.5});
    }
    function update(dt){
      time+=dt;
      markClock.value=time;
      for(const [name,b] of Object.entries(batches)){
        const smoke=name==='smoke'||name==='tireSmoke';
        for(let i=b.items.length-1;i>=0;i--){
          const p=b.items[i];p.age+=dt;p.life-=dt;
          if(p.life<=0){b.items.splice(i,1);b.pool.push(p);continue;}
          p.vel.multiplyScalar(Math.exp(-p.drag*dt));p.vel.y+=(name==='tireSmoke'?0.75:smoke?1.7:-p.gravity)*dt;
          if(p.anchor){p.anchor.updateWorldMatrix(true,false);p.pos.copy(p.local);p.anchor.localToWorld(p.pos);}else p.pos.addScaledVector(p.vel,dt);
          if(p.bounce&&p.pos.y<0.12){p.pos.y=0.12;p.vel.y=Math.abs(p.vel.y)*0.28;p.vel.x*=0.6;p.vel.z*=0.6;}
          p.rotation+=p.spin*dt;
        }
        // Compact first, then write attributes: a retired middle item cannot leave a stale GPU slot.
        for(let i=0;i<b.items.length;i++){
          const p=b.items[i],fade=p.life/(p.duration-p.delay),visibleAge=Math.max(0,p.age-p.delay),extent=p.size+p.growth*visibleAge;
          const j=i*3,k=i*4;
          b.data.center.set([p.pos.x,p.pos.y,p.pos.z],j);
          color.copy(p.tint);if(p.hot)color.multiplyScalar(1+fade*2.2);
          b.data.tint.set([color.r,color.g,color.b],j);
          const fadeIn=name==='tireSmoke'?0.065:smoke?0.14:0.015;
          b.data.shape.set([extent,extent+(p.stretch?p.vel.length()*p.stretch:0),p.rotation,p.alpha*Math.pow(Math.min(1,fade),smoke?0.8:1.3)*Math.min(1,visibleAge/fadeIn)],k);
          b.data.motion.set(p.stretch?[p.vel.x,p.vel.y,p.vel.z]:[0,0,0],j);
        }
        b.geometry.instanceCount=b.items.length;
        for(const key of Object.keys(b.data))b.geometry.attributes[key].needsUpdate=true;
      }
      for(let i=marks.length-1;i>=0;i--){const m=marks[i];m.life-=dt;m.mesh.material.opacity=0.75*Math.min(1,m.life);if(m.life<=0){m.mesh.removeFromParent();marks.splice(i,1);decalPool.push(m);}}
      for(let i=ripples.length-1;i>=0;i--){const r=ripples[i];r.life-=dt;const t=1-r.life/r.duration;r.mesh.scale.setScalar((0.3+3.5*t)/(r.anchor?1.9:1));r.mesh.material.opacity=Math.max(0,(1-t)*0.8);if(r.life<=0){r.mesh.removeFromParent();ripples.splice(i,1);ripplePool.push(r);}}
      for(const r of recoils){r.amount*=Math.exp(-25*dt);r.weapon.position.z=r.z+r.amount;}
      for(const e of lights){e.life=Math.max(0,e.life-dt);e.light.intensity=e.life>0?e.power*Math.pow(e.life/e.duration,2):0;}
      for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.life-=dt;if(d.life<=0){debris.splice(i,1);continue;}d.vel.y-=18*dt;d.pos.addScaledVector(d.vel,dt);d.rot.addScaledVector(d.spin,dt);if(d.pos.y<0.15){d.pos.y=0.15;d.vel.y=Math.abs(d.vel.y)*0.25;d.vel.x*=0.7;d.vel.z*=0.7;}}
      debris.forEach((d,i)=>{debrisDummy.position.copy(d.pos);debrisDummy.rotation.set(d.rot.x,d.rot.y,d.rot.z);debrisDummy.scale.setScalar(d.size*Math.min(1,d.life*4));debrisDummy.updateMatrix();debrisMesh.setMatrixAt(i,debrisDummy.matrix);});debrisMesh.count=debris.length;debrisMesh.instanceMatrix.needsUpdate=true;
      drawTrails(dt);
    }
    function clear(){
      resetDriving();
      markSlot=0;markGeometry.instanceCount=0;markGeometry.setDrawRange(0,0);
      for(const b of Object.values(batches)){b.pool.push(...b.items);b.items.length=0;b.geometry.instanceCount=0;}
      trails.length=0;ribbonGeo.setDrawRange(0,0);
      debris.length=0;debrisMesh.count=0;
      for(const m of marks){m.mesh.removeFromParent();decalPool.push(m);}marks.length=0;
      for(const r of ripples){r.mesh.removeFromParent();ripplePool.push(r);}ripples.length=0;
      for(const r of recoils){r.weapon.position.z=r.z;r.amount=0;}
      for(const e of lights){e.life=0;e.light.intensity=0;}
    }
    return {spawn,update,clear,burst,impact,explosion,shield,muzzle,updateDriving,resetDriving,createTrail,moveTrail,
      detachTrail(trail){if(trail)trail.detached=true;},
      setQuality(mode){
        high=mode==='high';
        if(high)return;
        roadGlow.visible=false;
        for(const b of Object.values(batches)){
          while(b.items.length>Math.floor(b.max/2))b.pool.push(b.items.pop());
          b.geometry.instanceCount=b.items.length;
        }
      },
      stats(){return {particles:Object.values(batches).reduce((n,b)=>n+b.items.length,0),trails:trails.length,marks:marks.length,ripples:ripples.length,debris:debris.length,lights:lights.filter(e=>e.life>0).length};}};
  };

  // Small HDR threshold bloom. No extra CDN/module graph; all targets live with renderer.
  game.createCombatRenderer=function({THREE,renderer}){
    const hdrSupported=renderer.capabilities.isWebGL2&&renderer.extensions.has('EXT_color_buffer_float');
    let samples=0;
    if(hdrSupported){
      // Canvas antialiasing does not apply to offscreen targets. Both attachments
      // must support the same sample count; keep bloom bounded to at most 4x MSAA.
      const gl=renderer.getContext();
      const colorSamples=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES)||[];
      const depthSamples=gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,gl.SAMPLES)||[];
      samples=[4,2].find(count=>colorSamples.includes(count)&&depthSamples.includes(count))||0;
    }
    // Preserve direct canvas antialiasing if multisampled HDR is unavailable.
    const supported=hdrSupported&&samples>0;
    let enabled=false,width=0,height=0;
    const targets=supported?Array.from({length:3},()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false})):[];
    if(supported){targets[0].depthBuffer=true;targets[0].samples=samples;}
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
    const blur=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{image:{value:null},step:{value:new THREE.Vector2()},threshold:{value:0}},vertexShader:vertex,
      fragmentShader:`varying vec2 vUv;uniform sampler2D image;uniform vec2 step;uniform float threshold;
        vec3 sampleColor(vec2 p){vec3 c=texture2D(image,p).rgb;float l=max(max(c.r,c.g),c.b);return c*max(0.0,l-threshold)/max(l,0.001);}
        void main(){vec3 c=sampleColor(vUv)*0.227027;c+=(sampleColor(vUv+step*1.384615)+sampleColor(vUv-step*1.384615))*0.316216;c+=(sampleColor(vUv+step*3.230769)+sampleColor(vUv-step*3.230769))*0.07027;gl_FragColor=vec4(c,1.0);}`});
    const compose=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{image:{value:null},glow:{value:null}},vertexShader:vertex,fragmentShader:`varying vec2 vUv;uniform sampler2D image;uniform sampler2D glow;void main(){gl_FragColor=vec4(texture2D(image,vUv).rgb+texture2D(glow,vUv).rgb*0.3,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
    const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),blur);scene.add(quad);
    return {setQuality(mode){enabled=supported&&mode==='high';},stats(){return {supported,enabled};},render(world,view){
      if(!enabled){renderer.render(world,view);return;}
      const size=renderer.getDrawingBufferSize(new THREE.Vector2());
      if(width!==size.x||height!==size.y){width=size.x;height=size.y;targets[0].setSize(width,height);for(const t of targets.slice(1))t.setSize(Math.max(1,Math.floor(width/4)),Math.max(1,Math.floor(height/4)));}
      const target=renderer.getRenderTarget();
      try{
        renderer.setRenderTarget(targets[0]);renderer.render(world,view);
        quad.material=blur;blur.uniforms.image.value=targets[0].texture;blur.uniforms.threshold.value=1.05;blur.uniforms.step.value.set(4/width,0);renderer.setRenderTarget(targets[1]);renderer.render(scene,camera);
        blur.uniforms.image.value=targets[1].texture;blur.uniforms.threshold.value=0;blur.uniforms.step.value.set(0,4/height);renderer.setRenderTarget(targets[2]);renderer.render(scene,camera);
        quad.material=compose;compose.uniforms.image.value=targets[0].texture;compose.uniforms.glow.value=targets[2].texture;renderer.setRenderTarget(target);renderer.render(scene,camera);
      }finally{renderer.setRenderTarget(target);}
    }};
  };
})(globalThis);
