// Device Tests view: loads the device database (devices/*.json) and runs guided, per-control tests.
import {newState, feed, evaluate, isAutomatic, testability, idLabel} from './device-tests-core.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const STORE = 'miditest.deviceResults.v1';
const root = $('#devicesView');

let db = [], device = null, test = null, state = newState(), access = null;
let results = load();
let audio = {ctx: null, osc: [], stream: null, raf: 0, meter: null};

function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(results)); } catch {} }
const devResults = () => (results[device.id] ??= {});
const allTests = d => d.sections.flatMap(s => s.tests.map(t => ({...t, section: s.name})));

async function loadDb() {
  try {
    const idx = await (await fetch('./devices/index.json')).json();
    db = await Promise.all(idx.devices.map(async f => (await fetch('./devices/' + f)).json()));
  } catch (e) {
    root.innerHTML = `<article class="panel"><h2>Device database unavailable</h2><p class="muted">${esc(e.message)} – serve MIDItest over http(s) or use the desktop build.</p></article>`;
    return;
  }
  renderList();
}

function renderList() {
  root.innerHTML = `<article class="panel"><div class="section-head"><div><h2>Device test database</h2><p>Pick a device for model-specific guided tests. Results are saved locally per device.</p></div>
    <div class="action-row"><button id="dtExportAll">Export all results</button></div></div>
    <div class="dt-cards">${db.map(d => { const tb = testability(d), done = Object.values(results[d.id] || {}).filter(r => r.status && r.status !== 'pending').length;
      return `<button class="dt-card" data-id="${esc(d.id)}"><strong>${esc(d.maker)} ${esc(d.name)}</strong><small>${esc(d.category)}</small>
      <span>${tb.tests} tests · ${tb.automatic} auto · ${tb.assisted} assisted · ${tb.manual} manual</span><span>Testability ${tb.score}% · ${done}/${tb.tests} done</span></button>`; }).join('')}</div></article>`;
  root.querySelectorAll('.dt-card').forEach(b => b.onclick = () => openDevice(b.dataset.id));
  $('#dtExportAll').onclick = () => download('miditest-device-results.json', {exported: new Date().toISOString(), results});
}

async function ensureMidi() {
  if (access || !navigator.requestMIDIAccess) return access;
  try {
    access = await navigator.requestMIDIAccess({sysex: false});
    access.addEventListener('statechange', () => { fillPorts(); });
  } catch (e) { note(`MIDI access failed: ${e.message}`); }
  return access;
}

