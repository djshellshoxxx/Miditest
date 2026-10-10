import assert from 'node:assert/strict';
import {decodeMessage} from '../midi-core.js';
import {protocolAudit,linkHealth,doubleTriggers,velocityResponse,polyphonyCapacity,sweepQuality,detectEncoderMode,encoderAnalysis,pitchReturn,pedalPolarity,burstStage,burstAnalysis,buildTestResults,expectedLength,TEST_GUIDE} from '../midi-tests.js';
import {classifyEvent,analyzeWindowsScan,analyzeLogText,describeCmProblem,describeSetupapiExit} from '../midi-winlog.js';

const ev=(bytes,t)=>({...decodeMessage(bytes),t});
// protocol
assert.equal(expectedLength(0x90),3);assert.equal(expectedLength(0xC0),2);assert.equal(expectedLength(0xF8),1);
let p=protocolAudit([ev([0x90,60,100],0),ev([0x80,60,40],10),ev([0x90,61,0],20)]);
assert.equal(p.status,'ok');assert.equal(p.trueNoteOff,1);assert.equal(p.velZeroNoteOff,1);assert.equal(p.releaseVelocity,1);
p=protocolAudit([{raw:[0xF4],hex:'F4',t:0},{raw:[0x90,200,1],hex:'90 C8 01',t:1},{raw:[0x90,1],hex:'90 01',t:2},{raw:[0xF0,1,2],hex:'F0 01 02',t:3}]);
assert.equal(p.status,'investigate');assert.equal(p.undefinedStatus,1);assert.equal(p.highDataByte,1);assert.equal(p.badLength,1);assert.equal(p.unterminatedSysex,1);
assert.equal(protocolAudit([ev([0xB0,123,0],0)]).status,'attention');
assert.equal(protocolAudit([]).status,'notrun');
// link health
const clk=Array.from({length:60},(_,i)=>ev([0xF8],i*20));
assert.equal(linkHealth(clk).status,'ok');
const gap=clk.filter((_,i)=>i!==30&&i!==31&&i!==32&&i!==33);
const lh=linkHealth(gap);assert.equal(lh.missedTicks,4);assert.equal(lh.status,'investigate');
const asOk=Array.from({length:5},(_,i)=>ev([0xFE],i*250));assert.equal(linkHealth(asOk).status,'ok');
assert.equal(linkHealth([...asOk,ev([0xFE],2000)]).status,'investigate');
assert.equal(linkHealth([ev([0x90,60,1],0)]).status,'notrun');
// double trigger
const notes=[];for(let i=0;i<12;i++){notes.push(ev([0x90,60+i,80],i*500),ev([0x80,60+i,0],i*500+200))}
assert.equal(doubleTriggers(notes).status,'ok');
const chat=[...notes,ev([0x90,60,5],6200),ev([0x80,60,0],6300),ev([0x90,60,6],6310),ev([0x80,60,0],6500),ev([0x90,60,7],6512)];
const dt=doubleTriggers(chat);assert.equal(dt.retriggers,2);assert.equal(dt.lowVelocityRetriggers,2);assert.equal(dt.status,'attention');
assert.equal(doubleTriggers([]).status,'notrun');
// velocity
const bk=new Map();for(let k=60;k<66;k++)bk.set(k,[80,82,79,81,80]);bk.set(66,[30,31,29,30,32]);bk.set(67,[120,121,119,120,122]);
const all=[...bk.values()].flat();const vr=velocityResponse(bk,all);
assert.equal(vr.outliers.length,2);assert.equal(vr.status,'attention');assert.equal(velocityResponse(new Map(),[1,2]).status,'notrun');
// rollover
const roll=[60,62,64,65,67].map((n,i)=>ev([0x90,n,90],i));
assert.equal(polyphonyCapacity(roll,5).status,'ok');assert.equal(polyphonyCapacity(roll,8).shortfall,3);assert.equal(polyphonyCapacity(roll,null).status,'info');assert.equal(polyphonyCapacity([],4).status,'notrun');
// sweep
const smooth=Array.from({length:128},(_,i)=>i),st=smooth.map((_,i)=>i*10);
const sq=sweepQuality(smooth,st);assert.equal(sq.status,'ok');assert.ok(sq.r2>0.99);assert.equal(sq.backslides,0);
const noisy=[...smooth];noisy.splice(40,0,38,40);noisy.splice(80,0,77,80);
const nq=sweepQuality(noisy,noisy.map((_,i)=>i*10));assert.ok(nq.backslides>=2);assert.equal(nq.status,'attention');
const coarse=Array.from({length:40},(_,i)=>i*4);assert.equal(sweepQuality(coarse,coarse.map((_,i)=>i*60)).status,'attention');
assert.equal(sweepQuality([1,2,3],[0,1,2]).status,'notrun');
// encoder
assert.equal(detectEncoderMode([1,1,127,1,127,1,1,1]),'twos');assert.equal(detectEncoderMode([65,63,65,65,63,65,65]),'offset');assert.equal(detectEncoderMode([5,50,90,10,30,70]),null);
const clean=[1,1,1,1,1,1,127,127,127,127,127,127];assert.equal(encoderAnalysis(clean).status,'ok');assert.equal(encoderAnalysis(clean).net,0);
const glitchy=[1,1,1,127,1,1,1,1,127,1,1,1,1,1];const ea=encoderAnalysis(glitchy);assert.equal(ea.glitches,2);assert.equal(ea.status,'attention');
// pitch
const pv=[0,2000,6000,8000,5000,2000,300,10,0,-3000,-7000,-8000,-4000,-100,5];
const pr=pitchReturn(pv,pv.map((_,i)=>i*20));assert.equal(pr.excursions,2);assert.equal(pr.unsettled,0);assert.ok(pr.medianReturnMs>0);assert.equal(pr.status,'ok');
const stuck=pitchReturn([0,6000,7000,5000,3000,2500,2400],[0,1,2,3,4,5,6]);assert.equal(stuck.unsettled,1);assert.equal(stuck.status,'info');
assert.equal(pitchReturn([0,5000,7000,3000,2000,1500,1400,0,5000,7000,3000,1500,1400],null).status,'investigate');
assert.equal(pitchReturn([0,1,2]).status,'notrun');
const over=pitchReturn([0,7000,3000,-2000,-1800,-10,0,7000,3000,-2000,-1800,-10,0],null);assert.equal(over.status,'attention');
// pedal
assert.equal(pedalPolarity([0,127,0,127,0],[0,100,300,500,800]).status,'ok');
assert.equal(pedalPolarity([0,127,0,127],[0,100,300,500]).status,'attention');
assert.equal(pedalPolarity([0,127,0,127,0],[0,100,110,500,800]).bounces,1);
assert.equal(pedalPolarity([127,127,127,127],[0,1,2,3]).status,'notrun');
// burst
assert.deepEqual(burstStage([1,2,3,4],[1,2,4,3,3]),{sent:4,received:5,lost:0,duplicates:1,outOfOrder:1,lossPct:0});
assert.equal(burstStage([1,2,3,4],[1,2]).lossPct,50);
assert.equal(burstAnalysis([{label:'a',rate:50,sent:[1,2],received:[1,2]}]).status,'ok');
assert.equal(burstAnalysis([{label:'a',rate:250,sent:[1,2],received:[1]}]).status,'investigate');
assert.equal(burstAnalysis([{label:'b',rate:1000,sent:[1,2],received:[1]}]).status,'attention');
assert.equal(burstAnalysis([]).status,'notrun');
// aggregate
const cc=new Map([['1:7',smooth],['1:30',clean]]);
const res=buildTestResults({events:notes,velocityByKey:bk,velocityValues:all,cc,ccTimes:new Map([['1:7',st]]),paramCcs:new Set([6]),pitchValues:pv,pitchTimes:pv.map((_,i)=>i*20),sustainValues:[0,127,0,127,0],sustainTimes:[0,100,300,500,800],expectedPoly:4});
assert.equal(res.length,Object.keys(TEST_GUIDE).length);
for(const r of res){assert.ok(r.title&&r.kind&&r.headline!==undefined&&Array.isArray(r.metrics)&&Array.isArray(r.meaning),r.id)}
assert.equal(buildTestResults({}).every(r=>r.status==='notrun'||r.status==='ok'||r.status==='info'),true);
// windows log classification
const e=(provider,id,message,level=2)=>({time:'2026-10-08T10:00:00Z',log:'System',provider,id,level,message});
assert.equal(classifyEvent(e('Microsoft-Windows-Kernel-PnP',219,'The driver \\Driver\\usbaudio failed to load for the device USB\\VID_1234'),[]).category,'Driver');
assert.equal(classifyEvent(e('Service Control Manager',7034,'The Windows Audio service terminated unexpectedly.'),[]).title,'A service terminated unexpectedly');
assert.equal(classifyEvent(e('Service Control Manager',7034,'The Foo service terminated unexpectedly.'),[]),null);
assert.equal(classifyEvent(e('Microsoft-Windows-USB-USBHUB3',43,'port reset failed'),[]).category,'USB');
assert.match(classifyEvent(e('Microsoft-Windows-WER-SystemErrorReporting',1001,'The bugcheck was: 0x000000fe (0x1,0x2).'),[]).title,/BUGCODE_USB_DRIVER/);
assert.match(classifyEvent(e('Application Error',1000,'Faulting application daw.exe, faulting module wdmaud.drv'),[]).title,/MIDI\/audio path/);
assert.equal(classifyEvent(e('Random',5,'unrelated thing'),[]),null);
assert.equal(classifyEvent(e('Random',5,'Launchkey Mini failure',3),['launchkey']).mentionsDevice,true);
assert.match(describeCmProblem(43).title,/stopped/);assert.match(describeCmProblem(999).title,/999/);
assert.match(describeSetupapiExit('FAILURE(0xe0000247)').title,/driver store/);
const scan={generated:'x',os:'Win',days:7,events:[e('Microsoft-Windows-Kernel-PnP',219,'driver failed to load usb')],devices:[{name:'USB Audio Device',id:'USB\\VID_1',errorCode:43,class:'MEDIA'}],drivers:[],services:[{name:'Audiosrv',displayName:'Windows Audio',status:'Stopped',startType:'Automatic'}],usbSelectiveSuspend:{ac:'0x00000001',dc:'0x00000000'},setupapi:[{title:'Device Install - USB\\VID_1',time:'t',exit:'FAILURE(0xe0000249)',warnings:['x']}],wer:[{time:'2026-10-08T10:00:00Z',app:'daw.exe',eventName:'APPCRASH',module:'wdmaud.drv',exception:'c0000005'}]};
const an=analyzeWindowsScan(scan,{windowStart:Date.parse('2026-10-08T09:59:00Z')});
assert.equal(an.status,'investigate');assert.ok(an.counts.duringTest>=1);assert.ok(an.findings.some(f=>/Code 43/.test(f.title)));assert.ok(an.findings.some(f=>f.category==='Power'));assert.ok(an.findings.some(f=>f.category==='Service'));assert.ok(an.findings.some(f=>f.source==='setupapi.dev.log'));assert.equal(an.logs.length,2);
assert.equal(analyzeWindowsScan({}).status,'ok');
const f5=analyzeWindowsScan({generated:'2026-10-08T12:00:00Z',days:7,build:26100,services:[{name:'MidiSrv',displayName:'Windows MIDI Service',status:'Running',startType:'Automatic'}],usbHistory:[{id:'x',name:'Pad',arrivals:9}],usbTree:[{id:'x',path:['Pad','USB Composite','Generic USB Hub','Generic USB Hub','xHCI']}],drivers:[{deviceId:'x',name:'Old drv',version:'1.0',date:'2020-01-01',provider:'Acme',signed:true},{deviceId:'y',name:'Bad drv',signed:false}],events:[e('Microsoft-Windows-Kernel-PnP',219,'driver failed to load usb')],changes:{driverInstalls:[{time:'2026-10-08T08:00:00Z',message:'m'}],hotfixes:[]}});
assert.ok(f5.findings.some(f=>/reconnected 9/.test(f.title)));assert.ok(f5.findings.some(f=>/hub levels/.test(f.title)));assert.ok(f5.findings.some(f=>/years old/.test(f.title)));assert.ok(f5.findings.some(f=>/not signed/.test(f.title)));assert.ok(f5.findings.some(f=>f.category==='Change'));
assert.equal(f5.environment.midi2Capable,true);assert.equal(f5.environment.midiServices,true);
// log text
const sa=analyzeLogText('setupapi.dev.log','>>>  [Device Install (Hardware initiated) - USB\\VID_1]\n>>>  Section start 2026/10/08\n<<<  [Exit status: FAILURE(0xe0000228)]\n>>>  [Device Install - OK]\n<<<  [Exit status: SUCCESS]\n');
assert.equal(sa.type,'setupapi');assert.equal(sa.findings.length,1);assert.match(sa.findings[0].explain,/compatible/);
const wer=analyzeLogText('Report.wer','EventType=APPCRASH\nAppName=daw.exe\nSig[3].Name=Fault Module Name\nSig[3].Value=wdmaud.drv\nSig[6].Name=Exception Code\nSig[6].Value=c0000005\n');
assert.equal(wer.type,'wer');assert.equal(wer.findings[0].severity,'investigate');
const gen=analyzeLogText('x.log','ok\nUSB device error 0xe0000247 something\nnothing');assert.equal(gen.findings.length,1);assert.match(gen.findings[0].explain,/driver store/);
console.log('MIDItest advanced tests: PASS');
