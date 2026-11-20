// YOLO11n-seg inference in the browser through ONNX Runtime Web.
// Handles both the CarDD damage model (6 classes) and a COCO model used to
// locate the car, since the only difference is the number of classes.

export const S = 640;          // model input side
export const MP = 160;         // mask prototype side
export const NM = 32;          // number of mask coefficients

export const DAMAGE_NAMES = ['dent', 'scratch', 'crack', 'glass shatter', 'lamp broken', 'tire flat'];
export const DAMAGE_COLORS = [[255,140,0],[255,215,0],[220,20,60],[30,144,255],[148,0,211],[0,200,120]];

// COCO ids that count as "the vehicle in the photo".
const COCO_VEHICLE = new Set([2 /*car*/, 5 /*bus*/, 7 /*truck*/]);

export async function loadSession(url) {
  return ort.InferenceSession.create(url, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

// Fit the photo into SxS with grey padding, exactly as Ultralytics does at val time.
export function letterbox(img) {
  const r = Math.min(S / img.width, S / img.height);
  const nw = Math.round(img.width * r), nh = Math.round(img.height * r);
  const px = Math.floor((S - nw) / 2), py = Math.floor((S - nh) / 2);

  const c = document.createElement('canvas');
  c.width = c.height = S;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = 'rgb(114,114,114)';
  cx.fillRect(0, 0, S, S);
  cx.drawImage(img, px, py, nw, nh);

  const { data } = cx.getImageData(0, 0, S, S);
  const f = new Float32Array(3 * S * S);
  const plane = S * S;
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    f[i] = data[p] / 255;
    f[plane + i] = data[p + 1] / 255;
    f[2 * plane + i] = data[p + 2] / 255;
  }
  return { tensor: new ort.Tensor('float32', f, [1, 3, S, S]), r, px, py, nw, nh };
}

const sigmoid = x => 1 / (1 + Math.exp(-x));

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
  const w = x2 - x1, h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}

// Per-class non-maximum suppression, matching Ultralytics' default (agnostic_nms=False).
function nms(dets, iouThr) {
  const kept = [];
  const byClass = new Map();
  for (const d of dets) {
    if (!byClass.has(d.cls)) byClass.set(d.cls, []);
    byClass.get(d.cls).push(d);
  }
  for (const group of byClass.values()) {
    group.sort((a, b) => b.conf - a.conf);
    const out = [];
    for (const d of group) {
      if (out.every(k => iou(d, k) <= iouThr)) out.push(d);
    }
    kept.push(...out);
  }
  return kept.sort((a, b) => b.conf - a.conf);
}

/**
 * Run one model and decode its detections.
 * `pred` is (1, 4+nc+32, N); `proto` is (1, 32, 160, 160).
 * Boxes come back in letterboxed 640-space; masks stay in 160-space, which is
 * where every area is measured. Areas are only ever used as ratios, so the
 * 640->160 scale factor cancels out.
 */
export async function infer(session, lb, { conf = 0.25, iouThr = 0.5, classFilter = null, stats = null } = {}) {
  const feeds = { [session.inputNames[0]]: lb.tensor };
  const out = await session.run(feeds);

  // Identify the two outputs by rank/shape rather than by name.
  let pred = null, proto = null;
  for (const name of session.outputNames) {
    const t = out[name];
    if (t.dims.length === 3) pred = t;
    else if (t.dims.length === 4) proto = t;
  }
  if (!pred || !proto) throw new Error('unexpected model outputs: ' + JSON.stringify(session.outputNames));

  const [, ch, N] = pred.dims;
  const nc = ch - 4 - NM;
  const p = pred.data;
  const at = (c, i) => p[c * N + i];        // output is channel-major

  const dets = [];
  for (let i = 0; i < N; i++) {
    let best = -1, bestScore = 0;
    for (let c = 0; c < nc; c++) {
      const s = at(4 + c, i);
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (bestScore < conf || best < 0) continue;
    if (classFilter && !classFilter.has(best)) continue;

    const cx = at(0, i), cy = at(1, i), w = at(2, i), h = at(3, i);
    const coeffs = new Float32Array(NM);
    for (let m = 0; m < NM; m++) coeffs[m] = at(4 + nc + m, i);

    dets.push({
      cls: best, conf: bestScore, coeffs,
      x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2,
    });
  }

  const kept = nms(dets, iouThr);
  const protoData = proto.data;

  // Optional running commentary, for the walkthrough page.
  if (stats) {
    Object.assign(stats, {
      predDims: pred.dims.join(' × '),
      protoDims: proto.dims.join(' × '),
      classes: nc,
      anchors: N,
      aboveConf: dets.length,
      afterNms: kept.length,
    });
  }

  for (const d of kept) {
    // Mask = sigmoid(coeffs . proto), cropped to the box, in 160-space.
    const mx1 = Math.max(0, Math.floor(d.x1 * MP / S));
    const my1 = Math.max(0, Math.floor(d.y1 * MP / S));
    const mx2 = Math.min(MP, Math.ceil(d.x2 * MP / S));
    const my2 = Math.min(MP, Math.ceil(d.y2 * MP / S));

    const mask = new Uint8Array(MP * MP);
    let area = 0;
    for (let y = my1; y < my2; y++) {
      for (let x = mx1; x < mx2; x++) {
        let acc = 0;
        const off = y * MP + x;
        for (let m = 0; m < NM; m++) acc += d.coeffs[m] * protoData[m * MP * MP + off];
        if (sigmoid(acc) > 0.5) { mask[off] = 1; area++; }
      }
    }
    d.mask = mask;
    d.maskArea = area;                      // in 160-space cells
    delete d.coeffs;
  }

  return kept.filter(d => d.maskArea > 0);
}

export const vehicleFilter = COCO_VEHICLE;

// Map a box from letterboxed 640-space back to the original photo.
export function unletterbox(box, lb) {
  return {
    x1: (box.x1 - lb.px) / lb.r,
    y1: (box.y1 - lb.py) / lb.r,
    x2: (box.x2 - lb.px) / lb.r,
    y2: (box.y2 - lb.py) / lb.r,
  };
}

// Mask-area in original-photo pixels, for display only.
export function areaInPhotoPx(maskArea, lb) {
  const cell = (S / MP) ** 2;               // 160-space cell -> 640-space px
  return maskArea * cell / (lb.r ** 2);
}
