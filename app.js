// ClaimSnap — wiring. Segmentation -> severity -> description -> cross-check.

import {
  loadSession, letterbox, infer, unletterbox, areaInPhotoPx,
  DAMAGE_NAMES, DAMAGE_COLORS, vehicleFilter, S, MP,
} from './seg.js';
import { carArea, scoreSeverity, overallSeverity, THRESHOLDS } from './severity.js';
import { crossCheck, supportedOnly } from './crosscheck.js';

const DAMAGE_MODEL = 'models/best.onnx';        // YOLO11n-seg trained on CarDD
const CAR_MODEL = 'models/car-seg.onnx';        // COCO YOLO11n-seg, for the car area

const $ = id => document.getElementById(id);
const say = (msg, isErr = false) => {
  $('status').textContent = msg;
  $('status').classList.toggle('err', isErr);
};
const pct = x => (x * 100).toFixed(x < 0.01 ? 2 : 1) + '%';

let damageSession = null, carSession = null, lastReport = null;

// ---------------------------------------------------------------- model load

(async () => {
  if (typeof ort === 'undefined') {
    say('ONNX Runtime Web did not load — check the network connection.', true);
    return;
  }
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
  ort.env.wasm.numThreads = 1;                  // no cross-origin isolation on a Static Space

  try {
    damageSession = await loadSession(DAMAGE_MODEL);
  } catch (e) {
    say(`Could not load ${DAMAGE_MODEL} — put the exported model in claimsnap/models/. (${e.message})`, true);
    return;
  }

  try {
    carSession = await loadSession(CAR_MODEL);
  } catch {
    carSession = null;                          // severity falls back to frame area
  }

  say(carSession
    ? 'Ready. Choose a car photo.'
    : 'Ready (no car model found, so severity is measured against the whole frame). Choose a car photo.');
  $('file').disabled = false;
})();

// ---------------------------------------------------------------- pipeline

