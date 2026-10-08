// Advanced diagnostic tests: pure analyzers over captured MIDI data. No DOM, no Web MIDI access.
// Every analyzer reports measurements; status is a triage hint ("attention"/"investigate"), never a repair diagnosis.
import {analyzeNotePairs,classifyEncoder,isSwitchLike,median,mean,stdev,velocityStats,switchStats} from './midi-core.js';

export const STATUS_ORDER=['notrun','info','ok','attention','investigate'];
export const STATUS_LABEL={notrun:'Not enough data',info:'Info',ok:'No concern observed',attention:'Attention',investigate:'Investigate'};
export const worst=list=>list.reduce((a,b)=>STATUS_ORDER.indexOf(b)>STATUS_ORDER.indexOf(a)?b:a,'notrun');
const f1=v=>v===null||v===undefined||!Number.isFinite(v)?'—':String(Math.round(v*10)/10);
const diffs=a=>a.slice(1).map((v,i)=>v-a[i]);

// ---------- T1 protocol conformance ----------
const UNDEFINED_STATUS=new Set([0xF4,0xF5,0xF9,0xFD]);
const FIXED_LEN={0xF1:2,0xF2:3,0xF3:2,0xF6:1,0xF8:1,0xFA:1,0xFB:1,0xFC:1,0xFE:1,0xFF:1};
export function expectedLength(status){const t=status&0xf0;if(status<0x80||status===0xF0||status===0xF7)return null;if(t===0xC0||t===0xD0)return 2;if(t>=0x80&&t<=0xE0)return 3;return FIXED_LEN[status]??null}
export function protocolAudit(events=[]){
  const r={total:events.length,undefinedStatus:0,badLength:0,highDataByte:0,unterminatedSysex:0,strayEox:0,trueNoteOff:0,velZeroNoteOff:0,releaseVelocity:0,channelMode:0,systemReset:0,tuneRequest:0,examples:[]};
  const note=(why,e)=>{if(r.examples.length<5)r.examples.push(why+': '+(e.hex||(e.raw||[]).join(' ')))};
  for(const e of events){const raw=e.raw||[],s=raw[0];if(s===undefined)continue;
    if(UNDEFINED_STATUS.has(s)){r.undefinedStatus++;note('undefined status',e);continue}
    if(s===0xF7){r.strayEox++;note('stray End-of-SysEx',e);continue}
    if(s===0xF0){if(raw.at(-1)!==0xF7){r.unterminatedSysex++;note('SysEx without F7',e)}if(raw.slice(1,-1).some(x=>x>127)){r.highDataByte++;note('SysEx data byte >127',e)}continue}
    const len=expectedLength(s);if(len!==null&&raw.length!==len){r.badLength++;note('length '+raw.length+' expected '+len,e)}
    if(raw.slice(1).some(x=>x>127)){r.highDataByte++;note('data byte >127',e)}
    const t=s&0xf0;
    if(t===0x80){r.trueNoteOff++;if(raw[2]!==undefined&&raw[2]!==0&&raw[2]!==64)r.releaseVelocity++}
    else if(t===0x90&&raw[2]===0)r.velZeroNoteOff++;
    else if(t===0xB0&&raw[1]>=120&&raw[1]<=127)r.channelMode++;
    else if(s===0xFF)r.systemReset++;else if(s===0xF6)r.tuneRequest++}
  const bad=r.undefinedStatus+r.badLength+r.highDataByte+r.unterminatedSysex+r.strayEox;
  const status=!r.total?'notrun':bad?'investigate':(r.channelMode||r.systemReset||r.tuneRequest)?'attention':'ok';
  return {...r,status};
}

