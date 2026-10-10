import assert from 'node:assert/strict';
import {CAPTURE_MAX_EVENTS,serializeCapture,parseCapture} from '../lib/capture.js';
import {buildIdentityRequest,parseIdentityReply,parseHex,validateSysex,checksum,diffBytes,manufacturerName} from '../lib/sysex.js';
import {UMP_WORDS,parseUmpHex,decodeUmp,scale16to7,scale32to7} from '../lib/ump.js';
import {REPORT_VERSION,migrate,validateReportV3} from '../lib/schema.js';
import {FLAGS,createFlags} from '../lib/flags.js';

// capture
assert.equal(CAPTURE_MAX_EVENTS,200000);
const evs=[{t:1000.12345,deviceId:'a',raw:[0x90,60,100]},{t:1010.5,deviceId:'a',raw:[0x80,60,0]}];
const txt=serializeCapture(evs,{device:'KB',ports:[{id:'a',name:'A'}],startedAt:'2026-10-10',notes:'n',app:'0.01'});
const j=JSON.parse(txt);
assert.equal(j.kind,'capture');assert.equal(j.schema,1);assert.equal(j.events[0].t,0);assert.equal(j.events[1].t,10.377);assert.deepEqual(j.events[0].bytes,[0x90,60,100]);
const p=parseCapture('﻿'+txt);
assert.equal(p.error,undefined);assert.equal(p.events.length,2);assert.equal(p.meta.device,'KB');assert.equal(p.meta.schema,1);assert.equal(p.meta.notes,'n');
const mk=o=>JSON.stringify({kind:'capture',schema:1,events:[],...o});
const ev=(t,bytes)=>({t,deviceId:'x',bytes});
for(const bad of ['nope','[]','null',mk({kind:'x'}),mk({schema:2}),mk({events:{}}),mk({events:[ev(0,[])]}),mk({events:[ev(0,[0x90,256])]}),mk({events:[ev(0,[0x90,1.5])]}),mk({events:[ev(0,[60,1])]}),mk({events:[ev(null,[0x90])]}),mk({events:[ev(5,[0x90]),ev(4,[0x90])]}),mk({events:[ev(0,new Array(4097).fill(0x90))]})])
  assert.ok(parseCapture(bad).error,bad.slice(0,60));
assert.ok(parseCapture(mk({events:new Array(CAPTURE_MAX_EVENTS+1).fill(ev(0,[0x90]))})).error);
assert.ok(parseCapture(undefined).error);
assert.equal(parseCapture(serializeCapture([],{})).events.length,0);

// sysex
assert.deepEqual(buildIdentityRequest(),[0xF0,0x7E,0x7F,0x06,0x01,0xF7]);
assert.deepEqual(buildIdentityRequest(5),[0xF0,0x7E,5,0x06,0x01,0xF7]);
const r1=parseIdentityReply([0xF0,0x7E,0x00,0x06,0x02,0x42,0x01,0x02,0x03,0x04,1,2,3,4,0xF7]);
assert.equal(r1.manufacturerName,'Korg');assert.deepEqual(r1.manufacturerId,[0x42]);assert.equal(r1.family,0x01|(0x02<<7));assert.equal(r1.member,3|(4<<7));assert.deepEqual(r1.revision,[1,2,3,4]);assert.equal(r1.deviceId,0);assert.match(r1.hex,/^F0 7E 00 06 02 42/);
const r3=parseIdentityReply([0xF0,0x7E,0x7F,0x06,0x02,0x00,0x20,0x32,0x01,0x00,0x02,0x00,1,0,0,0,0xF7]);
assert.equal(r3.manufacturerName,'Behringer');assert.deepEqual(r3.manufacturerId,[0,0x20,0x32]);assert.equal(r3.family,1);assert.equal(r3.member,2);
assert.equal(parseIdentityReply([0xF0,0x7E,0,6,2,0x42,1,2,3,4,1,2,3,4]),null);
assert.equal(parseIdentityReply([0xF0,0x7E,0,6,1,0xF7]),null);
assert.equal(parseIdentityReply(null),null);assert.equal(parseIdentityReply([0xF0,0x7E,0,6,2,0,0x20,0xF7]),null);
assert.equal(manufacturerName([0x41]),'Roland');assert.equal(manufacturerName([0,0x21,0x1D]),'Ableton');assert.equal(manufacturerName([0x7E]),'Universal Non-Real Time');
assert.equal(manufacturerName([0x55]),'Unknown (55)');assert.equal(manufacturerName([0,1,2]),'Unknown (00 01 02)');
assert.deepEqual(parseHex('F0 7E 7F').bytes,[0xF0,0x7E,0x7F]);assert.deepEqual(parseHex('f0,7e').bytes,[0xF0,0x7E]);assert.deepEqual(parseHex('0xF0 0x7E').bytes,[0xF0,0x7E]);
assert.deepEqual(parseHex('').bytes,[]);
for(const b of ['F0 7','ZZ','100','0x1FF','F0 7E G1','F0;7E'])
  if(b==='F0 7')continue;else assert.ok(parseHex(b).error,b);
