import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {relativeThreatDirection,buildThreatIndicators,directionLabel}=require('../src/ui/threat-feedback.js');

const pos={x:0,z:0};
const points={front:{x:0,z:20},rear:{x:0,z:-20},left:{x:-20,z:0},right:{x:20,z:0}};
for(const [direction,source] of Object.entries(points)){
  assert.equal(relativeThreatDirection(pos,0,source),direction,'heading north: '+direction);
}
assert.equal(relativeThreatDirection(pos,Math.PI/2,{x:15,z:0}),'front','rotated forward');
assert.equal(relativeThreatDirection(pos,Math.PI/2,{x:0,z:-15}),'right','rotated right');
assert.equal(relativeThreatDirection(pos,Math.PI/2,{x:0,z:15}),'left','rotated left');
assert.equal(relativeThreatDirection(pos,0,{x:0,z:0}),null,'same position is not a direction');
assert.equal(relativeThreatDirection(pos,Infinity,{x:1,z:2}),null,'invalid heading ignored');
assert.equal(relativeThreatDirection(pos,0,{x:NaN,z:2}),null,'invalid coordinates ignored');

const input={player:pos,heading:0,now:5,active:true,
  damage:{source:points.left,until:5.7},rocket:{source:points.rear}};
assert.deepEqual(buildThreatIndicators(input),{damage:'left',rocket:'rear'},'two signals at different edges');
assert.deepEqual(buildThreatIndicators({...input,now:5.71}),{damage:null,rocket:'rear'},'damage expires on game clock');
assert.deepEqual(buildThreatIndicators({...input,now:5,active:false}),{damage:null,rocket:null},'pause/menus hide');
assert.deepEqual(buildThreatIndicators({...input,damage:{source:points.rear,until:6}}),{damage:'rear',rocket:'rear'},'both signals retain meaning');
assert.deepEqual(buildThreatIndicators({...input,rocket:null}),{damage:'left',rocket:null},'no rocket');
assert.deepEqual(buildThreatIndicators({...input,damage:{source:points.left,until:4}}),{damage:null,rocket:'rear'},'expired hit');
assert.equal(directionLabel('front'),'СПЕРЕДИ');
assert.equal(directionLabel('rear'),'СЗАДИ');
assert.equal(directionLabel('left'),'СЛЕВА');
assert.equal(directionLabel('right'),'СПРАВА');
assert.equal(directionLabel(null),'');
console.log('THREAT_FEEDBACK_PASS four directions, headings, pause, expiry, overlapping threats, labels');
