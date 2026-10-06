import assert from 'node:assert/strict';
import {controlStats,velocityStats,analyzeNotePairs,peakMessageRate,clockStats,detectFloods} from '../midi-core.js';

const cc=Array.from({length:250000},(_,i)=>(i*17)%128);
const c=controlStats(cc);
assert.equal(c.count,250000);
assert.equal(c.min,0);
assert.equal(c.max,127);
assert.equal(c.unique,128);

const velocities=Array.from({length:100000},(_,i)=>1+(i%127));
const v=velocityStats(velocities);
assert.equal(v.count,100000);
assert.equal(v.min,1);
assert.equal(v.max,127);

const noteEvents=[];
for(let i=0;i<100000;i++){
  noteEvents.push({kind:'noteon',channel:1,a:36+(i%48),b:100,t:i*2});
  noteEvents.push({kind:'noteoff',channel:1,a:36+(i%48),b:0,t:i*2+1});
}
const pairs=analyzeNotePairs(noteEvents);
assert.equal(pairs.completed.length,100000);
assert.equal(pairs.stuck.length,0);

const timestamps=Array.from({length:100000},(_,i)=>i*0.1);
assert.ok(peakMessageRate(timestamps)>9000);

const tick=60000/180/24;
const clock=clockStats(Array.from({length:10000},(_,i)=>i*tick));
assert.ok(Math.abs(clock.bpm-180)<0.001);

const floods=detectFloods(Array.from({length:1000},(_,i)=>({kind:'cc',channel:1,a:7,value:64,t:i})),1000);
assert.ok(floods.some(f=>f.type==='identical-cc-spam'));
assert.ok(floods.some(f=>f.type==='high-message-rate'));

console.log('MIDItest browser-core stress tests: PASS');