$('file').onchange = e => {
  const f = e.target.files?.[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => run(img, f.name);
  img.onerror = () => say('That file could not be read as an image.', true);
  img.src = URL.createObjectURL(f);
};

async function run(img, filename) {
  for (const p of ['resultPanel', 'vlmPanel', 'summaryPanel']) $(p).classList.add('hide');
  say('Segmenting…');

  const t0 = performance.now();
  const lb = letterbox(img);

  let damage, vehicles = [];
  try {
    damage = await infer(damageSession, lb, { conf: 0.25, iouThr: 0.5 });
    if (carSession) {
      vehicles = await infer(carSession, lb, { conf: 0.35, iouThr: 0.5, classFilter: vehicleFilter });
    }
  } catch (e) {
    say('Inference failed: ' + e.message, true);
    return;
  }
  const segMs = performance.now() - t0;

  const car = carArea(vehicles, MP * MP);
  scoreSeverity(damage, car);

  draw(img, lb, damage, vehicles);
  renderDetections(damage, lb, car);
  $('metrics').innerHTML =
    `<span>Segmentation <b>${segMs.toFixed(0)} ms</b></span>` +
    `<span>Damage found <b>${damage.length}</b></span>` +
    `<span>Overall <b>${overallSeverity(damage) ?? 'none detected'}</b></span>` +
    `<span>Car located <b>${car.found ? 'yes' : 'no'}</b></span>`;
  $('resultPanel').classList.remove('hide');

  lastReport = {
    file: filename,
    generated: new Date().toISOString(),
    car_located: car.found,
    severity_thresholds: THRESHOLDS,
    overall_severity: overallSeverity(damage),
    detections: damage.map(d => ({
      type: DAMAGE_NAMES[d.cls],
      confidence: +d.conf.toFixed(3),
      share_of_car: +d.ratio.toFixed(4),
      severity: d.severity,
    })),
    timing_ms: { segmentation: Math.round(segMs) },
  };

  if (!$('useVlm').checked) { renderSummary(); say(`Done in ${(segMs / 1000).toFixed(1)} s — detections and summary below.`); return; }

  // ------------------------------------------------------------ description
  say('Loading the vision-language model (first run downloads it)…');
  let vlm;
  try {
    const { describe, backendName } = await import('./vlm.js');
    say('Writing the description…');
    vlm = await describe(img);
    lastReport.vlm_backend = backendName();
  } catch (e) {
    say('Segmentation done. The vision-language model could not run: ' + e.message, true);
    renderSummary();
    return;
  }

  $('rawVlm').textContent = vlm.raw || '(empty)';
  lastReport.timing_ms.description = Math.round(vlm.ms);
  lastReport.timing_ms.total = Math.round(segMs + vlm.ms);

  if (!vlm.json) {
    $('claims').innerHTML =
      '<div class="claim flag"><span class="tag flag">unusable</span><br>' +
      'The model did not return parsable JSON, so nothing can be cross-checked. ' +
      'The raw output is below.</div>';
    $('hallu').innerHTML = '';
    $('vlmPanel').classList.remove('hide');
    say(`Done in ${(segMs + vlm.ms) / 1000 | 0}s — description unusable, detections above stand on their own.`);
    renderSummary();
    return;
  }

  const checked = crossCheck(vlm.json, damage);
  renderClaims(vlm.json, checked);
  lastReport.description = {
    before_cross_check: vlm.json,
    after_cross_check: supportedOnly(vlm.json, checked),
    statements: checked.statements,
    unmentioned_detections: checked.missed,
    hallucination_rate_before: +checked.counts.hallucinationRate.toFixed(3),
    statements_removed: checked.counts.unsupported,
    statements_total: checked.counts.total,
  };
  renderSummary();
  say(`Done in ${((segMs + vlm.ms) / 1000).toFixed(1)} s on ${lastReport.vlm_backend ?? 'cpu'}.`);
}

// ---------------------------------------------------------------- rendering

function draw(img, lb, damage, vehicles) {
  const c = $('out');
  c.width = img.width; c.height = img.height;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);

  // Masks live in 160-space; blow them up to the letterboxed 640 frame first,
  // then lift the un-padded region back onto the photo.
  const m = document.createElement('canvas');
  m.width = m.height = MP;
  const mcx = m.getContext('2d');
  const px = mcx.createImageData(MP, MP);

  const paint = (det, rgb, alpha) => {
    px.data.fill(0);
    for (let i = 0; i < MP * MP; i++) {
      if (!det.mask[i]) continue;
      const o = i * 4;
      px.data[o] = rgb[0]; px.data[o + 1] = rgb[1]; px.data[o + 2] = rgb[2];
      px.data[o + 3] = alpha;
    }
    mcx.putImageData(px, 0, 0);
    cx.imageSmoothingEnabled = false;
    cx.drawImage(m, lb.px * MP / S, lb.py * MP / S, lb.nw * MP / S, lb.nh * MP / S,
      0, 0, img.width, img.height);
  };

  for (const v of vehicles) paint(v, [120, 130, 145], 46);   // car area, faint
  for (const d of damage) paint(d, DAMAGE_COLORS[d.cls], 130);

  // Boxes and labels on top.
  const scale = Math.max(img.width, img.height) / 640;
  cx.lineWidth = Math.max(2, 2.5 * scale);
  cx.font = `${Math.max(13, 15 * scale)}px -apple-system, system-ui, sans-serif`;
  cx.textBaseline = 'top';

  for (const d of damage) {
    const b = unletterbox(d, lb);
    const rgb = DAMAGE_COLORS[d.cls];
    cx.strokeStyle = `rgb(${rgb})`;
    cx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);

    const label = `${DAMAGE_NAMES[d.cls]} ${(d.conf * 100) | 0}% · ${d.severity}`;
    const w = cx.measureText(label).width + 10 * scale;
    const h = Math.max(18, 20 * scale);
    const ly = Math.max(0, b.y1 - h);
    cx.fillStyle = `rgb(${rgb})`;
    cx.fillRect(b.x1, ly, w, h);
    cx.fillStyle = '#fff';
    cx.fillText(label, b.x1 + 5 * scale, ly + 2 * scale);
  }
}

