(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const game=root.game??=(Object.create(null));
  // Only direct, fixed mesh children. Animated groups/lights stay independent.
  game.mergeModelMeshes=function mergeModelMeshes(THREE,parent){
    const batches=new Map();
    for(const m of [...parent.children]){
      if(!m.isMesh)continue;
      m.updateMatrix();
      const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
      g.applyMatrix4(m.matrix);
      if(!batches.has(m.material))batches.set(m.material,{position:[],normal:[],uv:[]});
      const b=batches.get(m.material);
      for(const name of ['position','normal','uv']){
        const a=g.getAttribute(name);
        if(a)for(const value of a.array)b[name].push(value);
      }
      g.dispose();m.geometry.dispose();parent.remove(m);
    }
    for(const [material,a] of batches){
      const g=new THREE.BufferGeometry();
      for(const name of ['position','normal','uv'])if(a[name].length)g.setAttribute(name,new THREE.Float32BufferAttribute(a[name],name==='uv'?2:3));
      g.computeBoundingSphere();
      const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);
    }
  };
})();
