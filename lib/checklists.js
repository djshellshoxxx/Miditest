// Device-type checklists (pure logic). Cards come from midi-tests.buildTestResults().
export const PRESET_TO_CHECKLIST={'Generic MIDI Device':'generic','Keyboard Controller':'keyboard61','Pad Controller':'pad16','DJ Controller':'djController','Foot Controller':'footController','Hardware Synth':'synth'};
const it=(id,title,instruction,required=true,manual=false)=>({id,title,instruction,required,manual});
const COMMON=[it('protocol','No protocol errors','Play and operate the controller for a minute.')];
export const CHECKLISTS={
  generic:{name:'Generic MIDI device',version:1,items:[...COMMON,it('retrigger','No double-trigger events','Play single deliberate presses.',false)]},
  keyboard61:{name:'61-key keyboard',version:1,defaults:{low:36,high:96},items:[
    it('keys','All keys seen','Press every key once, bottom to top.'),
    it('velocity','Velocity floor <= 20 and ceiling >= 120','Play very softly and very hard.'),
    it('pitch','Pitch bend returns to centre','Move the pitch wheel fully both ways and release.'),
    it('modwheel','Mod wheel full range (CC1 range >= 100)','Move the mod wheel from bottom to top.'),
    it('sustain','Sustain polarity correct','Press and release the sustain pedal.'),
    it('retrigger','No retrigger events','Play each key once, slowly.'),
    ...COMMON,it('aftertouch','Aftertouch present','Press keys harder after the note starts (if supported).',false)]},
  pad16:{name:'16-pad controller',version:1,defaults:{low:36,high:51},items:[
    it('pads','Each pad seen','Hit every pad once.'),
    it('velocity','Velocity floor <= 20 and ceiling >= 120','Hit pads softly and hard.'),
    it('retrigger','No double-trigger events','Hit each pad once, deliberately.'),
    ...COMMON,it('aftertouch','Aftertouch present','Press pads after the hit (if supported).',false)]},
  djController:{name:'DJ controller',version:1,items:[
    it('encoder','Encoders balanced','Turn each jog wheel/encoder both ways by the same amount.'),
    it('burst','No message flood','Operate several controls at once.'),
    it('controls','Controls moved (CC seen)','Move every fader and knob.'),
    ...COMMON]},
  footController:{name:'Foot controller',version:1,items:[
    it('pedal','Each switch toggles, bounce 0','Press and release each switch cleanly.'),
    it('retrigger','No double-trigger events','Press each switch once.',false),
    ...COMMON]},
  synth:{name:'Hardware synth',version:1,items:[
    it('sounds','Output sounds on all channels','Send notes on each channel and listen.',true,true),
    it('audio','No stuck notes or noise','Listen while playing and releasing.',true,true),
    it('panel','Front panel controls respond','Operate knobs and buttons.',false,true),
    ...COMMON]}
};
const card=(ctx,id)=>(ctx.tests||[]).find(c=>c&&c.id===id);
const fromCard=(ctx,id,failOn=['attention','investigate'])=>{
  const c=card(ctx,id);if(!c||c.status==='notrun')return {status:'pending',detail:'Not enough data yet'};
  return failOn.includes(c.status)?{status:'fail',detail:c.headline||c.status}:{status:'pass',detail:c.headline||''};
};
const names=n=>['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][n%12]+(Math.floor(n/12)-1);
const range=(ctx,def)=>{const e=ctx.expected;return e&&Number.isFinite(e.low)&&Number.isFinite(e.high)?{low:e.low,high:e.high}:def};
function seen(ctx,def,label){
  const r=range(ctx,def),obs=new Set(ctx.keys||[]);if(!r)return {status:'pending',detail:'No expected range set'};
  if(!obs.size)return {status:'pending',detail:'No notes observed yet'};
  const miss=[];for(let n=r.low;n<=r.high;n++)if(!obs.has(n))miss.push(n);
  const tot=r.high-r.low+1;
  return miss.length?{status:'fail',detail:'Missing '+label+' ('+miss.length+'/'+tot+'): '+miss.map(names).join(', ')}:{status:'pass',detail:tot+'/'+tot+' seen'};
}
const velo=ctx=>{const v=(ctx.velocityValues||[]).filter(Number.isFinite);if(!v.length)return {status:'pending',detail:'No velocity observed'};
  const lo=Math.min(...v),hi=Math.max(...v);return lo<=20&&hi>=120?{status:'pass',detail:lo+'–'+hi}:{status:'fail',detail:'Velocity '+lo+'–'+hi+' (need floor <= 20, ceiling >= 120)'}};
const CHECKS={
  keys:(c,d)=>seen(c,d,'keys'),pads:(c,d)=>seen(c,d,'pads'),velocity:velo,
  pitch:c=>fromCard(c,'pitch'),sustain:c=>fromCard(c,'pedal'),pedal:c=>fromCard(c,'pedal'),
  retrigger:c=>fromCard(c,'retrigger'),protocol:c=>fromCard(c,'protocol'),burst:c=>fromCard(c,'burst'),
  encoder:c=>fromCard(c,'encoder',['investigate']),
  modwheel:c=>{let vals=[];for(const [k,v] of ctx_cc(c))if(k.split(':')[1]==='1')vals=vals.concat(v);
    if(!vals.length)return {status:'pending',detail:'CC1 not observed'};const r=Math.max(...vals)-Math.min(...vals);
    return r>=100?{status:'pass',detail:'range '+r}:{status:'fail',detail:'CC1 range '+r+' (need >= 100)'}},
  controls:c=>{const n=[...ctx_cc(c)].filter(([,v])=>v.length).length;return n?{status:'pass',detail:n+' CC stream(s) seen'}:{status:'pending',detail:'No CC observed'}},
  aftertouch:c=>c.aftertouchCount>0?{status:'pass',detail:c.aftertouchCount+' message(s)'}:{status:'pending',detail:'Not observed'}
};
const ctx_cc=c=>c.cc instanceof Map?c.cc:new Map(Object.entries(c.cc||{}));
export function evaluateChecklist(key,ctx={}){
  const cl=CHECKLISTS[key]||CHECKLISTS.generic,k=CHECKLISTS[key]?key:'generic',items=cl.items.map(i=>{
    let r;
    if(ctx.skipped?.[i.id])r={status:'skipped',detail:'Skipped by user'};
    else if(i.manual)r=ctx.manual?.[i.id]?{status:'pass',detail:'Confirmed manually'}:{status:'pending',detail:'Awaiting manual confirmation'};
    else{try{r=CHECKS[i.id]?CHECKS[i.id](ctx,cl.defaults):{status:'pending',detail:'No check'}}catch(e){r={status:'pending',detail:'Check error'}}}
    return {...i,status:r.status,detail:r.detail};
  });
  const req=items.filter(i=>i.required),count=s=>items.filter(i=>i.status===s).length;
  const verdict=req.some(i=>i.status==='fail')?'REVIEW':req.every(i=>i.status==='pass')?'PASS':'INCOMPLETE';
  return {key:k,name:cl.name,items,verdict,passed:count('pass'),failed:count('fail'),pending:count('pending'),total:items.length};
}
