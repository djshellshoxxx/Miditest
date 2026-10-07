// MIDItest device test engine. Pure functions, no DOM: feed raw MIDI bytes into a
// per-test state object and evaluate it against the test definition from the device database.

export function parse(bytes, t = 0) {
  const [s = 0, d1 = 0, d2 = 0] = bytes;
  if (s >= 0xF0) {
    const sys = {0xF8: 'clock', 0xFA: 'start', 0xFB: 'continue', 0xFC: 'stop', 0xF0: 'sysex', 0xF2: 'spp', 0xFE: 'sensing'}[s] || 'system';
    return {kind: sys, ch: 0, num: 0, val: 0, t, raw: [...bytes]};
  }
  const hi = s & 0xF0, ch = (s & 0x0F) + 1;
  const m = {ch, t, raw: [...bytes]};
  if (hi === 0x90 && d2 > 0) return {...m, kind: 'note', num: d1, val: d2, on: true};
  if (hi === 0x80 || hi === 0x90) return {...m, kind: 'note', num: d1, val: 0, on: false};
  if (hi === 0xB0) return {...m, kind: 'cc', num: d1, val: d2};
  if (hi === 0xE0) return {...m, kind: 'pb', num: 0, val: (d2 << 7) | d1};
  if (hi === 0xD0) return {...m, kind: 'cp', num: 0, val: d1};
  if (hi === 0xA0) return {...m, kind: 'pp', num: d1, val: d2};
  if (hi === 0xC0) return {...m, kind: 'pc', num: d1, val: d1};
  return {...m, kind: 'unknown', num: d1, val: d2};
}

export const idOf = m => `${m.kind}:${m.ch}:${m.num}`;
export function idLabel(id) {
  const [k, ch, n] = id.split(':');
  const names = {note: 'Note', cc: 'CC', pb: 'Pitch bend', cp: 'Channel pressure', pp: 'Poly pressure', pc: 'Program'};
  return `${names[k] || k}${k === 'pb' || k === 'cp' ? '' : ' ' + n} ch${ch}`;
}

const NOISE = new Set(['clock', 'sensing', 'system', 'sysex', 'spp', 'start', 'stop', 'continue']);
const AUTO = new Set(['set', 'range', 'encoder', 'bend', 'pressure', 'keys', 'velocity', 'any', 'clock']);
export const isAutomatic = test => AUTO.has(test.type);

export function newState() {
  return {controls: {}, order: [], msgs: 0, first: null, last: null, clockTimes: [], transport: [], log: []};
}

function inExpect(m, ex) {
  if (!ex) return true;
  if (ex.kinds && !ex.kinds.includes(m.kind)) return false;
  if (ex.ch && ex.ch !== m.ch) return false;
  if (ex.nums && (m.num < ex.nums[0] || m.num > ex.nums[1])) return false;
  return true;
}

// Which message kinds each test type listens to (others are ignored, so stray traffic does not pollute results).
export function acceptedKinds(test) {
  if (test.kinds) return test.kinds;
  return {
    set: ['note', 'cc', 'pc'], range: ['cc', 'pb'], encoder: ['cc'], bend: ['pb'], pressure: ['cp', 'pp'],
    keys: ['note'], velocity: ['note'], any: ['note', 'cc', 'pb', 'cp', 'pp', 'pc'], clock: ['clock', 'start', 'stop', 'continue', 'spp']
  }[test.type] || [];
}

