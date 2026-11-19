import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
{
  const threeSource=readFileSync(new URL('../vendor/three/three.module.js',import.meta.url));
  const THREE=await import('data:text/javascript;base64,'+threeSource.toString('base64'));
  require('../src/game/combat-effects.js');
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera();
  const ctx={createRadialGradient:()=>({addColorStop(){}}),fillRect(){},putImageData(){},
    getImageData:()=>({data:new Uint8ClampedArray(128*128*4)})};
  const effects=globalThis.CyberRace.game.createCombatEffects({THREE,scene,camera,
    document:{createElement:()=>({getContext:()=>ctx})}});
  const group=new THREE.Group();
  scene.add(group);
  const car={group,exhaustOutlets:[new THREE.Vector3(-.64,.398,2.35),new THREE.Vector3(.64,.398,2.35)],
    wheels:[-1,1].map(x=>{
      const wheel=new THREE.Group();
      wheel.position.set(x,.38,1.4);group.add(wheel);
      return {group:wheel,isFront:false};
    })};
  const state={nitro:true,drifting:true,speed:60,speedLat:9,isAsphalt:point=>point.x<0};
  const dt=1/60;
  const drive=()=>{effects.updateDriving(car,state,dt);effects.update(dt);};
  assert.equal(typeof effects.updateDriving,'function','driving effects must consume the live vehicle pose');
  drive();
  const jets=car.exhaustOutlets.map(outlet=>group.children.find(node=>node.isMesh&&node.position.equals(outlet)));
  assert.ok(jets.every(jet=>jet?.visible),'both flames must start at the outlets');
  group.scale.set(1.82,1.8,1.98);
  group.rotation.y=.18;
  group.position.z=-5;
  drive();
  for(const [i,jet] of jets.entries()){
    assert.ok(jet.getWorldPosition(new THREE.Vector3()).distanceTo(group.localToWorld(car.exhaustOutlets[i].clone()))<1e-6,
      'moving and scaling the vehicle must carry the flame base with it');
  }
  const smoke=scene.children.find(node=>node.name==='Tire smoke');
  assert.ok(smoke.geometry.instanceCount>=2,'each slipping rear tire emits particles');
  const tint=smoke.geometry.attributes.tint;
  const types=new Set(Array.from({length:smoke.geometry.instanceCount},(_,i)=>tint.getX(i)>tint.getZ(i)?'dust':'smoke'));
  assert.deepEqual(types,new Set(['smoke','dust']),'one tire on the shoulder emits dust while the other emits smoke');
  const marks=scene.children.find(node=>node.name==='Tire marks');
  assert.ok(marks.geometry.drawRange.count>0);
  for(let i=0;i<marks.geometry.instanceCount;i++){
    assert.ok(marks.geometry.attributes.markStart.getX(i)<0&&marks.geometry.attributes.markEnd.getX(i)<0,
      'rubber marks stay on the asphalt side of the test road');
  }
  const emitted=smoke.geometry.instanceCount;
  effects.resetDriving();
  group.position.z=-400;
  state.nitro=false;
  drive();
  assert.equal(smoke.geometry.instanceCount,emitted,'reset discards the path across a respawn');
  assert.ok(jets.every(jet=>!jet.visible),'reset hides the flame');
  effects.clear();
  assert.equal(smoke.geometry.instanceCount,0);
  assert.equal(marks.geometry.drawRange.count,0);
  console.log('DRIVING_VFX PASS moving flames, split road surfaces, world-space marks, reset');
}
const {segmentSphereEntry3D,segmentBoxHit3D,createObstacleIndex}=require('../src/weapons/geometry.js');
const point=(x,y,z)=>({x,y,z});
const box={x:0,y:1,z:0,w:2,h:2,d:4,rotation:0,surface:'metal'};
let hit=segmentBoxHit3D(point(-5,1,0),point(5,1,0),box);
assert.equal(hit.t,0.4);assert.deepEqual(hit.normal,point(-1,0,0));
assert.equal(segmentBoxHit3D(point(-5,4,0),point(5,4,0),box),null);
assert.equal(segmentBoxHit3D(point(0,1,0),point(0,1,0),box).t,0);
assert.equal(segmentBoxHit3D(point(5,1,0),point(5,1,0),box),null);
hit=segmentBoxHit3D(point(-5,1,0),point(5,1,0),{...box,rotation:Math.PI/2});
assert.ok(Math.abs(hit.t-0.3)<1e-9);
assert.equal(segmentSphereEntry3D(point(-10,0,0),point(10,0,0),point(0,0,0),2),0.4);
assert.equal(segmentSphereEntry3D(point(0,0,0),point(10,0,0),point(0,0,0),2),0);
assert.equal(segmentSphereEntry3D(point(-10,5,0),point(10,5,0),point(0,0,0),2),null);
const obstacle={x:-3,y:1.5,z:0,w:0.2,h:3,d:8,rotation:0,surface:'metal'};
const index=createObstacleIndex([obstacle]);
const from=point(-10,1.5,0),to=point(0,1.5,0);
const broad=segmentSphereEntry3D(from,to,point(0,0,0),4.2),wall=index.hit(from,to);
assert.ok(broad<wall.t,'fixture must distinguish broad sphere entry from physical cover');
assert.ok(index.hit(from,point(-1.805,1.5,0)),'cover must be checked to the actual body surface');
assert.equal(index.hit(point(8,2,8),point(8,-2,8)).surface,'ground');
assert.equal(index.hit(point(8,2,8),point(8,2,10)),null);
// Index must return the same earliest collision as exhaustive slab tests,
// including rotated large boxes spanning several grid cells and negative space.
let seed=17;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const boxes=Array.from({length:80},()=>({x:(random()-0.5)*700,y:3,z:(random()-0.5)*700,w:2+random()*70,h:6,d:2+random()*50,rotation:random()*6,surface:'stone'}));
const spatial=createObstacleIndex(boxes);
for(let i=0;i<1000;i++){
 const a=point((random()-0.5)*900,1+random()*4,(random()-0.5)*900),b=point(a.x+(random()-0.5)*180,a.y,a.z+(random()-0.5)*180);
 const exact=boxes.map(box=>segmentBoxHit3D(a,b,box)).filter(Boolean).sort((a,b)=>a.t-b.t)[0];
 const indexed=spatial.hit(a,b);assert.equal(Boolean(indexed),Boolean(exact));if(exact)assert.ok(Math.abs(indexed.t-exact.t)<1e-8);
}
console.log('CYBER RACE combat collision contracts passed (1000 indexed/exhaustive paths).');