function renderDetections(damage, lb, car) {
  if (!damage.length) {
    $('detTableWrap').innerHTML =
      '<p style="color:var(--muted);font-size:14px;margin:0">' +
      'No damage of the six trained types was found above 25% confidence. ' +
      'That is not the same as an undamaged car.</p>';
    return;
  }
  const rows = damage.map(d => `
    <tr>
      <td><span class="swatch" style="background:rgb(${DAMAGE_COLORS[d.cls]})"></span>${DAMAGE_NAMES[d.cls]}</td>
      <td>${(d.conf * 100).toFixed(0)}%</td>
      <td>${Math.round(areaInPhotoPx(d.maskArea, lb)).toLocaleString()} px²</td>
      <td>${pct(d.ratio)}${car.found ? '' : ' <span style="color:var(--muted)">of frame</span>'}</td>
      <td class="sev ${d.severity}">${d.severity}</td>
    </tr>`).join('');
  $('detTableWrap').innerHTML = `<table>
    <thead><tr><th>Damage</th><th>Conf.</th><th>Mask area</th>
      <th>Share of ${car.found ? 'car' : 'frame'}</th><th>Severity</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderClaims(json, checked) {
  const parts = checked.statements.map(s => `
    <div class="claim ${s.supported ? 'ok' : 'flag'}">
      <span class="tag ${s.supported ? 'ok' : 'flag'}">${s.supported ? 'supported' : 'not supported'}</span><br>
      ${esc(s.text)} <span style="color:var(--muted)">${esc(s.reason)}</span>
    </div>`);

  if (json.summary) {
    parts.unshift(`<p style="margin:0 0 10px"><em>${esc(String(json.summary))}</em></p>`);
  }
  if (checked.missed.length) {
    parts.push(`<div class="claim"><span class="tag" style="color:var(--muted)">omission</span><br>
      The description does not mention ${esc(checked.missed.join(', '))}, which the segmenter did find.</div>`);
  }
  $('claims').innerHTML = parts.join('');

  const { total, unsupported, hallucinationRate } = checked.counts;
  $('hallu').innerHTML =
    `<span>Statements <b>${total}</b></span>` +
    `<span>Flagged <b>${unsupported}</b></span>` +
    `<span>Hallucination rate before cross-checking <b>${pct(hallucinationRate)}</b></span>` +
    `<span>Removed <b>${unsupported}</b> of ${total} (0% remain by construction)</span>`;
  $('vlmPanel').classList.remove('hide');
}

function renderSummary() {
  const r = lastReport;
  const lines = [
    `CLAIM PHOTO TRIAGE — ${r.file}`,
    `Generated ${new Date(r.generated).toLocaleString()} · on-device · ClaimSnap prototype`,
    '',
    `Overall severity: ${r.overall_severity ?? 'no trained damage type detected'}`,
    `Car located in photo: ${r.car_located ? 'yes' : 'no — severity measured against the whole frame'}`,
    '',
    'Detected damage:',
    ...(r.detections.length
      ? r.detections.map(d =>
        `  · ${d.type} — ${d.severity} (${pct(d.share_of_car)} of ${r.car_located ? 'car' : 'frame'} area, ` +
        `confidence ${(d.confidence * 100).toFixed(0)}%)`)
      : ['  · none above the 25% confidence threshold']),
  ];

  const d = r.description;
  if (d) {
    lines.push('', 'Draft description (model-written, cross-checked):');
    const kept = d.after_cross_check.damages || [];
    lines.push(...(kept.length
      ? kept.map(c => `  · ${c.type}${c.location ? ` on the ${c.location} (location unverified)` : ''}${c.severity ? ` — ${c.severity}` : ''}`)
      : ['  · nothing the segmentation output supports']));
    const flagged = d.statements.filter(s => !s.supported);
    if (flagged.length) {
      lines.push('', 'Removed as unsupported by the photo:');
      lines.push(...flagged.map(s => `  · ${s.text} ${s.reason}`));
    }
    if (d.unmentioned_detections.length) {
      lines.push('', `Not mentioned by the model but detected: ${d.unmentioned_detections.join(', ')}`);
    }
    lines.push('', `Hallucination rate: ${pct(d.hallucination_rate_before)} before cross-checking; ${d.statements_removed} of ${d.statements_total} statements removed. Measured severity above is authoritative.`);
  }

  lines.push('',
    `Time: ${r.timing_ms.total ?? r.timing_ms.segmentation} ms for this photo.`,
    '',
    'For first review only. No claim is approved or denied by this tool. Severity is an area',
    'measure, not a repair estimate. Photographs may be edited, reused or duplicated.');

  const summaryText = lines.join('\n');
  $('summary').textContent = summaryText;
  $('summaryPanel').classList.remove('hide');
  saveClaim(r, summaryText);
}

// ---------------------------------------------------------------- claims queue
// Every triaged photo is kept on this device only (localStorage), so the
// Claims Queue page has a case list to work from instead of one photo at a
// time. Nothing here is ever sent anywhere.

const QUEUE_KEY = 'claimsnap_claims';
const QUEUE_MAX = 40;

function thumbnail(maxW = 220) {
  const src = $('out');
  if (!src || !src.width) return null;
  const scale = Math.min(1, maxW / src.width);
  const t = document.createElement('canvas');
  t.width = Math.round(src.width * scale);
  t.height = Math.round(src.height * scale);
  t.getContext('2d').drawImage(src, 0, 0, t.width, t.height);
  try { return t.toDataURL('image/jpeg', 0.6); } catch { return null; }
}

function saveClaim(report, summaryText) {
  let queue;
  try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { queue = []; }
  queue.unshift({
    file: report.file,
    generated: report.generated,
    overall_severity: report.overall_severity,
    car_located: report.car_located,
    detections: report.detections,
    thumb: thumbnail(),
    summaryText,
  });
  if (queue.length > QUEUE_MAX) queue.length = QUEUE_MAX;
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* storage full — skip silently */ }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('summary').textContent);
    $('copy').textContent = 'Copied';
    setTimeout(() => ($('copy').textContent = 'Copy summary'), 1500);
  } catch {
    say('Clipboard access was refused — select the text and copy it manually.', true);
  }
};

$('download').onclick = () => {
  const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (lastReport.file || 'claimsnap').replace(/\.[^.]+$/, '') + '-triage.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
