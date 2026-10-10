import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

assert.match(html,/type="module" src="\.\/app-v2\.js"/);
assert.doesNotMatch(html,/src="\.\/app\.js"/);
assert.match(html,/id="quick"/);
for(const view of ['monitorView','controlsView','keyboardView','timingView','outputView','mappingView','testsView','winlogView','reportView'])assert.match(html,new RegExp('id="'+view+'"'));

const ids=[...app.matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map(m=>m[1]);
const required=['connect','input','output','guided','guidedEnd','monitor','controls','keyboard','runLoopback','loopRounds','exportReport','helpDialog','sysexStats','pitchStats','mpeStats','clockHistogram'];
const used=[...app.matchAll(/^const ids=\[([^\]]+)\]/gms)][0][1].replace(/\n/g,'').match(/'([^']+)'/g).map(x=>x.slice(1,-1));
for(const id of used)assert.match(html,new RegExp('id="'+id+'"'),'app-v2.js references missing DOM id '+id);
assert.doesNotMatch(html,/\son[a-z]+="/,'no inline event handlers');
assert.doesNotMatch(html+app,/\\n(function|<\/body>|\[els)/,'no literal \\n artifacts');
for(const id of required)assert.match(html,new RegExp('id="'+id+'"'),'missing DOM id '+id);

const features=readFileSync(new URL('../features.js',import.meta.url),'utf8');
const fids=(await import('../features.js')).FEATURE_IDS;
for(const id of fids)assert.match(html,new RegExp('id="'+id+'"'),'features.js references missing DOM id '+id);
for(const m of features.matchAll(/get\('([A-Za-z0-9]+)'\)/g))assert.ok(fids.includes(m[1]),'features.js uses id not in FEATURE_IDS: '+m[1]);
assert.match(css,/:focus-visible/);
assert.match(css,/prefers-reduced-motion/);
assert.match(css,/@media\(max-width:700px\)/);
assert.match(html,/Enable SysEx/);
assert.match(html,/Export JSON|JSON/);
console.log('MIDItest static UI tests: PASS');
