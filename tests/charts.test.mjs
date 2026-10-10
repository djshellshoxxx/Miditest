import assert from 'node:assert/strict';
import {classifyControl,controlHealth,keyHealth,toPoints,renderPie,renderLine,renderBar,renderHBar,renderChartGroups,chartGroups} from '../midi-charts.js';

// control classification
const sweep=Array.from({length:128},(_,i)=>i);
assert.equal(classifyControl(sweep),'working');
assert.equal(classifyControl([64,64,64,64]),'stuck');
assert.equal(classifyControl([]),'stuck');
assert.equal(classifyControl(Array.from({length:40},(_,i)=>20+i%10)),'limited');
assert.equal(classifyControl([0,60,0,60,0,127,0,127]),'noisy');
const h=controlHealth([{values:sweep},{values:[5,5,5]},{values:Array.from({length:40},(_,i)=>20+i%10)}]);
assert.deepEqual([h.working,h.stuck,h.limited,h.total],[1,1,1,3]);

// key health
let k=keyHealth({keys:[60,61,62,64],expected:{low:60,high:65},suspect:[62]});
assert.deepEqual([k.total,k.working,k.suspect,k.missing,k.fromExpected],[6,3,1,2,true]);
k=keyHealth({keys:[60,62,63]});
assert.deepEqual([k.total,k.working,k.missing,k.fromExpected],[4,3,1,false]);
k=keyHealth({keys:[],expected:{low:null,high:null}});assert.equal(k.total,0);
k=keyHealth({keys:[],expected:{low:36,high:40}});assert.deepEqual([k.total,k.missing],[5,5]);

// points
assert.equal(toPoints([1,2,3]).length,3);
assert.deepEqual(toPoints([5,6],[1000,3000]),[[0,5],[2,6]]);
assert.equal(toPoints(Array.from({length:5000},(_,i)=>i)).length,400);

// renderers
let html=renderPie({id:'p',title:'T <x>',slices:[{label:'A',value:3,tone:'good'},{label:'B',value:1,tone:'bad'}],center:{big:'3/4',small:'ok'}});
assert.match(html,/<svg class="pie"/);assert.match(html,/stroke-dasharray="75\.000 25\.000"/);assert.match(html,/75%/);assert.doesNotMatch(html,/<x>/);
assert.match(renderPie({title:'E',slices:[{label:'A',value:0,tone:'good'}],empty:'nothing'}),/chart-empty/);
html=renderLine({title:'L',series:[{label:'a',points:[[0,0],[1,127]]},{label:'b',points:[[0,5]]}],yMin:0,yMax:127});
assert.match(html,/<path class="line s0"/);assert.match(html,/<circle class="dot line s1"/);assert.match(html,/legend inline/);
assert.match(renderLine({title:'L',series:[{label:'a',points:[]}]}),/chart-empty/);
assert.match(renderLine({title:'S',step:true,series:[{label:'a',points:[[0,0],[1,127],[2,0]]}]}),/H[\d.]+V/);
html=renderBar({title:'B',bars:[{label:'x',value:2,tone:'good'},{label:'y',value:0}]});assert.match(html,/<rect class="bar t-good"/);
assert.match(renderBar({title:'B',bars:[{label:'x',value:0}]}),/chart-empty/);
assert.match(renderHBar({title:'H',max:100,rows:[{label:'Ch 1',value:50,text:'50%',tone:'warn'}]}),/width:50\.0%/);

// full builder, empty
let out=chartGroups({});
assert.equal(out.summary.keys.total,0);
assert.ok(out.groups.length>=5);
assert.doesNotThrow(()=>renderChartGroups(out.groups));

// full builder, populated
const times=sweep.map(i=>i*10);
const inp={keys:[60,61,62,64],expected:{low:60,high:65},suspectKeys:[62],velocityValues:[20,60,100,127],velocityByKey:new Map([[60,[40,50]],[61,[70]]]),velocityHistogram:[1,0,1,0,1,0,0,1],
 notePairing:{completed:4,duplicateOns:1,duplicateOffs:0,stuck:0},
 controls:[{label:'Ch 1 · CC 21',values:sweep,times,type:'absolute',kind:'knob'},{label:'Ch 1 · CC 22',values:[10,10,10],type:'absolute',kind:'fader'},{label:'Ch 1 · CC 23',values:sweep,times,type:'absolute',kind:''},{label:'Ch 1 · Sustain',values:[0,127],type:'switch',kind:''}],
 modSeries:[{label:'Ch 1 · Mod Wheel',values:sweep,times}],pitch:{values:[-8192,0,8191],times:[0,100,200]},sustain:{values:[0,127,0],times:[0,100,200]},sustainStats:{transitions:2,bounces:1,repeats:3},
 aftertouch:{values:[10,90],times:null},polyAftertouch:new Map([['1:60',[20,30]]]),messageCounts:{noteon:9,cc:5},channelStats:{1:{total:14}},clockTimes:[0,20,40,60],latencies:[1.2,1.4],loopback:{sent:10,matched:8,missing:1,altered:1,extra:0},testStatuses:['ok','ok','attention'],windowsCounts:{investigate:1,attention:2}};
out=chartGroups(inp);
assert.deepEqual([out.summary.keys.working,out.summary.keys.suspect,out.summary.keys.missing],[3,1,2]);
assert.equal(out.summary.knobs.working,1);assert.equal(out.summary.faders.stuck,1);
const ids=out.groups.flatMap(g=>g.charts.map(c=>c.id));
for(const id of ['keys-health','keys-octave','velocity-per-key','velocity-hist','velocity-zones','controls-health','knobs-health','faders-health','untagged-health','control-coverage','control-sweeps','pitch-time','pitch-travel','mod-time','sustain-time','sustain-events','aftertouch-time','aftertouch-zones','message-mix','clock-intervals','latency','loopback','tests-status','windows-log'])assert.ok(ids.includes(id),'missing chart '+id);
html=renderChartGroups(out.groups);
assert.match(html,/Keys: total vs working vs broken/);assert.doesNotMatch(html,/undefined|NaN/);
// without tagging, the hint chart replaces the knob/fader pies
const untagged=chartGroups({...inp,controls:inp.controls.map(c=>({...c,kind:''}))});
assert.ok(untagged.groups.flatMap(g=>g.charts).some(c=>c.id==='tag-hint'));
console.log('MIDItest chart tests: PASS');
