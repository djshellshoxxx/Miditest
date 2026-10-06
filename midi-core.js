export function noteName(n){const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];return `${names[((n%12)+12)%12]}${Math.floor(n/12)-1}`}

export function decodeMessage(data){
  const d=[...data],status=d[0]||0,type=status&0xf0,ch=(status&0x0f)+1,a=d[1]??0,b=d[2]??0;
  let kind='system',label='System',value=d.length>2?b:a;
  if(status===0xF0){kind='sysex';label='System Exclusive';value=d.length}
  else if(status===0xF2){kind='songposition';label='Song Position Pointer';value=a|(b<<7)}
  else if(status===0xF8){kind='clock';label='MIDI Clock';value=0}
  else if(status===0xFA){kind='start';label='Start';value=0}
  else if(status===0xFB){kind='continue';label='Continue';value=0}
  else if(status===0xFC){kind='stop';label='Stop';value=0}
  else if(status===0xFE){kind='active';label='Active Sense';value=0}
  else if(status===0xFF){kind='reset';label='System Reset';value=0}
  else if(type===0x80||(type===0x90&&b===0)){kind='noteoff';label=`Note Off ${noteName(a)}`;value=b}
  else if(type===0x90){kind='noteon';label=`Note On ${noteName(a)}`;value=b}
  else if(type===0xA0){kind='polyaftertouch';label=`Poly Aftertouch ${noteName(a)}`;value=b}
  else if(type===0xB0){kind='cc';label=`CC ${a}`;value=b}
  else if(type===0xC0){kind='program';label=`Program ${a}`;value=a}
  else if(type===0xD0){kind='aftertouch';label='Channel Aftertouch';value=a}
  else if(type===0xE0){kind='pitchbend';label='Pitch Bend';value=((b<<7)|a)-8192}
  const channel=type>=0x80&&type<=0xE0?ch:null;
  return {status,type,channel,a,b,value,kind,label,note:(kind==='noteon'||kind==='noteoff'||kind==='polyaftertouch')?a:null,velocity:(kind==='noteon'||kind==='noteoff')?b:null,raw:d,decimal:d.join(' '),hex:d.map(x=>x.toString(16).padStart(2,'0').toUpperCase()).join(' ')};
}

export function mean(values=[]){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}
export function median(values=[]){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
export function stdev(values=[]){if(!values.length)return null;const m=mean(values);return Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/values.length)}
function minMax(values){let min=Infinity,max=-Infinity;for(const v of values){if(v<min)min=v;if(v>max)max=v}return {min,max}}

export function deadZones(values=[],expectedMax=127,minGap=4){
  const sorted=[...new Set(values)].filter(v=>Number.isFinite(v)).sort((a,b)=>a-b),out=[];
  if(!sorted.length)return out;
  for(let i=1;i<sorted.length;i++){if(sorted[i]-sorted[i-1]-1>=minGap)out.push([sorted[i-1]+1,sorted[i]-1])}
  return out;
}

export function controlStats(values=[]){
  if(!values.length)return {count:0,min:null,max:null,range:0,coverage:0,unique:0,skipped:0,repeated:0,jitter:0,jumps:0,reversals:0,deadZones:[],eventRate:0};
  const {min,max}=minMax(values);let jumps=0,reversals=0,lastDir=0,repeated=0;
  for(let i=1;i<values.length;i++){const delta=values[i]-values[i-1];if(Math.abs(delta)>12)jumps++;if(delta===0)repeated++;const dir=Math.sign(delta);if(dir&&lastDir&&dir!==lastDir)reversals++;if(dir)lastDir=dir}
  const tail=values.slice(-Math.min(20,values.length)),j=stdev(tail)||0,unique=new Set(values).size;
  return {count:values.length,min,max,range:max-min,coverage:Number(((max-min)/127*100).toFixed(1)),unique,skipped:Math.max(0,(max-min+1)-unique),repeated,jitter:Number(j.toFixed(2)),jumps,reversals,deadZones:deadZones(values)};
}

export function velocityStats(values=[]){
  if(!values.length)return {count:0,min:null,max:null,mean:null,median:null,stdev:null,range:0,histogram:Array(8).fill(0)};
  const hist=Array(8).fill(0);for(const v of values)hist[Math.min(7,Math.floor(Math.max(0,v)/16))]++;
  const {min,max}=minMax(values);return {count:values.length,min,max,mean:Number(mean(values).toFixed(2)),median:median(values),stdev:Number(stdev(values).toFixed(2)),range:max-min,histogram:hist};
}

