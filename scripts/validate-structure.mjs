import {existsSync,readFileSync} from 'node:fs';

const fail=message=>{console.error('VALIDATION ERROR:',message);process.exitCode=1;};
const required=[
  'src/core/three-loader.js','src/core/storage.js','src/game/config.js','src/game/runtime.js',
  'src/ai/difficulty.js','src/weapons/geometry.js','src/audio/audio-system.js','src/ui/elements.js',
  'docs/ARCHITECTURE.md','CHANGELOG.md'
];
for(const file of required)if(!existsSync(file))fail('missing '+file);

const html=readFileSync('index.html','utf8');
const orderedScripts=[
  'src/core/three-loader.js','src/core/storage.js','src/game/config.js','src/ai/difficulty.js',
  'src/weapons/geometry.js','src/audio/audio-system.js','src/ui/elements.js','src/game/runtime.js'
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
for(const token of ['CyberRace.core','CyberRace.game','CyberRace.ai','CyberRace.weapons','CyberRace.audio','CyberRace.ui',"dataset.cyberBoot='ready'","const segmentSphereHit=createSegmentSphereHit(THREE)"]){
  if(!runtime.includes(token))fail('runtime integration missing: '+token);
}
if(runtime.includes('class AudioSys'))fail('AudioSys returned to runtime');
if(runtime.includes('const CONFIG = {'))fail('CONFIG returned to runtime');
if(runtime.includes("document.getElementById('speed-val')"))fail('direct HUD lookup returned to runtime');

const loader=readFileSync('src/core/three-loader.js','utf8');
if(!loader.includes('cdn.jsdelivr.net')||!loader.includes('unpkg.com'))fail('Three.js fallback loader incomplete');

const config=readFileSync('src/game/config.js','utf8');
for(const token of ['TOTAL_LAPS:15','MAX_SPEED:52','PLAYER_ROCKET_SPEED:155','IDLE_RENDER_INTERVAL_MS:66'])if(!config.includes(token))fail('game config missing '+token);

const ai=readFileSync('src/ai/difficulty.js','utf8');
for(const token of ['easy:{','normal:{','hard:{','getDifficulty'])if(!ai.includes(token))fail('AI difficulty module missing '+token);

const weapons=readFileSync('src/weapons/geometry.js','utf8');
if(!weapons.includes('createSegmentSphereHit'))fail('weapon geometry helper missing');

const audio=readFileSync('src/audio/audio-system.js','utf8');
if(!audio.includes('class AudioSys')||!audio.includes("type==='rocket'"))fail('audio module incomplete');

if(!process.exitCode)console.log('CYBER RACE modular architecture validation passed.');
