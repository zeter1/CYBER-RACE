(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const game=root.game??=(Object.create(null));

  // Local model space: nose = -Z, axles = +/-1.4, tyre radius = 0.38.
  // Keep the runtime's scale, wheel animation and weapon visibility contract.
  game.createCarFactory=function createCarFactory({THREE,document}){
    const reflectionCanvas=document.createElement('canvas');
    reflectionCanvas.width=512;reflectionCanvas.height=256;
    const ctx=reflectionCanvas.getContext('2d');
    const sky=ctx.createLinearGradient(0,0,0,256);
    sky.addColorStop(0,'#c5d4e7');sky.addColorStop(0.38,'#78879a');
    sky.addColorStop(0.49,'#4b5664');sky.addColorStop(0.6,'#343741');
    sky.addColorStop(1,'#1c2028');
    ctx.fillStyle=sky;ctx.fillRect(0,0,512,256);
    for(const [x,y,radius] of [[86,57,78],[310,61,92]]){
      const reflection=ctx.createRadialGradient(x,y,0,x,y,radius);
      reflection.addColorStop(0,'rgba(244,249,255,.78)');
      reflection.addColorStop(.52,'rgba(224,235,252,.35)');
      reflection.addColorStop(1,'rgba(224,235,252,0)');
      ctx.fillStyle=reflection;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
    }
    // Shared across all cars; Three.js caches the filtered reflection map.
    const reflection=new THREE.CanvasTexture(reflectionCanvas);
    reflection.mapping=THREE.EquirectangularReflectionMapping;
    reflection.colorSpace=THREE.SRGBColorSpace;
    const standard=(color,roughness=0.5,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness,envMap:reflection,envMapIntensity:0.65});
    const trim=standard(0x151b23,0.55,0.25);
    const rubber=standard(0x141518,0.94);
    const alloy=standard(0xa3aebb,0.25,0.9);
    const brake=standard(0x555b64,0.65,0.8);
    const caliper=standard(0xc52c25,0.4,0.4);
    const glass=new THREE.MeshPhysicalMaterial({color:0x101b27,roughness:0.23,metalness:0.27,clearcoat:0.85,clearcoatRoughness:0.12,envMap:reflection,envMapIntensity:1,side:THREE.DoubleSide});
    const lamp=(color,intensity)=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:0.23,metalness:0.15});
    const headlamp=lamp(0xc6ecff,1.45),tailLamp=lamp(0xff2737,1.3),amber=lamp(0xff9a24,0.7);
    const tailLens=standard(0x4a0913,0.31,0.15);
    const rimMetal=standard(0x455563,0.25,0.88),hardware=standard(0x738694,0.3,0.8);
    const cyan=lamp(0x39e4df,0.8);
    const v=p=>new THREE.Vector3(...p);

    function mesh(parent,geometry,material,position=[0,0,0],rotation=[0,0,0]){
      const m=new THREE.Mesh(geometry,material);
      m.position.set(...position);m.rotation.set(...rotation);
      m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
    }
    function box(parent,size,material,position,rotation){return mesh(parent,new THREE.BoxGeometry(...size),material,position,rotation);}
    function beveled(parent,size,material,position,rotation){
      const [w,h,d]=size,b=Math.min(.025,w/8,h/8,d/8),x=w/2-b,y=h/2-b;
      const shape=new THREE.Shape();shape.moveTo(-x+b,-y);shape.lineTo(x-b,-y);shape.lineTo(x,-y+b);
      shape.lineTo(x,y-b);shape.lineTo(x-b,y);shape.lineTo(-x+b,y);shape.lineTo(-x,y-b);shape.lineTo(-x,-y+b);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:d-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:1,steps:1,curveSegments:1});geometry.translate(0,0,-d/2+b);
      return mesh(parent,geometry,material,position,rotation);
    }
    function fender(parent,side,z,material){
      const shape=new THREE.Shape(),outer=.55,inner=.47;
      shape.moveTo(outer,0);shape.absarc(0,0,outer,0,Math.PI,false);shape.lineTo(-inner,0);shape.absarc(0,0,inner,Math.PI,0,true);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:.09,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:1,steps:1,curveSegments:12});
      geometry.translate(0,0,-.045);mesh(parent,geometry,material,[side*1.055,.38,z],[0,Math.PI/2,0]);
    }
    function panel(parent,points,material){
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));
      g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
      return mesh(parent,g,material);
    }
    function line(parent,points,radius,material){
      const curve=new THREE.CatmullRomCurve3(points.map(v));
      return mesh(parent,new THREE.TubeGeometry(curve,Math.max(4,points.length*3),radius,5,false),material);
    }
    function strut(parent,a,b,radius,material){
      const start=v(a),end=v(b),delta=end.clone().sub(start);
      const m=mesh(parent,new THREE.CylinderGeometry(radius,radius,delta.length(),8),material,start.clone().add(end).multiplyScalar(0.5).toArray());
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;
    }
    const batch=parent=>game.mergeModelMeshes(THREE,parent);

    function bodySection(z){
      const end=Math.pow(Math.abs(z)/2.24,5);
      const archDistance=Math.min(Math.abs(z+1.4),Math.abs(z-1.4));
      const arch=archDistance<0.46?0.38+Math.sqrt(0.46**2-archDistance**2):0.29;
      const flare=(z>0?0.15:0.09)*Math.exp(-Math.pow(archDistance/0.57,2));
      const width=0.97-0.10*end+flare;
      const top=0.91-0.20*end+flare*0.22,shoulder=Math.max(top-0.025,arch+0.065),lower=Math.max(0.29,arch);
      return {width,top,shoulder,lower};
    }
    function sideSurfaceX(z,y){
      const {width,shoulder,lower}=bodySection(z);
      const middle=Math.max(lower+0.025,shoulder-0.11);
      if(y<=middle)return width*(0.94+0.06*THREE.MathUtils.clamp((y-lower)/(middle-lower),0,1));
      return width*(1-0.05*THREE.MathUtils.clamp((y-middle)/(shoulder-middle),0,1));
    }
    function bodyShell(parent,paint){
      const positions=[],indices=[],uv=[];
      const count=100;
      for(let i=0;i<=count;i++){
        const z=-2.24+i*4.48/count;
        const {width,top,shoulder,lower}=bodySection(z);
        const ring=[[-width*0.94,lower],[-width,Math.max(lower+0.025,shoulder-0.11)],[-width*0.95,shoulder],[-width*0.72,top+0.025],[0,top+0.045],[width*0.72,top+0.025],[width*0.95,shoulder],[width,Math.max(lower+0.025,shoulder-0.11)],[width*0.94,lower]];
        for(const [x,y] of ring){positions.push(x,y,z);uv.push((x+1.1)/2.2,i/count);}
        if(i<count)for(let j=0;j<8;j++){
          const a=i*9+j,b=a+9;indices.push(a,b,a+1,a+1,b,b+1);
        }
      }
      // End caps; keep the wheel wells open below the fenders.
      for(const base of [0,count*9])for(let j=1;j<8;j++){
        if(base===0)indices.push(base,base+j,base+j+1);
        else indices.push(base,base+j+1,base+j);
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
      mesh(parent,g,paint);
    }

    function roof(parent,paint){
      const positions=[],uv=[],indices=[];
      for(let i=0;i<=12;i++)for(let j=0;j<=8;j++){
        const t=i/12,u=j/8,width=0.66-0.02*t;
        positions.push((u*2-1)*width,1.39+0.04*t+Math.sin(t*Math.PI)*(0.025+0.035*Math.sin(u*Math.PI)),-0.43+1.02*t);
        uv.push(u,t);
        if(i<12&&j<8){const a=i*9+j;indices.push(a,a+9,a+1,a+1,a+9,a+10);}
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
      mesh(parent,g,paint);
    }

    function createCar(color,isPlayer=false){
      const group=new THREE.Group();group.name='GT combat coupe';group.scale.setScalar(1.9);
      const fixed=new THREE.Group();group.add(fixed);
      const paint=new THREE.MeshPhysicalMaterial({color,metalness:0.36,roughness:0.29,clearcoat:0.85,clearcoatRoughness:0.22,envMap:reflection,envMapIntensity:0.86});
      const exhaustOutlets=[];
      bodyShell(fixed,paint);
      box(fixed,[1.65,0.12,3.7],trim,[0,0.26,0]);
      // Curved painted roof, separate glazing and structural pillars.
      roof(fixed,paint);
      panel(fixed,[[-0.83,0.955,-1.02],[0.83,0.955,-1.02],[0.66,1.39,-0.43],[-0.66,1.39,-0.43]],glass);
      panel(fixed,[[-0.64,1.43,0.59],[0.64,1.43,0.59],[0.84,0.96,1.24],[-0.84,0.96,1.24]],glass);
      for(const side of [-1,1]){
        const s=x=>side*x;
        panel(fixed,[[s(0.835),0.96,-0.95],[s(0.67),1.38,-0.4],[s(0.65),1.41,0.57],[s(0.85),0.96,1.15]],glass);
        strut(fixed,[s(0.84),0.95,-1.03],[s(0.67),1.4,-0.43],0.027,paint);
        line(fixed,[[s(0.67),1.4,-0.43],[s(0.655),1.44,0.08],[s(0.64),1.44,0.6]],0.021,paint);
        strut(fixed,[s(0.64),1.44,0.6],[s(0.86),0.95,1.26],0.033,paint);
        line(fixed,[[s(0.84),0.95,-1.03],[s(0.87),0.94,0.1],[s(0.86),0.95,1.26]],0.022,trim);
        strut(fixed,[s(0.665),1.41,0.36],[s(0.855),0.96,0.48],0.027,trim);
        // Door shut lines, flush handles and sculpted rocker panels.
        const door=[[-0.81,0.885],[-0.79,0.65],[-0.65,0.36],[0,0.35],[0.65,0.36],[0.78,0.65],[0.77,0.885]];
        line(fixed,door.map(([z,y])=>[s(sideSurfaceX(z,y)+0.003),y,z]),0.006,trim);
        box(fixed,[0.025,0.035,0.17],alloy,[s(sideSurfaceX(0.52,0.79)+0.01),0.79,0.52]);
        box(fixed,[0.09,0.075,1.7],trim,[s(0.985),0.3,0]);
        strut(fixed,[s(0.82),1.01,-0.7],[s(1.035),1.04,-0.72],0.025,trim);
        const mirror=mesh(fixed,new THREE.SphereGeometry(1,12,8),paint,[s(1.095),1.075,-0.72]);mirror.scale.set(0.14,0.065,0.105);
        box(fixed,[0.19,0.075,0.015],alloy,[s(1.095),1.075,-0.625]);
        // Real open arch silhouette and rolled lip, following the tyre clearance.
        for(const z of [-1.4,1.4]){
          const points=[];
          for(let i=0;i<=20;i++){
            const a=i/20*Math.PI;
            const y=0.38+Math.sin(a)*0.466,along=z+Math.cos(a)*0.466;
            points.push([s(sideSurfaceX(along,y)+0.006),y,along]);
          }
          line(fixed,points,0.014,paint);
        }
        // Hood louvres, brake inlet and side indicators.
        for(let i=0;i<4;i++)box(fixed,[0.24,0.012,0.035],trim,[s(0.58),0.926,-1.25+i*0.09]);
        box(fixed,[0.022,0.14,0.33],trim,[s(0.999),0.65,0.78],[0,side*0.08,0]);
        box(fixed,[0.024,0.035,0.13],amber,[s(1.015),0.7,-1.94]);
        // Recessed lamp housings with a pair of LED blades.
        beveled(fixed,[0.58,0.15,0.09],trim,[s(0.57),0.66,-2.23]);
        for(const x of [0.415,0.57,0.725])beveled(fixed,[0.115,0.032,0.023],headlamp,[s(x),0.668,-2.284]);
        beveled(fixed,[0.65,0.16,0.065],trim,[s(0.52),0.646,2.241]);
        beveled(fixed,[0.565,0.112,0.023],tailLens,[s(0.52),0.646,2.272]);
        beveled(fixed,[0.49,0.026,0.014],tailLamp,[s(0.52),0.663,2.284]);
        beveled(fixed,[0.031,0.062,0.014],tailLamp,[s(0.75),0.646,2.284]);
        // The rim is separate from the dark inner wall and recessed end of the pipe.
        const exhaust=[s(0.64),0.398,2.29];
        mesh(fixed,new THREE.CylinderGeometry(0.086,0.086,0.12,16,1,true).rotateX(Math.PI/2),rimMetal,exhaust);
        const outlet=new THREE.Vector3(exhaust[0],exhaust[1],2.35);
        exhaustOutlets.push(outlet);
        mesh(fixed,new THREE.TorusGeometry(0.077,0.011,6,16),alloy,outlet.toArray());
        mesh(fixed,new THREE.CircleGeometry(0.082,16),trim,[exhaust[0],exhaust[1],2.315]);
        strut(fixed,[s(0.62),0.761,1.79],[s(0.62),1.196,1.88],0.04,trim);
      }
      box(fixed,[1.9,0.045,0.28],trim,[0,0.29,-2.19]);
      box(fixed,[0.87,0.19,0.035],trim,[0,0.475,-2.245]);
      for(let i=-3;i<=3;i++)box(fixed,[0.013,0.13,0.015],alloy,[i*0.11,0.475,-2.269]);
      beveled(fixed,[0.32,0.028,0.026],rimMetal,[0,0.64,2.251]);
      beveled(fixed,[1.73,0.17,0.16],paint,[0,0.461,2.218],[0.14,0,0]);
      beveled(fixed,[1.59,0.15,0.25],trim,[0,0.337,2.165],[-0.12,0,0]);
      for(const x of [-0.33,-0.16,0.16,0.33])beveled(fixed,[0.036,0.125,0.25],trim,[x,0.315,2.18],[-0.15,0,0]);
      beveled(fixed,[1.9,0.058,0.32],trim,[0,1.21,1.87],[0.07,0,0]);
      for(const x of [-0.95,0.95])beveled(fixed,[0.04,0.116,0.34],paint,[x,1.235,1.87],[0.07,0,0]);
      for(const side of [-1,1]){
        beveled(fixed,[.13,.1,1.78],trim,[side*1.04,.3,.02]);
        beveled(fixed,[.016,.02,1.18],cyan,[side*1.105,.33,.03]);
      }
      // Sloping scoop with a deep intake, rather than stacked solid blocks.
      const scoop=new THREE.BufferGeometry();
      scoop.setAttribute('position',new THREE.Float32BufferAttribute([-.43,.94,-1.84,.43,.94,-1.84,.36,.94,-1.08,-.36,.94,-1.08,-.43,1.13,-1.84,.43,1.13,-1.84,.36,1.02,-1.08,-.36,1.02,-1.08],3));
      scoop.setIndex([0,4,1,1,4,5,4,7,5,5,7,6,1,5,2,2,5,6,3,7,0,0,7,4,2,6,3,3,6,7]);scoop.computeVertexNormals();mesh(fixed,scoop,paint);
      box(fixed,[.72,.115,.045],trim,[0,1.035,-1.867]);
      for(const x of [-.24,0,.24])box(fixed,[.025,.1,.05],hardware,[x,1.035,-1.895]);
      // Open radiator, sculpted corner intakes and splitter supports.
      beveled(fixed,[1.16,.24,.06],trim,[0,.47,-2.29]);
      for(const side of [-1,1]){
        beveled(fixed,[.32,.22,.08],trim,[side*.76,.46,-2.28]);
        beveled(fixed,[.12,.3,.15],paint,[side*.54,.45,-2.3],[0,0,side*.17]);
        for(const y of [.42,.49])box(fixed,[.25,.018,.025],hardware,[side*.76,y,-2.329]);
        strut(fixed,[side*.72,.3,-2.37],[side*.79,.52,-2.26],.014,hardware);
      }
      batch(fixed);

      const wheels=[];
      for(const z of [-1.4,1.4])for(const side of [-1,1]){
        const wg=new THREE.Group();wg.position.set(side*1.025,0.38,z);group.add(wg);
        const tire=new THREE.Group();wg.add(tire);
        // Rounded tyre shoulders, textured-looking tread bands, recessed wheel face.
        mesh(tire,new THREE.CylinderGeometry(0.365,0.365,0.27,32,1,true).rotateZ(Math.PI/2),rubber);
        for(const x of [-0.115,0.115])mesh(tire,new THREE.TorusGeometry(0.315,0.065,10,32).rotateY(Math.PI/2),rubber,[x,0,0]);
        for(const x of [-0.065,0,0.065])mesh(tire,new THREE.TorusGeometry(0.365,0.006,4,32).rotateY(Math.PI/2),trim,[x,0,0]);
        for(let i=0;i<28;i++)for(const sideX of [-1,1]){
          const a=i*Math.PI*2/28;
          box(tire,[.085,.012,.048],trim,[sideX*.068,Math.cos(a)*.367,Math.sin(a)*.367],[a,sideX*.25,0]);
        }
        batch(tire);
        const rim=new THREE.Group();wg.add(rim);
        mesh(rim,new THREE.CylinderGeometry(0.258,0.258,0.25,24,1,true).rotateZ(Math.PI/2),trim);
        const face=side*0.145;
        mesh(rim,new THREE.TorusGeometry(0.253,0.016,6,32).rotateY(Math.PI/2),alloy,[face,0,0]);
        mesh(rim,new THREE.CylinderGeometry(0.065,0.065,0.025,12).rotateZ(Math.PI/2),alloy,[face,0,0]);
        mesh(rim,new THREE.TorusGeometry(.232,.006,4,32).rotateY(Math.PI/2),cyan,[face+side*.004,0,0]);
        for(let i=0;i<10;i++){
          const a=i*Math.PI*2/10;
          const spoke=box(rim,[0.03,0.19,0.032],rimMetal,[face,Math.cos(a)*0.15,Math.sin(a)*0.15],[a,0,0]);
          spoke.rotation.x=a;
          mesh(rim,new THREE.CylinderGeometry(0.012,0.012,0.029,6).rotateZ(Math.PI/2),trim,[face+side*0.018,Math.cos(a)*0.043,Math.sin(a)*0.043]);
        }
        batch(rim);
        const brakes=new THREE.Group();wg.add(brakes);
        mesh(brakes,new THREE.CylinderGeometry(0.215,0.215,0.016,24).rotateZ(Math.PI/2),brake,[side*0.09,0,0]);
        box(brakes,[0.045,0.16,0.073],caliper,[side*0.105,0.015,0.18]);
        batch(brakes);
        wheels.push({group:wg,isFront:z<0,tire,rim});
      }
      if(isPlayer)for(const x of [-0.6,0.6]){
        const light=new THREE.SpotLight(0xffffee,8,60,0.5,0.4,1);
        light.position.set(x,0.6,-2.1);light.target.position.set(x,0,-14);group.add(light,light.target);
      }
      const weaponGroup=new THREE.Group();weaponGroup.position.set(0,1.3,0);group.add(weaponGroup);
      const rocketLauncher=new THREE.Group();rocketLauncher.position.set(-.39,.31,.1);weaponGroup.add(rocketLauncher);
      beveled(rocketLauncher,[.55,.14,.65],trim,[0,-.18,.08]);
      // One hollow large-bore tube, inner radius .185 local (> the missile's .2 world radius).
      const tube=new THREE.CylinderGeometry(.235,.235,.84,24,1,true);tube.rotateX(Math.PI/2);
      mesh(rocketLauncher,tube,rimMetal,[0,0,-.21]);
      const liner=new THREE.CylinderGeometry(.185,.185,.78,24,1,true);liner.rotateX(Math.PI/2);
      const darkLiner=standard(0x080c11,.8,.2);darkLiner.side=THREE.BackSide;
      mesh(rocketLauncher,liner,darkLiner,[0,0,-.23]);
      for(const z of [-.64,-.36,.2])mesh(rocketLauncher,new THREE.TorusGeometry(.21,.027,6,24),alloy,[0,0,z]);
      mesh(rocketLauncher,new THREE.CircleGeometry(.184,24),trim,[0,0,.12],[0,Math.PI,0]);
      beveled(rocketLauncher,[.42,.33,.42],trim,[0,.01,.17]);
      for(const side of [-1,1]){
        beveled(rocketLauncher,[.035,.05,.23],cyan,[side*.245,.015,-.13]);
        beveled(rocketLauncher,[.025,.045,.17],amber,[side*.225,.03,.18]);
      }
      beveled(rocketLauncher,[.16,.075,.2],hardware,[0,.27,.09]);
      rocketLauncher.userData.muzzleZ=-.67;batch(rocketLauncher);
      const machineGun=new THREE.Group();machineGun.position.set(.38,.27,.08);weaponGroup.add(machineGun);
      beveled(machineGun,[.28,.24,.4],trim,[0,0,.03]);
      beveled(machineGun,[.35,.12,.32],trim,[0,-.15,.08]);
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3,x=Math.cos(a)*.065,y=Math.sin(a)*.065;
        mesh(machineGun,new THREE.CylinderGeometry(.027,.027,.61,10,1,true),hardware,[x,y,-.45],[Math.PI/2,0,0]);
        mesh(machineGun,new THREE.TorusGeometry(.024,.007,4,10),alloy,[x,y,-.76]);
        mesh(machineGun,new THREE.CircleGeometry(.019,8),trim,[x,y,-.73],[0,Math.PI,0]);
      }
      for(const z of [-.25,-.61])mesh(machineGun,new THREE.CylinderGeometry(.108,.108,.055,16,1,true),trim,[0,0,z],[Math.PI/2,0,0]);
      beveled(machineGun,[.02,.045,.16],amber,[.149,.02,.07]);
      machineGun.userData.muzzleZ=-.78;batch(machineGun);
      rocketLauncher.visible=false;machineGun.visible=false;
      // Bounded accessories: construct once; selection only changes visibility/paint.
      const interceptorKit=new THREE.Group(),armoredKit=new THREE.Group();
      group.add(interceptorKit,armoredKit);
      box(interceptorKit,[1.95,0.08,0.52],trim,[0,1.4,1.8]);
      for(const x of [-0.88,0.88])box(interceptorKit,[0.08,0.32,0.5],paint,[x,1.42,1.8]);
      box(interceptorKit,[1.8,0.035,0.42],paint,[0,0.3,-2.34]);
      for(const x of [-1,1]){
        beveled(armoredKit,[.15,.34,1.68],rimMetal,[x*1.045,.62,.02],[0,0,x*.04]);
        beveled(armoredKit,[.17,.15,.55],paint,[x*1.06,.74,-.38]);
        for(const z of [-.68,-.3,.1,.67])for(const y of [.5,.72]){
          mesh(armoredKit,new THREE.CylinderGeometry(.022,.022,.018,6),hardware,[x*1.135,y,z],[0,0,Math.PI/2]);
        }
        for(const z of [-1.4,1.4])fender(armoredKit,x,z,trim);
        beveled(interceptorKit,[.16,.045,.42],trim,[x*.94,.4,-2.12],[0,x*.22,x*.18]);
      }
      beveled(armoredKit,[2.04,.1,.32],trim,[0,.28,-2.32]);
      for(const x of [-.91,.91])beveled(armoredKit,[.11,.3,.23],rimMetal,[x,.43,-2.33]);
      beveled(armoredKit,[1.98,.07,.42],trim,[0,1.28,1.87],[.06,0,0]);
      for(const x of [-.99,.99])beveled(armoredKit,[.045,.23,.48],paint,[x,1.3,1.87]);
      for(const x of [-.6,.6])beveled(armoredKit,[.19,.065,.73],paint,[x,.955,-1.43]);
      batch(interceptorKit);batch(armoredKit);
      function setAppearance(classId='universal',colorValue=color){
        paint.color.setHex(colorValue);
        interceptorKit.visible=classId==='interceptor';armoredKit.visible=classId==='armored';
        if(classId==='interceptor')group.scale.set(1.82,1.8,1.98);
        else if(classId==='armored')group.scale.set(2.02,1.98,1.9);
        else group.scale.setScalar(1.9);
        group.userData.garageClass=classId;group.userData.garagePaint=colorValue;
      }
      setAppearance();
      function getMuzzle(rocket=false,target=new THREE.Vector3()){
        const weapon=rocket?rocketLauncher:machineGun;weapon.updateWorldMatrix(true,false);
        return weapon.localToWorld(target.set(0,0,weapon.userData.muzzleZ));
      }
      return {group,wheels,exhaustOutlets,weaponGroup,rocketLauncher,machineGun,setAppearance,getMuzzle};
    }
    createCar.environmentMap=reflection;
    return createCar;
  };
})();