export function pitchStats(values=[]){
  if(!values.length)return {count:0,min:null,max:null,center:null,centerSpread:null,negativeTravel:0,positiveTravel:0,asymmetry:null};
  const {min,max}=minMax(values),near=values.filter(v=>Math.abs(v)<1024),center=mean(near),spread=stdev(near),neg=Math.abs(Math.min(0,min)),pos=Math.max(0,max);
  return {count:values.length,min,max,center:center===null?null:Math.round(center),centerSpread:spread===null?null:Math.round(spread),negativeTravel:neg,positiveTravel:pos,asymmetry:Math.abs(neg-pos)};
}

export function clockBpm(timestamps=[]){if(timestamps.length<25)return null;const diffs=[];for(let i=1;i<timestamps.length;i++){const d=timestamps[i]-timestamps[i-1];if(d>0&&d<500)diffs.push(d)}if(!diffs.length)return null;return 60000/(median(diffs)*24)}
export function clockStats(timestamps=[]){
  if(timestamps.length<2)return {count:timestamps.length,bpm:null,intervalMean:null,jitter:null,peakJitter:null};
  const diffs=[];for(let i=1;i<timestamps.length;i++){const d=timestamps[i]-timestamps[i-1];if(d>0&&d<500)diffs.push(d)}
  const m=mean(diffs),dev=diffs.map(x=>Math.abs(x-m));
  const histogram=Array(12).fill(0);let intervalMin=null,intervalMax=null,peakJitter=null;if(diffs.length){const bounds=minMax(diffs),lo=bounds.min,hi=bounds.max,span=Math.max(0.0001,hi-lo);intervalMin=lo;intervalMax=hi;for(const d of diffs)histogram[Math.min(11,Math.floor((d-lo)/span*12))]++}if(dev.length)peakJitter=minMax(dev).max;return {count:timestamps.length,bpm:clockBpm(timestamps),intervalMean:m===null?null:Number(m.toFixed(3)),jitter:dev.length?Number(mean(dev).toFixed(3)):null,peakJitter:peakJitter===null?null:Number(peakJitter.toFixed(3)),intervalMin,intervalMax,histogram};
}

export function classifyEncoder(values=[]){
  if(values.length<4)return 'Insufficient data';
  const {min,max}=minMax(values),set=new Set(values);
  if(min>=0&&max<=127&&set.size>16)return 'Absolute 0–127';
  const count=v=>values.filter(x=>x===v).length/values.length;
  if(count(1)+count(127)>.7)return 'Likely relative two\'s complement / increment-decrement';
  if(count(1)+count(65)>.7)return 'Likely relative binary offset';
  if(count(63)+count(65)>.7)return 'Likely relative sign/magnitude';
  return 'Unknown / mixed';
}

export function classifyControl(values=[]){
  if(values.length<6)return 'Insufficient data';
  const {min,max}=minMax(values),unique=new Set(values).size;
  if(unique<=4&&min<=8&&max>=119)return 'Switch / button candidate';
  if(max-min>=32&&unique>4)return 'Continuous control candidate';
  return 'Unclassified control';
}

export function messageRate(timestamps=[],windowMs=1000){if(!timestamps.length)return 0;const end=timestamps[timestamps.length-1],start=end-windowMs;return timestamps.filter(t=>t>=start).length/(windowMs/1000)}
export function peakMessageRate(timestamps=[],windowMs=1000){if(!timestamps.length)return 0;let peak=0,l=0;for(let r=0;r<timestamps.length;r++){while(timestamps[r]-timestamps[l]>windowMs)l++;peak=Math.max(peak,(r-l+1)/(windowMs/1000))}return peak}

export function analyzeNotePairs(events=[]){
  const active=new Map(),completed=[];let duplicateOns=0,duplicateOffs=0;
  for(const e of events){if(e.kind!=='noteon'&&e.kind!=='noteoff')continue;const k=`${e.channel}:${e.a}`;if(e.kind==='noteon'){if(active.has(k))duplicateOns++;else active.set(k,e)}
    else if(!active.has(k))duplicateOffs++;else{const on=active.get(k);completed.push({channel:e.channel,note:e.a,start:on.t,end:e.t,duration:Math.max(0,e.t-on.t),velocity:on.b});active.delete(k)}}
  return {completed,duplicateOns,duplicateOffs,stuck:[...active.values()].map(e=>({channel:e.channel,note:e.a,since:e.t,velocity:e.b}))};
}