assert.deepEqual(parseHex('F0 7').bytes,[0xF0,7]); // single digit is a valid byte
assert.ok(parseHex(5).error);assert.ok(parseHex('FFF').error.includes('large'));
assert.equal(validateSysex([0xF0,1,2,0xF7]),null);assert.equal(validateSysex([0xF0,0xF7]),null);
for(const b of [[],[1,0xF7],[0xF0,1],[0xF0,0x80,0xF7],[0xF0,-1,0xF7],[0xF0],null])assert.equal(typeof validateSysex(b),'string');
assert.equal(checksum('roland',[0x10,0x20,0x30]),(128-0x60)%128);assert.equal(checksum('roland',[0x40,0x40]),0);
assert.equal(checksum('xor',[0x41,0x22,0x7F]),(0x41^0x22^0x7f)&0x7f);
assert.equal(checksum('twos',[1,2,3]),(-6)&0x7f);assert.equal(checksum('twos',[]),0);
assert.throws(()=>checksum('nope',[1]));
assert.deepEqual(diffBytes([1,2,3],[1,9,3]),[{offset:1,a:2,b:9}]);
assert.deepEqual(diffBytes([1,2],[1,2,3]),[{offset:2,a:undefined,b:3}]);
assert.deepEqual(diffBytes([1,2,3],[1]),[{offset:1,a:2,b:undefined},{offset:2,a:3,b:undefined}]);
assert.deepEqual(diffBytes([1],[1]),[]);

// ump
assert.deepEqual(UMP_WORDS,{0:1,1:1,2:1,3:2,4:2,5:4,6:1,7:1,8:2,9:2,10:2,11:3,12:3,13:4,14:4,15:4});
assert.deepEqual(parseUmpHex('20903C64, 0x40903C00 FFFF0000').words,[0x20903C64,0x40903C00,0xFFFF0000]);
for(const b of ['2090','ZZZZZZZZ','123456789'])assert.ok(parseUmpHex(b).error);
assert.deepEqual(parseUmpHex('').words,[]);assert.ok(parseUmpHex(null).error);
const n2=decodeUmp([0x20903C64])[0];
assert.equal(n2.mt,2);assert.equal(n2.group,0);assert.equal(n2.kind,'noteon');assert.equal(n2.channel,1);assert.equal(n2.note,60);assert.equal(n2.velocity,100);
assert.equal(decodeUmp([0x21803C00])[0].kind,'noteoff');assert.equal(decodeUmp([0x21803C00])[0].group,1);
const n4=decodeUmp([0x41943C00,0xFFFF0000]);
assert.equal(n4.length,1);assert.equal(n4[0].kind,'noteon');assert.equal(n4[0].group,1);assert.equal(n4[0].channel,5);assert.equal(n4[0].note,60);assert.equal(n4[0].velocity16,0xFFFF);assert.equal(n4[0].velocity7,127);
assert.equal(scale16to7(0xFFFF),127);assert.equal(scale16to7(0),0);assert.equal(scale32to7(0xFFFFFFFF),127);
const cc=decodeUmp([0x40B00700,0x80000000])[0];assert.equal(cc.kind,'cc');assert.equal(cc.controller,7);assert.equal(cc.value32,0x80000000);
const pb=decodeUmp([0x40E00000,0x80000000])[0];assert.equal(pb.kind,'pitchbend');assert.equal(pb.value32,0x80000000);
const pr=decodeUmp([0x40C00001,0x05000102])[0];assert.equal(pr.kind,'program');assert.equal(pr.bankValid,true);assert.equal(pr.program,5);assert.equal(pr.bankMsb,1);assert.equal(pr.bankLsb,2);
assert.equal(decodeUmp([0x40C00000,0x05000102])[0].bankValid,false);
assert.equal(decodeUmp([0x40D00000,5])[0].kind,'aftertouch');
const sx=decodeUmp([0x30030102,0x03000000])[0];
assert.equal(sx.kind,'sysex7');assert.equal(sx.status,'complete');assert.deepEqual(sx.bytes,[1,2,3]);
assert.equal(decodeUmp([0x30160102,0x03040506])[0].status,'start');
assert.equal(decodeUmp([0x00000000])[0].kind,'noop');assert.equal(decodeUmp([0x00201234])[0].kind,'jrtimestamp');assert.equal(decodeUmp([0x00101234])[0].kind,'jrclock');
assert.equal(decodeUmp([0x10F80000])[0].kind,'clock');assert.equal(decodeUmp([0x10FA0000])[0].kind,'start');assert.equal(decodeUmp([0x10FC0000])[0].kind,'stop');
assert.equal(decodeUmp([0x50010000,0,0,0])[0].kind,'sysex8');
assert.equal(decodeUmp([0xD0100001,0,0,0])[0].kind,'flexdata');
const fn=decodeUmp([0xF0030048,0x656C6C6F,0,0])[0];assert.equal(fn.kind,'endpointname');assert.equal(fn.text,'Hello');
assert.equal(decodeUmp([0xF0010101,0,0,0])[0].umpVersionMajor,1);
const rs=decodeUmp([0x60000000,0x70000000,0x80000000,0x00000000,0xB0000000,0,0]);
assert.deepEqual(rs.map(x=>x.kind),['reserved','reserved','reserved','reserved']);assert.equal(rs[3].words,3);
const tr=decodeUmp([0x20903C64,0x40903C00]);assert.equal(tr[1].kind,'truncated');
assert.deepEqual(decodeUmp([]),[]);assert.deepEqual(decodeUmp(null),[]);
for(let i=0;i<1000;i++){
  const w=Array.from({length:Math.floor(Math.random()*40)},()=>Math.random()<0.1?Math.floor(Math.random()*1e12)-5e11:(Math.random()*0x100000000)>>>0);
  const out=decodeUmp(w);assert.ok(Array.isArray(out));
  const consumed=out.reduce((s,x)=>s+(x.kind==='truncated'?x.words:UMP_WORDS[x.mt]),0);assert.equal(consumed,w.length);
}

