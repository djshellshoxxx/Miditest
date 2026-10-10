// Pure chart builders for MIDItest. Everything here returns plain data or SVG/HTML strings so it can be unit tested in Node.
// chartGroups(input) turns captured MIDI statistics into chart specs; renderChartGroups(groups) turns the specs into markup.
import {controlStats} from './midi-core.js';

export const LIMITED_BELOW=75;   // coverage % under which a control counts as "limited travel" (same threshold as the findings list)
export const MAX_POINTS=400;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteLabel=n=>NOTE_NAMES[((n%12)+12)%12]+(Math.floor(n/12)-1);
const sum=a=>a.reduce((x,y)=>x+y,0);
const pctOf=(v,t)=>t?Math.round(v/t*1000)/10:0;

// ---------- classification ----------
// Health of one absolute (0-127) control from the values captured so far.
export function classifyControl(values=[]){
  const s=controlStats(values);
  if(s.count<2||s.unique<=1)return 'stuck';
  if((s.count>=20&&s.jitter>=4)||s.jumps>=3)return 'noisy';
  if(s.coverage<LIMITED_BELOW)return 'limited';
  return 'working';
}
const CONTROL_SLICES=[['working','Working: full travel, clean','good'],['noisy','Noisy or jumpy','warn'],['limited','Limited travel (<'+LIMITED_BELOW+'% swept)','bad'],['stuck','No movement (one value only)','muted']];
export function controlHealth(controls=[]){
  const out={working:0,noisy:0,limited:0,stuck:0,total:0};
  for(const c of controls){out[classifyControl(c.values)]++;out.total++}
  return out;
}

// Keys: total comes from the expected range when set, otherwise the span between the lowest and highest key seen.
export function keyHealth({keys=[],expected={},suspect=[]}={}){
  const seen=new Set(keys),bad=new Set(suspect);
  const low=expected.low??(seen.size?Math.min(...seen):null),high=expected.high??(seen.size?Math.max(...seen):null);
  if(low===null||high===null||high<low)return {total:0,working:0,suspect:0,missing:0,low:null,high:null,fromExpected:false};
  let working=0,sus=0,missing=0;
  for(let n=low;n<=high;n++){if(!seen.has(n))missing++;else if(bad.has(n))sus++;else working++}
  return {total:high-low+1,working,suspect:sus,missing,low,high,fromExpected:expected.low!==null&&expected.low!==undefined&&expected.high!==null&&expected.high!==undefined};
}

// ---------- series helpers ----------
export function toPoints(values=[],times=null,max=MAX_POINTS){
  const useTime=Array.isArray(times)&&times.length===values.length&&values.length>0,t0=useTime?times[0]:0;
  let pts=values.map((v,i)=>[useTime?(times[i]-t0)/1000:i,v]);
  if(pts.length>max){const stride=pts.length/max;pts=Array.from({length:max},(_,i)=>pts[Math.min(pts.length-1,Math.floor(i*stride))]);}
  return pts;
}
const fmt=v=>Math.abs(v)>=100?String(Math.round(v)):Math.abs(v)>=10?v.toFixed(0):v.toFixed(1).replace(/\.0$/,'');

// ---------- renderers ----------
function frame(spec,body,legend=''){
  const note=spec.note?'<p class="chart-note">'+esc(spec.note)+'</p>':'';
  return '<figure class="chart" data-chart="'+esc(spec.id||'')+'"><figcaption><strong>'+esc(spec.title)+'</strong>'+(spec.subtitle?'<span>'+esc(spec.subtitle)+'</span>':'')+'</figcaption>'+body+legend+note+'</figure>';
}
function emptyBody(text){return '<p class="chart-empty">'+esc(text||'No data captured yet.')+'</p>'}