export function heldNoteNumbers(held=[]){
  return [...new Set([...held].map(key=>Number(String(key).slice(String(key).lastIndexOf(':')+1))).filter(Number.isInteger))].sort((a,b)=>a-b);
}

export function updateHeldNotes(held,event){
  if(event.kind==='noteon')held.add(`${event.channel}:${event.a}`);
  else if(event.kind==='noteoff')held.delete(`${event.channel}:${event.a}`);
  return held;
}

export function latencyStats(samples=[]){if(!samples.length)return {count:0,min:null,median:null,mean:null,max:null,stdev:null};const {min,max}=minMax(samples);return {count:samples.length,min,median:median(samples),mean:Number(mean(samples).toFixed(3)),max,stdev:Number(stdev(samples).toFixed(3))}}

export function compareLoopback(sent=[],received=[]){
  const recv=received.map(x=>({bytes:[...x],used:false}));let matched=0,altered=0;
  for(const s0 of sent){const s=[...s0],exact=recv.find(r=>!r.used&&r.bytes.length===s.length&&r.bytes.every((v,i)=>v===s[i]));if(exact){exact.used=true;matched++;continue}
    const similar=recv.find(r=>!r.used&&r.bytes[0]===s[0]&&r.bytes[1]===s[1]);if(similar){similar.used=true;altered++}}
  const missing=Math.max(0,sent.length-matched-altered),extra=recv.filter(r=>!r.used).length;
  return {sent:sent.length,received:received.length,matched,altered,missing,extra,completion:sent.length?Number(((matched+altered)/sent.length*100).toFixed(1)):100};
}

export function detectFloods(events=[],windowMs=1000){
  if(!events.length)return [];const findings=[];
  const recent=events.filter(e=>(events.at(-1).t??0)-(e.t??0)<=windowMs);
  const identical=new Map();for(const e of recent){if(e.kind==='cc'){const k=`${e.channel}:${e.a}:${e.value}`;identical.set(k,(identical.get(k)||0)+1)}}
  for(const [k,n] of identical)if(n>=20)findings.push({type:'identical-cc-spam',detail:`${k} repeated ${n} times/${windowMs}ms`,count:n});
  const active=recent.filter(e=>e.kind==='active').length;if(active>=50)findings.push({type:'active-sense-heavy',detail:`${active} Active Sense messages/${windowMs}ms`,count:active});
  const clocks=recent.filter(e=>e.kind==='clock').length;if(clocks>=100)findings.push({type:'clock-heavy',detail:`${clocks} clock messages/${windowMs}ms`,count:clocks});
  if(recent.length>=500)findings.push({type:'high-message-rate',detail:`${recent.length} total messages/${windowMs}ms`,count:recent.length});
  return findings;
}

export function analyzeCcPairs(events=[]){
  const latest=new Map(),pairs=[];
  for(const e of events){if(e.kind!=='cc')continue;const k=`${e.channel}:${e.a}`;latest.set(k,e);if(e.a>=32&&e.a<=63){const msb=latest.get(`${e.channel}:${e.a-32}`);if(msb)pairs.push({channel:e.channel,msbCc:e.a-32,lsbCc:e.a,value14:(msb.value<<7)|e.value,t:e.t})}}
  return pairs;
}

export function createParameterTracker(){return {channels:new Map()}}
export function processParameterMessage(tracker,e){
  if(!tracker||e.kind!=='cc'||!e.channel)return null;if(!tracker.channels.has(e.channel))tracker.channels.set(e.channel,{mode:null,msb:null,lsb:null,dataMsb:0,dataLsb:0});
  const s=tracker.channels.get(e.channel);
  if(e.a===99||e.a===98||e.a===101||e.a===100){
    const mode=e.a===99||e.a===98?'NRPN':'RPN';
    if(s.mode!==mode){s.msb=null;s.lsb=null}
    s.mode=mode;
    if(e.a===99||e.a===101)s.msb=e.value;else s.lsb=e.value;
    if(s.msb===127&&s.lsb===127)s.mode=null;
    return null;
  }
  if(e.a===6){s.dataMsb=e.value} else if(e.a===38){s.dataLsb=e.value} else if(e.a!==96&&e.a!==97)return null;
  if(s.mode&&s.msb!==null&&s.lsb!==null){return {type:s.mode,channel:e.channel,parameter:(s.msb<<7)|s.lsb,value14:(s.dataMsb<<7)|s.dataLsb,increment:e.a===96?1:e.a===97?-1:0}}
  return null;
}