// Execute the actual runtime owner functions in an isolated synthetic context.
// The simplified car fixture is unrotated; real transforms/rendering need browser checks.
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
const geometry=require('../src/weapons/geometry.js');

function extract(name){
  const start=source.indexOf('    function '+name+'(');
  assert.ok(start>=0,'missing runtime function '+name);
  // Runtime's top-level functions close at exactly four-space indentation.
  const close=source.indexOf('\n    }',start);
  assert.ok(close>start,'missing function terminator '+name);
  return source.slice(start,close+6);
}
const ownerCode=['targetSurface','hitVehicle','removeProjectileAt','findProjectileVehicle','updateProjectiles'].map(extract).join('\n');
class Vector {
  constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
  clone(){return new Vector(this.x,this.y,this.z);}
  copy(v){return this.set(v.x,v.y,v.z);}
  set(x,y,z){Object.assign(this,{x,y,z});return this;}
  setY(y){this.y=y;return this;}
  addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
  sub(v){return this.addScaledVector(v,-1);}
  lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  normalize(){const n=Math.sqrt(this.lengthSq())||1;return this.set(this.x/n,this.y/n,this.z/n);}
  negate(){return this.set(-this.x,-this.y,-this.z);}
  transformDirection(){return this.normalize();} // Fixture has no car rotation.
  distanceTo(v){return Math.sqrt(this.clone().sub(v).lengthSq());}
}
function run({wallX=null,shield=false,rocket=false,mutation=null}={}){
  const group={
    position:new Vector(0,.02,0),matrixWorld:{},updateWorldMatrix(){},
    worldToLocal(v){return v.sub(this.position).set(v.x/1.9,v.y/1.9,v.z/1.9);},
    localToWorld(v){return v.set(v.x*1.9,v.y*1.9+.02,v.z*1.9);}
  };
  const target={health:100,shieldTimer:shield?1:0,car:{group}};
  const projectiles=[{
    mesh:{position:new Vector(-10,1.5,0),userData:{},lookAt(){}},
    vel:new Vector(100,0,0),life:2,damage:10,owner:'player',sharedResources:true,
    isRocket:rocket,target:rocket?target:null
  }];
  const calls={removed:0,world:0,impact:0};
  const context={
    ...geometry,THREE:{Vector3:Vector},
    player:{pos:new Vector(100,0,100),invincibleTimer:0,destroyed:false},
    playerCar:null,opponents:[target],projectiles,
    CONFIG:{MAX_PROJECTILES:80,ROCKET_HIT_RADIUS:6.2,BULLET_HIT_RADIUS:4.2,WORLD_SIZE:2000},
    canControl:()=>true,gameFinished:false,incomingThreat:Infinity,
    projectileTargetPos:new Vector(),projectileTargetVel:new Vector(),projectileLookPoint:new Vector(),
    getTargetPosition:()=>group.position,getTargetVelocity:()=>new Vector(),
    stepHomingProjectile:()=>({distance:7,velocity:{x:100,y:0,z:0},position:{x:0,y:1.5,z:0},noProgress:0}),
    obstacleIndex:geometry.createObstacleIndex(wallX===null?[]:[{x:wallX,y:1.5,z:0,w:.2,h:4,d:8}]),
    combatEffects:{createTrail:()=>({}),moveTrail(){},detachTrail(){}},
    scene:{remove(){calls.removed++;}},rocketPools:{},bulletPools:{},
    spawnImpactEffect:()=>calls.impact++,hitScenery:()=>calls.world++,
    showHitMarker(){},destroyOpponent(){},incomingWarningEl:{classList:{toggle(){}},dataset:{},textContent:''}
  };
  let code=ownerCode;
  if(mutation==='cover'){
    const needle='const surface=targetSurface(p,vehicle),obstruction=obstacleIndex.hit(previous,surface.pos);';
    assert.equal(code.split(needle).length,2,'cover mutation must replace exactly one actual owner guard');
    code=code.replace(needle,'const surface=targetSurface(p,vehicle),obstruction=null;');
  }else if(mutation==='shield-origin'){
    const needle='(projectile.impactFrom||projectile.mesh.position)';
    assert.equal(code.split(needle).length,2,'shield mutation must replace exactly one actual owner expression');
    code=code.replace(needle,'projectile.mesh.position');
  }
  vm.createContext(context);
  vm.runInContext(code+'\nupdateProjectiles(0.1);',context,{timeout:1000});
  return {health:target.health,left:projectiles.length,...calls};
}
// Independent constants: 10 damage; shield multiplier .35; cover prevents all damage.
for(const [name,fixture,expected] of [
  ['wall before body',{wallX:-3},{health:100,left:0,removed:1,world:1,impact:0}],
  ['wall after body',{wallX:-.5},{health:90,left:0,removed:1,world:0,impact:1}],
  ['shield without wall',{shield:true},{health:96.5,left:0,removed:1,world:0,impact:1}],
  ['proximity rocket wall',{wallX:-3,rocket:true},{health:100,left:0,removed:1,world:1,impact:0}]
]){
  assert.deepEqual(run(fixture),expected,name);
  console.log(name+' PASS');
}
assert.deepEqual(run({wallX:-3,mutation:'cover'}),{health:90,left:0,removed:1,world:0,impact:1},'known-bad cover guard must reproduce false damage');
assert.deepEqual(run({shield:true,mutation:'shield-origin'}),{health:100,left:0,removed:1,world:1,impact:0},'known-bad shield origin must reproduce false ground obstruction');
console.log('PASS: four extracted runtime paths; both in-memory regression mutations detected.');

