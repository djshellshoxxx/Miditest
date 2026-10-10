// Device profiles and fleet comparison (pure logic; storage is injected).
import {baselineDiff} from '../midi-core.js';
const num=v=>Number.isFinite(v)?v:null;
export function createProfileStore(storage,key='miditest-profiles-v1',{maxProfiles=30,maxBytes=2e6}={}){
  const load=()=>{try{const o=JSON.parse(storage.getItem(key)||'{}');return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}catch{return {}}};
  const persist=m=>{let s;try{s=JSON.stringify(m)}catch{return 'Profile could not be serialised.'}
    if(s.length>maxBytes)return 'Profile storage would exceed '+Math.round(maxBytes/1e6)+' MB. Export and remove old profiles.';
    try{storage.setItem(key,s);return null}catch{return 'Storage is full or unavailable. Export profiles and free space.'}};
  const add=(name,model,report,extra={})=>{
    if(!report||typeof report!=='object')return {error:'No report to save.'};
    const m=load();if(Object.keys(m).length>=maxProfiles)return {error:'Profile limit ('+maxProfiles+') reached. Remove one first.'};
    const id=extra.id&&!m[extra.id]?extra.id:'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    m[id]={id,name:String(name||'Untitled').slice(0,120),model:String(model||'').slice(0,120),createdAt:extra.createdAt||new Date().toISOString(),report};
    const e=persist(m);return e?{error:e}:{ok:true,id};
  };
  return {
    list:()=>Object.values(load()).map(({id,name,model,createdAt})=>({id,name,model,createdAt})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),
    save:(name,model,report)=>add(name,model,report),
    get:id=>load()[id]||null,
    remove(id){const m=load();if(!m[id])return false;delete m[id];return !persist(m)},
    exportProfile(id){const p=load()[id];return p?JSON.stringify({kind:'profile',schema:1,...p},null,1):''},
    importProfile(text){
      let o;try{o=JSON.parse(text)}catch{return {error:'File is not valid JSON.'}}
      if(!o||o.kind!=='profile')return {error:'Not a MIDItest profile file.'};
      if(o.schema!==1)return {error:'Unsupported profile schema: '+o.schema+'.'};
      if(!o.report||typeof o.report!=='object'||Array.isArray(o.report))return {error:'Profile has no report.'};
      return add(o.name,o.model,o.report,{createdAt:typeof o.createdAt==='string'?o.createdAt:undefined});
    }
  };
}
const tests=r=>{const a=r?.advancedTests;return Array.isArray(a)?Object.fromEntries(a.filter(t=>t&&t.id).map(t=>[t.id,t.status])):{}};
export function diffAgainstProfile(profileReport={},curReport={}){
  const d=baselineDiff(profileReport||{},curReport||{}),a=tests(profileReport),b=tests(curReport),testChanges=[];
  for(const id of new Set([...Object.keys(a),...Object.keys(b)]))if(a[id]!==b[id])testChanges.push({id,from:a[id]??null,to:b[id]??null});
  return {...d,testChanges};
}
const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const METRICS=['missingKeys','meanJitter','pitchCenter','latencyMedian','peakRate'];
function metricsOf(r={}){
  const js=Object.values(r?.controls||{}).map(c=>c?.jitter).filter(Number.isFinite);
  const exp=r?.expected,miss=Array.isArray(r?.missingKeys)?r.missingKeys.length:exp&&Number.isFinite(exp.low)&&Number.isFinite(exp.high)&&Array.isArray(r?.keys)?Array.from({length:exp.high-exp.low+1},(_,i)=>exp.low+i).filter(n=>!r.keys.includes(n)).length:null;
  return {missingKeys:miss,meanJitter:js.length?js.reduce((x,y)=>x+y,0)/js.length:null,pitchCenter:num(r?.pitch?.center),latencyMedian:num(r?.latency?.median),peakRate:num(r?.messageRate?.peak)};
}
export function fleetOutliers(units=[]){
  const rows=units.map(u=>({name:u?.name??'',metrics:metricsOf(u?.report),flags:[]})),medians={},insufficient=rows.length<4;
  for(const m of METRICS){
    const vals=rows.map(r=>r.metrics[m]).filter(v=>v!==null),med=median(vals);medians[m]=med;
    if(insufficient||vals.length<4)continue;
    const dev=vals.map(v=>Math.abs(v-med)),mad=median(dev),meanAd=dev.reduce((x,y)=>x+y,0)/dev.length;
    for(const r of rows){const v=r.metrics[m];if(v===null)continue;
      // MAD of zero: fall back to mean absolute deviation (x1.2533), then to any difference
      const sc=mad>0?mad*1.4826:meanAd*1.2533,z=sc>0?Math.abs(v-med)/sc:v!==med?Infinity:0;if(z>3.5)r.flags.push(m)}
  }
  return {insufficient,rows,medians};
}