export function renderPie(spec){
  const slices=(spec.slices||[]).filter(s=>s.value>0),total=sum(slices.map(s=>s.value));
  if(!total)return frame(spec,emptyBody(spec.empty));
  const R=15.9155;let acc=0;
  const rings=slices.map(s=>{const p=s.value/total*100,c='<circle class="slice t-'+s.tone+'" cx="21" cy="21" r="'+R+'" stroke-dasharray="'+p.toFixed(3)+' '+(100-p).toFixed(3)+'" stroke-dashoffset="'+(25-acc).toFixed(3)+'"><title>'+esc(s.label)+': '+s.value+' ('+pctOf(s.value,total)+'%)</title></circle>';acc+=p;return c}).join('');
  const label=spec.slices.filter(s=>s.value>0).map(s=>s.label+' '+s.value).join(', ');
  const svg='<svg class="pie" viewBox="0 0 42 42" role="img" aria-label="'+esc(spec.title+': '+label)+'"><circle class="ring" cx="21" cy="21" r="'+R+'"/>'+rings+(spec.center?'<text class="c-big" x="21" y="21.8" text-anchor="middle">'+esc(spec.center.big)+'</text><text class="c-small" x="21" y="26.5" text-anchor="middle">'+esc(spec.center.small||'')+'</text>':'')+'</svg>';
  const legend='<ul class="legend">'+(spec.slices||[]).map(s=>'<li class="'+(s.value?'':'zero')+'"><i class="swatch t-'+s.tone+'"></i><span>'+esc(s.label)+'</span><b>'+s.value+'</b><em>'+pctOf(s.value,total)+'%</em></li>').join('')+'</ul>';
  return frame(spec,'<div class="pie-wrap">'+svg+legend+'</div>');
}

