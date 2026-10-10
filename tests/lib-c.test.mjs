import assert from 'node:assert/strict';
import {ACTIVE_TESTS,buildPlan,evaluate,planDurationMs,createExpectationTracker} from '../lib/active-tests.js';
import {createClockScheduler,clockMeasure} from '../lib/clockgen.js';

const ids=['ccSweep','notePairing','programBank','pitchPressure','nrpn','channelIsolation'];
assert.deepEqual(ACTIVE_TESTS.map(t=>t.id),ids);
for(const t of ACTIVE_TESTS){assert.equal(t.mode,'loopback');assert.equal(t.needsInput,true);assert.ok(t.title&&t.description)}

const loop=plan=>plan.steps.map((s,i)=>({bytes:[...s.bytes],t:i*15}));
for(const id of ids){
  const p=buildPlan(id,{channel:3});
  assert.equal(p.testId,id);assert.equal(p.channel,3);assert.equal(p.timeoutMs,500);
  for(const s of p.steps){assert.ok(s.label);assert.equal(s.expect.length,1);assert.deepEqual(s.expect[0],s.bytes);
    assert.equal(s.bytes[0]&15,3);for(const b of s.bytes.slice(1))assert.ok(b>=0&&b<=127)}
  assert.equal(p.steps[0].delayMs,0);assert.equal(p.steps[1].delayMs,15);
  const r=evaluate(p,[...loop(p),{bytes:[0xF8],t:1},{bytes:[0xFE],t:2}]);
  assert.equal(r.status,'ok',id);assert.equal(r.matched,r.expected);assert.equal(r.sent,p.steps.length);
  assert.equal(r.missing+r.altered+r.extra+r.outOfOrder+r.duplicates+r.otherChannel,0);
  assert.ok(planDurationMs(p)===(p.steps.length-1)*15+500);
}
assert.equal(buildPlan('channelIsolation').expectNothingOnOtherChannels,true);
assert.equal(buildPlan('ccSweep').expectNothingOnOtherChannels,false);
assert.equal(buildPlan('ccSweep',{channel:99}).channel,15);
assert.equal(buildPlan('ccSweep',{channel:-4}).channel,0);
assert.equal(buildPlan('ccSweep',{cc:200,velocity:300,timeoutMs:1}).timeoutMs,100);
assert.throws(()=>buildPlan('nope'));

// content checks
const sweep=buildPlan('ccSweep',{cc:21});
assert.equal(sweep.steps.length,128+127+18);
assert.deepEqual(sweep.steps[127].bytes,[0xB0,21,127]);assert.deepEqual(sweep.steps[128].bytes,[0xB0,21,126]);
assert.ok(sweep.steps.some(s=>s.bytes[1]===53));
const np=buildPlan('notePairing');
assert.ok(np.steps.some(s=>s.bytes[1]===123)&&np.steps.some(s=>s.bytes[1]===120));
assert.equal(np.steps.filter(s=>s.bytes[0]===0x90).length,9);
const pp=buildPlan('pitchPressure');
assert.deepEqual(pp.steps[0].bytes,[0xE0,0,0]);assert.deepEqual(pp.steps[2].bytes,[0xE0,127,127]);
assert.deepEqual(pp.steps.map(s=>s.bytes),buildPlan('pitchPressure').steps.map(s=>s.bytes)); // deterministic
assert.equal(pp.steps.filter(s=>s.bytes[0]===0xE0).length,23);
const nr=buildPlan('nrpn');assert.deepEqual(nr.steps.slice(0,4).map(s=>s.bytes[1]),[99,98,6,38]);
assert.ok(nr.steps.some(s=>s.bytes[1]===101));
assert.equal(buildPlan('programBank').steps.filter(s=>s.bytes[0]===0xC0).length,5);

// fault injection on notePairing (17 msgs)
const p=buildPlan('notePairing'),good=loop(p);
let r=evaluate(p,good.filter((_,i)=>i!==4&&i!==9));
assert.equal(r.status,'investigate');assert.equal(r.missing,2);assert.equal(r.matched,p.steps.length-2);
const alt=good.map(m=>({...m,bytes:[...m.bytes]}));alt[2].bytes[2]=99;
r=evaluate(p,alt);assert.equal(r.status,'investigate');assert.equal(r.altered,1);assert.equal(r.missing,0);assert.equal(r.matched,p.steps.length-1);
const ro=[...good];[ro[3],ro[5]]=[ro[5],ro[3]];
r=evaluate(p,ro);assert.equal(r.status,'investigate');assert.ok(r.outOfOrder>=1);assert.equal(r.missing,0);
r=evaluate(p,[...good,good[1]]);assert.equal(r.status,'attention');assert.equal(r.duplicates,1);assert.equal(r.extra,0);
r=evaluate(p,[...good,{bytes:[0xB0,1,2],t:1}]);assert.equal(r.status,'attention');assert.equal(r.extra,1);
r=evaluate(p,[...good,{bytes:[0x91,60,64],t:1},{bytes:[0xB5,7,7],t:2}]);assert.equal(r.status,'investigate');assert.equal(r.otherChannel,2);
r=evaluate(p,[]);assert.equal(r.status,'notrun');assert.ok(r.details.includes('no messages came back — check the loopback route'));
r=evaluate(p,[{bytes:[0xF8],t:0}]);assert.equal(r.status,'notrun');
assert.ok(r.details.length<=10);
r=evaluate(buildPlan('ccSweep'),loop(buildPlan('ccSweep')).filter((_,i)=>i%3));assert.ok(r.details.length<=10&&r.details.length>0);

