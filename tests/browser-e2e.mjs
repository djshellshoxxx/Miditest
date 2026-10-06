import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
await page.addInitScript(() => {
  const input={id:'fake-in',name:'QA MIDI Controller',manufacturer:'MIDItest QA',type:'input',state:'connected',connection:'open',onmidimessage:null};
  const output={id:'fake-out',name:'QA MIDI Output',manufacturer:'MIDItest QA',type:'output',state:'connected',connection:'open',sent:[],send(bytes){this.sent.push([...bytes])}};
  const access={inputs:new Map([[input.id,input]]),outputs:new Map([[output.id,output]]),onstatechange:null};
  Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:async()=>access});
  globalThis.__qaMidi={input,output,access};
});
await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
await page.click('#connect');
await page.waitForFunction(()=>[...document.querySelector('#input').options].some(option=>option.value==='fake-in'));
await page.selectOption('#input','fake-in');
await page.selectOption('#output','fake-out');
assert.match(await page.locator('#midiStatus').textContent(),/Listening|MIDI enabled/i);

const emit=async bytes=>page.evaluate(b=>{
  const input=globalThis.__qaMidi.input;
  input.onmidimessage?.({data:new Uint8Array(b),currentTarget:input});
},bytes);

await emit([0x90,60,25]);
await emit([0x91,60,35]);
await emit([0x80,60,0]);
await page.waitForTimeout(50);
assert.ok(await page.locator('.key[title="C4"]').evaluate(el=>el.classList.contains('held')),'same pitch remains held on channel 2');
await emit([0x81,60,0]);
await emit([0x90,64,120]);
await emit([0x80,64,0]);
for(let i=0;i<20;i++)await emit([0xB0,7,Math.round(i*127/19)]);
await emit([0xE0,0,0]); await emit([0xE0,0,64]); await emit([0xE0,127,127]);
await emit([0xD0,80]);
await new Promise(r=>setTimeout(r,100));

const summary=await page.locator('#summary').textContent();
assert.match(summary,/Events/i); assert.match(summary,/Keys/i); assert.match(summary,/CCs/i);
assert.match(await page.locator('#inventory').textContent(),/Pitch bend.*Observed/is);

await page.click('[data-view="monitorView"]');
assert.ok(await page.locator('#monitor tr').count()>=20);
await page.fill('#search','CC 7');
await new Promise(r=>setTimeout(r,30));
assert.ok(await page.locator('#monitor tr').count()>=1);

await page.click('[data-view="controlsView"]');
assert.match(await page.locator('#controls').textContent(),/CC 7/);
assert.match(await page.locator('#controlDetail').textContent(),/Coverage/i);

await page.click('[data-view="keyboardView"]');
assert.match(await page.locator('#keySummary').textContent(),/2 notes observed/i);

await page.click('[data-view="outputView"]');
await page.fill('#outNote','72');
await page.click('#noteOn');
await page.click('#noteOff');
await page.click('#sendCc');
const sent=await page.evaluate(()=>globalThis.__qaMidi.output.sent);
assert.ok(sent.some(x=>x[0]===0x90&&x[1]===72));
assert.ok(sent.some(x=>x[0]===0x80&&x[1]===72));
assert.ok(sent.some(x=>(x[0]&0xF0)===0xB0));

await page.click('[data-view="mappingView"]');
await page.fill('#mappingLabel','QA mapping');
await page.click('#addMapping');
assert.match(await page.locator('#mappingRows').textContent(),/QA mapping/);

await page.click('[data-view="reportView"]');
assert.match(await page.locator('#reportPreview').textContent(),/"eventCount"/);
await page.click('#saveBaseline');
assert.ok(await page.evaluate(()=>localStorage.getItem('miditest-baseline-v2')!==null));
await page.click('#compareBaseline');
assert.match(await page.locator('#reportHuman').textContent(),/comparison/i);

await browser.close();
console.log('MIDItest browser Web MIDI E2E QA: PASS');
