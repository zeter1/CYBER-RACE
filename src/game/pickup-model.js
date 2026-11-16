(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const game=root.game??=(Object.create(null));

  game.createPickupFactory=function createPickupFactory({THREE,envMap=null}){
    const data={
      rocket:{color:0xff663b,emissive:0xff4422,icon:'🚀',name:'РАКЕТЫ',detail:'+2 ракеты'},
      machinegun:{color:0x6297ff,emissive:0x4477ff,icon:'🔫',name:'ПАТРОНЫ',detail:'+30 патронов'},
      nitro:{color:0x64ee83,emissive:0x22dd55,icon:'💨',name:'НИТРО',detail:'+1 заряд'},
      speedboost:{color:0xffd35a,emissive:0xffbb22,icon:'⚡',name:'УСКОРЕНИЕ',detail:'10 секунд'},
      health:{color:0xff7c83,emissive:0xff3344,icon:'❤️',name:'РЕМОНТ',detail:'+40 здоровья'},
      shield:{color:0x6ae4ff,emissive:0x22bbff,icon:'🛡️',name:'ЩИТ',detail:'7 секунд защиты'}
    };
    const types=Object.keys(data);
    const geometries=new Set(),materials=new Set();
    const environment={envMap,envMapIntensity:0.8};
    const metal=new THREE.MeshStandardMaterial({color:0xa2b3c4,metalness:0.75,roughness:0.3,...environment});
    const dark=new THREE.MeshStandardMaterial({color:0x17222f,metalness:0.55,roughness:0.42,...environment});
    const white=new THREE.MeshStandardMaterial({color:0xf1f5fa,metalness:0.25,roughness:0.3,...environment});
    const brass=new THREE.MeshStandardMaterial({color:0xe2b65a,metalness:0.7,roughness:0.25,...environment});
    const batch=group=>game.mergeModelMeshes(THREE,group);
    function add(parent,geometry,material,pos=[0,0,0],rot=[0,0,0]){
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...pos);mesh.rotation.set(...rot);parent.add(mesh);return mesh;
    }
    function box(parent,size,material,pos,rot){
      const [w,h,d]=size,b=Math.min(0.04,w/5,h/5,d/5);
      const shape=new THREE.Shape();
      shape.moveTo(-w/2+b,-h/2+b);shape.lineTo(w/2-b,-h/2+b);shape.lineTo(w/2-b,h/2-b);shape.lineTo(-w/2+b,h/2-b);shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:d-2*b,bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:2,steps:1});
      geometry.translate(0,0,-(d-2*b)/2);return add(parent,geometry,material,pos,rot);
    }
    function cylinder(parent,r1,r2,height,material,pos,rot){return add(parent,new THREE.CylinderGeometry(r1,r2,height,16),material,pos,rot);}
    function extrude(parent,points,depth,material,pos=[0,0,0]){
      const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:0.045,bevelThickness:0.045,bevelSegments:2,steps:1,curveSegments:8});
      geometry.translate(0,0,-depth/2);return add(parent,geometry,material,pos);
    }

    const templates={};
    types.forEach((type,index)=>{
      const d=data[type];
      const paint=new THREE.MeshStandardMaterial({color:d.color,emissive:d.emissive,emissiveIntensity:0.13,metalness:0.5,roughness:0.26,...environment});
      const glow=new THREE.MeshBasicMaterial({color:d.color,toneMapped:false});
      const groundGlow=new THREE.MeshBasicMaterial({color:d.color,transparent:true,opacity:0.22,depthWrite:false,blending:THREE.AdditiveBlending});
      const group=new THREE.Group();group.name='pickup-'+type;
      const model=new THREE.Group();group.add(model);model.name='rotating-model';
      if(type==='rocket'){
        for(const x of [-0.32,0.32]){
          cylinder(model,0.19,0.19,1.1,metal,[x,-0.02,0]);
          add(model,new THREE.ConeGeometry(0.2,0.45,16),paint,[x,0.75,0]);
          cylinder(model,0.22,0.22,0.12,dark,[x,-0.6,0]);
          cylinder(model,0.12,0.16,0.08,glow,[x,-0.69,0]);
          for(let j=0;j<3;j++){
            const a=j*Math.PI*2/3;
            box(model,[0.035,0.4,0.28],paint,[x+Math.sin(a)*0.23,-0.35,Math.cos(a)*0.23],[0,a,-0.15]);
          }
          cylinder(model,0.205,0.205,0.08,paint,[x,0.32,0]);
        }
      }else if(type==='machinegun'){
        box(model,[1.3,0.75,0.72],paint,[0,-0.26,0]);
        box(model,[1.39,0.12,0.81],dark,[0,-0.68,0]);
        box(model,[1.35,0.14,0.78],metal,[0,0.15,0]);
        for(const x of [-0.4,0,0.4]){
          cylinder(model,0.125,0.125,0.75,brass,[x,0.47,0]);
          add(model,new THREE.ConeGeometry(0.125,0.27,12),metal,[x,0.98,0]);
        }
        for(const x of [-0.5,0.5])box(model,[0.12,0.58,0.04],metal,[x,-0.24,0.385]);
        box(model,[0.37,0.09,0.04],glow,[0,-0.26,0.39]);
      }else if(type==='nitro'){
        cylinder(model,0.38,0.38,1.2,paint,[0,-0.12,0]);
        const shoulder=add(model,new THREE.SphereGeometry(0.38,16,10),paint,[0,0.48,0]);shoulder.scale.y=0.65;
        cylinder(model,0.16,0.21,0.2,metal,[0,0.77,0]);
        cylinder(model,0.22,0.22,0.07,dark,[0,0.92,0]);
        box(model,[0.56,0.065,0.08],metal,[0,0.87,0]);
        for(const y of [-0.58,0.24])cylinder(model,0.405,0.405,0.11,metal,[0,y,0]);
        box(model,[0.12,0.62,0.055],glow,[0,-0.15,0.375]);
      }else if(type==='speedboost'){
        for(const x of [-0.37,0.37])extrude(model,[[-0.4,-0.72],[0.02,-0.72],[0.55,0],[0.02,0.72],[-0.4,0.72],[0.1,0]],0.23,paint,[x,0,0]);
        add(model,new THREE.TorusGeometry(0.5,0.07,8,24),metal,[-0.4,0,-0.2]);
        cylinder(model,0.19,0.19,0.3,glow,[-0.4,0,-0.22],[Math.PI/2,0,0]);
      }else if(type==='health'){
        box(model,[1.4,0.98,0.56],white,[0,-0.08,0]);
        box(model,[1.13,0.76,0.07],paint,[0,-0.08,0.315]);
        box(model,[0.2,0.55,0.065],white,[0,-0.08,0.37]);
        box(model,[0.58,0.18,0.065],white,[0,-0.08,0.37]);
        box(model,[0.2,0.55,0.065],paint,[0,-0.08,-0.315]);
        box(model,[0.58,0.18,0.065],paint,[0,-0.08,-0.315]);
        box(model,[0.65,0.12,0.19],paint,[0,0.76,0]);
        for(const x of [-0.29,0.29])box(model,[0.1,0.3,0.15],metal,[x,0.59,0]);
        for(const x of [-0.62,0.62])for(const y of [-0.45,0.28])box(model,[0.19,0.2,0.65],dark,[x,y,0]);
      }else{
        const outline=[[-0.72,0.65],[-0.38,0.77],[0,0.92],[0.38,0.77],[0.72,0.65],[0.65,-0.1],[0.4,-0.63],[0,-0.98],[-0.4,-0.63],[-0.65,-0.1]];
        extrude(model,outline,0.2,metal);
        extrude(model,outline.map(([x,y])=>[x*0.8,y*0.8]),0.1,paint,[0,0,0.17]);
        box(model,[0.08,1.1,0.055],glow,[0,0,0.26]);
        box(model,[0.8,0.08,0.055],glow,[0,0.12,0.26]);
        extrude(model,outline.map(([x,y])=>[x*0.8,y*0.8]),0.1,paint,[0,0,-0.17]);
      }
      batch(model);model.scale.setScalar(1.2);
      model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
      // No point lights per pickup: glow is emissive geometry with a shared halo.
      const base=new THREE.Group();group.add(base);base.name='base';
      cylinder(base,1.02,1.14,0.13,dark,[0,-1.2,0]);
      add(base,new THREE.TorusGeometry(1.06,0.035,6,32),glow,[0,-1.12,0],[Math.PI/2,0,0]);
      add(base,new THREE.RingGeometry(0.9,1.38,32),groundGlow,[0,-1.27,0],[-Math.PI/2,0,0]);
      batch(base);base.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
      group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
      templates[type]=group;
    });
    const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
    function create(type){
      if(!templates[type])throw new Error('Unknown pickup type');
      const group=templates[type].clone(true);
      group.userData.rotMesh=group.getObjectByName('rotating-model');
      return group;
    }
    function update(bonuses,time,dt){
      for(const b of bonuses){
        const g=b.group;
        g.position.y=b.baseY+(reducedMotion?0:Math.sin(time*1.8+g.position.x)*0.16);
        if(!reducedMotion)g.userData.rotMesh.rotation.y=(g.userData.rotMesh.rotation.y+dt*0.65)%(Math.PI*2);
      }
    }
    return {create,update,data,types,geometries,materials};
  };
})();