export function baselineDiff(oldReport={},curReport={}){
  const oldKeys=oldReport.keys||[],curKeys=curReport.keys||[],controls={};
  const keys=new Set([...Object.keys(oldReport.controls||{}),...Object.keys(curReport.controls||{})]);
  for(const k of keys){const a=oldReport.controls?.[k]||{},b=curReport.controls?.[k]||{};controls[k]={rangeDelta:(b.range??0)-(a.range??0),jitterDelta:Number(((b.jitter??0)-(a.jitter??0)).toFixed(2)),missing:!curReport.controls?.[k],new:!oldReport.controls?.[k]}}
  return {missingKeys:oldKeys.filter(k=>!curKeys.includes(k)),newKeys:curKeys.filter(k=>!oldKeys.includes(k)),disconnectDelta:(curReport.disconnects||0)-(oldReport.disconnects||0),controls,pitchCenterDelta:(curReport.pitch?.center??0)-(oldReport.pitch?.center??0),latencyMedianDelta:(curReport.latency?.median??0)-(oldReport.latency?.median??0),peakRateDelta:(curReport.messageRate?.peak??0)-(oldReport.messageRate?.peak??0)};
}

export function chordName(notes=[]){
  const pcs=[...new Set(notes.map(n=>((n%12)+12)%12))].sort((a,b)=>a-b);if(pcs.length<3||pcs.length>4)return null;const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  for(const root of pcs){const ints=pcs.map(p=>(p-root+12)%12).sort((a,b)=>a-b),key=ints.join(',');if(key==='0,4,7')return `${names[root]} major`;if(key==='0,3,7')return `${names[root]} minor`;if(key==='0,3,6')return `${names[root]} diminished`;if(key==='0,4,8')return `${names[root]} augmented`;if(key==='0,4,7,10')return `${names[root]}7`;if(key==='0,4,7,11')return `${names[root]}maj7`;if(key==='0,3,7,10')return `${names[root]}m7`}
  return null;
}

export function channelStats(events=[]){
  const out={};for(const e of events){if(!e.channel)continue;if(!out[e.channel])out[e.channel]={total:0,noteon:0,noteoff:0,cc:0,pitchbend:0,aftertouch:0,polyaftertouch:0,program:0};out[e.channel].total++;if(e.kind in out[e.channel])out[e.channel][e.kind]++}return out;
}

export function performanceStats(events=[]){
  const pair=analyzeNotePairs(events),ons=events.filter(e=>e.kind==='noteon').sort((a,b)=>a.t-b.t),inter=[];for(let i=1;i<ons.length;i++)inter.push(ons[i].t-ons[i-1].t);
  const byKey={},groups=[];for(const e of ons){if(!byKey[e.a])byKey[e.a]=[];byKey[e.a].push(e.b);const g=groups.at(-1);if(g&&e.t-g.start<=12){g.notes.push(e.a);g.spread=e.t-g.start}else groups.push({start:e.t,spread:0,notes:[e.a]})}
  return {notes:ons.map(e=>{const p=pair.completed.find(x=>x.channel===e.channel&&x.note===e.a&&x.start===e.t);return {note:e.a,channel:e.channel,velocity:e.b,t:e.t,duration:p?.duration??null}}),interOnset:inter,simultaneousGroups:groups.filter(g=>g.notes.length>1),velocityByKey:Object.fromEntries(Object.entries(byKey).map(([k,v])=>[k,velocityStats(v)])),held:pair.stuck};
}

export function reportSummary(state){return {version:2,device:state.device||'',started:state.started||null,durationMs:state.started?Date.now()-state.started:0,eventCount:state.events?.length||0,keys:[...(state.keys||[])].sort((a,b)=>a-b),channels:[...(state.channels||[])].sort((a,b)=>a-b),messageCounts:state.messageCounts||{},disconnects:state.disconnects||0,controls:state.controls||{},pitch:state.pitch||{}}}
