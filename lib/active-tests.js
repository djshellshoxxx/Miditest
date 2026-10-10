// Active (send + verify) test plans and evaluation. Pure logic, no DOM.
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,Math.round(Number.isFinite(+v)?+v:lo)));
const d7=v=>clamp(v,0,127);

export const ACTIVE_TESTS=[
  {id:'ccSweep',title:'CC fidelity sweep',mode:'loopback',needsInput:true,description:'Sends one CC from 0 to 127 and back down, plus a 14-bit CC pair, and checks every value returns unchanged and in order.'},
  {id:'notePairing',title:'Note on/off pairing & stuck-note',mode:'loopback',needsInput:true,description:'Sends 8 matched Note On/Off pairs, then a Note On followed by All Notes Off (CC123) and All Sound Off (CC120), and checks all of it returns.'},
  {id:'programBank',title:'Program / Bank select',mode:'loopback',needsInput:true,description:'Sends Bank Select MSB/LSB and Program Change for five programs and checks the echo.'},
  {id:'pitchPressure',title:'Pitch-bend & aftertouch round trip',mode:'loopback',needsInput:true,description:'Sends 14-bit pitch-bend extremes and random values, channel pressure and poly pressure, and checks the echo.'},
  {id:'nrpn',title:'NRPN / RPN round trip',mode:'loopback',needsInput:true,description:'Sends NRPN (CC99/98/6/38) for three parameters and an RPN (CC101/100/6) and checks the echo.'},
  {id:'channelIsolation',title:'Channel isolation',mode:'loopback',needsInput:true,description:'Sends a note and a CC on one channel and checks nothing arrives on any other channel.'}
];

function lcg(seed){let s=seed>>>0;return()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)}

export function buildPlan(testId,opts={}){
  const channel=clamp(opts.channel??0,0,15),cc=d7(opts.cc??21),velocity=Math.max(1,d7(opts.velocity??64));
  const timeoutMs=clamp(opts.timeoutMs??500,100,5000),stepMs=clamp(opts.stepMs??15,1,1000);
  const steps=[];
  const add=(label,bytes)=>{const b=bytes.map(d7).map((v,i)=>i?v:bytes[0]);steps.push({label,bytes:b,delayMs:steps.length?stepMs:0,expect:[[...b]]})};
  const S=n=>n|channel;
  const ccMsg=(n,v)=>[S(0xB0),n,v];
  if(testId==='ccSweep'){
    for(let v=0;v<=127;v++)add(`CC ${cc} = ${v} (up)`,ccMsg(cc,v));
    for(let v=126;v>=0;v--)add(`CC ${cc} = ${v} (down)`,ccMsg(cc,v));
    const msb=Math.min(cc,95),vals=[];for(let v=0;v<16383;v+=2048)vals.push(v);vals.push(16383);
    for(const v of vals){add(`14-bit CC ${msb}/${msb+32} = ${v} (MSB)`,ccMsg(msb,v>>7));add(`14-bit CC ${msb}/${msb+32} = ${v} (LSB)`,ccMsg(msb+32,v&127))}
  }else if(testId==='notePairing'){
    for(let i=0;i<8;i++){const n=60+i;add(`Note On ${n}`,[S(0x90),n,velocity]);add(`Note Off ${n}`,[S(0x80),n,0])}
    add('Note On 72 (left hanging)',[S(0x90),72,velocity]);add('All Notes Off (CC123)',ccMsg(123,0));add('All Sound Off (CC120)',ccMsg(120,0));
  }else if(testId==='programBank'){
    [[0,0,0],[0,5,10],[1,0,33],[2,17,64],[3,127,127]].forEach(([msb,lsb,p])=>{add(`Bank MSB ${msb}`,ccMsg(0,msb));add(`Bank LSB ${lsb}`,ccMsg(32,lsb));add(`Program ${p}`,[S(0xC0),p])});
  }else if(testId==='pitchPressure'){
    const r=lcg(12345),vals=[-8192,0,8191];for(let i=0;i<20;i++)vals.push((r()>>>8)%16384-8192);
    for(const v of vals){const u=v+8192;add(`Pitch bend ${v}`,[S(0xE0),u&127,u>>7])}
    for(let v=0;v<=127;v+=16)add(`Channel pressure ${v}`,[S(0xD0),v]);
    for(const v of [0,32,64,96,127])add(`Poly pressure note 60 = ${v}`,[S(0xA0),60,v]);
  }else if(testId==='nrpn'){
    [[1,2,10,20],[5,100,64,0],[127,127,127,127]].forEach(([m,l,vm,vl],i)=>{add(`NRPN ${i+1} MSB`,ccMsg(99,m));add(`NRPN ${i+1} LSB`,ccMsg(98,l));add(`NRPN ${i+1} data MSB`,ccMsg(6,vm));add(`NRPN ${i+1} data LSB`,ccMsg(38,vl))});
    add('RPN MSB',ccMsg(101,0));add('RPN LSB',ccMsg(100,0));add('RPN data MSB',ccMsg(6,2));
  }else if(testId==='channelIsolation'){
    add('Note On 60',[S(0x90),60,velocity]);add(`CC ${cc} = 100`,ccMsg(cc,100));add('Note Off 60',[S(0x80),60,0]);
  }else throw new Error(`Unknown active test: ${testId}`);
  return {testId,channel,timeoutMs,steps,expectNothingOnOtherChannels:testId==='channelIsolation'};
}

