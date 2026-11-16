import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const ai=require('../src/ai/opponent-brain.js');
const race=require('../src/game/race-state.js');
const hud=require('../src/ui/hud-model.js');

assert.equal(typeof ai.selectOpponentCombatTarget,'function');
const target=(id,x,z,extra={})=>({id,position:{x,z},health:100,progress:.2,visible:true,...extra});
const options={selfId:0,origin:{x:0,z:0},forward:{x:0,z:1},range:145,minFacing:.1};
const pick=(candidates,extra={})=>ai.selectOpponentCombatTarget({...options,candidates,...extra});
assert.equal(pick([target(0,0,20),target(1,0,45)]),1,'exclude self');
assert.equal(pick([target('player',40,100),target(1,0,45)]),1,'player is not the only target');
assert.equal(pick([target(1,0,40,{visible:false}),target(2,0,60)]),2,'cover excludes target');
for(const extra of [{dead:true},{health:0},{invincible:true}])assert.equal(pick([target(1,0,40,extra)]),null);
assert.equal(pick([target(1,0,-40),target(2,0,200)]),null,'rear/distant targets excluded');
assert.equal(pick([target(1,0,50),target(2,0,50,{shieldTimer:3})]),1,'prefer exposed target');
assert.equal(pick([target(1,0,50),target(2,0,52)],{currentTargetId:2}),2,'stable target');
assert.equal(pick([target(1,0,50),target(2,0,52)],{lastAttackerId:2,lastAttackerTimer:4}),2,'short retaliation memory');
assert.equal(pick([target(1,0,50),target(2,0,50,{progress:.7})]),2,'leader is valuable');

const attack={combat:true,origin:{x:0,z:0},target:{x:0,z:65},targetVelocity:{x:10,z:0},forward:{x:0,z:1},
  difficulty:{attackRange:145,minFacing:.1,aimSpread:0,attackDelay:1},lineOfSight:true,
  targetDead:false,targetInvincible:false,targetShieldTimer:0,targetHealth:100,
  rockets:0,gunAmmo:10,projectileCount:0,maxProjectiles:80,burstRemaining:0};
const fire=(extra={},random=()=>.2)=>ai.planOpponentAttack({...attack,...extra},random);
const first=fire();assert.equal(first.kind,'bullet');assert.equal(first.burstRemaining,2);assert.ok(first.cooldown<.3);
const second=fire({burstRemaining:first.burstRemaining});assert.equal(second.burstRemaining,1);
const third=fire({burstRemaining:second.burstRemaining});assert.equal(third.burstRemaining,0);assert.ok(third.cooldown>1);
assert.ok(first.shotX>0,'moving target lead');
for(const extra of [{lineOfSight:false},{targetDead:true},{targetInvincible:true},{gunAmmo:0},{projectileCount:80}]){
  assert.equal(fire(extra).kind,'none','no waste '+JSON.stringify(extra));
}
assert.equal(fire({rockets:3,targetShieldTimer:2}).kind,'bullet','reserve rocket against shield');
assert.equal(fire({rockets:3,targetShieldTimer:2,gunAmmo:0}).kind,'none');
assert.equal(fire({rockets:3}).kind,'rocket');
assert.equal(fire({rockets:3,target:{x:0,z:20}}).kind,'bullet','no close-range rocket');

const grid=race.createRaceGrid(4900,40,6);
assert.equal(grid.length,7);assert.equal(grid[0].t,0);
for(let i=0;i<grid.length;i++){
  assert.ok(Number.isFinite(grid[i].t)&&Math.abs(grid[i].offset)<=24.8);
  for(let j=0;j<i;j++)assert.ok(Math.hypot((grid[i].t-grid[j].t)*4900,grid[i].offset-grid[j].offset)>=12,'grid spacing');
}
assert.deepEqual(Array.from({length:6},(_,id)=>ai.planOpponentTactics({id},{roadHalf:40,totalLength:4900},0).personality),
  ['racer','aggressor','tactician','racer','aggressor','tactician']);
const positions=hud.buildRacePositions({lap:1,prevT:.1},Array.from({length:6},(_,id)=>({lap:1,t:.2+id*.01})));
assert.equal(positions.length,7);assert.equal(positions.findIndex(p=>p.who==='player'),6);
console.log('CYBER RACE all-racer target selection, bursts, shield/cover and seven-car grid passed.');