// Postprocessing must preserve geometry antialiasing. Synthetic GPU capabilities
// exercise format compatibility and fallback; actual edge coverage needs WebGL.
const rendererSource=fs.readFileSync(new URL('../src/game/combat-effects.js',import.meta.url),'utf8');
const rendererModule={};vm.runInNewContext(rendererSource,rendererModule);
function rendererFixture({webgl2=true,hdr=true,color=[8,4,2,1],depth=[8,4,2,1]}={}){
  const targets=[],calls=[],queries=[];
  class Target{
    constructor(w,h,options){this.width=w;this.height=h;this.samples=0;this.texture={};Object.assign(this,options);targets.push(this);}
    setSize(w,h){this.width=w;this.height=h;}
  }
  class Vector{set(x,y){this.x=x;this.y=y;return this;}}
  class Scene{add(){}}
  class Material{constructor(options){Object.assign(this,options);}}
  class Mesh{constructor(geometry,material){this.material=material;}}
  const THREE={WebGLRenderTarget:Target,HalfFloatType:'half-float',Scene,OrthographicCamera:class{},ShaderMaterial:Material,Vector2:Vector,Mesh,PlaneGeometry:class{}};
  const gl={RENDERBUFFER:1,RGBA16F:2,DEPTH_COMPONENT24:3,SAMPLES:4,
    getInternalformatParameter(target,format,param){assert.equal(target,1);assert.equal(param,4);queries.push(format);return new Int32Array(format===2?color:depth);}};
  const state={target:{name:'caller-target'},width:1280,height:720,fail:false};
  const renderer={capabilities:{isWebGL2:webgl2,maxSamples:8},extensions:{has:()=>hdr},
    getContext(){assert.ok(webgl2&&hdr,'unsupported HDR must not query multisampling');return gl;},
    getDrawingBufferSize:out=>out.set(state.width,state.height),getRenderTarget:()=>state.target,
    setRenderTarget:target=>{state.target=target;},render(world,view){calls.push({target:state.target,world,view});if(state.fail)throw Error('synthetic render failure');}};
  return {api:rendererModule.CyberRace.game.createCombatRenderer({THREE,renderer}),targets,calls,queries,state};
}
for(const [options,expectedSamples] of [[{},4],[{color:[2,1]},2],[{depth:[2,1]},2]]){
  const f=rendererFixture(options),caller=f.state.target,world={},view={};
  f.api.setQuality('high');f.api.render(world,view);
  assert.equal(f.targets[0].samples,expectedSamples,'world HDR target must use supported MSAA');
  assert.equal(f.targets[0].depthBuffer,true);
  assert.ok(f.targets.slice(1).every(t=>t.samples===0&&!t.depthBuffer),'blur targets need neither depth nor MSAA');
  assert.equal(f.calls.length,4);assert.equal(f.calls[0].target,f.targets[0]);assert.equal(f.calls[3].target,caller);assert.equal(f.state.target,caller);
  f.state.width=801;f.state.height=601;f.api.render(world,view);
  assert.deepEqual(f.targets.map(t=>[t.width,t.height]),[[801,601],[200,150],[200,150]]);
  assert.equal(f.targets[0].samples,expectedSamples,'resize must retain MSAA');
  f.api.setQuality('low');f.calls.length=0;f.api.render(world,view);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].target,caller);
  f.api.setQuality('high');f.calls.length=0;f.api.render(world,view);
  assert.equal(f.calls.length,4);assert.equal(f.targets.length,3,'quality toggles reuse targets');
  f.state.fail=true;assert.throws(()=>f.api.render(world,view),/synthetic render failure/);assert.equal(f.state.target,caller,'failure must restore caller target');
}
for(const options of [{webgl2:false},{hdr:false},{color:[1]},{depth:[1]},{color:[4],depth:[2]}]){
  const f=rendererFixture(options),caller=f.state.target,world={},view={};
  f.api.setQuality('high');f.api.render(world,view);
  assert.equal(f.api.stats().enabled,false,'incompatible MSAA must use direct rendering');
  assert.equal(f.targets.length,0,'fallback must not allocate unusable HDR targets');
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].target,caller);assert.equal(f.calls[0].world,world);assert.equal(f.calls[0].view,view);
}
console.log('PASS: HDR MSAA 4x/2x, format intersection, direct fallback, resize, quality toggles and failure restoration.');
