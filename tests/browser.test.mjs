// Browser integration tests: loads index.html in headless Chromium with a mock Web MIDI implementation.
// Run: npm install && npx playwright install chromium && node tests/browser.test.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('..',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  const path=normalize(decodeURIComponent(new URL(req.url,'http://x').pathname)).replace(/^([/\\])+/,'')||'index.html';
  try{const body=await readFile(join(root,path));res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'});res.end(body)}
  catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/index.html`;

// mode: 'ok' (mock device with output looped back to input), 'denied' or 'unavailable'.
const mock=mode=>`(()=>{
  if(${JSON.stringify(mode)}==='unavailable'){delete Navigator.prototype.requestMIDIAccess;return}
  if(${JSON.stringify(mode)}==='denied'){navigator.requestMIDIAccess=async()=>{throw new DOMException('Permission denied','NotAllowedError')};return}
  class Port{constructor(id,name,type){this.id=id;this.name=name;this.manufacturer='Mock';this.type=type;this.state='connected';this.connection='closed';this._h=null}
    set onmidimessage(f){this._h=f;this.connection='open'} get onmidimessage(){return this._h}}
  const input=new Port('in1','Mock Keys','input'),output=new Port('out1','Mock Out','output');
  const access={inputs:new Map([[input.id,input]]),outputs:new Map([[output.id,output]]),onstatechange:null};
  window.__sent=[];output.send=b=>{window.__sent.push([...b]);setTimeout(()=>window.__midi.emit(b),2)};
  window.__midi={emit(b){input._h&&input._h({data:new Uint8Array(b),currentTarget:input})},
    unplug(){input.state='disconnected';access.inputs.delete(input.id);access.onstatechange?.({port:input})},
    replug(){input.state='connected';access.inputs.set(input.id,input);access.onstatechange?.({port:input})}};
  navigator.requestMIDIAccess=async()=>access;
})();`;

const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
async function open(mode){
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.addInitScript(mock(mode));await page.goto(url);
  return {page,errors};
}
const text=(page,sel)=>page.locator(sel).innerText();
const tab=(page,view)=>page.click(`[data-view="${view}"]`);
const settle=page=>page.waitForTimeout(250);

try{
  // Web MIDI unavailable: page still usable, hardware actions disabled.
  {const {page,errors}=await open('unavailable');
    assert.match(await text(page,'#midiStatus'),/unavailable/i);
    assert.ok(await page.locator('#connect').isDisabled());
    assert.ok(await page.locator('#noteOn').isDisabled());
    await page.click('#helpBtn');assert.ok(await page.locator('#helpDialog').evaluate(d=>d.open));
    assert.deepEqual(errors,[]);await page.close()}

  // Permission denied: recoverable status text.
  {const {page,errors}=await open('denied');
    await page.click('#connect');await settle(page);
    assert.match(await text(page,'#midiStatus'),/not granted/i);
    assert.ok(!(await page.locator('#connect').isDisabled()),'connect stays available to retry');
    assert.deepEqual(errors,[]);await page.close()}

  // Full mock device session.
  {const {page,errors}=await open('ok');
    assert.ok(await page.locator('#noteOn').isDisabled(),'output controls disabled before access');
    await page.click('#connect');await settle(page);
    assert.equal(await page.locator('#input').inputValue(),'in1');
    assert.match(await text(page,'#midiStatus'),/Listening: Mock Keys/);
    assert.ok(!(await page.locator('#noteOn').isDisabled()));

    await page.click('#guided');await page.click('#guidedNext');await page.click('#guidedSkip');
    assert.match(await text(page,'#guidedTitle'),/3\/11/);

    await page.evaluate(async()=>{const M=window.__midi,sleep=ms=>new Promise(r=>setTimeout(r,ms));
      for(let n=48;n<=60;n++){M.emit([0x90,n,60+n]);M.emit([0x80,n,0])}
      for(let v=0;v<=127;v++)M.emit([0xB0,21,v]);                  // clean sweep
      for(let i=0;i<30;i++)M.emit([0xB0,22,60+(i%2)*8]);             // noisy control
      for(let i=0;i<4;i++){M.emit([0xB0,64,127]);M.emit([0xB0,64,0]);await sleep(50)} // sustain switch
      for(let v=-8192;v<8192;v+=256){const x=v+8192;M.emit([0xE0,x&127,x>>7])}M.emit([0xE0,0,64]);
      M.emit([0x90,62,90]);                                          // left held (unmatched)
    });
    await settle(page);
    const findings=await text(page,'#findings');
    assert.match(findings,/1:22: high stationary jitter/);
    assert.doesNotMatch(findings,/1:21:/,'clean sweep must not be flagged');
    assert.doesNotMatch(findings,/1:64:/,'switch pedal must not be flagged for jumps/jitter');
    assert.match(findings,/Note On without matching Note Off/);
    assert.match(await text(page,'#inventory'),/Buttons \/ switches\s*1 switch-like/);

    await tab(page,'monitorView');await settle(page);
    assert.ok(await page.locator('#monitor tr').count()>100);
    await page.selectOption('#typeFilter','pitchbend');
    const rows=await page.locator('#monitor tr').count();assert.ok(rows>10&&rows<100,'type filter narrows rows: '+rows);
    await page.selectOption('#typeFilter','');

    await tab(page,'controlsView');await settle(page);
    await page.click('[data-control="1:21"]');await settle(page);
    assert.match(await text(page,'#controlTitle'),/CC 21/);
    assert.match(await text(page,'#controlDetail'),/100%\s*Coverage/);
    assert.match(await text(page,'#pitchStats'),/Channel 1/);
    assert.match(await text(page,'#pedalStats'),/\(switch\)/);

    await tab(page,'keyboardView');await page.fill('#expectedLow','48');await page.fill('#expectedHigh','64');await page.click('#applyExpected');await settle(page);
    assert.match(await text(page,'#keySummary'),/expected notes unseen/);

    await tab(page,'timingView');await page.fill('#loopRounds','2');await page.click('#runLoopback');await page.waitForTimeout(1500);
    const loop=await text(page,'#loopbackStats');assert.match(loop,/13\s*Sent/);assert.match(loop,/13\s*Matched/);assert.match(loop,/100%/);
    assert.match(await text(page,'#latencyStats'),/13\s*Samples/);

    await tab(page,'mappingView');await page.fill('#mappingLabel','Cutoff');await page.click('#addMapping');
    assert.equal(await page.locator('#mappingRows tr').count(),1);

    await page.evaluate(()=>{window.__midi.unplug();window.__midi.replug()});await settle(page);
    assert.match(await text(page,'#summary'),/1\s*Disconnects/);

    await page.click('#guidedEnd').catch(()=>{});
    await tab(page,'reportView');await settle(page);
    const report=await text(page,'#reportHuman');
    assert.match(report,/Guided step skipped: Key sweep/);
    assert.match(report,/Missing expected keys/);
    assert.match(report,/13\/13 matched/);
    const json=JSON.parse(await page.locator('#reportPreview').textContent());
    assert.equal(json.version,2);assert.ok(json.eventCount>100);assert.equal(json.mappings[0].label,'Cutoff');

    // Local persistence: save baseline, compare, clear.
    await page.click('#saveBaseline');
    assert.ok(await page.evaluate(()=>!!localStorage.getItem('miditest-baseline-v2')));
    await page.click('#compareBaseline');await settle(page);
    assert.match(await text(page,'#reportHuman'),/Baseline comparison/);
    await page.setInputFiles('#importReport',{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99,"eventCount":1}')});await settle(page);
    assert.match(await text(page,'#midiStatus'),/Unsupported report version/);
    await page.click('#clearLocal');
    assert.ok(await page.evaluate(()=>!localStorage.getItem('miditest-baseline-v2')));

    await page.click('[data-view="outputView"]');await page.click('#panicAll');
    assert.ok(await page.evaluate(()=>window.__sent.filter(b=>(b[0]&0xF0)===0xB0&&b[1]===123).length===16));
    assert.deepEqual(errors,[]);await page.close()}

  console.log('MIDItest browser integration tests: PASS');
}finally{await browser.close();server.close()}