// ---------- T2 link health ----------
export function linkHealth(events=[]){
  const as=[],clockGaps=[];let lastClock=null,clockCount=0;
  for(const e of events){
    if(e.kind==='active')as.push(e.t);
    else if(e.kind==='clock'){clockCount++;if(lastClock!==null)clockGaps.push(e.t-lastClock);lastClock=e.t}
    else if(e.kind==='stop'||e.kind==='start'||e.kind==='continue')lastClock=null;
  }
  const asGaps=diffs(as),asLate=asGaps.filter(g=>g>330).length;
  const usable=clockGaps.filter(g=>g<2000),med=median(usable)||0;let missed=0,stalls=0;
  if(clockCount>=25&&med>0)for(const g of usable)if(g>=1.5*med){missed+=Math.max(1,Math.round(g/med)-1);if(g>=3*med)stalls++}
  const asUsed=as.length>=3,clockUsed=clockCount>=25;
  const status=!asUsed&&!clockUsed?'notrun':(asUsed&&asLate>0)||missed>=3?'investigate':missed>0?'attention':'ok';
  return {status,activeSense:as.length,activeSenseMaxGap:asGaps.length?Math.max(...asGaps):null,activeSenseLate:asLate,clockTicks:clockCount,clockMedianMs:med||null,missedTicks:missed,stalls};
}

// ---------- T3 key double-trigger / chatter ----------
export function doubleTriggers(events=[],{gapMs=25,shortMs=10}={}){
  const lastOff=new Map(),re=[];let ons=0;
  for(const e of events){const k=e.channel+':'+e.a;
    if(e.kind==='noteoff')lastOff.set(k,e.t);
    else if(e.kind==='noteon'){ons++;const lo=lastOff.get(k);if(lo!==undefined&&e.t-lo>=0&&e.t-lo<gapMs)re.push({note:e.a,channel:e.channel,gap:e.t-lo,velocity:e.b})}}
  const short=analyzeNotePairs(events).completed.filter(n=>n.duration<shortMs);
  const perKey={};for(const x of re)perKey[x.note]=(perKey[x.note]||0)+1;for(const x of short)perKey[x.note]=(perKey[x.note]||0)+1;
  const worstKeys=Object.entries(perKey).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,c])=>({note:Number(n),count:c}));
  const lowVel=re.filter(x=>x.velocity<20).length,count=re.length+short.length;
  const status=ons<10?'notrun':count>=3?'investigate':count>0?'attention':'ok';
  return {status,noteOns:ons,retriggers:re.length,lowVelocityRetriggers:lowVel,shortNotes:short.length,minGap:re.length?Math.min(...re.map(x=>x.gap)):null,worstKeys};
}

// ---------- T4 velocity response ----------
export function velocityResponse(byKey=new Map(),all=[]){
  const vs=velocityStats(all);if(vs.count<10)return {status:'notrun',samples:vs.count};
  const used=vs.histogram.filter(n=>n>0).length,unique=new Set(all).size;
  const reps=[];for(const v of byKey.values())if(v.length>=5)reps.push(stdev(v));
  const means=[...byKey.entries()].filter(([,v])=>v.length>=3).map(([k,v])=>[Number(k),mean(v)]);
  const mm=median(means.map(x=>x[1])),outliers=means.length>=4?means.filter(([,m])=>Math.abs(m-mm)>=20).map(([k,m])=>({note:k,mean:Math.round(m),delta:Math.round(m-mm)})):[];
  const repeatability=reps.length?median(reps):null,softReach=vs.min<=20,hardReach=vs.max>=120;
  const status=outliers.length>=2||(repeatability!==null&&repeatability>15)||(vs.count>=30&&!hardReach&&used<=3)?'attention':'ok';
  return {status,samples:vs.count,floor:vs.min,ceiling:vs.max,binsUsed:used,uniqueValues:unique,softReach,hardReach,repeatability,outliers:outliers.slice(0,8)};
}

// ---------- T5 rollover / polyphony ----------
export function polyphonyCapacity(events=[],expected=null){
  const held=new Set();let max=0,maxAt=null;
  for(const e of events){const k=e.channel+':'+e.a;if(e.kind==='noteon'){held.add(k);if(held.size>max){max=held.size;maxAt=e.t}}else if(e.kind==='noteoff')held.delete(k)}
  if(!max)return {status:'notrun',maxHeld:0,expected};
  const short=expected?Math.max(0,expected-max):0;
  return {status:expected?(short>0?'attention':'ok'):'info',maxHeld:max,maxAt,expected,shortfall:short};
}