export function feed(state, test, bytes, t = Date.now()) {
  const m = parse(bytes, t);
  if (!acceptedKinds(test).includes(m.kind)) return false;
  if (NOISE.has(m.kind) && test.type !== 'clock') return false;
  state.msgs++; state.first ??= t; state.last = t;
  if (state.log.length < 400) state.log.push(m.raw);
  if (test.type === 'clock') {
    if (m.kind === 'clock') { state.clockTimes.push(t); if (state.clockTimes.length > 400) state.clockTimes.shift(); }
    else state.transport.push(m.kind);
    return true;
  }
  const id = idOf(m);
  let c = state.controls[id];
  if (!c) {
    c = state.controls[id] = {id, kind: m.kind, ch: m.ch, num: m.num, count: 0, ons: 0, offs: 0, held: false, values: [], min: Infinity, max: -Infinity,
      distinct: new Set(), up: 0, down: 0, jumps: 0, doubles: 0, lastOn: -1e9, centerReturns: 0, leftCenter: false, expected: inExpect(m, test.expect)};
    state.order.push(id);
  }
  c.count++;
  if (m.kind === 'note') {
    if (m.on) {
      if (c.held && t - c.lastOn < 40) c.doubles++;
      c.ons++; c.held = true; c.lastOn = t; c.values.push(m.val); c.distinct.add(m.val);
      c.min = Math.min(c.min, m.val); c.max = Math.max(c.max, m.val);
    } else { c.offs++; c.held = false; }
    return true;
  }
  const prev = c.values.length ? c.values[c.values.length - 1] : null;
  c.values.push(m.val); if (c.values.length > 2000) c.values.shift();
  c.distinct.add(m.val); c.min = Math.min(c.min, m.val); c.max = Math.max(c.max, m.val);
  if (m.kind === 'cc' && m.val >= 0 && m.val <= 127) { // relative encoders: 1..63 = up, 65..127 = down (two's complement / binary offset handled below)
    if (m.val > 0 && m.val < 64) c.relUp = (c.relUp || 0) + 1; else if (m.val > 64) c.relDown = (c.relDown || 0) + 1;
    if (m.val === 1 || m.val === 127 || m.val === 63 || m.val === 65) c.relCodes = (c.relCodes || 0) + 1;
  }
  if (prev !== null) {
    const d = m.val - prev; if (d > 0) c.up++; if (d < 0) c.down++;
    const span = m.kind === 'pb' ? 16383 : 127;
    if (Math.abs(d) > span * 0.25) c.jumps++;
  }
  if (m.kind === 'pb') {
    const off = Math.abs(m.val - 8192) > 1500;
    if (off) c.leftCenter = true; else if (c.leftCenter && Math.abs(m.val - 8192) <= (test.centerTolerance ?? 64)) { c.centerReturns++; c.leftCenter = false; }
  }
  return true;
}

const ctrlList = (state, test) => {
  const list = state.order.map(id => state.controls[id]);
  return test.expectStrict ? list.filter(c => c.expected) : list;
};

function encoderMode(c) {
  const rel = (c.relCodes || 0) / Math.max(1, c.count);
  return rel > 0.6 && c.distinct.size <= 12 ? 'relative' : 'absolute';
}

export function encoderDirections(c) {
  if (encoderMode(c) === 'relative') return {mode: 'relative', up: c.relUp || 0, down: c.relDown || 0};
  return {mode: 'absolute', up: c.up, down: c.down};
}

function clockBpm(times) {
  if (times.length < 25) return null;
  const iv = [];
  for (let i = 1; i < times.length; i++) iv.push(times[i] - times[i - 1]);
  const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
  const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length);
  return {bpm: 60000 / (mean * 24), jitterMs: sd, ticks: times.length};
}

