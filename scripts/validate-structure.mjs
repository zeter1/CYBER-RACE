import {existsSync,readFileSync} from 'node:fs';

const fail=message=>{console.error('VALIDATION ERROR:',message);process.exitCode=1;};
const required=[
  'src/core/three-loader.js','src/core/storage.js',
  'src/game/config.js','src/game/race-state.js','src/game/track-environment.js','src/game/runtime.js',
  'src/ai/difficulty.js','src/ai/opponent-brain.js',
  'src/weapons/geometry.js','src/weapons/ballistics.js',
  'src/audio/audio-system.js',
  'src/ui/elements.js','src/ui/hud-model.js','src/ui/minimap.js',
  'tests/contracts.mjs','docs/ARCHITECTURE.md','CHANGELOG.md'
];
for(const file of required)if(!existsSync(file))fail('missing '+file);

const html=readFileSync('index.html','utf8');
const orderedScripts=[
  'src/core/three-loader.js','src/core/storage.js',
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
for(const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)){
  if(match[1].trim().length>120)fail('large inline script returned');
}

const runtime=readFileSync('src/game/runtime.js','utf8');
for(const token of [
  'createTrackEnvironment','resolveLapCompletion','chooseLaneTarget','computeOpponentSpeed',
  'opponentAttackGeometry','computeLeadShot2D','selectRocketTarget','estimateLeadTime',
  'homingBlend','updateRocketProgress','createMinimap','buildRacePositions','raceProgressPercent',
  "dataset.cyberBoot='ready'"
]){
  if(!runtime.includes(token))fail('runtime integration missing: '+token);
}
for(const legacy of [
  "const groundCanvas=document.createElement('canvas')",'function findClosest(x, z','class Minimap',
  'const progressGap=playerProgress-botProgress','const leadTime=THREE.MathUtils.clamp(distance/speed'
]){
  if(runtime.includes(legacy))fail('legacy subsystem logic returned to runtime: '+legacy);
}

const contracts=readFileSync('tests/contracts.mjs','utf8');
for(const token of ['findClosestSample','rubberBandMultiplier','segmentSphereHit3D','estimateLeadTime','buildRacePositions','resolveLapCompletion']){
  if(!contracts.includes(token))fail('contract coverage missing: '+token);
}

const track=readFileSync('src/game/track-environment.js','utf8');
if(!track.includes('createTrackEnvironment')||!track.includes('findClosestSample'))fail('track/environment module incomplete');
const ai=readFileSync('src/ai/opponent-brain.js','utf8');
if(!ai.includes('computeOpponentSpeed')||!ai.includes('computeLeadShot2D'))fail('opponent brain module incomplete');
const weapons=readFileSync('src/weapons/ballistics.js','utf8');
if(!weapons.includes('selectRocketTarget')||!weapons.includes('updateRocketProgress'))fail('ballistics module incomplete');
const ui=readFileSync('src/ui/minimap.js','utf8');
if(!ui.includes('createMinimap'))fail('minimap module incomplete');

if(!process.exitCode)console.log('CYBER RACE deep gameplay architecture validation passed.');