// ---------- T6 sweep linearity / monotonicity ----------
export function sweepQuality(values=[],times=[]){
  if(values.length<12)return {status:'notrun',samples:values.length};
  const d=[];for(let i=1;i<values.length;i++)if(values[i]!==values[i-1])d.push({d:values[i]-values[i-1],i,dt:times[i]!==undefined&&times[i-1]!==undefined?times[i]-times[i-1]:null});
  let backslides=0;for(let k=1;k<d.length-1;k++){const a=Math.sign(d[k-1].d),b=Math.sign(d[k].d),c=Math.sign(d[k+1].d);if(a===c&&a!==b&&Math.abs(d[k].d)<=3)backslides++}
  // longest monotonic run (ignoring repeats)
  let best={s:0,e:0,span:0},s=0;for(let k=1;k<=d.length;k++){if(k===d.length||Math.sign(d[k].d)!==Math.sign(d[s].d)){const span=Math.abs(values[d[k-1].i]-values[d[s].i-1]);if(span>best.span)best={s:s,e:k-1,span};s=k}}
  const run=d.slice(best.s,best.e+1);if(best.span<30||run.length<6)return {status:'notrun',samples:values.length,span:best.span,backslides};
  const coarse=run.filter(x=>x.dt!==null&&x.dt>=40&&Math.abs(x.d)>=3).length;
  const i0=run[0].i-1,i1=run.at(-1).i,pts=[];for(let i=i0;i<=i1;i++)pts.push([times[i]??i,values[i]]);
  const n=pts.length,mx=mean(pts.map(p=>p[0])),my=mean(pts.map(p=>p[1]));let sxy=0,sxx=0,syy=0;for(const [x,y] of pts){sxy+=(x-mx)*(y-my);sxx+=(x-mx)**2;syy+=(y-my)**2}
  const r2=sxx&&syy?sxy*sxy/(sxx*syy):1,slope=sxx?sxy/sxx:0,maxDev=Math.max(...pts.map(([x,y])=>Math.abs(y-(my+slope*(x-mx)))))/best.span*100;
  const status=backslides>=2||coarse>=2?'attention':'ok';
  return {status,samples:values.length,runSteps:run.length,span:best.span,backslides,coarseSteps:coarse,r2:Number(r2.toFixed(3)),maxDeviationPct:Number(maxDev.toFixed(1)),steady:r2>=0.9};
}

// ---------- T7 relative encoder integrity ----------
export function detectEncoderMode(values=[]){
  if(values.length<6||values.includes(0)&&isSwitchLike(values))return null;
  const share=(...vs)=>values.filter(v=>vs.includes(v)).length/values.length;
  if(share(1,127)>.6)return 'twos';if(share(63,65)>.6)return 'offset';if(share(1,65)>.6)return 'signmag';return null;
}
const DECODERS={twos:v=>v<64?v:v-128,offset:v=>v-64,signmag:v=>v<64?v:-(v-64)};
export function encoderAnalysis(values=[],times=[]){
  const mode=detectEncoderMode(values);if(!mode)return {status:'notrun',mode:null};
  const dl=values.map(DECODERS[mode]).filter(x=>x!==0);let cw=0,ccw=0,glitches=0,fast=0;
  dl.forEach((x,i)=>{if(x>0)cw+=x;else ccw+=-x;if(Math.abs(x)>1)fast++;
    if(i>0&&i<dl.length-1&&Math.abs(x)===1&&Math.sign(dl[i-1])===Math.sign(dl[i+1])&&Math.sign(x)!==Math.sign(dl[i-1]))glitches++});
  const ticks=cw+ccw,rate=glitches/Math.max(1,dl.length);
  const status=dl.length<8?'notrun':glitches>=2&&rate>0.02?'attention':'ok';
  return {status,mode,events:dl.length,cw,ccw,net:cw-ccw,glitches,accelerated:fast,ticks};
}

