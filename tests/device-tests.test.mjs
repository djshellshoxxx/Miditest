import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse, newState, feed, evaluate, testability, validateDevice, encoderDirections} from '../device-tests-core.js';

const dir = new URL('../devices/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'));
assert.ok(index.devices.length >= 7);
const ids = new Set();
for (const f of index.devices) {
  const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
  assert.deepEqual(validateDevice(d), [], f);
  assert.ok(!ids.has(d.id), 'duplicate device ' + d.id); ids.add(d.id);
  for (const s of d.sections) for (const t of s.tests) if (t.echo) assert.ok(d.sections.some(x => x.tests.some(y => y.id === t.echo)), `${t.id} echoes unknown test`);
  const tb = testability(d); assert.ok(tb.tests > 5 && tb.score > 0 && tb.score <= 100);
}

assert.equal(parse([0x90, 60, 0]).on, false);
assert.equal(parse([0xE1, 0, 64]).val, 8192);
assert.equal(parse([0xE1, 0, 64]).ch, 2);

const run = (test, msgs) => { const s = newState(); let t = 0; for (const m of msgs) feed(s, test, m, t += 100); return evaluate(s, test); };

// set: 16 pads with release passes; missing release stays pending
const pads = {type: 'set', count: 16, requireRelease: true, expect: {kinds: ['note'], nums: [36, 51]}};
const padMsgs = [...Array(16)].flatMap((_, i) => [[0x90, 36 + i, 100], [0x80, 36 + i, 0]]);
assert.equal(run(pads, padMsgs).status, 'pass');
assert.equal(run(pads, padMsgs.slice(0, -1)).status, 'pending');
assert.equal(run(pads, padMsgs.map(m => [m[0], m[1] + 20, m[2]])).status, 'warn'); // outside documented default map
// velocity range per pad
assert.equal(run({type: 'set', count: 1, kinds: ['note'], velocityRange: [40, 110]}, [[0x90, 36, 20], [0x90, 36, 0], [0x90, 36, 120]]).status, 'pass');
// double trigger
const s = newState(), dbl = {type: 'set', count: 1, requireRelease: true};
feed(s, dbl, [0x90, 40, 90], 0); feed(s, dbl, [0x90, 40, 90], 10); feed(s, dbl, [0x80, 40, 0], 50);
assert.equal(evaluate(s, dbl).status, 'warn');

// range: full fader sweep passes, half sweep pending, pitch-bend fader auto-scales
const sweep = [...Array(128)].map((_, v) => [0xB0, 7, v]);
assert.equal(run({type: 'range', count: 1}, sweep).status, 'pass');
assert.equal(run({type: 'range', count: 1}, sweep.slice(0, 64)).status, 'pending');
assert.equal(run({type: 'range', kinds: ['pb'], count: 1}, [[0xE0, 0, 0], [0xE0, 0, 64], [0xE0, 127, 127]]).status, 'pass');
assert.equal(run({type: 'range', count: 1}, [[0xB0, 7, 0], [0xB0, 7, 127], [0xB0, 7, 0], [0xB0, 7, 127], [0xB0, 7, 0], [0xB0, 7, 127]]).status, 'warn');

// encoder: relative (1 / 127) and absolute both detected
const rel = [...Array(5)].map(() => [0xB0, 20, 1]).concat([...Array(5)].map(() => [0xB0, 20, 127]));
const st = newState(), enc = {type: 'encoder', count: 1, minSteps: 3};
rel.forEach((m, i) => feed(st, enc, m, i));
assert.equal(encoderDirections(st.controls['cc:1:20']).mode, 'relative');
assert.equal(evaluate(st, enc).status, 'pass');
assert.equal(run(enc, [10, 11, 12, 13, 12, 11, 10, 9].map(v => [0xB0, 21, v])).status, 'pass');

// bend: full travel + 3 returns
const bend = [];
for (let i = 0; i < 3; i++) bend.push([0xE0, 127, 127], [0xE0, 0, 64], [0xE0, 0, 0], [0xE0, 0, 64]);
assert.equal(run({type: 'bend', centerReturns: 3}, bend).status, 'pass');

// keys: 25 contiguous keys; a gap gives warn when count reached otherwise
const keys = [...Array(25)].flatMap((_, i) => [[0x90, 48 + i, 80], [0x80, 48 + i, 0]]);
assert.equal(run({type: 'keys', count: 25}, keys).status, 'pass');
const gap = run({type: 'keys', count: 24}, keys.filter(m => m[1] !== 50));
assert.equal(gap.status, 'warn'); assert.deepEqual(gap.metrics.gaps, [50]);

// velocity, pressure, any, clock
const vel = [5, 10, 20, 30, 50, 60, 70, 80, 115, 120, 127].flatMap(v => [[0x90, 60, v], [0x80, 60, 0]]);
assert.equal(run({type: 'velocity'}, vel).status, 'pass');
assert.equal(run({type: 'pressure', count: 1}, [...Array(12)].map((_, i) => [0xD0, i * 11])).status, 'pass');
assert.equal(run({type: 'any', minMessages: 2}, [[0x90, 1, 1], [0xB0, 1, 1]]).status, 'pass');
const cs = newState(), ck = {type: 'clock'};
for (let i = 0; i < 100; i++) feed(cs, ck, [0xF8], i * 20.8333);
assert.ok(Math.abs(evaluate(cs, ck).metrics.bpm - 120) < 0.5);
// clock bytes ignored by MIDI control tests
assert.equal(feed(newState(), pads, [0xF8], 0), false);

console.log('MIDItest device tests: PASS');
