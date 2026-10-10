// Optional features attached to the core app through the API passed by app-v2.js (see the bottom of that file).
// Pure logic lives in lib/*.js (unit tested); this file only wires DOM, timers and Web MIDI.
import {createFlags,FLAGS} from './lib/flags.js';
import {serializeCapture,parseCapture} from './lib/capture.js';
import {evaluateChecklist,PRESET_TO_CHECKLIST} from './lib/checklists.js';
import {createProfileStore,diffAgainstProfile,fleetOutliers} from './lib/profiles.js';
import {decimateMinMax,niceTicks,percentile,rateTimeline} from './lib/chartdata.js';
import {buildIdentityRequest,parseIdentityReply,parseHex,validateSysex,checksum,diffBytes} from './lib/sysex.js';
import {parseUmpHex,decodeUmp} from './lib/ump.js';
import {ACTIVE_TESTS,buildPlan,evaluate,planDurationMs} from './lib/active-tests.js';
import {createClockScheduler,clockMeasure} from './lib/clockgen.js';
import {STATUS_LABEL} from './midi-tests.js';

// DOM ids this module needs; tests/ui-static.test.mjs checks they exist in index.html.
export const FEATURE_IDS=['appVersion','preset','glossaryBtn','glossaryDialog','glossarySearch','glossaryList','labsList','checklistPanel','checklistBody','checklistSub','ckTech','ckSerial','ckPrint','recStart','recStop','recSave','capLoad','replayMode','replayRun','replayStop','recStatus','umpText','umpDecode','umpOut','umpEnv','chartSelect','chartControl','chartCanvas','chartInfo','chartTable','chartPng','chartCsv','activeList','activeChannel','activeCc','activeRun','activeCancel','activeStatus','activeResults','sysDev','sysIdentity','sysIdentityOut','sysHex','sysSend','sysCsKind','sysCsBtn','sysCapA','sysCapB','sysDiffBtn','sysStatus','sysLog','clkBpm','clkStart','clkCont','clkStop','clkStatus','clkResult','inputB','pathStart','pathStop','pathStatus','pathOut','pfName','pfSave','pfSelect','pfCompare','pfExport','pfDelete','pfImport','fleetImport','pfStatus','fleetOut','exportHtml'];

const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
const f1=v=>v===null||v===undefined||!Number.isFinite(v)?'—':String(Math.round(v*10)/10);
const safeStorage=()=>{try{return window.localStorage}catch{return null}};
const ICON={notrun:'○',info:'ℹ',ok:'✓',attention:'!',investigate:'⚠',pass:'✓',fail:'✗',pending:'○',skipped:'–'};