export function renderLine(spec){
  const series=(spec.series||[]).filter(s=>s.points&&s.points.length);
  if(!series.length)return frame(spec,emptyBody(spec.empty));
  const W=640,H=240,L=46,R=14,T=12,B=30,all=series.flatMap(s=>s.points);
  let x0=Math.min(...all.map(p=>p[0])),x1=Math.max(...all.map(p=>p[0]));if(x1===x0)x1=x0+1;
  let y0=spec.yMin??Math.min(...all.map(p=>p[1])),y1=spec.yMax??Math.max(...all.map(p=>p[1]));if(y1===y0){y0-=1;y1+=1}
  const X=v=>L+(v-x0)/(x1-x0)*(W-L-R),Y=v=>T+(1-(v-y0)/(y1-y0))*(H-T-B);
  let grid='';
  for(let i=0;i<=4;i++){const v=y0+(y1-y0)*i/4,y=Y(v);grid+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'"/><text class="tick" x="'+(L-6)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end">'+fmt(v)+'</text>'}
  for(let i=0;i<=4;i++){const v=x0+(x1-x0)*i/4,x=X(v);grid+='<text class="tick" x="'+x.toFixed(1)+'" y="'+(H-B+15)+'" text-anchor="middle">'+fmt(v)+'</text>'}
  const refs=(spec.refLines||[]).filter(r=>r.y>=y0&&r.y<=y1).map(r=>'<line class="ref" x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(r.y).toFixed(1)+'" y2="'+Y(r.y).toFixed(1)+'"/><text class="tick ref-label" x="'+(W-R-2)+'" y="'+(Y(r.y)-3).toFixed(1)+'" text-anchor="end">'+esc(r.label||'')+'</text>').join('');
  const paths=series.map((s,i)=>{
    const cls='line s'+(i%6);
    if(s.points.length===1)return '<circle class="dot '+cls+'" cx="'+X(s.points[0][0]).toFixed(1)+'" cy="'+Y(s.points[0][1]).toFixed(1)+'" r="3.5"/>';
    let d='';s.points.forEach((p,j)=>{const x=X(p[0]).toFixed(1),y=Y(p[1]).toFixed(1);d+=j===0?'M'+x+' '+y:(spec.step?'H'+x+'V'+y:'L'+x+' '+y)});
    return '<path class="'+cls+'" d="'+d+'"/>';
  }).join('');
  const axes='<text class="axis-label" x="'+((L+W-R)/2)+'" y="'+(H-3)+'" text-anchor="middle">'+esc(spec.xLabel||'')+'</text>'+(spec.yLabel?'<text class="axis-label" transform="rotate(-90)" x="'+(-(T+H-B)/2)+'" y="11" text-anchor="middle">'+esc(spec.yLabel)+'</text>':'');
  const desc=spec.title+': '+series.map(s=>s.label+' from '+fmt(Math.min(...s.points.map(p=>p[1])))+' to '+fmt(Math.max(...s.points.map(p=>p[1])))).join('; ');
  const svg='<svg class="plot" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(desc)+'">'+grid+refs+paths+axes+'</svg>';
  const legend=series.length>1||spec.alwaysLegend?'<ul class="legend inline">'+series.map((s,i)=>'<li><i class="swatch s'+(i%6)+'"></i><span>'+esc(s.label)+'</span><em>'+fmt(Math.min(...s.points.map(p=>p[1])))+'–'+fmt(Math.max(...s.points.map(p=>p[1])))+'</em></li>').join('')+'</ul>':'';
  return frame(spec,svg,legend);
}

export function renderBar(spec){
  const bars=spec.bars||[];
  if(!bars.length||!bars.some(b=>b.value>0))return frame(spec,emptyBody(spec.empty));
  const W=640,H=220,L=40,R=10,T=10,B=34,max=spec.max??Math.max(...bars.map(b=>b.value),1),n=bars.length,slot=(W-L-R)/n,bw=Math.max(3,Math.min(46,slot*.72));
  let grid='';
  for(let i=0;i<=4;i++){const v=max*i/4,y=T+(1-i/4)*(H-T-B);grid+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'"/><text class="tick" x="'+(L-6)+'" y="'+(y+3).toFixed(1)+'" text-anchor="end">'+fmt(v)+'</text>'}
  const every=Math.ceil(n/14);
  const rects=bars.map((b,i)=>{const h=Math.max(b.value>0?1.5:0,b.value/max*(H-T-B)),x=L+slot*i+(slot-bw)/2,y=H-B-h;
    return '<rect class="bar t-'+(b.tone||'accent')+'" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'"><title>'+esc(b.label)+': '+b.value+(spec.unit||'')+'</title></rect>'+(i%every===0?'<text class="tick" x="'+(x+bw/2).toFixed(1)+'" y="'+(H-B+14)+'" text-anchor="middle">'+esc(b.label)+'</text>':'')}).join('');
  const axes=spec.xLabel?'<text class="axis-label" x="'+((L+W-R)/2)+'" y="'+(H-2)+'" text-anchor="middle">'+esc(spec.xLabel)+'</text>':'';
  const svg='<svg class="plot" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(spec.title+': '+bars.map(b=>b.label+' '+b.value).join(', '))+'">'+grid+rects+axes+'</svg>';
  return frame(spec,svg);
}

// Horizontal bars as HTML rows: good for long labels (one row per control).
export function renderHBar(spec){
  const rows=spec.rows||[];
  if(!rows.length)return frame(spec,emptyBody(spec.empty));
  const max=spec.max??Math.max(...rows.map(r=>r.value),1);
  const html='<div class="hbars">'+rows.map(r=>'<div class="hbar-row"><span title="'+esc(r.label)+'">'+esc(r.label)+'</span><div class="hbar-track"><div class="hbar-fill t-'+(r.tone||'accent')+'" style="width:'+Math.max(r.value>0?1:0,r.value/max*100).toFixed(1)+'%"></div></div><b>'+esc(r.text??r.value)+'</b></div>').join('')+'</div>';
  return frame(spec,html);
}

export function renderChart(spec){
  return spec.type==='pie'?renderPie(spec):spec.type==='line'?renderLine(spec):spec.type==='bar'?renderBar(spec):spec.type==='hbar'?renderHBar(spec):'';
}
export function renderChartGroups(groups=[]){
  return groups.filter(g=>g.charts.length).map(g=>'<section class="chart-group"><h3>'+esc(g.title)+'</h3>'+(g.note?'<p class="muted">'+esc(g.note)+'</p>':'')+'<div class="chart-grid">'+g.charts.map(renderChart).join('')+'</div></section>').join('');
}

// ---------- spec builder ----------
const STATUS_SLICES=[['ok','No concern observed','good'],['attention','Attention','warn'],['investigate','Investigate','bad'],['info','Info','accent'],['notrun','Not enough data','muted']];
function zones(values,cuts,labels,tones){const out=labels.map((label,i)=>({label,value:0,tone:tones[i]}));for(const v of values){let i=0;while(i<cuts.length&&v>=cuts[i])i++;out[i].value++}return out}

export function chartGroups(inp={}){
  const keys=[...(inp.keys||[])].sort((a,b)=>a-b),expected=inp.expected||{low:null,high:null},summary={};
  const groups=[];

  // ----- Keys & velocity -----
  const kh=keyHealth({keys,expected,suspect:inp.suspectKeys||[]});summary.keys=kh;
  const kc=[];
  kc.push({type:'pie',id:'keys-health',title:'Keys: total vs working vs broken',
    subtitle:kh.total?(kh.fromExpected?'Expected range '+noteLabel(kh.low)+'–'+noteLabel(kh.high):'Observed span '+noteLabel(kh.low)+'–'+noteLabel(kh.high)):'',
    center:kh.total?{big:kh.working+'/'+kh.total,small:'working'}:null,
    slices:[{label:'Working: seen, no faults',value:kh.working,tone:'good'},{label:'Suspect: double-trigger or chatter',value:kh.suspect,tone:'warn'},{label:'Not responding: never seen',value:kh.missing,tone:'bad'}],
    note:kh.total?(kh.fromExpected?'':'Total is the span from the lowest to the highest key seen. Set the expected key range in the Keyboard tab so keys beyond either end count as missing too.'):'',
    empty:'Press keys (and set the expected range in the Keyboard tab) to see this chart.'});
  if(kh.total){
    const oct=new Map();
    for(let n=kh.low;n<=kh.high;n++){const o=Math.floor(n/12)-1;if(!oct.has(o))oct.set(o,{seen:0,total:0});const e=oct.get(o);e.total++;if(keys.includes(n))e.seen++}
    kc.push({type:'bar',id:'keys-octave',title:'Keys seen per octave',subtitle:'Percent of each octave that responded',unit:'%',max:100,xLabel:'Octave',
      bars:[...oct.entries()].map(([o,e])=>({label:'C'+o,value:pctOf(e.seen,e.total),tone:e.seen===e.total?'good':e.seen===0?'bad':'warn'}))});
  }
  const byKey=inp.velocityByKey instanceof Map?inp.velocityByKey:new Map(Object.entries(inp.velocityByKey||{}).map(([k,v])=>[Number(k),v]));
  const ks=[...byKey.keys()].sort((a,b)=>a-b),stat=(f)=>ks.map(k=>[k,f(byKey.get(k))]);
  kc.push({type:'line',id:'velocity-per-key',title:'Velocity per key',subtitle:'Mean, minimum and maximum velocity for each key',xLabel:'MIDI note number',yLabel:'Velocity',yMin:0,yMax:127,
    series:ks.length?[{label:'Max',points:stat(v=>Math.max(...v))},{label:'Mean',points:stat(v=>sum(v)/v.length)},{label:'Min',points:stat(v=>Math.min(...v))}]:[],
    note:ks.length?'Keys whose mean sits far from its neighbours may have a weak or hot sensor. Play every key at similar force for a fair comparison.':'',empty:'Play notes to see velocity per key.'});
  const vel=inp.velocityValues||[];
  kc.push({type:'line',id:'velocity-time',title:'Velocity of each note played',subtitle:'Most recent notes, in the order they were played',xLabel:'Note number in sequence',yLabel:'Velocity',yMin:0,yMax:127,series:[{label:'Velocity',points:toPoints(vel.slice(-200))}],empty:'Play notes to see this chart.'});
  const hist=inp.velocityHistogram||[];
  kc.push({type:'bar',id:'velocity-hist',title:'Velocity distribution',subtitle:'How many notes landed in each velocity band',xLabel:'Velocity band',bars:hist.map((v,i)=>({label:(i*16)+'–'+(i*16+15),value:v,tone:'accent'})),empty:'Play notes to see this chart.'});
  kc.push({type:'pie',id:'velocity-zones',title:'Playing strength',subtitle:'Share of notes by velocity',slices:zones(vel,[43,86],['Soft (0–42)','Medium (43–85)','Hard (86–127)'],['info','accent','warn']),empty:'Play notes to see this chart.'});
  const np=inp.notePairing;
  if(np)kc.push({type:'pie',id:'note-pairing',title:'Note On / Note Off pairing',subtitle:'Messages that matched and ones that did not',
    slices:[{label:'Completed notes',value:np.completed||0,tone:'good'},{label:'Duplicate Note On',value:np.duplicateOns||0,tone:'warn'},{label:'Duplicate Note Off',value:np.duplicateOffs||0,tone:'warn'},{label:'Held without Note Off',value:np.stuck||0,tone:'bad'}],empty:'Play notes to see this chart.'});
  groups.push({title:'Keys and velocity',note:'Keys count as broken when they never send anything. Keys with double-triggers are shown as suspect.',charts:kc});

  // ----- Controls: knobs, faders -----
  const ctrls=(inp.controls||[]).filter(c=>c.type==='absolute'&&c.values.length);
  const health=controlHealth(ctrls);summary.controls=health;
  const slicesFor=h=>CONTROL_SLICES.map(([k,label,tone])=>({label,value:h[k],tone}));
  const centerFor=h=>h.total?{big:h.working+'/'+h.total,small:'working'}:null;
  const cc=[];
  const kindOf=k=>k.kind==='knob'||k.kind==='fader'?k.kind:'';
  const knobs=ctrls.filter(c=>kindOf(c)==='knob'),faders=ctrls.filter(c=>kindOf(c)==='fader'),other=ctrls.filter(c=>!kindOf(c));
  summary.knobs=controlHealth(knobs);summary.faders=controlHealth(faders);
  const anyTagged=knobs.length+faders.length>0;
  cc.push({type:'pie',id:'controls-health',title:anyTagged?'All continuous controls':'Continuous controls: working vs not',subtitle:ctrls.length+' control stream(s) moved so far',center:centerFor(health),slices:slicesFor(health),
    note:'A control is only judged on what you moved. A knob you have not touched yet does not appear here.',empty:'Move your knobs and faders through full travel to see this chart.'});
  if(knobs.length)cc.push({type:'pie',id:'knobs-health',title:'Knobs: working vs not',subtitle:knobs.length+' tagged as knob',center:centerFor(summary.knobs),slices:slicesFor(summary.knobs)});
  if(faders.length)cc.push({type:'pie',id:'faders-health',title:'Faders: working vs not',subtitle:faders.length+' tagged as fader',center:centerFor(summary.faders),slices:slicesFor(summary.faders)});
  if(anyTagged&&other.length){const h=controlHealth(other);cc.push({type:'pie',id:'untagged-health',title:'Untagged controls',subtitle:other.length+' not yet tagged',center:centerFor(h),slices:slicesFor(h)})}
  if(!anyTagged&&ctrls.length)cc.push({type:'pie',id:'tag-hint',title:'Knobs vs faders',subtitle:'',slices:[],empty:'MIDI does not say whether a control is a knob or a fader. Open the Controls tab, select a control and set its type to Knob or Fader to get separate pies for each.'});
  const types=inp.controls||[];
  cc.push({type:'pie',id:'control-types',title:'Kinds of control seen',subtitle:'Detected from the values each control sends',
    slices:[{label:'Absolute (knobs, faders, wheels)',value:types.filter(c=>c.type==='absolute').length,tone:'accent'},{label:'Buttons / switches',value:types.filter(c=>c.type==='switch').length,tone:'info'},{label:'Relative encoders',value:types.filter(c=>c.type==='relative').length,tone:'warn'}],empty:'Move controls to see this chart.'});
  const cover=ctrls.map(c=>({label:c.label+(kindOf(c)?' ('+kindOf(c)+')':''),value:controlStats(c.values).coverage,tone:({working:'good',noisy:'warn',limited:'bad',stuck:'muted'})[classifyControl(c.values)],text:controlStats(c.values).coverage+'%'})).sort((a,b)=>a.value-b.value).slice(0,40);
  cc.push({type:'hbar',id:'control-coverage',title:'Travel covered by each control',subtitle:'Percent of the 0–127 range each control swept (lowest first)',max:100,rows:cover,empty:'Move controls to see this chart.'});
  const busiest=[...ctrls].sort((a,b)=>b.values.length-a.values.length).slice(0,6);
  cc.push({type:'line',id:'control-sweeps',title:'Control sweeps over time',subtitle:'The six most active controls',xLabel:'Seconds',yLabel:'Value',yMin:0,yMax:127,series:busiest.map(c=>({label:c.label,points:toPoints(c.values.slice(-300),c.times?c.times.slice(-300):null)})),empty:'Move controls to see this chart.'});
  groups.push({title:'Knobs, faders and controls',note:'Working means full travel (at least '+LIMITED_BELOW+'% swept), no abrupt jumps and no stationary jitter.',charts:cc});

  // ----- Pitch bend & mod -----
  const pc=[],pitch=inp.pitch||{values:[],times:[]};
  pc.push({type:'line',id:'pitch-time',title:'Pitch bend over time',subtitle:'Full range is −8192 to +8191, centre is 0',xLabel:'Seconds',yLabel:'Bend',yMin:-8192,yMax:8191,refLines:[{y:0,label:'centre'}],series:[{label:'Pitch bend',points:toPoints(pitch.values||[],pitch.times)}],empty:'Move the pitch wheel or stick to see this chart.'});
  const pv=pitch.values||[],negT=pv.length?Math.abs(Math.min(0,Math.min(...pv))):0,posT=pv.length?Math.max(0,Math.max(...pv)):0;
  pc.push({type:'bar',id:'pitch-travel',title:'Pitch bend travel by direction',subtitle:'Percent of full travel reached',unit:'%',max:100,bars:pv.length?[{label:'Down',value:pctOf(negT,8192),tone:negT>=8192*.9?'good':'warn'},{label:'Up',value:pctOf(posT,8191),tone:posT>=8191*.9?'good':'warn'}]:[],empty:'Move the pitch wheel or stick to see this chart.'});
  const modSeries=(inp.modSeries||[]).map(m=>({label:m.label,points:toPoints(m.values.slice(-400),m.times?m.times.slice(-400):null)}));
  pc.push({type:'line',id:'mod-time',title:'Mod wheel and expression',subtitle:'CC 1 and CC 11 over time',xLabel:'Seconds',yLabel:'Value',yMin:0,yMax:127,series:modSeries,alwaysLegend:true,empty:'Move the mod wheel (CC 1) or expression (CC 11) to see this chart.'});
  groups.push({title:'Pitch bend and modulation',charts:pc});

  // ----- Pedal & pressure -----
  const sc=[],sus=inp.sustain||{values:[],times:[]};
  sc.push({type:'line',id:'sustain-time',title:'Sustain pedal over time',subtitle:'Pedal position (127 = down). Steps show each press and release',xLabel:'Seconds',yLabel:'CC 64',yMin:0,yMax:127,step:true,refLines:[{y:64,label:'on/off threshold'}],series:[{label:'Sustain',points:toPoints(sus.values||[],sus.times)}],empty:'Press the sustain pedal to see this chart.'});
  const sw=inp.sustainStats;
  if(sw)sc.push({type:'pie',id:'sustain-events',title:'Sustain pedal events',subtitle:'Clean presses and releases vs contact problems',
    slices:[{label:'Clean transitions',value:Math.max(0,sw.transitions-sw.bounces),tone:'good'},{label:'Bounces (re-trigger under 40 ms)',value:sw.bounces,tone:'bad'},{label:'Repeated state messages',value:sw.repeats,tone:'muted'}],empty:'Press the sustain pedal to see this chart.'});
  const at=inp.aftertouch||{values:[],times:null};
  const polySeries=[...(inp.polyAftertouch instanceof Map?inp.polyAftertouch:new Map(Object.entries(inp.polyAftertouch||{}))).entries()].slice(0,4).map(([k,v])=>({label:'Poly '+k,points:toPoints(v.slice(-300))}));
  sc.push({type:'line',id:'aftertouch-time',title:'Aftertouch pressure',subtitle:'Channel pressure over time, plus up to four polyphonic note streams',xLabel:(at.times?'Seconds':'Message number'),yLabel:'Pressure',yMin:0,yMax:127,alwaysLegend:true,
    series:[{label:'Channel pressure',points:toPoints(at.values||[],at.times)},...polySeries],empty:'Press down on held keys to see aftertouch.'});
  const pressure=[...(at.values||[]),...[...(inp.polyAftertouch instanceof Map?inp.polyAftertouch.values():Object.values(inp.polyAftertouch||{}))].flat()];
  sc.push({type:'pie',id:'aftertouch-zones',title:'Aftertouch pressure levels',subtitle:'Share of pressure readings',slices:zones(pressure,[43,86],['Light (0–42)','Medium (43–85)','Firm (86–127)'],['info','accent','warn']),empty:'Press down on held keys to see aftertouch.'});
  groups.push({title:'Pedals and pressure',charts:sc});

  // ----- Traffic, timing & links -----
  const tc=[],mc=Object.entries(inp.messageCounts||{}).sort((a,b)=>b[1]-a[1]);
  const top=mc.slice(0,7),rest=sum(mc.slice(7).map(x=>x[1])),tones=['accent','info','good','warn','bad','muted','accent'];
  tc.push({type:'pie',id:'message-mix',title:'Message mix',subtitle:'What the device is sending',slices:[...top.map(([k,v],i)=>({label:k,value:v,tone:tones[i]})),...(rest?[{label:'Other',value:rest,tone:'muted'}]:[])],empty:'No messages captured yet.'});
  const ch=Object.entries(inp.channelStats||{}).map(([c,v])=>({label:'Channel '+c,value:v.total,tone:'accent'}));
  tc.push({type:'hbar',id:'channel-activity',title:'Activity per channel',subtitle:'Messages seen on each MIDI channel',rows:ch,empty:'No channel messages captured yet.'});
  const ct=inp.clockTimes||[],ivs=ct.slice(1).map((t,i)=>t-ct[i]).filter(d=>d>0&&d<500);
  tc.push({type:'line',id:'clock-intervals',title:'MIDI clock tick spacing',subtitle:'Milliseconds between clock ticks. A steady clock is a flat line',xLabel:'Tick number',yLabel:'ms',series:[{label:'Interval',points:toPoints(ivs.slice(-400))}],empty:'No MIDI clock received yet.'});
  const lat=inp.latencies||[];
  tc.push({type:'line',id:'latency',title:'Loopback round-trip latency',subtitle:'Each matched message from the loopback test',xLabel:'Sample',yLabel:'ms',series:[{label:'Latency',points:toPoints(lat)}],empty:'Run the loopback test to see this chart.'});
  const lb=inp.loopback;
  if(lb)tc.push({type:'pie',id:'loopback',title:'Loopback result',subtitle:lb.sent+' message(s) sent',slices:[{label:'Matched',value:lb.matched||0,tone:'good'},{label:'Missing',value:lb.missing||0,tone:'bad'},{label:'Altered',value:lb.altered||0,tone:'warn'},{label:'Extra',value:lb.extra||0,tone:'muted'}],empty:'Run the loopback test to see this chart.'});
  groups.push({title:'Traffic, timing and links',charts:tc});

  // ----- Tests -----
  const rc=[],ts=inp.testStatuses||[];
  rc.push({type:'pie',id:'tests-status',title:'Advanced test outcomes',subtitle:ts.length+' test(s)',slices:STATUS_SLICES.map(([k,label,tone])=>({label,value:ts.filter(s=>s===k).length,tone})),empty:'No test results yet.'});
  const wc=inp.windowsCounts;
  if(wc)rc.push({type:'pie',id:'windows-log',title:'Windows log findings',subtitle:'From the last scan',slices:[{label:'Investigate',value:wc.investigate||0,tone:'bad'},{label:'Attention',value:wc.attention||0,tone:'warn'}],empty:'The last scan found nothing to flag.'});
  groups.push({title:'Tests and system logs',charts:rc});

  return {groups,summary};
}