export function planDurationMs(plan){return plan.steps.reduce((s,x)=>s+(x.delayMs||0),0)+(plan.timeoutMs||0)}

const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const hex=b=>b.map(x=>x.toString(16).padStart(2,'0').toUpperCase()).join(' ');

export function createExpectationTracker(plan){
  const exp=[];for(const s of plan.steps)for(const e of s.expect||[])exp.push({bytes:[...e],state:0,label:s.label}); // state 0 pending,1 matched,2 altered
  const ch=plan.channel;let maxIdx=-1,count=0,matched=0,altered=0,extra=0,outOfOrder=0,duplicates=0,otherChannel=0;
  const extras=[],others=[];
  function onMessage(bytes,t){
    const b=[...bytes];if(!b.length||b[0]>=0xF8)return;count++;
    let i=exp.findIndex(e=>e.state===0&&same(e.bytes,b));
    if(i>=0){exp[i].state=1;matched++;if(i<maxIdx)outOfOrder++;else maxIdx=i;return}
    if(b[0]>=0x80&&b[0]<0xF0&&(b[0]&15)!==ch){otherChannel++;if(others.length<3)others.push(hex(b));return}
    if(exp.some(e=>e.state===1&&same(e.bytes,b))){duplicates++;return}
    i=exp.findIndex(e=>e.state===0&&e.bytes[0]===b[0]&&e.bytes[1]===b[1]);
    if(i>=0){exp[i].state=2;exp[i].got=b;altered++;if(i<maxIdx)outOfOrder++;else maxIdx=i;return}
    extra++;if(extras.length<3)extras.push(hex(b));
  }
  function snapshot(){
    const expected=exp.length,missing=exp.filter(e=>e.state===0),details=[];
    const status=count===0&&expected>0?'notrun':(missing.length||altered||otherChannel||outOfOrder)?'investigate':(extra||duplicates)?'attention':'ok';
    if(status==='notrun')details.push('no messages came back — check the loopback route');
    else{
      details.push(`${matched} of ${expected} expected messages came back exactly`);
      if(missing.length){details.push(`${missing.length} missing, first: ${missing[0].label} (${hex(missing[0].bytes)})`)}
      for(const e of exp.filter(x=>x.state===2).slice(0,2))details.push(`altered: sent ${hex(e.bytes)}, got ${hex(e.got)}`);
      if(outOfOrder)details.push(`${outOfOrder} arrived out of order`);
      if(duplicates)details.push(`${duplicates} duplicate message(s)`);
      if(otherChannel)details.push(`${otherChannel} message(s) on other channels, e.g. ${others.join(', ')}`);
      if(extra)details.push(`${extra} unexpected message(s), e.g. ${extras.join(', ')}`);
    }
    return {testId:plan.testId,status,sent:plan.steps.length,expected,matched,missing:missing.length,altered,extra,outOfOrder,duplicates,otherChannel,details:details.slice(0,10)};
  }
  return {onMessage,snapshot};
}

export function evaluate(plan,received=[]){
  const tr=createExpectationTracker(plan);
  for(const m of received)tr.onMessage(m.bytes,m.t);
  return tr.snapshot();
}