export function initFeatures(api){
  const {state,$,$$,esc,metric,download,setStatus,renderAll,buildReport,viewRenderers}=api;
  const flags=createFlags(safeStorage());
  const on=id=>flags.isOn(id);
  const get=id=>document.getElementById(id);
  const chip=(status,text)=>'<span class="status-chip status-'+esc(status)+'">'+(ICON[status]||'')+' '+esc(text)+'</span>';
  const requireOutput=()=>{if(!api.getOutput()){setStatus('Select a MIDI output first.','attention');return false}return true};
  const printHtml=html=>{const f=document.createElement('iframe');f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';f.srcdoc=html;f.onload=()=>{try{f.contentWindow.focus();f.contentWindow.print()}finally{setTimeout(()=>f.remove(),2000)}};document.body.append(f)};

  // ---------- Labs flags ----------
  function applyFlags(){for(const el of $$('[data-flag]'))el.hidden=!on(el.dataset.flag);}
  function activeViewId(){return document.querySelector('.view.active-view')?.id||'quick'}
  function renderLabs(){get('labsList').innerHTML=FLAGS.map(f=>'<label class="check"><input type="checkbox" data-labs="'+esc(f.id)+'"'+(on(f.id)?' checked':'')+'> '+esc(f.label||f.id)+'</label>').join('');}
  get('labsList').addEventListener('change',e=>{const id=e.target.dataset?.labs;if(!id)return;flags.set(id,e.target.checked);applyFlags()});
  renderLabs();applyFlags();

  // ---------- Glossary (F15) ----------
  let glossary=null;
  async function loadGlossary(){if(glossary)return glossary;try{glossary=await (await fetch('./data/glossary.json')).json()}catch{glossary=[]}return glossary}
  async function openGlossary(focusId=''){const g=await loadGlossary(),dlg=get('glossaryDialog'),q=get('glossarySearch');q.value=focusId?(g.find(x=>x.id===focusId)?.term||focusId):'';renderGlossary(focusId);if(!dlg.open)dlg.showModal();q.focus()}
  function renderGlossary(focusId=''){
    const q=get('glossarySearch').value.trim().toLowerCase(),g=(glossary||[]).filter(x=>!q||[x.term,x.id,...(x.aliases||[]),x.short].join(' ').toLowerCase().includes(q));
    g.sort((a,b)=>(b.id===focusId)-(a.id===focusId)||a.term.localeCompare(b.term));
    get('glossaryList').innerHTML=g.length?g.map(x=>'<section class="win-finding"><h3>'+esc(x.term)+'</h3><p><strong>'+esc(x.short)+'</strong></p><p>'+esc(x.long)+'</p>'+((x.related||[]).length?'<p>Related: '+x.related.map(r=>'<button type="button" class="term" data-gloss="'+esc(r)+'">'+esc(r.replace(/-/g,' '))+'</button>').join(' ')+'</p>':'')+'</section>').join(''):'<p class="muted">No matching terms.</p>';
  }
  get('glossaryBtn').onclick=()=>openGlossary();
  get('glossarySearch').addEventListener('input',()=>renderGlossary());
  document.addEventListener('click',e=>{const t=e.target.closest?.('[data-term],[data-gloss]');if(!t)return;e.preventDefault();openGlossary(t.dataset.term||t.dataset.gloss)});

  // ---------- Record & replay (F04) ----------
  let rec=null,recStart=0,loaded=null,replayTimer=null,replaying=false;
  const recUi=()=>{get('recStart').disabled=!!rec||replaying;get('recStop').disabled=!rec;get('recSave').disabled=!rec&&!(loaded?.recorded);get('replayRun').disabled=!loaded||replaying||!!rec;get('replayStop').disabled=!replaying};
  api.onIngest(e=>{if(rec&&!e.replayed){if(rec.length>=200000){stopRec();get('recStatus').textContent='Recording stopped at the 200,000-event limit. Save the capture.';return}rec.push({t:e.t-recStart,deviceId:e.deviceId,raw:e.raw})}});
  function startRec(){rec=[];recStart=performance.now();loaded=null;get('recStatus').textContent='Recording… play or operate the controller, then press Stop.';recUi()}
  function stopRec(){if(!rec)return;loaded={events:rec.map(x=>({t:x.t,deviceId:x.deviceId,bytes:x.raw})),meta:{device:state.device,startedAt:new Date(Date.now()-(performance.now()-recStart)).toISOString()},recorded:true};get('recStatus').textContent='Recorded '+rec.length.toLocaleString()+' event(s). Save the capture or press Replay.';rec=null;recUi()}
  get('recStart').onclick=startRec;get('recStop').onclick=stopRec;
  get('recSave').onclick=()=>{if(rec)stopRec();if(!loaded)return;const ports=[api.getInput(),api.getOutput()].filter(Boolean).map(p=>({id:p.id,name:api.portName(p)}));
    download('miditest-capture.json',serializeCapture(loaded.events.map(x=>({t:x.t,deviceId:x.deviceId,raw:x.bytes})),{device:loaded.meta.device||state.device,ports,startedAt:loaded.meta.startedAt,app:get('appVersion')?.textContent||''}),'application/json')};
  get('capLoad').onchange=async()=>{const f=get('capLoad').files?.[0];get('capLoad').value='';if(!f)return;if(f.size>60*1024*1024){get('recStatus').textContent='Capture file is larger than 60 MB.';return}
    const r=parseCapture(await f.text());if(r.error){get('recStatus').textContent='Could not load capture: '+r.error;return}loaded={events:r.events,meta:r.meta};get('recStatus').textContent='Loaded '+r.events.length.toLocaleString()+' event(s) from '+f.name+(r.meta.device?' ('+r.meta.device+')':'')+'. Press Replay.';recUi()};
  function replayOne(x){api.onMidi({data:Uint8Array.from(x.bytes),replayT:x.t,replayed:true,currentTarget:{id:x.deviceId||'replay',name:loaded.meta.device||'Replay'}})}
  function endReplay(note){clearInterval(replayTimer);replayTimer=null;replaying=false;api.setBulk(false);const inp=api.getInput();if(inp&&!inp.onmidimessage)inp.onmidimessage=api.onMidi;api.rebuildMonitor();renderAll(true);get('recStatus').textContent=note;recUi()}
  get('replayRun').onclick=async()=>{
    if(!loaded||replaying)return;const mode=get('replayMode').value,evs=loaded.events,inp=api.getInput();
    api.resetState(true);state.device=loaded.meta.device||'Replay';replaying=true;if(inp)inp.onmidimessage=null;recUi();
    if(mode==='instant'){api.setBulk(true);get('recStatus').textContent='Analysing '+evs.length.toLocaleString()+' event(s)…';
      for(let i=0;i<evs.length&&replaying;i+=2000){for(const x of evs.slice(i,i+2000))replayOne(x);await new Promise(r=>setTimeout(r,0))}
      endReplay('Replay analysed '+evs.length.toLocaleString()+' event(s). Only the most recent 5,000 events are kept for event-based tests; controls keep their last 1,000 values.');return}
    const speed=mode==='fast'?4:1,t0=performance.now();let i=0;get('recStatus').textContent='Replaying…';
    replayTimer=setInterval(()=>{const now=(performance.now()-t0)*speed;while(i<evs.length&&evs[i].t<=now)replayOne(evs[i++]);if(i>=evs.length)endReplay('Replay finished ('+evs.length.toLocaleString()+' events).')},20)};
  get('replayStop').onclick=()=>{if(replaying)endReplay('Replay stopped.')};
  recUi();

  // ---------- Checklist (F02) ----------
  const manual={},skipped={};
  const ckCtx=()=>({keys:[...state.keys],expected:state.expected,velocityValues:state.velocityValues,cc:state.cc,pitchValues:api.primaryPitch().values,sustainValues:state.sustainValues,aftertouchCount:state.aftertouch.length+state.polyAftertouch.size,tests:api.testResults(),manual,skipped});
  const ckKey=()=>PRESET_TO_CHECKLIST[get('preset').value]||'generic';
  const ckResult=()=>evaluateChecklist(ckKey(),ckCtx());
  function renderChecklist(){
    if(!on('checklist'))return;const r=ckResult(),v=r.verdict;
    get('checklistSub').textContent=r.name+' · '+r.passed+' of '+r.total+' passed'+(r.failed?' · '+r.failed+' failed':'')+(r.pending?' · '+r.pending+' still to test':'');
    get('checklistBody').innerHTML='<p>'+chip(v==='PASS'?'ok':v==='REVIEW'?'investigate':'info','Checklist result: '+v)+' <span class="muted">PASS needs every required item to pass. This is a measurement summary, not a repair diagnosis.</span></p><div class="compact-table">'+r.items.map(i=>'<div class="compact-row"><strong>'+(ICON[i.status]||'')+' '+esc(i.title)+(i.required?'':' (optional)')+'</strong><small>'+esc(i.detail||i.instruction||'')+'</small><span>'+(i.manual&&i.status!=='pass'?'<button type="button" data-ck="'+esc(i.id)+'">Mark OK</button>':esc(i.status))+(i.status==='pending'||i.status==='fail'?' <button type="button" data-skip="'+esc(i.id)+'">Skip</button>':'')+'</span></div>').join('')+'</div>';
  }
  get('checklistBody').addEventListener('click',e=>{const m=e.target.dataset?.ck,s=e.target.dataset?.skip;if(m)manual[m]=true;else if(s)skipped[s]=true;else return;renderChecklist()});
  get('preset').addEventListener('change',renderChecklist);
  const origQuick=viewRenderers.quick;viewRenderers.quick=()=>{origQuick();renderChecklist()};
  const sheetHtml=()=>{const r=ckResult(),rep=buildReport();return reportShell('Checklist sheet — '+r.name,'<table><tr><th>Device</th><td>'+esc(rep.device||'(no input)')+'</td><th>Date</th><td>'+esc(new Date().toLocaleString())+'</td></tr><tr><th>Technician</th><td>'+esc(get('ckTech').value)+'</td><th>Serial</th><td>'+esc(get('ckSerial').value)+'</td></tr></table><h2>Result: '+esc(r.verdict)+'</h2><table><tr><th>Check</th><th>Status</th><th>Detail</th></tr>'+r.items.map(i=>'<tr><td>'+esc(i.title)+(i.required?'':' (optional)')+'</td><td>'+esc(i.status)+'</td><td>'+esc(i.detail||'')+'</td></tr>').join('')+'</table>')};
  get('ckPrint').onclick=()=>printHtml(sheetHtml());
  api.extendReport(rep=>{const r=ckResult();rep.checklist={key:r.key,name:r.name,verdict:r.verdict,passed:r.passed,failed:r.failed,pending:r.pending,total:r.total,technician:get('ckTech').value,serial:get('ckSerial').value,items:r.items.map(i=>({id:i.id,title:i.title,required:i.required,status:i.status,detail:i.detail}))};if(state.identity)rep.identity=state.identity;if(state.activeResults?.length)rep.activeTests=state.activeResults});

  // ---------- Shareable report (F11) ----------
  function reportShell(title,body){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px}h2{font-size:17px;margin-top:22px;border-bottom:1px solid #ccc}table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #bbb;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f1f1f1}.s-investigate{color:#a1182b;font-weight:600}.s-attention{color:#8a5a00;font-weight:600}.s-ok{color:#1d6b3a}footer{margin-top:24px;color:#555;font-size:12px}@media print{body{margin:0}}</style></head><body><h1>'+esc(title)+'</h1>'+body+'<footer>Generated by MIDItest (Circuit Drift Labs). Measured observations, not a repair diagnosis.</footer></body></html>'}
  function fullReportHtml(){
    const r=buildReport(),tbl=(rows)=>'<table>'+rows.map(([a,b])=>'<tr><th>'+esc(a)+'</th><td>'+esc(b)+'</td></tr>').join('')+'</table>',ck=r.checklist;
    let b=tbl([['Device',r.device||'(none)'],['Generated',r.generatedAt],['Preset',r.preset],['Technician',ck?.technician||''],['Serial',ck?.serial||''],['Events captured',r.eventCount],['Disconnects',r.disconnects]]);
    if(ck)b+='<h2>Checklist: '+esc(ck.verdict)+'</h2><table><tr><th>Check</th><th>Status</th><th>Detail</th></tr>'+ck.items.map(i=>'<tr><td>'+esc(i.title)+'</td><td>'+esc(i.status)+'</td><td>'+esc(i.detail||'')+'</td></tr>').join('')+'</table>';
    b+='<h2>Findings</h2>'+(r.observations.length?'<ul>'+r.observations.map(o=>'<li class="s-'+esc(o.severity)+'">'+esc(o.text)+'</li>').join('')+'</ul>':'<p>No suspicious measurements highlighted.</p>');
    b+='<h2>Tests</h2>'+(r.advancedTests||[]).map(t=>'<h3>'+esc(t.title)+' — <span class="s-'+esc(t.status)+'">'+esc(STATUS_LABEL[t.status]||t.status)+'</span></h3><p>'+esc(t.headline)+'</p>'+tbl(Object.entries(t.metrics||{}))+(t.details?.length?'<ul>'+t.details.map(d=>'<li>'+esc(d)+'</li>').join('')+'</ul>':'')+t.meaning.map(m=>'<p><em>'+esc(m)+'</em></p>').join('')).join('');
    if(r.windowsLogs)b+='<h2>Windows logs ('+esc(r.windowsLogs.status)+')</h2>'+r.windowsLogs.findings.map(f=>'<h3 class="s-'+esc(f.severity)+'">'+esc(f.title)+(f.duringTest?' (during test)':'')+'</h3><p>'+esc(f.source)+'</p><p><strong>Meaning:</strong> '+esc(f.explain)+'</p><p><strong>Action:</strong> '+esc(f.action)+'</p>').join('');
    b+='<h2>Not tested / not observed</h2><ul>'+r.untested.map(u=>'<li>'+esc(u)+'</li>').join('')+'</ul>';
    return reportShell('MIDItest diagnostic report',b);
  }
  get('exportHtml').onclick=()=>download('miditest-report.html',fullReportHtml(),'text/html');

  // ---------- Profiles & fleet (F03) ----------
  const store=createProfileStore(safeStorage());
  function refreshProfiles(){const l=store.list();get('pfSelect').innerHTML=l.length?l.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join(''):'<option value="">No profiles</option>'}
  const pfMsg=t=>{get('pfStatus').textContent=t};
  get('pfSave').onclick=()=>{const r=store.save(get('pfName').value.trim()||state.device||'Unnamed',state.device,buildReport());if(r.error)pfMsg(r.error);else{pfMsg('Profile saved.');get('pfName').value='';refreshProfiles();get('pfSelect').value=r.id}};
  get('pfCompare').onclick=()=>{const p=store.get(get('pfSelect').value);if(!p){pfMsg('Select a profile first.');return}state.importedReport=p.report;const d=diffAgainstProfile(p.report,buildReport());viewRenderers.reportView();pfMsg('Comparing with "'+p.name+'". '+(d.testChanges?.length?d.testChanges.length+' test status change(s): '+d.testChanges.map(c=>c.id+' '+c.from+'→'+c.to).join(', '):'No test status changes.'))};
  get('pfExport').onclick=()=>{const t=store.exportProfile(get('pfSelect').value);if(!t){pfMsg('Select a profile first.');return}download('miditest-profile.json',t,'application/json')};
  get('pfDelete').onclick=()=>{const id=get('pfSelect').value;if(id&&confirm('Delete this profile?')){store.remove(id);refreshProfiles();pfMsg('Profile deleted.')}};
  get('pfImport').onchange=async()=>{const f=get('pfImport').files?.[0];get('pfImport').value='';if(!f)return;const r=store.importProfile(await f.text());if(r.error)pfMsg(r.error);else{pfMsg('Profile imported.');refreshProfiles()}};
  get('fleetImport').onchange=async()=>{
    const files=[...(get('fleetImport').files||[])];get('fleetImport').value='';const units=[],bad=[];
    for(const f of files){try{const o=JSON.parse(await f.text());if(!o||typeof o!=='object'||typeof o.eventCount!=='number')throw 0;units.push({name:(o.device||f.name)+' ('+f.name+')',report:o})}catch{bad.push(f.name)}}
    if(!units.length){get('fleetOut').innerHTML='<p class="muted">No valid reports. '+esc(bad.join(', '))+'</p>';return}
    const r=fleetOutliers(units),cols=['missingKeys','meanJitter','pitchCenter','latencyMedian','peakRate'];
    get('fleetOut').innerHTML='<h3>Fleet comparison</h3>'+(r.insufficient?'<p class="muted">Fewer than 4 units: raw values only, outliers are not flagged.</p>':'')+(bad.length?'<p class="muted">Skipped: '+esc(bad.join(', '))+'</p>':'')+'<table class="report-table"><thead><tr><th>Unit</th>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+r.rows.map(x=>'<tr><td>'+esc(x.name)+'</td>'+cols.map(c=>'<td'+(x.flags.includes(c)?' class="s-flag"':'')+'>'+esc(f1(x.metrics[c]))+(x.flags.includes(c)?' ⚠':'')+'</td>').join('')+'</tr>').join('')+'</tbody></table><p class="muted">⚠ = differs from the other units by more than 3.5 robust deviations.</p>'};
  refreshProfiles();

  // ---------- Charts (F06) ----------
  const canvas=get('chartCanvas'),ctx2=canvas.getContext('2d');let chartData=null;
  const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#5a93c7';
  function chartSpec(){
    const kind=get('chartSelect').value;
    if(kind==='control'){const sel=get('chartControl'),keys=[...state.cc.keys()];if(sel.options.length!==keys.length||keys.some((k,i)=>sel.options[i]?.value!==k)){const cur=sel.value;sel.innerHTML=keys.map(k=>'<option value="'+esc(k)+'">'+esc(k)+'</option>').join('');if(keys.includes(cur))sel.value=cur}
      const k=sel.value,v=state.cc.get(k)||[],t=state.ccTimes.get(k)||[];return {title:'Control '+(k||'(none)'),xs:t.map(x=>x/1000),ys:v,xl:'time (s)',yl:'value',ymin:0,ymax:127}}
    if(kind==='latency'){const l=state.latencies;return {title:'Round-trip latency (run a loopback test)',xs:l.map((_,i)=>i+1),ys:l,xl:'sample',yl:'ms',p95:true}}
    if(kind==='velocity'){const xs=[],ys=[];for(const [n,v] of state.velocityByKey)for(const y of v){xs.push(n);ys.push(y)}return {title:'Velocity per key',xs,ys,xl:'note number',yl:'velocity',ymin:0,ymax:127,scatter:true}}
    if(kind==='rate'){const r=rateTimeline(state.timestamps,1000);return {title:'Messages per second',xs:r.map(x=>x.t/1000),ys:r.map(x=>x.rate),xl:'time (s)',yl:'msg/s'}}
    const pp=api.primaryPitch();return {title:'Pitch bend (channel '+(pp.channel??'—')+')',xs:(pp.times||[]).map(x=>x/1000),ys:pp.values,xl:'time (s)',yl:'units',ymin:-8192,ymax:8191,band:512}
  }
  function drawChart(){
    const s=chartSpec(),W=canvas.width,H=canvas.height,m={l:56,r:12,t:26,b:34};ctx2.clearRect(0,0,W,H);chartData=s;
    ctx2.font='12px system-ui,sans-serif';ctx2.fillStyle=css('--text');ctx2.fillText(s.title,m.l,16);
    if(!s.ys.length){ctx2.fillStyle=css('--muted');ctx2.fillText('No data yet.',m.l+10,H/2);get('chartTable').innerHTML='';return}
    const xmin=Math.min(...s.xs),xmax=Math.max(...s.xs),ymin=s.ymin??Math.min(...s.ys),ymax=s.ymax??Math.max(...s.ys),sx=v=>m.l+(xmax===xmin?0.5:(v-xmin)/(xmax-xmin))*(W-m.l-m.r),sy=v=>H-m.b-(ymax===ymin?0.5:(v-ymin)/(ymax-ymin))*(H-m.t-m.b);
    ctx2.strokeStyle=css('--line');ctx2.fillStyle=css('--muted');
    for(const t of niceTicks(ymin,ymax,5)){const y=sy(t);ctx2.beginPath();ctx2.moveTo(m.l,y);ctx2.lineTo(W-m.r,y);ctx2.stroke();ctx2.fillText(String(Math.round(t*100)/100),4,y+4)}
    for(const t of niceTicks(xmin,xmax,6)){const x=sx(t);ctx2.fillText(String(Math.round(t*100)/100),x-8,H-m.b+16)}
    ctx2.fillText(s.xl+' →   '+s.yl,W-220,H-4);
    if(s.band){ctx2.fillStyle='rgba(95,146,119,.18)';ctx2.fillRect(m.l,sy(s.band),W-m.l-m.r,sy(-s.band)-sy(s.band))}
    ctx2.strokeStyle=css('--accent');ctx2.fillStyle=css('--accent');ctx2.lineWidth=1.5;
    if(s.scatter){for(let i=0;i<s.xs.length;i++){ctx2.beginPath();ctx2.arc(sx(s.xs[i]),sy(s.ys[i]),2.2,0,7);ctx2.fill()}}
    else{const d=decimateMinMax(s.xs,s.ys,Math.floor((W-m.l-m.r)/2));ctx2.beginPath();d.x.forEach((x,i)=>i?ctx2.lineTo(sx(x),sy(d.y[i])):ctx2.moveTo(sx(x),sy(d.y[i])));ctx2.stroke()}
    if(s.p95){const p=percentile(s.ys,95);ctx2.setLineDash([6,4]);ctx2.strokeStyle=css('--warn');ctx2.beginPath();ctx2.moveTo(m.l,sy(p));ctx2.lineTo(W-m.r,sy(p));ctx2.stroke();ctx2.setLineDash([]);ctx2.fillText('p95 '+f1(p),W-90,sy(p)-4)}
    const p=percentile(s.ys,50);get('chartTable').innerHTML='<div class="compact-row"><strong>'+s.ys.length+' points</strong><small>min '+f1(Math.min(...s.ys))+' · max '+f1(Math.max(...s.ys))+' · median '+f1(p)+'</small><span>p95 '+f1(percentile(s.ys,95))+'</span></div>';
    chartData.map={sx,sy,xmin,xmax};
  }
  canvas.addEventListener('pointermove',e=>{if(!chartData?.ys?.length)return;const r=canvas.getBoundingClientRect(),px=(e.clientX-r.left)*canvas.width/r.width;let best=0,bd=1e9;chartData.xs.forEach((x,i)=>{const d=Math.abs(chartData.map.sx(x)-px);if(d<bd){bd=d;best=i}});get('chartInfo').textContent=chartData.title+': '+chartData.yl+' '+f1(chartData.ys[best])+' at '+chartData.xl.replace(' (s)','')+' '+f1(chartData.xs[best])});
  get('chartSelect').onchange=drawChart;get('chartControl').onchange=drawChart;
  get('chartPng').onclick=()=>canvas.toBlob(b=>{if(!b)return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='miditest-chart.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
  get('chartCsv').onclick=()=>{if(!chartData)return;download('miditest-chart.csv',api.csv([[chartData.xl,chartData.yl],...chartData.xs.map((x,i)=>[x,chartData.ys[i]])]),'text/csv')};
  viewRenderers.chartsView=drawChart;

  // ---------- SysEx tools (F07) ----------
  let sysWait=null;const sysLog=t=>{const el=get('sysLog');el.textContent=(new Date().toLocaleTimeString()+'  '+t+'\n'+el.textContent).slice(0,4000)};
  const dumps={A:null,B:null};
  api.onIngest(e=>{if(e.kind!=='sysex'||!sysWait)return;const w=sysWait;sysWait=null;clearTimeout(w.timer);sysLog('Received SysEx '+e.raw.length+' bytes: '+e.hex.slice(0,120)+(e.hex.length>120?' …':''));w.fn(e)});
  const awaitSysex=(ms,fn,onTimeout)=>{if(sysWait)clearTimeout(sysWait.timer);sysWait={fn,timer:setTimeout(()=>{sysWait=null;onTimeout()},ms)}};
  const trySend=bytes=>{try{if(!requireOutput())return false;api.getOutput().send(bytes);return true}catch(e){get('sysStatus').textContent='Send failed: '+(e?.message||e)+(/sysex|permission/i.test(String(e?.message))?' — press Enable SysEx first.':'');return false}};
  get('sysIdentity').onclick=()=>{const dev=parseInt(get('sysDev').value,16);if(!(dev>=0&&dev<=127)){get('sysStatus').textContent='Device ID must be hex 00–7F.';return}
    const req=buildIdentityRequest(dev);awaitSysex(3000,e=>{const id=parseIdentityReply(e.raw);if(!id){get('sysStatus').textContent='A SysEx message arrived but it is not an Identity Reply.';return}state.identity=id;get('sysStatus').textContent='Identity reply received.';get('sysIdentityOut').innerHTML=[['Manufacturer',id.manufacturerName+' ('+id.manufacturerId.map(x=>x.toString(16).padStart(2,'0')).join(' ')+')'],['Family',id.family],['Member',id.member],['Revision',id.revision.join('.')],['Device ID',id.deviceId]].map(([a,b])=>'<div class="compact-row"><strong>'+esc(a)+'</strong><span>'+esc(b)+'</span></div>').join('')},()=>{get('sysStatus').textContent='No Identity Reply within 3 s. The device may not support it, or SysEx is not enabled on both ports.'});
    if(trySend(req)){sysLog('Sent Identity Request '+req.map(x=>x.toString(16).padStart(2,'0')).join(' '));get('sysStatus').textContent='Waiting for reply…'}};
  get('sysSend').onclick=()=>{const p=parseHex(get('sysHex').value);if(p.error){get('sysStatus').textContent=p.error;return}const bad=validateSysex(p.bytes);if(bad){get('sysStatus').textContent=bad;return}
    if(!confirm('Send '+p.bytes.length+' SysEx bytes to "'+api.portName(api.getOutput())+'"? SysEx can overwrite device settings.'))return;if(trySend(p.bytes)){sysLog('Sent '+p.bytes.length+' bytes');get('sysStatus').textContent='Sent.'}};
  get('sysCsBtn').onclick=()=>{const p=parseHex(get('sysHex').value);if(p.error){get('sysStatus').textContent=p.error;return}get('sysStatus').textContent='Checksum over the '+p.bytes.length+' entered byte(s) ('+get('sysCsKind').value+'): '+checksum(get('sysCsKind').value,p.bytes).toString(16).toUpperCase().padStart(2,'0')+'h'};
  for(const k of ['A','B'])get('sysCap'+k).onclick=()=>{get('sysStatus').textContent='Waiting up to 30 s for a SysEx dump → '+k+'…';awaitSysex(30000,e=>{dumps[k]=e.raw;get('sysStatus').textContent='Dump '+k+' captured ('+e.raw.length+' bytes).'},()=>{get('sysStatus').textContent='No SysEx dump arrived.'})};
  get('sysDiffBtn').onclick=()=>{if(!dumps.A||!dumps.B){get('sysStatus').textContent='Capture dump A and dump B first.';return}const d=diffBytes(dumps.A,dumps.B);sysLog(d.length?d.length+' difference(s): '+d.slice(0,40).map(x=>'@'+x.offset+' '+(x.a??'—')+'→'+(x.b??'—')).join(', ')+(d.length>40?' …':''):'Dumps are identical ('+dumps.A.length+' bytes).');get('sysStatus').textContent=d.length?d.length+' byte difference(s); see log.':'Dumps identical.'};

  // ---------- UMP decoder & environment (F08) ----------
  get('umpDecode').onclick=()=>{const p=parseUmpHex(get('umpText').value);if(p.error){get('umpOut').innerHTML='<p class="muted">'+esc(p.error)+'</p>';return}const msgs=decodeUmp(p.words);get('umpOut').innerHTML=msgs.slice(0,300).map(m=>'<div class="compact-row"><strong>MT'+esc(m.mt.toString(16).toUpperCase())+' g'+esc(m.group??'')+'</strong><small>'+esc(m.kind)+(m.channel!=null?' · ch '+m.channel:'')+'</small><span>'+esc(m.text||'')+'</span></div>').join('')||'<p class="muted">No words.</p>'};
  const origMon=viewRenderers.monitorView;viewRenderers.monitorView=()=>{origMon();const env=state.winAnalysis?.environment;get('umpEnv').textContent=env?'Windows build '+env.build+': MIDI 2.0 stack '+(env.midi2Capable?'available':'not available')+', Windows MIDI service '+(env.midiServices?'running':'not running')+'. The browser still sees the MIDI 1.0 translation only. Paste UMP words below to decode a UMP capture.':'Browsers only see the MIDI 1.0 translation of MIDI 2.0 devices. Run a Windows log scan to show whether the Windows MIDI 2.0 stack is present. Paste UMP words below to decode a UMP capture.'};

  // ---------- Active tests (F01) ----------
  state.activeResults=[];let activeRun=null,activeConfirmed=false;const received=[];
  api.onIngest(e=>{if(activeRun&&e.raw[0]<0xF8)received.push({bytes:e.raw,t:e.t})});
  get('activeList').innerHTML=ACTIVE_TESTS.map(t=>'<label class="check" title="'+esc(t.description||'')+'"><input type="checkbox" data-active="'+esc(t.id)+'" checked> '+esc(t.title)+'</label>').join(' ');
  const ACTIVE_MEANING={ok:'Every message came back exactly as sent, in order. The send/receive path (browser, driver, cable and device echo) is reliable for this message type.',attention:'Everything sent came back, but extra or duplicate messages were also seen. Something on the route is echoing or merging traffic; check for MIDI feedback loops or a Thru setting.',investigate:'Messages were lost, changed, re-ordered or appeared on another channel. That points to the route (cable, interface, driver, hub) or the device altering data. Re-test with a different cable/port; if it persists the device firmware or channel filter is suspect.',notrun:'Nothing came back. Check that the selected output is physically or virtually looped to the selected input, then run again.'};
  function panicSend(ch){for(const cc of [123,120,121])try{api.getOutput()?.send([0xB0|ch,cc,0])}catch{}}
  function renderActive(extra=''){get('activeResults').innerHTML=extra+state.activeResults.map(r=>'<div class="win-finding"><h3>'+esc(r.title)+' '+chip(r.status,STATUS_LABEL[r.status]||r.status)+'</h3><div class="metric-grid">'+['sent','expected','matched','missing','altered','extra','outOfOrder','duplicates','otherChannel'].map(k=>metric(k,r[k])).join('')+'</div>'+r.details.map(d=>'<p class="muted">'+esc(d)+'</p>').join('')+'<p><strong>What this result means:</strong> '+esc(ACTIVE_MEANING[r.status])+'</p></div>').join('')}
  get('activeRun').onclick=async()=>{
    if(activeRun)return;if(!api.getInput()||!api.getOutput()){get('activeStatus').textContent='Select both an input and an output (looped back) first.';return}
    if(state.loopback?.active||state.burst?.active){get('activeStatus').textContent='Another loopback test is running.';return}
    const ids=$$('[data-active]').filter(c=>c.checked).map(c=>c.dataset.active);if(!ids.length){get('activeStatus').textContent='Tick at least one test.';return}
    if(!activeConfirmed){if(!confirm('Active tests send MIDI to "'+api.portName(api.getOutput())+'". Notes, controller moves and program changes will reach whatever is connected to that output. Continue?'))return;activeConfirmed=true}
    const ch=api.clamp(get('activeChannel').value,1,16)-1,cc=api.clamp(get('activeCc').value,1,31);state.activeResults=[];get('activeCancel').disabled=false;get('activeRun').disabled=true;
    activeRun={timers:[],cancelled:false,ch};
    for(const id of ids){if(activeRun.cancelled)break;
      const plan=buildPlan(id,{channel:ch,cc,velocity:64});received.length=0;get('activeStatus').textContent='Running: '+(ACTIVE_TESTS.find(t=>t.id===id)?.title||id)+' ('+plan.steps.length+' messages)…';
      await new Promise(res=>{let at=0;plan.steps.forEach(s=>{at+=s.delayMs;activeRun.timers.push(setTimeout(()=>{try{api.getOutput().send(s.bytes)}catch{}},at))});activeRun.timers.push(setTimeout(res,planDurationMs(plan)+plan.timeoutMs+50));activeRun.finish=res});
      if(activeRun.cancelled)break;const r=evaluate(plan,received.slice());state.activeResults.push({...r,title:ACTIVE_TESTS.find(t=>t.id===id)?.title||id});renderActive()}
    panicSend(ch);const wasCancelled=activeRun.cancelled;activeRun=null;get('activeCancel').disabled=true;get('activeRun').disabled=false;get('activeStatus').textContent=wasCancelled?'Cancelled. A channel panic was sent.':'Active tests finished.';renderActive()};
  get('activeCancel').onclick=()=>{if(!activeRun)return;activeRun.cancelled=true;activeRun.timers.forEach(clearTimeout);panicSend(activeRun.ch);activeRun.finish?.()};

  // ---------- Clock generator (F09) ----------
  const clkSent=[],clkRecv=[];let clkMeasuring=false;
  const sched=createClockScheduler({send:(bytes,when)=>{try{api.getOutput()?.send(bytes,when);if(bytes[0]===0xF8&&clkMeasuring)clkSent.push(when)}catch{}},now:()=>performance.now(),setTimer:(f,ms)=>setTimeout(f,ms),clearTimer:id=>clearTimeout(id)});
  api.onIngest(e=>{if(clkMeasuring&&e.raw[0]===0xF8)clkRecv.push(e.t)});
  get('clkStart').onclick=()=>{if(!requireOutput())return;if(!confirm('Send MIDI clock/Start to "'+api.portName(api.getOutput())+'"? Connected sequencers or drum machines will start.'))return;const bpm=api.clamp(get('clkBpm').value,30,300);clkSent.length=0;clkRecv.length=0;clkMeasuring=true;sched.start(bpm);get('clkStatus').textContent='Sending clock at '+bpm+' BPM… press Stop to measure.';get('clkResult').innerHTML=''};
  get('clkCont').onclick=()=>{if(!requireOutput())return;clkMeasuring=true;sched.cont();get('clkStatus').textContent='Continue sent; clock running.'};
  function stopClock(){if(!sched.isRunning()&&!clkMeasuring)return;const bpm=sched.stats().bpm||Number(get('clkBpm').value)||120;sched.stop();clkMeasuring=false;
    if(clkRecv.length<8||clkSent.length<8){get('clkStatus').textContent='Stopped. Not enough returned clock to measure ('+clkRecv.length+' received). Loop the output back to the input to measure tempo accuracy.';return}
    const m=clockMeasure(clkSent.slice(),clkRecv.slice(),bpm),errPct=m.bpmMeasured?Math.abs(m.bpmMeasured-bpm)/bpm*100:null,status=m.lost>0||(m.jitterRmsMs??0)>3||(errPct??0)>1?'attention':'ok';
    get('clkStatus').textContent='Stopped. Measurement complete.';get('clkResult').innerHTML='<p>'+chip(status,status==='ok'?'No concern observed':'Attention')+'</p><div class="metric-grid">'+metric('Ticks paired',m.ticks)+metric('Measured BPM',f1(m.bpmMeasured))+metric('Tempo error %',f1(errPct))+metric('Drift ppm',f1(m.driftPpm))+metric('Jitter RMS ms',f1(m.jitterRmsMs))+metric('Max deviation ms',f1(m.maxDeviationMs))+metric('Lost ticks',m.lost)+'</div><p><strong>What this means:</strong> Tempo error and drift show how faithfully the route reproduces the set tempo; jitter is timing wobble after removing constant latency and linear drift. Lost ticks mean the route dropped clock messages. Browser timers are limited by the OS and driver, so small jitter is normal.</p>'}
  get('clkStop').onclick=stopClock;window.addEventListener('pagehide',()=>{try{if(sched.isRunning())sched.stop()}catch{}});

  // ---------- Path comparison (F10) ----------
  let pathB=null,pathA=[],pathBMsgs=[],pathTimer=null;
  function fillInputB(){const acc=api.getAccess(),sel=get('inputB'),cur=sel.value,a=api.getInput();sel.innerHTML='<option value="">None</option>'+(acc?[...acc.inputs.values()].filter(p=>p!==a).map(p=>'<option value="'+esc(p.id)+'">'+esc(api.portName(p))+'</option>').join(''):'');if([...sel.options].some(o=>o.value===cur))sel.value=cur}
  get('inputB').addEventListener('focus',fillInputB);get('inputB').addEventListener('mousedown',fillInputB);
  api.onIngest(e=>{if(pathB&&e.kind!=='active'&&!e.replayed){pathA.push({t:e.t,key:e.hex});if(pathA.length>5000)pathA.shift()}});
  function comparePaths(){
    const used=new Set();let matched=0;const lat=[];
    for(const a of pathA){let hit=-1;for(let j=0;j<pathBMsgs.length;j++){if(used.has(j)||pathBMsgs[j].key!==a.key)continue;if(Math.abs(pathBMsgs[j].t-a.t)<=50){hit=j;break}}if(hit>=0){used.add(hit);matched++;lat.push(pathBMsgs[hit].t-a.t)}}
    const lost=pathA.length-matched,extra=pathBMsgs.length-used.size,status=!pathA.length?'notrun':lost?'investigate':extra?'attention':'ok';
    get('pathOut').innerHTML='<p>'+chip(status,STATUS_LABEL[status])+'</p><div class="metric-grid">'+metric('A messages',pathA.length)+metric('B messages',pathBMsgs.length)+metric('Matched',matched)+metric('On A only (lost on path B)',lost)+metric('On B only',extra)+metric('Median A→B ms',f1(median(lat)))+'</div><p><strong>What this means:</strong> Messages seen on input A but not on input B (within 50 ms) were lost or changed between the two points. Messages only on B were injected or altered. This only compares paths that carry the same MIDI; use it when both inputs should see the same traffic.</p>'}
  get('pathStart').onclick=()=>{const acc=api.getAccess(),id=get('inputB').value;if(!acc||!id||!acc.inputs.has(id)){get('pathStatus').textContent='Enable MIDI and choose Input B.';return}if(!api.getInput()){get('pathStatus').textContent='Select the main input (A) first.';return}
    pathB=acc.inputs.get(id);if(pathB===api.getInput()){pathB=null;get('pathStatus').textContent='Input B must differ from input A.';return}pathA=[];pathBMsgs=[];pathB.onmidimessage=ev=>{const d=[...ev.data];if(d[0]===0xFE)return;pathBMsgs.push({t:performance.now(),key:d.map(x=>x.toString(16).padStart(2,'0').toUpperCase()).join(' ')});if(pathBMsgs.length>5000)pathBMsgs.shift()};
    get('pathStart').disabled=true;get('pathStop').disabled=false;get('pathStatus').textContent='Comparing '+api.portName(api.getInput())+' (A) with '+api.portName(pathB)+' (B)…';pathTimer=setInterval(comparePaths,1000)};
  get('pathStop').onclick=()=>{clearInterval(pathTimer);if(pathB)pathB.onmidimessage=null;comparePaths();pathB=null;get('pathStart').disabled=false;get('pathStop').disabled=true;get('pathStatus').textContent='Stopped.'};

  // ---------- Accessibility: roving tabs with arrow keys ----------
  const tabs=$$('.tab');
  const syncTabIndex=()=>tabs.forEach(t=>t.tabIndex=t.classList.contains('active')?0:-1);syncTabIndex();
  document.querySelector('.tabs')?.addEventListener('click',()=>setTimeout(syncTabIndex,0));
  document.querySelector('.tabs')?.addEventListener('keydown',e=>{const vis=tabs.filter(t=>!t.hidden),i=vis.indexOf(document.activeElement);if(i<0)return;let n=-1;if(e.key==='ArrowRight')n=(i+1)%vis.length;else if(e.key==='ArrowLeft')n=(i-1+vis.length)%vis.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=vis.length-1;if(n<0)return;e.preventDefault();vis[n].focus();vis[n].click()});
  applyFlags();
}