// incremental tracker
const tr=createExpectationTracker(p);
assert.equal(tr.snapshot().status,'notrun');
tr.onMessage(good[0].bytes,0);tr.onMessage(good[1].bytes,1);
let s=tr.snapshot();assert.equal(s.matched,2);assert.equal(s.missing,p.steps.length-2);assert.equal(s.status,'investigate');
good.slice(2).forEach(m=>tr.onMessage(m.bytes,m.t));
assert.deepEqual(tr.snapshot(),evaluate(p,good));assert.equal(tr.snapshot().status,'ok');

// clock scheduler with fake clock/timers
function fake(){
  let t=0,id=0;const timers=new Map(),sent=[];
  return {sent,get t(){return t},
    api:{send:(b,w)=>sent.push({b:[...b],w,at:t}),now:()=>t,setTimer:(fn,ms)=>{timers.set(++id,{fn,at:t+ms});return id},clearTimer:i=>timers.delete(i)},
    run(until){for(;;){let k=null,m=Infinity;for(const [i,x] of timers)if(x.at<m){m=x.at;k=i}if(k===null||m>until)break;const x=timers.get(k);timers.delete(k);t=m;x.fn()}t=until},
    pending:()=>timers.size};
}
let f=fake(),c=createClockScheduler(f.api);
assert.equal(c.isRunning(),false);
c.start(120);assert.equal(c.isRunning(),true);
const bars=8,dur=bars*4*500; // 120 BPM => 500 ms/beat
f.run(dur);
const ticks=f.sent.filter(x=>x.b[0]===0xF8);
assert.deepEqual(f.sent[0].b,[0xFA]);
const per=60000/120/24;
for(let i=0;i<24*4*bars;i++)assert.ok(Math.abs(ticks[i].w-i*per)<0.01,`tick ${i}`);
assert.ok(ticks.length>=24*4*bars&&ticks.length<=24*4*bars+4);
assert.ok(ticks.every(x=>x.w<x.at+60+1e-9)&&ticks.every(x=>x.w>=x.at-1e-9-60));
assert.equal(c.stats().ticksSent,ticks.length);assert.equal(c.stats().bpm,120);assert.equal(c.stats().startedAt,0);
c.stop();assert.equal(f.sent.at(-1).b[0],0xFC);assert.equal(f.sent.at(-1).at,dur);assert.equal(c.isRunning(),false);assert.equal(f.pending(),0);
const n0=f.sent.length;f.run(dur+1000);assert.equal(f.sent.length,n0);
c.cont();assert.equal(f.sent[n0].b[0],0xFB);assert.equal(c.isRunning(),true);
c.stop();
// bpm clamp, no start, spp
f=fake();c=createClockScheduler(f.api);
c.start(1000,{sendStart:false});assert.equal(c.stats().bpm,300);assert.notEqual(f.sent[0].b[0],0xFA);
c.setBpm(5);assert.equal(c.stats().bpm,30);c.setBpm(90);assert.equal(c.stats().bpm,90);
c.sendSpp(300);assert.deepEqual(f.sent.at(-1).b,[0xF2,300&127,300>>7]);
c.sendSpp(99999);assert.deepEqual(f.sent.at(-1).b,[0xF2,127,127]);
c.stop();
f=fake();c=createClockScheduler(f.api);c.start(10);assert.equal(c.stats().bpm,30);c.stop();

// clockMeasure: 120 BPM, 0.1% slow, 3 ms latency
const sent=[],got=[];for(let i=0;i<500;i++){sent.push(i*per);got.push(3+i*per*1.001)}
let m=clockMeasure(sent,got,120);
assert.equal(m.ticks,499);assert.equal(m.lost,0);
assert.ok(Math.abs(m.driftPpm-1000)<1,String(m.driftPpm));
assert.ok(Math.abs(m.bpmMeasured-120/1.001)<0.001);
assert.ok(m.jitterRmsMs<1e-6&&m.maxDeviationMs<1e-6);
const jit=got.map((x,i)=>x+(i%2?0.5:-0.5));
m=clockMeasure(sent,jit,120);assert.ok(Math.abs(m.jitterRmsMs-0.5)<0.01);assert.ok(Math.abs(m.maxDeviationMs-0.5)<0.01);
m=clockMeasure(sent,got.slice(0,490),120);assert.equal(m.lost,10);
assert.equal(clockMeasure([],[],120).bpmMeasured,null);

console.log('lib-c tests: PASS');