// ---------- T8 pitch-bend spring return ----------
export function pitchReturn(values=[],times=null,{big=4096,settle=512}={}){
  const out=[];let i=0;const n=values.length;
  while(i<n){if(Math.abs(values[i])>=big){let j=i;while(j+1<n&&Math.abs(values[j+1])>=big)j++;const sign=Math.sign(values[j]);let e=j+1;while(e<n&&Math.abs(values[e])<big)e++;
      let s=-1;for(let k=j+1;k<e;k++)if(Math.abs(values[k])<=settle){s=k;break}
      let overshoot=0;for(let k=j+1;k<e&&(s<0||k<=s+2);k++)overshoot=Math.max(overshoot,-sign*values[k]);
      out.push({peak:values[j],settled:s>=0,returnMs:s>=0&&times?times[s]-times[j]:null,overshoot:Math.max(0,overshoot),final:s>=0?values[s]:(e>j+1?values[e-1]:null)});i=e}else i++}
  if(!out.length)return {status:'notrun',excursions:0};
  const done=out.filter(x=>x.settled),unsettled=out.length-done.length,ret=done.map(x=>x.returnMs).filter(Number.isFinite),over=Math.max(...out.map(x=>x.overshoot));
  const status=out.length<2?'info':unsettled>0?'investigate':over>1024?'attention':'ok';
  return {status,excursions:out.length,unsettled,medianReturnMs:median(ret),slowestReturnMs:ret.length?Math.max(...ret):null,maxOvershoot:over};
}

// ---------- T9 pedal polarity / range ----------
export function pedalPolarity(values=[],times=[]){
  if(values.length<4)return {status:'notrun',samples:values.length};
  const sw=switchStats(values,times),min=Math.min(...values),max=Math.max(...values),last=values.at(-1),distinct=new Set(values).size;
  if(!(min<64&&max>=64))return {status:'notrun',samples:values.length,min,max};
  const inverted=last>=64,full=min<=5&&max>=122;
  return {status:inverted||sw.bounces>0?'attention':!full?'info':'ok',samples:values.length,min,max,final:last,transitions:sw.transitions,bounces:sw.bounces,distinct,continuous:distinct>3,fullTravel:full};
}

// ---------- T10 loopback burst / throughput ----------
export function burstStage(sent=[],received=[]){
  const set=new Set(received),uniq=new Set();let dup=0,ooo=0;
  for(let i=0;i<received.length;i++){if(uniq.has(received[i]))dup++;uniq.add(received[i]);if(i>0&&received[i]<received[i-1])ooo++}
  const lost=sent.filter(s=>!set.has(s)).length;
  return {sent:sent.length,received:received.length,lost,duplicates:dup,outOfOrder:ooo,lossPct:sent.length?Number((lost/sent.length*100).toFixed(1)):0};
}
export function burstAnalysis(stages=[]){
  if(!stages.length)return {status:'notrun',stages:[]};
  const rows=stages.map(s=>({label:s.label,rate:s.rate,...burstStage(s.sent,s.received),medianLatencyMs:s.latencies?.length?median(s.latencies):null}));
  const lowLoss=rows.some(r=>r.rate>0&&r.rate<=250&&(r.lost||r.outOfOrder||r.duplicates));
  const anyLoss=rows.some(r=>r.lost||r.outOfOrder||r.duplicates);
  return {status:lowLoss?'investigate':anyLoss?'attention':'ok',stages:rows};
}

