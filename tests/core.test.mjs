import assert from 'node:assert/strict';
import {
  noteName,decodeMessage,controlStats,pitchStats,clockBpm,classifyEncoder,messageRate,
  velocityStats,latencyStats,analyzeNotePairs,compareLoopback,detectFloods,deadZones,
  analyzeCcPairs,createParameterTracker,processParameterMessage,baselineDiff,
  chordName,channelStats,performanceStats
} from '../midi-core.js';

assert.equal(noteName(60),'C4');
assert.equal(noteName(0),'C-1');

const on=decodeMessage([0x90,60,100]);
assert.equal(on.kind,'noteon'); assert.equal(on.channel,1); assert.equal(on.note,60); assert.equal(on.velocity,100);
assert.equal(decodeMessage([0x90,60,0]).kind,'noteoff');
assert.equal(decodeMessage([0xE0,0,64]).value,0);
assert.equal(decodeMessage([0xF2,1,2]).kind,'songposition');
assert.equal(decodeMessage([0xF2,1,2]).value,257);
assert.equal(decodeMessage([0xF0,0x7D,1,0xF7]).kind,'sysex');

const c=controlStats([0,1,2,3,127]);
assert.equal(c.min,0); assert.equal(c.max,127); assert.equal(c.jumps,1);
assert.equal(controlStats([]).count,0);
assert.ok(controlStats([64,64,65,64,65]).jitter>0);
assert.deepEqual(deadZones([0,1,2,10,11,127],127,4),[[3,9],[12,126]]);

const p=pitchStats([-8192,0,8191,10,-10]);
assert.equal(p.min,-8192); assert.equal(p.max,8191); assert.equal(p.negativeTravel,8192); assert.equal(p.positiveTravel,8191);

const ticks=Array.from({length:48},(_,i)=>i*(60000/120/24));
assert.ok(Math.abs(clockBpm(ticks)-120)<0.01);
assert.equal(classifyEncoder(Array.from({length:32},(_,i)=>i)),'Absolute 0–127');
assert.match(classifyEncoder([1,1,127,1,127,127,1,127]),/relative/i);
assert.equal(messageRate([0,100,200,900],1000),4);

const vs=velocityStats([1,20,64,100,127]);
assert.equal(vs.min,1); assert.equal(vs.max,127); assert.equal(vs.median,64); assert.ok(vs.stdev>0);

const pairs=analyzeNotePairs([
  {kind:'noteon',channel:1,a:60,t:0},{kind:'noteoff',channel:1,a:60,t:100},
  {kind:'noteon',channel:1,a:61,t:200},{kind:'noteon',channel:1,a:61,t:210}
]);
assert.equal(pairs.completed.length,1);
assert.equal(pairs.duplicateOns,1);
assert.equal(pairs.stuck.length,1);

const lat=latencyStats([10,20,30,40]);
assert.equal(lat.min,10); assert.equal(lat.max,40); assert.equal(lat.median,25); assert.equal(lat.mean,25);

const loop=compareLoopback([[0x90,60,100],[0x80,60,0]],[[0x90,60,100],[0x80,60,1],[0xB0,1,2]]);
assert.equal(loop.sent,2); assert.equal(loop.received,3); assert.equal(loop.matched,1); assert.equal(loop.altered,1); assert.equal(loop.extra,1);

const floods=detectFloods([
  ...Array.from({length:30},(_,i)=>({kind:'cc',channel:1,a:7,value:64,t:i*10})),
  ...Array.from({length:10},(_,i)=>({kind:'active',t:500+i*10}))
],1000);
assert.ok(floods.some(x=>x.type==='identical-cc-spam'));

const cc14=analyzeCcPairs([
  {kind:'cc',channel:1,a:1,value:64,t:0},{kind:'cc',channel:1,a:33,value:1,t:1}
]);
assert.equal(cc14[0].value14,8193);

const tracker=createParameterTracker();
processParameterMessage(tracker,{kind:'cc',channel:1,a:99,value:1});
processParameterMessage(tracker,{kind:'cc',channel:1,a:98,value:2});
const nrpn=processParameterMessage(tracker,{kind:'cc',channel:1,a:6,value:64});
assert.equal(nrpn.type,'NRPN'); assert.equal(nrpn.parameter,130); assert.equal(nrpn.value14,8192);

const diff=baselineDiff(
 {controls:{'1:7':{range:127,jitter:0.2}},keys:[60,61],disconnects:0},
 {controls:{'1:7':{range:100,jitter:2.5}},keys:[60],disconnects:2}
);
assert.equal(diff.missingKeys[0],61); assert.equal(diff.disconnectDelta,2); assert.equal(diff.controls['1:7'].rangeDelta,-27);\nconst drift=baselineDiff({pitch:{center:5},latency:{median:10},messageRate:{peak:50}},{pitch:{center:8},latency:{median:14},messageRate:{peak:75}});\nassert.equal(drift.pitchCenterDelta,3); assert.equal(drift.latencyMedianDelta,4); assert.equal(drift.peakRateDelta,25);

assert.equal(chordName([60,64,67]),'C major');
assert.equal(chordName([60,63,67]),'C minor');

const ch=channelStats([{kind:'noteon',channel:1},{kind:'cc',channel:1},{kind:'pitchbend',channel:2}]);
assert.equal(ch[1].total,2); assert.equal(ch[2].pitchbend,1);

const perf=performanceStats([
 {kind:'noteon',channel:1,a:60,b:100,t:0},
 {kind:'noteoff',channel:1,a:60,b:0,t:250},
 {kind:'noteon',channel:1,a:64,b:90,t:500}
]);
assert.equal(perf.notes.length,2); assert.equal(perf.notes[0].duration,250); assert.equal(perf.interOnset[0],500);\nconst chordPerf=performanceStats([{kind:'noteon',channel:1,a:60,b:90,t:0},{kind:'noteon',channel:1,a:64,b:90,t:7},{kind:'noteon',channel:1,a:67,b:90,t:11}]);\nassert.equal(chordPerf.simultaneousGroups.length,1); assert.deepEqual(chordPerf.simultaneousGroups[0].notes,[60,64,67]);

console.log('MIDItest core tests: PASS');