// Returns {status:'pending'|'pass'|'warn'|'fail', progress:0..1, summary, metrics, rows}
export function evaluate(state, test) {
  const list = ctrlList(state, test);
  const need = test.count ?? 1;
  const r = {status: 'pending', progress: 0, summary: '', metrics: {messages: state.msgs}, rows: []};
  const unexpected = list.filter(c => !c.expected).length;
  const warnUnexpected = () => { if (test.expect && unexpected && r.status === 'pass') { r.status = 'warn'; r.summary += ` · ${unexpected} control(s) outside documented default map (template may differ)`; } };

  switch (test.type) {
    case 'any': {
      r.progress = Math.min(1, state.msgs / (test.minMessages ?? 1));
      r.rows = list.map(c => ({id: c.id, label: idLabel(c.id), detail: `${c.count} msgs, values ${fmtRange(c)}`, ok: true}));
      if (r.progress >= 1) r.status = 'pass';
      r.summary = `${state.msgs} message(s) from ${list.length} source(s)`;
      break;
    }
    case 'set': {
      const vRange = test.velocityRange;
      const okC = c => (c.kind !== 'note' || !test.requireRelease || c.offs > 0) && (!vRange || (c.min <= vRange[0] && c.max >= vRange[1])) && (c.kind !== 'cc' || !test.requireRelease || c.distinct.size >= 2);
      const good = list.filter(okC);
      r.rows = list.map(c => ({id: c.id, label: idLabel(c.id), ok: okC(c), detail: c.kind === 'note'
        ? `${c.ons} press / ${c.offs} release, vel ${fmtRange(c)}${c.doubles ? `, ${c.doubles} double-trigger` : ''}${c.held ? ', HELD' : ''}`
        : `${c.count} msgs, values ${fmtRange(c)}`}));
      r.progress = Math.min(1, good.length / need);
      const doubles = list.reduce((a, c) => a + c.doubles, 0), held = list.filter(c => c.held).length;
      r.metrics = {...r.metrics, detected: list.length, complete: good.length, doubleTriggers: doubles, heldNow: held};
      r.summary = `${good.length}/${need} controls verified${list.length > good.length ? ` (${list.length - good.length} incomplete)` : ''}`;
      if (good.length >= need) r.status = doubles ? 'warn' : 'pass';
      if (doubles) r.summary += ` · ${doubles} double-trigger(s)`;
      warnUnexpected();
      break;
    }
    case 'range': {
      const lo = test.min ?? 0, hi = test.max ?? 127;
      const span = c => c.kind === 'pb' && hi <= 127 ? [0, 16383, 64] : [lo, hi, test.tolerance ?? (hi > 127 ? 64 : 1)];
      const okC = c => { const [a, b, tol] = span(c); return c.min <= a + tol && c.max >= b - tol; };
      r.rows = list.map(c => ({id: c.id, label: idLabel(c.id), ok: okC(c),
        detail: `min ${c.min} max ${c.max}, ${c.distinct.size} distinct, ${c.jumps} jump(s)${missingSteps(c, ...span(c))}`}));
      const good = list.filter(okC), jumps = good.reduce((a, c) => a + c.jumps, 0);
      r.progress = Math.min(1, good.length / need);
      r.metrics = {...r.metrics, detected: list.length, complete: good.length, jumps};
      r.summary = `${good.length}/${need} reached full travel ${lo}–${hi}`;
      if (good.length >= need) r.status = jumps > (test.maxJumps ?? 2) * need ? 'warn' : 'pass';
      if (jumps) r.summary += ` · ${jumps} large jump(s)`;
      warnUnexpected();
      break;
    }
    case 'encoder': {
      const min = test.minSteps ?? 3;
      const okC = c => { const d = encoderDirections(c); return d.up >= min && d.down >= min; };
      r.rows = list.map(c => { const d = encoderDirections(c); return {id: c.id, label: idLabel(c.id), ok: okC(c), detail: `${d.mode}, ${d.up} up / ${d.down} down steps, values ${fmtRange(c)}`}; });
      const good = list.filter(okC);
      r.progress = Math.min(1, good.length / need);
      const dur = state.last && state.first ? (state.last - state.first) / 1000 : 0;
      r.metrics = {...r.metrics, detected: list.length, complete: good.length, msgPerSec: dur ? +(state.msgs / dur).toFixed(1) : 0};
      r.summary = `${good.length}/${need} turned both directions`;
      if (good.length >= need) r.status = 'pass';
      warnUnexpected();
      break;
    }
    case 'bend': {
      const c = list.find(x => x.kind === 'pb');
      const returns = test.centerReturns ?? 3;
      if (c) {
        const full = c.min <= 200 && c.max >= 16183;
        r.rows = [{id: c.id, label: idLabel(c.id), ok: full && c.centerReturns >= returns, detail: `min ${c.min} max ${c.max} (full ${full ? 'yes' : 'no'}), ${c.centerReturns}/${returns} returns to centre, last ${c.values.at(-1)}`}];
        r.progress = ((full ? 1 : 0) + Math.min(1, c.centerReturns / returns)) / 2;
        r.metrics = {...r.metrics, min: c.min, max: c.max, centerReturns: c.centerReturns, restValue: c.values.at(-1), restOffset: c.values.at(-1) - 8192};
        r.summary = `travel ${c.min}–${c.max}, ${c.centerReturns} centre return(s), rest offset ${c.values.at(-1) - 8192}`;
        if (full && c.centerReturns >= returns) r.status = Math.abs(c.values.at(-1) - 8192) > (test.centerTolerance ?? 64) ? 'warn' : 'pass';
      } else r.summary = 'no pitch bend received yet';
      break;
    }
    case 'pressure': {
      const okC = c => c.max >= (test.minPeak ?? 100) && c.distinct.size >= 8;
      r.rows = list.map(c => ({id: c.id, label: idLabel(c.id), ok: okC(c), detail: `values ${fmtRange(c)}, ${c.distinct.size} distinct`}));
      const good = list.filter(okC);
      r.progress = Math.min(1, good.length / need);
      r.summary = list.length ? `${good.length}/${need} pressure source(s) reached peak ≥ ${test.minPeak ?? 100}` : 'no aftertouch received yet';
      if (good.length >= need) r.status = 'pass';
      break;
    }
    case 'keys': {
      const notes = list.filter(c => c.kind === 'note' && c.ons);
      const nums = notes.map(c => c.num).sort((a, b) => a - b);
      const lo = nums[0], hi = nums.at(-1);
      const gaps = [];
      if (nums.length) for (let n = lo; n <= hi; n++) if (!nums.includes(n)) gaps.push(n);
      const doubles = notes.reduce((a, c) => a + c.doubles, 0), held = notes.filter(c => c.held).map(c => c.num);
      const noRelease = notes.filter(c => !c.offs).map(c => c.num);
      r.progress = Math.min(1, nums.length / need);
      r.metrics = {...r.metrics, keys: nums.length, lowest: lo, highest: hi, gaps, doubleTriggers: doubles, held, noRelease};
      r.rows = notes.map(c => ({id: c.id, label: idLabel(c.id), ok: c.offs > 0 && !c.doubles, detail: `${c.ons}× vel ${fmtRange(c)}${c.doubles ? `, ${c.doubles} double` : ''}${c.offs ? '' : ', no release yet'}`}));
      r.summary = `${nums.length}/${need} keys${nums.length ? ` (${lo}–${hi})` : ''}${gaps.length ? ` · gaps: ${gaps.join(',')}` : ''}${doubles ? ` · ${doubles} double-trigger(s)` : ''}${held.length ? ` · held: ${held.join(',')}` : ''}`;
      if (nums.length >= need && !noRelease.length) r.status = gaps.length || doubles ? 'warn' : 'pass';
      break;
    }
    case 'velocity': {
      const vals = list.filter(c => c.kind === 'note').flatMap(c => c.values);
      const lo = test.softMax ?? 40, hi = test.hardMin ?? 110;
      const soft = vals.filter(v => v <= lo).length, hard = vals.filter(v => v >= hi).length;
      const distinct = new Set(vals).size;
      r.progress = Math.min(1, (Math.min(soft, 3) + Math.min(hard, 3) + Math.min(distinct, 10) / 10 * 4) / 10);
      r.metrics = {...r.metrics, hits: vals.length, min: Math.min(...vals), max: Math.max(...vals), distinct, soft, hard};
      r.summary = vals.length ? `${vals.length} hits, velocity ${Math.min(...vals)}–${Math.max(...vals)}, ${distinct} distinct; soft ≤${lo}: ${soft}, hard ≥${hi}: ${hard}` : 'play soft and hard';
      if (soft >= 3 && hard >= 3 && distinct >= 10) r.status = 'pass';
      break;
    }
    case 'clock': {
      const b = clockBpm(state.clockTimes);
      r.progress = Math.min(1, state.clockTimes.length / 96);
      r.metrics = {...r.metrics, ticks: state.clockTimes.length, transport: [...new Set(state.transport)], ...(b || {})};
      r.summary = b ? `${b.bpm.toFixed(1)} BPM, jitter ${b.jitterMs.toFixed(2)} ms` : `${state.clockTimes.length} clock tick(s)`;
      if (b && state.clockTimes.length >= 96) r.status = b.jitterMs > (test.maxJitterMs ?? 4) ? 'warn' : 'pass';
      break;
    }
    default:
      r.summary = 'Manual test: follow the steps and mark the result.';
  }
  return r;
}