// ---------- catalog: plain-language run / read / limits text used by the Tests tab ----------
export const TEST_GUIDE={
  protocol:{title:'Protocol conformance audit',kind:'Passive · any device',
    run:'Just play and operate the controller for a minute (keys, knobs, buttons, pedals). Nothing special is required.',
    reads:'Every message is checked against the MIDI 1.0 byte rules: data bytes must be 0–127, each status must have the right length, undefined statuses (F4, F5, F9, FD) must not appear and SysEx must end with F7. Channel-mode CCs (120–127), System Reset and Tune Request are listed because a controller rarely should send them unprompted.',
    limits:'Web MIDI delivers already-parsed messages and silently drops some malformed bytes, so a clean result does not prove the raw cable stream was clean. Running status is resolved by the browser and cannot be observed.'},
  link:{title:'Link health (Active Sensing & clock continuity)',kind:'Passive · devices that send Active Sensing or MIDI clock',
    run:'Leave the device connected and idle for 30 seconds (Active Sensing) or run its clock/sequencer for at least 25 ticks.',
    reads:'MIDI 1.0 says a sender using Active Sensing must transmit FE at least every 300 ms. Gaps over 330 ms mean the link or the device paused. For clock, ticks should arrive at a steady interval; gaps of 1.5× the median interval imply missed ticks, which show up as tempo wobble or drift in synced gear.',
    limits:'Most USB controllers never send Active Sensing, so "not enough data" is normal. Gaps can also come from browser tab throttling – keep the window in front.'},
  retrigger:{title:'Key / pad double-trigger and chatter',kind:'Passive · keyboards, pads, drum triggers',
    run:'Play each key or pad with a single, deliberate press and release at medium force. Then press lightly and slowly and hold for a second.',
    reads:'A human cannot release and re-press the same key within about 25 ms, so a Note Off followed by a Note On on the same key that quickly is usually contact bounce or a double-trigger. Notes lasting under 10 ms are also suspicious. Low-velocity retriggers are the classic sign of a worn contact or dirty pad sensor.',
    limits:'Fast legitimate drum rolls on a pad can approach the threshold; check that the flagged notes match what you actually played.'},
  velocity:{title:'Velocity response and consistency',kind:'Passive · velocity-sensitive keys and pads',
    run:'Play a few notes very softly, a few very hard, then strike one key 5+ times with the same force. Repeat on a few other keys with a similar touch.',
    reads:'Floor and ceiling show whether the full 1–127 range is reachable. Bins used shows how much of the range you exercised. Repeatability is the median per-key standard deviation for repeated strikes (lower is more consistent). Outliers are keys whose average velocity differs ≥20 from the median key under similar playing.',
    limits:'Human playing is not perfectly even, so outliers are hints. Confirm by repeating on the flagged key and a neighbour with the same force.'},
  rollover:{title:'Rollover / polyphony capacity',kind:'Passive with a user-supplied key count · keyboards',
    run:'Enter how many keys you will hold, then press and hold that many keys at once (for example a full ten-finger cluster) and release.',
    reads:'The maximum number of notes the controller reported as held at the same time is compared with what you pressed. A smaller number than expected means keys were not reported while others were down – a rollover limit or matrix ghosting-prevention behavior.',
    limits:'Some keyboards deliberately limit rollover. Compare against the manufacturer\'s specification before treating it as a fault.'},
  sweep:{title:'Sweep linearity and monotonicity (per control)',kind:'Passive · faders, knobs, wheels, expression pedals',
    run:'Move one control smoothly and steadily from one end to the other, then back, at a constant speed. Use "Reset selected capture" on the Controls tab first for a clean run.',
    reads:'Backslides are tiny reversals inside a movement (value goes up, down one or two steps, then up again), typical of a worn track or noisy ADC. Coarse steps are jumps of 3+ values during a slow movement, meaning lost resolution. Linearity (R²) and maximum deviation compare value against time; close to 1.0 / small deviation means a steady taper.',
    limits:'Your hand speed is not perfectly constant, and log/audio tapers are curved by design, so a low R² alone is not a fault. Backslides and coarse steps are the stronger signals.'},
  encoder:{title:'Relative encoder integrity',kind:'Passive · endless encoders and jog wheels',
    run:'Turn the encoder slowly clockwise for ten clicks, then counter-clockwise for ten clicks. Repeat slowly, then quickly.',
    reads:'The encoding (two\'s complement, binary offset or sign-magnitude) is detected from the values, then ticks are decoded to signed steps. A direction glitch is a single opposite tick between ticks of the same direction, a typical symptom of a dirty or worn encoder contact. For equal clockwise and counter-clockwise turns, Net should be close to 0.',
    limits:'Fast flicks can legitimately produce multi-step values (acceleration). Only isolated one-tick reversals are counted as glitches.'},
  pitch:{title:'Pitch-bend spring return',kind:'Passive · pitch wheels and sticks',
    run:'Push the wheel to an extreme, let go and let it spring back. Repeat at least 5 times in both directions.',
    reads:'Time to settle is how long the wheel takes to get from the extreme back within ±512 units of center. Overshoot is how far it swings past center to the opposite side. Unsettled means the wheel stopped beyond ±512 – a sticky or weak spring, or a dead center that does not return.',
    limits:'Slow releases by hand give long return times. For a fair measurement, release the wheel completely without guiding it.'},
  pedal:{title:'Sustain pedal polarity and range',kind:'Passive · sustain/foot switches (CC64)',
    run:'Start with the pedal fully released, press it all the way down, release it fully and stop touching it. Repeat 3 times.',
    reads:'The last reported value after you release the pedal should be below 64. If it is 64 or higher the pedal is either inverted (polarity set for the opposite pedal type) or stuck. Full travel means the values reached near 0 and near 127. Bounces are quick on/off flips under 40 ms.',
    limits:'Many keyboards detect pedal polarity at power-up; if you plugged the pedal in while holding it down, restart the keyboard with the pedal released.'},
  burst:{title:'Loopback burst / throughput stress',kind:'Active · requires MIDI OUT looped back to MIDI IN',
    run:'Route the selected output into the selected input (cable or virtual loopback port), choose the number of messages per stage and press Run burst test. The test sends numbered pitch-bend messages at 50/s, 250/s, 1000/s and as one instantaneous burst.',
    reads:'Each message carries a unique 14-bit sequence number so loss, duplicates and re-ordering can be counted exactly. Loss at 250/s or less is a real problem. Loss at 1000/s or the instant burst is expected on classic 5-pin DIN (31.25 kbaud ≈ 1000 three-byte messages per second at best) and not expected on USB.',
    limits:'Measures the full browser→driver→device→driver→browser path, not the device alone. Do not run into a hardware synth with pitch-bend response enabled – it will hear the bends (a center pitch-bend is sent at the end).'}
};