// schema
assert.equal(REPORT_VERSION,3);
const old={version:1,eventCount:3,keys:[1],extra:{a:1}};
const m=migrate(old);
assert.equal(m.version,3);assert.deepEqual(m.advancedTests,[]);assert.equal(m.windowsLogs,null);assert.equal(m.checklist,null);assert.equal(m.identity,null);assert.deepEqual(m.logFiles,[]);assert.deepEqual(m.extra,{a:1});assert.equal(old.version,1);assert.notEqual(m.extra,old.extra);
const m2=migrate({version:2,eventCount:1,windowsLogs:{x:1},advancedTests:[1]});assert.deepEqual(m2.windowsLogs,{x:1});assert.deepEqual(m2.advancedTests,[1]);
assert.equal(migrate(null).version,3);
for(const v of [1,2,3])assert.equal(validateReportV3({version:v,eventCount:0}),null);
assert.equal(validateReportV3(m),null);
assert.equal(validateReportV3({version:3,eventCount:0,advancedTests:[],logFiles:[],windowsLogs:null,checklist:{},identity:{}}),null);
for(const b of [null,[],{version:4,eventCount:0},{version:0,eventCount:0},{version:3},{version:3,eventCount:0,keys:1},{version:3,eventCount:0,controls:null},{version:3,eventCount:0,advancedTests:{}},{version:3,eventCount:0,logFiles:'x'},{version:3,eventCount:0,windowsLogs:[]},{version:3,eventCount:0,checklist:1},{version:3,eventCount:0,identity:'x'}])
  assert.equal(typeof validateReportV3(b),'string');

// flags
assert.deepEqual(FLAGS.map(f=>f.id),['replay','checklist','profiles','charts','sysex','activeTests','clockgen','multidevice','ump','glossary']);
assert.ok(FLAGS.every(f=>f.default===true&&typeof f.label==='string'));
const mem=()=>{const d={};return {getItem:k=>d[k]??null,setItem:(k,v)=>{d[k]=String(v)},d}};
const s=mem(),f=createFlags(s);
assert.equal(f.isOn('replay'),true);assert.equal(f.isOn('nope'),false);
f.set('replay',false);assert.equal(f.isOn('replay'),false);assert.equal(f.isOn('sysex'),true);assert.equal(JSON.parse(s.d['miditest-flags']).replay,false);
assert.equal(createFlags(s).isOn('replay'),false);
f.set('bogus',true);assert.equal(f.isOn('bogus'),false);assert.equal(Object.keys(f.all()).length,10);
const bad=createFlags({getItem:()=>'{not json',setItem(){}});assert.equal(bad.isOn('ump'),true);
const thr=createFlags({getItem(){throw new Error('x')},setItem(){throw new Error('x')}});assert.equal(thr.isOn('ump'),true);thr.set('ump',false);assert.equal(Object.keys(thr.all()).length,10);
assert.equal(createFlags({getItem:()=>'[1]',setItem(){}}).isOn('charts'),true);
assert.equal(createFlags({getItem:()=>'{"charts":"no"}',setItem(){}}).isOn('charts'),true);
assert.equal(createFlags(null).isOn('charts'),true);
const c=createFlags(mem(),'k2');c.set('glossary',false);assert.equal(c.all().glossary,false);

console.log('lib-a tests: PASS');