function fmtRange(c) { return c.min === Infinity ? '–' : c.min === c.max ? String(c.min) : `${c.min}–${c.max}`; }
function missingSteps(c, lo, hi) {
  if (hi > 127 || c.min > lo + 1 || c.max < hi - 1) return '';
  let miss = 0; for (let v = lo; v <= hi; v++) if (!c.distinct.has(v)) miss++;
  return miss > 20 ? `, ${miss} values skipped (fast move or coarse pot)` : '';
}

// Testability score for the database: share of tests the software can verify on its own.
export function testability(device) {
  const tests = device.sections.flatMap(s => s.tests);
  const auto = tests.filter(isAutomatic).length;
  const assisted = tests.filter(t => ['midi-out', 'din-loopback', 'audio-in', 'audio-out'].includes(t.type)).length;
  return {tests: tests.length, automatic: auto, assisted, manual: tests.length - auto - assisted,
    score: Math.round(((auto + assisted * 0.6 + (tests.length - auto - assisted) * 0.2) / Math.max(1, tests.length)) * 100)};
}

export function validateDevice(d) {
  const errs = [];
  for (const k of ['id', 'name', 'maker', 'category', 'sections']) if (!d[k]) errs.push(`missing ${k}`);
  const types = new Set([...AUTO, 'manual', 'midi-out', 'din-loopback', 'audio-in', 'audio-out']);
  const ids = new Set();
  for (const s of d.sections || []) for (const t of s.tests || []) {
    if (!t.id || ids.has(t.id)) errs.push(`bad/duplicate test id ${t.id}`); ids.add(t.id);
    if (!types.has(t.type)) errs.push(`${t.id}: unknown type ${t.type}`);
    if (!t.name || !t.steps?.length) errs.push(`${t.id}: needs name and steps`);
    if (t.type === 'midi-out' && !t.messages && !t.echo) errs.push(`${t.id}: midi-out needs messages or echo`);
  }
  return errs;
}