function fillPorts() {
  const inSel = $('#dtIn'), outSel = $('#dtOut');
  if (!inSel || !access) return;
  const hints = (device.portHints || []).map(h => h.toLowerCase());
  const pick = (sel, ports) => {
    const prev = sel.value;
    sel.innerHTML = '<option value="">— none —</option>' + (sel === inSel ? '<option value="*">All inputs</option>' : '') +
      [...ports.values()].map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.manufacturer ? ' (' + esc(p.manufacturer) + ')' : ''}</option>`).join('');
    const auto = [...ports.values()].find(p => hints.some(h => (p.name + ' ' + p.manufacturer).toLowerCase().includes(h)));
    sel.value = [...sel.options].some(o => o.value === prev) && prev ? prev : auto ? auto.id : (sel === inSel ? '*' : '');
  };
  pick(inSel, access.inputs); pick(outSel, access.outputs);
  for (const p of access.inputs.values()) if (!p._dt) { p._dt = true; p.addEventListener('midimessage', onMessage); }
}

function onMessage(e) {
  if (!test || !device) return;
  const want = $('#dtIn')?.value;
  if (!want || (want !== '*' && e.target.id !== want)) return;
  if (loop.active) return loopReceive(e);
  if (feed(state, test, e.data, e.timeStamp || performance.now())) scheduleLive();
}

let liveQueued = false;
function scheduleLive() { if (!liveQueued) { liveQueued = true; requestAnimationFrame(() => { liveQueued = false; renderLive(); }); } }

async function openDevice(id) {
  device = db.find(d => d.id === id); test = null;
  const tb = testability(device), r = devResults();
  const links = (arr, f) => (arr || []).map(f).join('');
  root.innerHTML = `<div class="dt-head panel"><div><button id="dtBack">← All devices</button> <h2 class="dt-title">${esc(device.maker)} ${esc(device.name)}</h2>
      <p class="muted">${esc(device.category)} · ${esc(device.years || '')} · testability ${tb.score}% (${tb.automatic} automatic, ${tb.assisted} assisted, ${tb.manual} manual)</p></div>
    <div class="dt-ports">${device.midi === false ? '' : `<label>Device MIDI in<select id="dtIn"></select></label><label>Device MIDI out<select id="dtOut"></select></label>`}
      <button id="dtExport" class="primary">Export results</button><button id="dtReset" class="danger">Reset results</button></div></div>
  <div class="grid dt-layout">
    <aside class="panel dt-nav">${device.sections.map(s => `<h3>${esc(s.name)}</h3>${s.tests.map(t => `<button class="dt-test" data-id="${esc(t.id)}"><span class="dt-dot ${esc(r[t.id]?.status || '')}"></span>${esc(t.name)}<small>${isAutomatic(t) ? 'auto' : t.type === 'manual' ? 'manual' : 'assisted'}</small></button>`).join('')}`).join('')}</aside>
    <section id="dtMain" class="panel"><h2>Device information</h2>${device.notes ? `<p>${esc(device.notes)}</p>` : ''}
      <h3>Drivers</h3><ul>${links(device.drivers, d => `<li><strong>${esc(d.os)}</strong>: ${esc(d.name)}${d.gens ? ' – ' + esc(d.gens) : ''} ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">download</a>` : ''}</li>`)}</ul>
      <h3>Manuals</h3><ul>${links(device.manuals, m => `<li><a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a></li>`)}</ul>
      <h3>Service manual</h3><p>${device.serviceManual?.available ? '<strong>Available.</strong> ' : '<strong>Not publicly available.</strong> '}${esc(device.serviceManual?.notes || '')}${device.serviceManual?.url ? ` <a href="${esc(device.serviceManual.url)}" target="_blank" rel="noopener">link</a>` : ''}</p>
      ${device.setup ? `<h3>Before testing</h3><ol>${device.setup.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
      <h3>Known failure modes to look for</h3><ul>${links(device.failureModes, f => `<li>${esc(f)}</li>`)}</ul>
      <p class="muted">Select a test on the left to begin. Automatic tests pass themselves when the criteria are met; you can always override with Pass / Fail / Skip.</p></section>
  </div><p id="dtNote" class="support" aria-live="polite"></p>`;
  $('#dtBack').onclick = () => { stopAudio(); test = null; renderList(); };
  $('#dtExport').onclick = () => download(`miditest-${device.id}-results.json`, buildExport());
  $('#dtReset').onclick = () => { if (confirm('Clear saved results for this device?')) { results[device.id] = {}; save(); openDevice(device.id); } };
  root.querySelectorAll('.dt-test').forEach(b => b.onclick = () => openTest(b.dataset.id));
  if (device.midi !== false) { await ensureMidi(); fillPorts(); }
}

function buildExport() {
  return {device: {id: device.id, maker: device.maker, name: device.name}, exported: new Date().toISOString(), userAgent: navigator.userAgent,
    testability: testability(device), results: allTests(device).map(t => ({section: t.section, id: t.id, name: t.name, type: t.type, ...(devResults()[t.id] || {status: 'not run'})}))};
}

function openTest(id) {
  stopAudio();
  test = allTests(device).find(t => t.id === id); state = newState(); loop.active = false;
  root.querySelectorAll('.dt-test').forEach(b => b.classList.toggle('active', b.dataset.id === id));
  const prev = devResults()[id];
  $('#dtMain').innerHTML = `<p class="eyebrow">${esc(test.section)}</p><h2>${esc(test.name)}</h2>
    ${test.expectNote ? `<p class="muted">Documented default: ${esc(test.expectNote)}</p>` : ''}
    <ol class="dt-steps">${test.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <div id="dtTool"></div>
    <div class="dt-progress"><span id="dtBar"></span></div><p id="dtSummary" class="dt-summary"></p>
    <div id="dtRows" class="compact-table"></div>
    <label class="dt-notes">Notes<textarea id="dtNotes" rows="2" placeholder="Observations, serial number, firmware…">${esc(prev?.notes || '')}</textarea></label>
    <div class="action-row dt-actions"><button id="dtRestart">Restart capture</button><button id="dtPass" class="good">Pass</button><button id="dtWarn">Pass with issues</button><button id="dtFail" class="danger">Fail</button><button id="dtSkip">Skip / N/A</button><button id="dtNext" class="primary">Next test →</button></div>
    ${prev?.status ? `<p class="muted">Last result: <strong>${esc(prev.status)}</strong> ${esc(prev.summary || '')} (${esc(prev.at || '')})</p>` : ''}`;
  $('#dtRestart').onclick = () => openTest(id);
  for (const [b, s] of [['dtPass', 'pass'], ['dtWarn', 'warn'], ['dtFail', 'fail'], ['dtSkip', 'skip']]) $('#' + b).onclick = () => record(s, true);
  $('#dtNext').onclick = () => { const list = allTests(device), i = list.findIndex(t => t.id === test.id); if (list[i + 1]) openTest(list[i + 1].id); };
  renderTool(); renderLive();
}

function record(status, manual) {
  const ev = evaluate(state, test);
  devResults()[test.id] = {status, manual, summary: status === 'skip' ? 'skipped' : ev.summary, metrics: {...ev.metrics, ...(audio.meter?.metrics || {}), ...(loop.metrics || {})},
    controls: ev.rows.map(r => ({id: r.id, ok: r.ok, detail: r.detail})), notes: $('#dtNotes')?.value || '', at: new Date().toLocaleString()};
  save();
  const dot = root.querySelector(`.dt-test[data-id="${CSS.escape(test.id)}"] .dt-dot`); if (dot) dot.className = 'dt-dot ' + status;
  note(`${test.name}: ${status.toUpperCase()}`);
}

function renderLive() {
  if (!test || !$('#dtBar')) return;
  const ev = evaluate(state, test);
  $('#dtBar').style.width = Math.round(ev.progress * 100) + '%';
  $('#dtBar').className = ev.status;
  if (isAutomatic(test)) $('#dtSummary').textContent = `${ev.status === 'pending' ? 'Listening… ' : ev.status.toUpperCase() + ' · '}${ev.summary}`;
  $('#dtRows').innerHTML = ev.rows.length ? `<table><tbody>${ev.rows.slice(-64).map(r => `<tr><td>${r.ok ? '✔' : '…'}</td><td>${esc(r.label)}</td><td>${esc(r.detail)}</td></tr>`).join('')}</tbody></table>` : '';
  const cur = devResults()[test.id];
  if (isAutomatic(test) && ev.status !== 'pending' && (!cur || (!cur.manual && cur.status !== ev.status))) record(ev.status, false);
}

// ---- assisted tools ----
function renderTool() {
  const tool = $('#dtTool');
  if (isAutomatic(test) || test.type === 'manual') { tool.innerHTML = isAutomatic(test) && device.midi !== false && !$('#dtIn')?.value ? '<p class="attention">Select the device MIDI input above.</p>' : ''; return; }
  if (test.type === 'midi-out') {
    tool.innerHTML = `<div class="action-row"><button id="dtSend" class="primary">Send to device</button><button id="dtClear">Send off / clear</button></div><p class="muted" id="dtOutInfo"></p>`;
    $('#dtSend').onclick = () => sendOut(true); $('#dtClear').onclick = () => sendOut(false);
  } else if (test.type === 'din-loopback') {
    tool.innerHTML = `<div class="action-row"><button id="dtLoop" class="primary">Run loopback (${test.count || 64} messages)</button></div>`;
    $('#dtLoop').onclick = runLoop;
  } else if (test.type === 'audio-out') {
    tool.innerHTML = `<div class="action-row"><select id="dtSink"></select><button data-ch="0">Left tone</button><button data-ch="1">Right tone</button><button data-ch="b">Both</button><button id="dtSweep">Sweep 20 Hz–20 kHz</button><button id="dtStop">Stop</button></div>`;
    listAudio('audiooutput', $('#dtSink'));
    tool.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => tone(b.dataset.ch));
    $('#dtSweep').onclick = () => tone('b', true); $('#dtStop').onclick = stopAudio;
  } else if (test.type === 'audio-in') {
    tool.innerHTML = `<div class="action-row"><select id="dtSrc"></select><button id="dtMeter" class="primary">Start meter</button><button id="dtStop">Stop</button></div><div id="dtMeters" class="dt-meters"></div>`;
    listAudio('audioinput', $('#dtSrc'));
    $('#dtMeter').onclick = startMeter; $('#dtStop').onclick = stopAudio;
  }
}

function outPort() { const id = $('#dtOut')?.value; return id ? access?.outputs.get(id) : null; }

function sendOut(on) {
  const out = outPort(); if (!out) return note('Select the device MIDI output first.');
  let msgs = test.messages || [];
  if (test.echo) {
    const learned = Object.values(devResults()[test.echo]?.controls || {}).map(c => c.id);
    msgs = learned.map(id => { const [k, ch, n] = id.split(':'); return k === 'note' ? [0x90 + (ch - 1), +n, 127] : k === 'cc' ? [0xB0 + (ch - 1), +n, 127] : null; }).filter(Boolean);
    if (!msgs.length) return note('Run the referenced input test first so MIDItest knows which messages to echo.');
  }
  for (const m of msgs) out.send(on ? m : (m[0] & 0xF0) === 0x90 ? [m[0], m[1], 0] : (m[0] & 0xF0) === 0xB0 ? [m[0], m[1], 0] : m);
  $('#dtOutInfo').textContent = `${on ? 'Sent' : 'Cleared'} ${msgs.length} message(s): ${msgs.slice(0, 8).map(m => m.map(b => b.toString(16).padStart(2, '0')).join(' ')).join(' | ')}${msgs.length > 8 ? ' …' : ''}`;
}

const loop = {active: false, sent: new Map(), got: 0, lat: [], metrics: null};
function loopReceive(e) {
  const [s, n, v] = e.data; if ((s & 0xF0) !== 0x90 || !v) return;
  const t0 = loop.sent.get(n * 128 + v); if (t0 === undefined) return;
  loop.sent.delete(n * 128 + v); loop.got++; loop.lat.push(performance.now() - t0);
}
async function runLoop() {
  const out = outPort(); if (!out || !$('#dtIn').value) return note('Select both device MIDI in and out, and connect a 5-pin cable from MIDI OUT to MIDI IN.');
  const n = test.count || 64; Object.assign(loop, {active: true, sent: new Map(), got: 0, lat: []});
  for (let i = 0; i < n; i++) { const note = 36 + (i % 48), vel = 1 + (i % 120); loop.sent.set(note * 128 + vel, performance.now()); out.send([0x90 + ((test.channel || 1) - 1), note, vel]); out.send([0x80 + ((test.channel || 1) - 1), note, 0]); await new Promise(r => setTimeout(r, 15)); }
  await new Promise(r => setTimeout(r, 800)); loop.active = false;
  const avg = loop.lat.length ? loop.lat.reduce((a, b) => a + b, 0) / loop.lat.length : null;
  loop.metrics = {sent: n, received: loop.got, lost: n - loop.got, avgLatencyMs: avg && +avg.toFixed(2), maxLatencyMs: loop.lat.length ? +Math.max(...loop.lat).toFixed(2) : null};
  $('#dtSummary').textContent = `Loopback: ${loop.got}/${n} received${avg ? `, avg ${avg.toFixed(2)} ms, max ${loop.metrics.maxLatencyMs} ms` : ''}`;
  record(loop.got === n ? 'pass' : loop.got ? 'warn' : 'fail', false);
}

async function listAudio(kind, sel) {
  try { if (kind === 'audioinput') (await navigator.mediaDevices.getUserMedia({audio: true})).getTracks().forEach(t => t.stop()); } catch {}
  const devs = (await navigator.mediaDevices?.enumerateDevices?.() || []).filter(d => d.kind === kind);
  const hints = (device.portHints || []).map(h => h.toLowerCase());
  sel.innerHTML = devs.map(d => `<option value="${esc(d.deviceId)}">${esc(d.label || d.deviceId.slice(0, 8))}</option>`).join('') || '<option value="">default</option>';
  const auto = devs.find(d => hints.some(h => d.label.toLowerCase().includes(h))); if (auto) sel.value = auto.deviceId;
}

async function tone(ch, sweep) {
  stopAudio();
  const ctx = audio.ctx = new AudioContext();
  try { if ($('#dtSink').value && ctx.setSinkId) await ctx.setSinkId($('#dtSink').value); } catch (e) { note('Could not route to that output: ' + e.message); }
  const merger = ctx.createChannelMerger(2), gain = ctx.createGain(); gain.gain.value = 0.15;
  const osc = ctx.createOscillator(); osc.frequency.value = ch === '1' ? 660 : 440;
  if (sweep) { osc.frequency.setValueAtTime(20, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(20000, ctx.currentTime + 12); }
  osc.connect(gain);
  if (ch === 'b') { gain.connect(merger, 0, 0); gain.connect(merger, 0, 1); } else gain.connect(merger, 0, +ch);
  merger.connect(ctx.destination); osc.start(); audio.osc = [osc];
  note(sweep ? 'Sweeping 20 Hz → 20 kHz over 12 s (keep volume low).' : `Playing ${ch === 'b' ? 'both channels' : ch === '0' ? 'LEFT only (440 Hz)' : 'RIGHT only (660 Hz)'}.`);
}

async function startMeter() {
  stopAudio();
  try {
    audio.stream = await navigator.mediaDevices.getUserMedia({audio: {deviceId: $('#dtSrc').value ? {exact: $('#dtSrc').value} : undefined, channelCount: {ideal: test.channels || 2}, echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
  } catch (e) { return note('Audio input failed: ' + e.message); }
  const ctx = audio.ctx = new AudioContext(), src = ctx.createMediaStreamSource(audio.stream);
  const chs = Math.min(test.channels || 2, src.channelCount || 2), split = ctx.createChannelSplitter(chs);
  src.connect(split);
  const an = [...Array(chs)].map((_, i) => { const a = ctx.createAnalyser(); a.fftSize = 2048; split.connect(a, i); return a; });
  const buf = new Float32Array(2048), m = audio.meter = {metrics: {channelsReported: audio.stream.getAudioTracks()[0]?.getSettings().channelCount ?? chs}, peak: an.map(() => -120), floor: an.map(() => 0)};
  const draw = () => {
    $('#dtMeters').innerHTML = an.map((a, i) => {
      a.getFloatTimeDomainData(buf);
      let pk = 0, sum = 0; for (const v of buf) { pk = Math.max(pk, Math.abs(v)); sum += v * v; }
      const rms = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-6), peak = 20 * Math.log10(pk || 1e-6);
      m.peak[i] = Math.max(m.peak[i], peak); m.floor[i] = Math.min(m.floor[i], rms);
      m.metrics[`in${i + 1}PeakDb`] = +m.peak[i].toFixed(1); m.metrics[`in${i + 1}NoiseFloorDb`] = +m.floor[i].toFixed(1);
      return `<div><strong>Input ${i + 1}</strong><div class="dt-progress"><span style="width:${Math.max(0, Math.min(100, (rms + 90) / 90 * 100))}%" class="${peak > -1 ? 'fail' : peak > -12 ? 'warn' : 'pass'}"></span></div><small>RMS ${rms.toFixed(1)} dBFS · peak ${peak.toFixed(1)} · max peak ${m.peak[i].toFixed(1)} · lowest RMS ${m.floor[i].toFixed(1)}</small></div>`;
    }).join('') + `<small class="muted">Channels reported by the driver: ${m.metrics.channelsReported}. Browser input may be limited to 2 channels.</small>`;
    audio.raf = requestAnimationFrame(draw);
  };
  draw();
}

function stopAudio() {
  cancelAnimationFrame(audio.raf); audio.osc.forEach(o => { try { o.stop(); } catch {} });
  audio.stream?.getTracks().forEach(t => t.stop()); audio.ctx?.close().catch(() => {});
  audio = {ctx: null, osc: [], stream: null, raf: 0, meter: audio.meter};
}

function note(msg) { const n = $('#dtNote'); if (n) n.textContent = msg; }
function download(name, obj) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

if (root) loadDb();
export {idLabel};
