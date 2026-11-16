import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const {createPilotTutorial}=require('../src/game/pilot-tutorial.js');
const t=createPilotTutorial();
const display=(now=0,mode='keyboard',other={})=>t.view({active:true,now,mode,ammo:80,nitro:3,...other});

// First session: only actual driving with throttle + real speed unlocks shooting.
t.start({enabled:true,done:false});
assert.equal(t.state().stage,0);
assert.equal(display().key,'W / ↑');
assert.equal(t.observeDrive({throttle:0,speed:50},0.5),null,'momentum without throttle is not a driving action');
assert.equal(t.observeDrive({throttle:1,speed:11.9},0.6),null,'throttle alone without moving is insufficient');
assert.equal(t.action('gun',0.7),null,'early gun use must not complete a later step');
assert.equal(t.action('nitro',0.8),null,'early nitro use must not complete a later step');
assert.equal(t.observeDrive({throttle:0.6,speed:12},1),'advanced');
assert.equal(t.state().stage,1);
assert.equal(display(1,'touch').key,'ПУЛИ');
assert.match(display(1,'gamepad').key,/X/);
assert.match(display(1,'keyboard',{ammo:0}).detail,/Патроны закончились/);
assert.equal(t.action('gun',2),'advanced');
assert.equal(t.state().stage,2);
assert.equal(display(2,'touch').key,'НИТРО');
assert.equal(display(2,'gamepad').key,'A');
assert.match(display(2,'keyboard',{nitro:0}).detail,/Нужен заряд нитро/);
assert.equal(t.action('rocket',2.5),null);
assert.equal(t.action('nitro',3),'completed');
assert.equal(t.state().stage,-1);
assert.equal(display(3).kind,'complete');
assert.equal(display(5.8).kind,'complete');
assert.equal(t.view({active:false,now:3}),null,'pause hides hints without advancing simulated time');
assert.equal(display(6),null,'completion fades after three game seconds');
assert.equal(t.action('nitro',7),null,'completed tutorial is idempotent');
assert.equal(t.skip(),false,'cannot skip an already completed tutorial');

// Persisted completion: next race stays quiet; Replay explicitly re-arms.
t.start({enabled:true,done:true,shieldSeen:false});
assert.equal(display(0),null);
t.start({enabled:true,done:false,shieldSeen:false});
assert.equal(t.state().stage,0);
assert.equal(t.skip(),true);
assert.equal(display(0),null);
t.start({enabled:true,done:true,shieldSeen:true});
assert.equal(t.noticeThreat({active:true,near:true,canPulse:true,now:1}),false);

// The first approaching missile offers a one-shot, contextual shield hint.
t.start({enabled:true,done:true,shieldSeen:false});
assert.equal(t.noticeThreat({active:false,near:true,canPulse:true,now:0}),false);
assert.equal(t.noticeThreat({active:true,near:false,canPulse:true,now:0}),false);
assert.equal(t.noticeThreat({active:true,near:true,canPulse:false,now:0}),false);
assert.equal(t.noticeThreat({active:true,near:true,canPulse:true,now:10}),true);
assert.equal(t.noticeThreat({active:true,near:true,canPulse:true,now:11}),false);
assert.equal(display(11,'keyboard').kind,'threat');
assert.equal(display(11,'gamepad').key,'B');
assert.equal(t.view({active:false,now:11}),null);
assert.equal(display(14.9).kind,'threat','time held during pause cannot expire the hint');
assert.equal(display(15),null);
t.start({enabled:true,done:true,shieldSeen:false});
assert.equal(t.noticeThreat({active:true,near:true,canPulse:true,now:2}),true);
assert.equal(t.action('pulse',2.2),null);
assert.equal(display(2.2),null,'using the real impulse dismisses the threat tip');
t.start({enabled:true,done:false,shieldSeen:false});
assert.equal(t.noticeThreat({active:true,near:true,canPulse:true,now:2}),true);
t.action('pulse',2.3);
assert.equal(display(2.3).kind,'step','pulse must not advance ordinary tutorial stages');

// Disabling is immediate and preserves a pending tutorial for explicit reenable.
t.configure(false);
assert.equal(display(2.3),null);
assert.equal(t.observeDrive({throttle:1,speed:30},2.3),null);
t.configure(true);
assert.equal(t.state().stage,0);
assert.equal(t.observeDrive({throttle:Infinity,speed:30},3),null);
assert.equal(t.observeDrive({throttle:1,speed:NaN},3),null);
assert.equal(display(3,'unknown').key,'W / ↑');

// Contract / integration guards: the same module and existing settings namespace.
require('../src/game/config.js');
assert.equal(globalThis.CyberRace.game.SETTINGS_DEFAULTS.tutorialEnabled,true);
assert.equal(globalThis.CyberRace.game.SETTINGS_DEFAULTS.tutorialDone,false);
const runtime=readFileSync(new URL('../src/game/runtime.js',import.meta.url),'utf8');
for(const token of ["advancePilotTutorial('gun')","advancePilotTutorial('nitro')","advancePilotTutorial('pulse')",
  'pilotTutorial.observeDrive','pilotTutorial.noticeThreat','renderPilotTutorial()',
  'settings.tutorialDone=true;saveSettings()']){
  assert.ok(runtime.includes(token),'runtime action binding is missing: '+token);
}
console.log('PILOT_TUTORIAL_PASS drive, gun, nitro, threat, pause, replay, skip, persistence, controls and integration');