// Real runtime damage/destruction/projectile owners; all boundaries are synthetic.
const source=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
function extract(name){
  const start=source.indexOf('    function '+name+'('),close=source.indexOf('\n    }',start);
  assert.ok(start>=0&&close>start,name);return source.slice(start,close+6);
}
const geometry=require('../src/weapons/geometry.js');
class Vector{
  constructor(x=0,y=0,z=0){this.set(x,y,z);}
  set(x,y,z){Object.assign(this,{x,y,z});return this;}
  setY(y){this.y=y;return this;}
  copy(v){return this.set(v.x,v.y,v.z);}
  clone(){return new Vector(this.x,this.y,this.z);}
  add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
  sub(v){return this.addScaledVector(v,-1);}
  addScaledVector(v,n){this.x+=v.x*n;this.y+=v.y*n;this.z+=v.z*n;return this;}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
}
function harness(){
  const calls={marker:0,impact:0,world:0,removed:0,explosion:0};
  const bot=(id,x,z=0)=>({id,health:100,shieldTimer:0,invincibleTimer:0,t:.2,lap:1,
    car:{group:{position:new Vector(x,1,z),visible:true}},healthPlane:{visible:true}});
  const shooter=bot(0,-10),victim=bot(1,0),third=bot(2,30);
  const player={pos:new Vector(100,1,100),invincibleTimer:0,destroyed:false,health:100,score:0,kills:0,combo:0,comboTimer:0};
  const context={...geometry,player,opponents:[shooter,victim,third],projectiles:[],canControl:()=>true,
    gameFinished:false,incomingThreat:Infinity,THREE:{Vector3:Vector,MathUtils:{clamp:(n,a,b)=>Math.max(a,Math.min(b,n))}},
    CONFIG:{MAX_PROJECTILES:80,ROCKET_HIT_RADIUS:6.2,BULLET_HIT_RADIUS:4.2,WORLD_SIZE:2000},
    projectileTargetPos:new Vector(),projectileTargetVel:new Vector(),projectileLookPoint:new Vector(),
    getTargetPosition:t=>t===player?player.pos:t.car.group.position,getTargetVelocity:()=>new Vector(),
    targetSurface(p,t){return {pos:(t===player?player.pos:t.car.group.position).clone(),normal:new Vector(1,0,0)};},
    stepHomingProjectile:()=>({distance:7,velocity:{x:100,y:0,z:0},position:{x:0,y:1,z:0},noProgress:0}),
    obstacleIndex:geometry.createObstacleIndex([]),
    scene:{remove(){calls.removed++;}},rocketPools:{},bulletPools:{},
    combatEffects:{createTrail:()=>({}),moveTrail(){},detachTrail(){},explosion(){calls.explosion++;}},
    spawnImpactEffect(){calls.impact++;},hitScenery(){calls.world++;},showHitMarker(){calls.marker++;},
    applyPlayerDamage(n){player.health-=n;},respawnPlayer(){},spawnShockwave(){},addCameraShake(){},spawnBonusAt(){},
    audio:{play(){}},comboDisplayEl:{classList:{toggle(){}},textContent:''},incomingWarningEl:{classList:{toggle(){}},dataset:{},textContent:''},
    Math:Object.assign(Object.create(Math),{random:()=>.99})};
  vm.createContext(context);
  vm.runInContext(['soundAt','hitVehicle','destroyOpponent','removeProjectileAt','findProjectileVehicle','updateProjectiles'].map(extract).join('\n'),context);
  const shot=(extra={})=>({mesh:{position:new Vector(-10,1,0),userData:{},lookAt(){}},vel:new Vector(100,0,0),
    life:2,damage:10,owner:'opponent',ownerRef:shooter,sharedResources:true,isRocket:false,...extra});
  return {c:context,calls,shooter,victim,third,player,shot};
}
{
  const h=harness();h.c.projectiles.push(h.shot());h.c.updateProjectiles(.1);
  assert.equal(h.shooter.health,100,'self excluded');assert.equal(h.victim.health,90,'bot bullet damages bot');
  assert.equal(h.victim.lastAttackerId,0);assert.equal(h.calls.marker,0);assert.equal(h.player.score,0);
  assert.equal(h.c.projectiles.length,0);h.c.updateProjectiles(.1);assert.equal(h.victim.health,90,'one hit only');
}
{
  const h=harness();h.victim.shieldTimer=2;h.c.projectiles.push(h.shot());h.c.updateProjectiles(.1);
  assert.equal(h.victim.health,96.5,'shield applies to bot-bot hit');
}
{
  const h=harness();h.c.obstacleIndex=geometry.createObstacleIndex([{x:-6,y:1,z:0,w:.2,h:3,d:8}]);
  h.c.projectiles.push(h.shot());h.c.updateProjectiles(.1);assert.equal(h.victim.health,100);assert.equal(h.calls.world,1);
}
for(const rocket of [false,true]){
  const h=harness();h.victim.health=5;
  h.c.projectiles.push(h.shot({isRocket:rocket,target:rocket?h.victim:null}));h.c.updateProjectiles(.1);
  assert.equal(h.victim.dead,true);assert.equal(h.player.score,0);assert.equal(h.player.kills,0);
  assert.equal(h.calls.explosion,1);h.c.destroyOpponent(h.victim,false,h.player);assert.equal(h.player.score,0,'no double kill');
}
{
  const h=harness();h.victim.health=5;h.shooter.car.group.position.set(-10,1,40);
  h.c.projectiles.push(h.shot({owner:'player',ownerRef:h.player}));h.c.updateProjectiles(.1);
  assert.equal(h.player.kills,1);assert.equal(h.player.score,100);assert.equal(h.calls.marker,1);
}
{
  const h=harness();h.victim.invincibleTimer=1;
  h.c.projectiles.push(h.shot());h.c.updateProjectiles(.1);assert.equal(h.victim.health,100,'respawn immunity');
}
{
  const h=harness();h.third.car.group.position.set(-3,1,0);
  h.c.projectiles.push(h.shot({isRocket:true,target:h.victim}));h.c.updateProjectiles(.1);
  assert.equal(h.third.health,90,'nearby car intercepts rocket');assert.equal(h.victim.health,100);
}
{
  const h=harness();h.victim.health=5;
  h.c.projectiles.push(h.shot({ownerRef:h.victim,mesh:{position:new Vector(0,1,30),userData:{},lookAt(){}}}));
  h.c.projectiles.push(h.shot());h.c.updateProjectiles(.1);
  assert.equal(h.c.projectiles.length,0,'shooter death expires its shots without corrupting iteration');
  assert.equal(h.calls.removed,2);assert.equal(h.calls.explosion,1);
}
console.log('CYBER RACE actual runtime all-racer hits, cover, shield, kill credit, immunity and projectile cleanup passed.');
