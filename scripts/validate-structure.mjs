import {existsSync,readFileSync} from 'node:fs';

const fail=message=>{console.error('VALIDATION ERROR:',message);process.exitCode=1;};
const required=[
  'src/core/three-loader.js','src/core/storage.js','src/core/seeded-rng.js',
  'src/game/config.js','src/game/race-state.js','src/game/track-environment.js','src/game/runtime.js',
  'src/ai/difficulty.js','src/ai/opponent-brain.js',
  'src/weapons/geometry.js','src/weapons/ballistics.js',
  'src/audio/audio-system.js',
  'src/ui/elements.js','src/ui/hud-model.js','src/ui/minimap.js',
  'tests/contracts.mjs','tests/scenarios.mjs','tests/fixtures/cyber-replay.json',
  'docs/ARCHITECTURE.md','CHANGELOG.md'
];
for(const file of required)if(!existsSync(file))fail('missing '+file);

const html=readFileSync('index.html','utf8');
const orderedScripts=[
  'src/core/three-loader.js','src/core/storage.js','src/core/seeded-rng.js',
  'src/game/config.js','src/game/race-state.js','src/game/track-environment.js',
  'src/ai/difficulty.js','src/ai/opponent-brain.js',
  'src/weapons/geometry.js','src/weapons/ballistics.js',
  'src/audio/audio-system.js',
  'src/ui/elements.js','src/ui/hud-model.js','src/ui/minimap.js',
  'src/game/runtime.js'
];
let last=-1;
for(const file of orderedScripts){
  const at=html.indexOf('src="'+file+'"');
  if(at<0)fail('index does not load '+file);
  if(at<=last)fail('script order is incorrect at '+file);
  last=at;
}

const runtime=readFileSync('src/game/runtime.js','utf8');
for(const token of [
  'stepOpponentFrame','planOpponentAttack','stepHomingProjectile','createTrackEnvironment',
  'resolveLapCompletion','createMinimap','buildRacePositions',"dataset.cyberBoot='ready'"
]){
  if(!runtime.includes(token))fail('runtime integration missing: '+token);
}
for(const legacy of [
  'const progressGap=playerProgress-botProgress',
  'const leadTime=estimateLeadTime(distance,speed,0.55)',
  'const blend=homingBlend(p.turnSpeed||4,dt)',
  'o.laneChangeTimer-=dt',
  'class Minimap'
]){
  if(runtime.includes(legacy))fail('legacy simulation logic returned to runtime: '+legacy);
}

const ai=readFileSync('src/ai/opponent-brain.js','utf8');
for(const token of ['stepOpponentFrame','planOpponentAttack','computeOpponentSpeed','computeLeadShot2D']){
  if(!ai.includes(token))fail('opponent simulation module incomplete: '+token);
}
const ballistics=readFileSync('src/weapons/ballistics.js','utf8');
for(const token of ['stepHomingProjectile','selectRocketTarget','updateRocketProgress']){
  if(!ballistics.includes(token))fail('ballistics simulation module incomplete: '+token);
}
const rng=readFileSync('src/core/seeded-rng.js','utf8');
if(!rng.includes('createSeededRng')||!rng.includes('Math.imul'))fail('deterministic RNG module incomplete');

const replay=JSON.parse(readFileSync('tests/fixtures/cyber-replay.json','utf8'));
if(replay.version!==1||!replay.opponent||!replay.attack||!replay.rocket)fail('replay fixture schema incomplete');

if(!process.exitCode)console.log('CYBER RACE deterministic simulation architecture validation passed.');
