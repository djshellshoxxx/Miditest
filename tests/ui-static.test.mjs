import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

assert.match(html,/type="module" src="\.\/app-v2\.js"/);
assert.doesNotMatch(html,/src="\.\/app\.js"/);
assert.match(html,/id="quick"/);
for(const view of ['monitorView','controlsView','keyboardView','timingView','outputView','mappingView','reportView'])assert.match(html,new RegExp('id="'+view+'"'));

const ids=[...app.matchAll(/'([A-Za-z][A-Za-z0-9]+)'/g)].map(m=>m[1]);
const required=['connect','input','output','guided','monitor','controls','keyboard','runLoopback','exportReport','helpDialog'];
for(const id of required)assert.match(html,new RegExp('id="'+id+'"'),'missing DOM id '+id);

assert.match(css,/:focus-visible/);
assert.match(css,/prefers-reduced-motion/);
assert.match(css,/@media\(max-width:700px\)/);
assert.match(html,/Enable SysEx/);
assert.match(html,/Export JSON|JSON/);
console.log('MIDItest static UI tests: PASS');