const MEANING={
  protocol:{ok:'Every message captured follows the MIDI 1.0 byte rules. This does not cover how the device behaves, only that the stream was well-formed.',attention:'The device sent channel-mode, System Reset or Tune Request messages. These are legal but unusual from a controller; check whether a panic/reset button or a driver utility sent them. A System Reset can make receiving gear forget its settings.',investigate:'Malformed data was observed (wrong lengths, undefined statuses or bytes above 127). That points to a firmware problem, a cable/interface fault or a misbehaving driver. Reproduce with a different cable/port; if it persists the device firmware is the likely source.',notrun:'No messages captured yet.',info:''},
  link:{ok:'Active Sensing and/or clock arrived on time with no gaps, so the link looked continuous during the capture.',attention:'A few clock ticks were missed. A single miss can come from a busy computer; repeated misses indicate USB congestion, power-saving or a flaky cable.',investigate:'Active Sensing gaps exceeded 300 ms or several clock ticks were missed. A receiving synth would cut off notes here. Check the cable/port, disable USB power saving (selective suspend), avoid unpowered hubs and re-test.',notrun:'Neither Active Sensing nor 25+ clock ticks were seen. Most USB devices do not send Active Sensing, so this is usually normal.',info:''},
  retrigger:{ok:'No suspiciously fast re-triggers or ultra-short notes were seen.',attention:'One or two fast retriggers or very short notes appeared. Could be technique; repeat on the same key to see if it recurs.',investigate:'Repeated fast retriggers or very short notes. Likely contact bounce (worn rubber dome contacts, dirty pad sensor or failing switch). The listed keys are the best candidates for cleaning or replacement.',notrun:'Play at least 10 notes.',info:''},
  velocity:{ok:'Velocity range, spread and consistency look reasonable for the playing captured.',attention:'Some keys or the overall response look uneven (inconsistent repeats, outlier keys or a compressed range). Repeat with identical force on the flagged keys; if they still differ, that key\'s sensor or contact may be worn.',investigate:'',notrun:'Play at least 10 notes with varied force.',info:''},
  rollover:{ok:'The controller reported at least as many simultaneous notes as you pressed.',attention:'Fewer notes were reported than you pressed. The keyboard has a rollover limit or its matrix is blocking key combinations.',investigate:'',notrun:'Hold several keys at once, then release.',info:'Maximum simultaneous notes reported. Enter how many keys you pressed to turn this into a pass/attention check.'},
  sweep:{ok:'Sweeps were monotonic with no backslides or coarse steps.',attention:'Backslides or coarse steps were found on at least one control. That indicates a noisy track, loose wiper or low-resolution ADC. See the per-control lines to find which one.',investigate:'',notrun:'Move a control smoothly end to end (at least 12 values, 30+ span).',info:''},
  encoder:{ok:'The encoder tick stream was clean with no isolated direction glitches.',attention:'Isolated opposite-direction ticks were found. This is the classic symptom of a dirty or worn encoder contact; cleaning with contact cleaner often helps.',investigate:'',notrun:'Turn a relative encoder in both directions (8+ ticks).',info:''},
  pitch:{ok:'The wheel returned to center promptly and without large overshoot.',attention:'The wheel overshoots past center by more than 1024 units. This suggests a loose or worn spring/pot and may cause audible pitch wobble.',investigate:'At least one release ended outside ±512 of center. The wheel is sticking, the spring is weak or the center is offset.',notrun:'Push the pitch wheel to an extreme and let go.',info:'Only one excursion captured; repeat at least 5 times for a trustworthy result.'},
  pedal:{ok:'The pedal released to a value below 64 and travelled the full range.',attention:'The pedal ended on a value of 64 or more after release, or bounced. This is typically inverted polarity (restart the keyboard with the pedal released) or a stuck/failing switch.',investigate:'',notrun:'Press and release the sustain pedal several times.',info:'The pedal works but did not reach the full 0–127 range.'},
  burst:{ok:'No loss, duplication or re-ordering at any stage. The loopback path is reliable at these rates.',attention:'Messages were lost only in the highest-rate stages. On a USB interface that signals a driver/buffer limit; on classic DIN it is expected.',investigate:'Messages were lost, duplicated or re-ordered at modest rates (≤250/s). The path (cable, interface, driver or hub) is unreliable. Try another cable/port/hub and re-test.',notrun:'Run the burst test with an output looped back to the input.',info:''}
};

// Aggregate every test into card objects for the UI/report. `inp` is plain data from the app state.
export function buildTestResults(inp={}){
  const ev=inp.events||[],res=[];
  const add=(id,status,headline,metrics,extra={})=>res.push({id,title:TEST_GUIDE[id].title,kind:TEST_GUIDE[id].kind,status,headline,metrics,meaning:[MEANING[id][status]||'',...(extra.meaning||[])].filter(Boolean),rows:extra.rows||[]});
  const p=protocolAudit(ev);
  add('protocol',p.status,p.total?p.total+' messages checked':'No data',[['Messages',p.total],['Undefined status',p.undefinedStatus],['Length mismatches',p.badLength],['Data byte >127',p.highDataByte],['Unterminated SysEx',p.unterminatedSysex],['Stray EOX',p.strayEox],['True Note Off (8n)',p.trueNoteOff],['Note On vel 0 as off',p.velZeroNoteOff],['Release velocity used',p.releaseVelocity],['Channel-mode CC 120–127',p.channelMode],['System Reset',p.systemReset],['Tune Request',p.tuneRequest]],{rows:p.examples});
  const l=linkHealth(ev);
  add('link',l.status,l.status==='notrun'?'No Active Sensing or clock':(l.activeSense?l.activeSense+' Active Sense · ':'')+(l.clockTicks?l.clockTicks+' clock ticks':''),[['Active Sensing messages',l.activeSense],['Longest Active Sense gap ms',f1(l.activeSenseMaxGap)],['Gaps >330 ms',l.activeSenseLate],['Clock ticks',l.clockTicks],['Median tick ms',f1(l.clockMedianMs)],['Missed ticks',l.missedTicks],['Stalls (≥3 ticks)',l.stalls]]);
  const d=doubleTriggers(ev);
  add('retrigger',d.status,d.status==='notrun'?'Fewer than 10 notes':(d.retriggers+d.shortNotes)+' suspicious event(s)',[['Note Ons',d.noteOns],['Fast retriggers (<25 ms)',d.retriggers],['…with velocity <20',d.lowVelocityRetriggers],['Notes <10 ms',d.shortNotes],['Smallest gap ms',f1(d.minGap)]],{rows:d.worstKeys.map(k=>'Key '+k.note+': '+k.count+' event(s)')});
  const v=velocityResponse(inp.velocityByKey||new Map(),inp.velocityValues||[]);
  add('velocity',v.status,v.status==='notrun'?'Fewer than 10 velocity samples':'Range '+v.floor+'–'+v.ceiling+' · repeatability σ '+f1(v.repeatability),v.status==='notrun'?[['Samples',v.samples]]:[['Samples',v.samples],['Floor',v.floor],['Ceiling',v.ceiling],['Soft reached (≤20)',v.softReach?'yes':'no'],['Hard reached (≥120)',v.hardReach?'yes':'no'],['Velocity bins used (of 8)',v.binsUsed],['Distinct values',v.uniqueValues],['Repeatability σ',f1(v.repeatability)],['Outlier keys',v.outliers.length]],{rows:(v.outliers||[]).map(o=>'Key '+o.note+': mean '+o.mean+' ('+(o.delta>0?'+':'')+o.delta+' vs median key)')});
  const r=polyphonyCapacity(ev,inp.expectedPoly||null);
  add('rollover',r.status,r.maxHeld?'Max '+r.maxHeld+' simultaneous note(s)'+(r.expected?' of '+r.expected+' expected':''):'No notes',[['Max simultaneous notes',r.maxHeld],['Expected',r.expected??'not set'],['Shortfall',r.shortfall??'—']]);
  const sw=[],enc=[];
  for(const [k,vals] of inp.cc||[]){const cc=Number(k.split(':')[1]);if(inp.paramCcs?.has(cc)||isSwitchLike(vals))continue;const times=inp.ccTimes?.get(k)||[];
    if(classifyEncoder(vals).startsWith('Likely relative')||detectEncoderMode(vals)){enc.push([k,encoderAnalysis(vals,times)]);continue}
    sw.push([k,sweepQuality(vals,times)])}
  const sRows=sw.filter(([,x])=>x.status!=='notrun');
  add('sweep',worst(sRows.map(([,x])=>x.status)),sRows.length?sRows.length+' control(s) analysed':'No sweep analysable',[['Controls analysed',sRows.length],['With backslides',sRows.filter(([,x])=>x.backslides>0).length],['With coarse steps',sRows.filter(([,x])=>x.coarseSteps>0).length]],{rows:sRows.slice(0,24).map(([k,x])=>'Ch:CC '+k+' — span '+x.span+', '+x.backslides+' backslide(s), '+x.coarseSteps+' coarse step(s), R² '+x.r2+', max deviation '+x.maxDeviationPct+'%'+(x.steady?'':' (uneven speed or curved taper)')+' ['+STATUS_LABEL[x.status]+']')});
  const eRows=enc.filter(([,x])=>x.status!=='notrun');
  add('encoder',worst(eRows.map(([,x])=>x.status)),eRows.length?eRows.length+' encoder(s) analysed':'No relative encoder detected',[['Encoders analysed',eRows.length],['Direction glitches',eRows.reduce((a,[,x])=>a+x.glitches,0)]],{rows:eRows.map(([k,x])=>'Ch:CC '+k+' — '+({twos:"two's complement",offset:'binary offset',signmag:'sign-magnitude'})[x.mode]+', CW '+x.cw+', CCW '+x.ccw+', net '+x.net+', '+x.glitches+' glitch(es), '+x.accelerated+' accelerated event(s) ['+STATUS_LABEL[x.status]+']')});
  const pb=pitchReturn(inp.pitchValues||[],inp.pitchTimes||null);
  add('pitch',pb.status,pb.excursions?pb.excursions+' excursion(s)':'No pitch-bend excursions',[['Excursions',pb.excursions],['Did not settle',pb.unsettled??'—'],['Median return ms',f1(pb.medianReturnMs)],['Slowest return ms',f1(pb.slowestReturnMs)],['Max overshoot units',pb.maxOvershoot??'—']]);
  const pe=pedalPolarity(inp.sustainValues||[],inp.sustainTimes||[]);
  add('pedal',pe.status,pe.status==='notrun'?'No press/release cycle':'Final value '+pe.final+(pe.final>=64?' (pedal reads pressed)':' (released)'),pe.status==='notrun'?[['Samples',pe.samples]]:[['Samples',pe.samples],['Range',pe.min+'–'+pe.max],['Final value',pe.final],['Transitions',pe.transitions],['Bounces',pe.bounces],['Distinct values',pe.distinct],['Half-damper capable',pe.continuous?'yes':'no'],['Full travel',pe.fullTravel?'yes':'no']]);
  const b=burstAnalysis(inp.burst?.stages||[]);
  add('burst',b.status,b.stages.length?'Worst loss '+Math.max(...b.stages.map(s=>s.lossPct))+'%':'Not run',[['Stages',b.stages.length]],{rows:b.stages.map(s=>s.label+': sent '+s.sent+', received '+s.received+', lost '+s.lost+' ('+s.lossPct+'%), duplicates '+s.duplicates+', out of order '+s.outOfOrder+', median latency '+f1(s.medianLatencyMs)+' ms')});
  return res;
}
