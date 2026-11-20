// "Verify the assistant": every statement the vision-language model makes is
// checked against the segmentation output, and anything unsupported is flagged
// rather than deleted, so the handler can see what the model invented.
//
// Pure functions, no DOM and no model — the notebook imports the same rules for
// the hallucination-rate evaluation.

import { DAMAGE_NAMES } from './seg.js';
import { LEVELS } from './severity.js';

// Words the model is likely to reach for, mapped onto the six CarDD classes.
const SYNONYMS = {
  'dent': 'dent', 'dented': 'dent', 'dint': 'dent', 'ding': 'dent', 'dents': 'dent',
  'crease': 'dent', 'crumple': 'dent', 'crumpled': 'dent',
  'scratch': 'scratch', 'scratches': 'scratch', 'scratched': 'scratch',
  'scrape': 'scratch', 'scuff': 'scratch', 'scuffed': 'scratch', 'paint damage': 'scratch',
  'crack': 'crack', 'cracks': 'crack', 'cracked': 'crack', 'split': 'crack',
  'glass shatter': 'glass shatter', 'shattered glass': 'glass shatter',
  'broken glass': 'glass shatter', 'broken window': 'glass shatter',
  'smashed window': 'glass shatter', 'windscreen': 'glass shatter',
  'windshield': 'glass shatter', 'shattered': 'glass shatter',
  'lamp broken': 'lamp broken', 'broken lamp': 'lamp broken',
  'broken headlight': 'lamp broken', 'headlight': 'lamp broken',
  'headlamp': 'lamp broken', 'taillight': 'lamp broken', 'tail light': 'lamp broken',
  'broken light': 'lamp broken',
  'tire flat': 'tire flat', 'flat tire': 'tire flat', 'flat tyre': 'tire flat',
  'deflated tire': 'tire flat', 'punctured tire': 'tire flat', 'flat': 'tire flat',
};

export function normaliseType(raw) {
  if (!raw) return null;
  const t = String(raw).toLowerCase().trim().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  if (DAMAGE_NAMES.includes(t)) return t;
  if (SYNONYMS[t]) return SYNONYMS[t];
  // Longest matching synonym contained in the phrase, so "a deep scratch on the
  // door" resolves but "scratch-resistant" does not win over a better match.
  let best = null;
  for (const [k, v] of Object.entries(SYNONYMS)) {
    if (t.includes(k) && (!best || k.length > best.k.length)) best = { k, v };
  }
  return best ? best.v : null;
}

function normaliseSeverity(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (LEVELS.includes(s)) return s;
  if (/^(light|slight|small|cosmetic|superficial)$/.test(s)) return 'minor';
  if (/^(medium|mid|significant)$/.test(s)) return 'moderate';
  if (/^(major|heavy|extensive|serious|bad)$/.test(s)) return 'severe';
  return null;
}

/**
 * Check one parsed VLM object against the detections.
 *
 * claimed: { damages: [{type, location?, severity?}], summary?: string }
 * dets:    segmentation output, each with .cls and .severity
 *
 * Returns { statements, counts, missed } where every statement carries
 * supported:true|false and a reason. Two statements per claimed damage at most:
 * the damage type itself, and its severity if the model asserted one.
 */
export function crossCheck(claimed, dets) {
  const detected = new Map();                 // type -> worst severity seen
  for (const d of dets) {
    const name = DAMAGE_NAMES[d.cls];
    const prev = detected.get(name);
    if (!prev || LEVELS.indexOf(d.severity) > LEVELS.indexOf(prev)) detected.set(name, d.severity);
  }

  const statements = [];
  const claimedTypes = new Set();
  const damages = Array.isArray(claimed?.damages) ? claimed.damages : [];

  for (const c of damages) {
    const type = normaliseType(c?.type);
    const shown = c?.type ?? '(no type)';

    if (!type) {
      statements.push({
        kind: 'type', type: null, text: `Reports "${shown}".`, supported: false,
        reason: 'Not one of the six damage types this model was trained on.',
      });
      continue;
    }
    claimedTypes.add(type);

    if (detected.has(type)) {
      statements.push({
        kind: 'type', type, text: `Reports ${type}.`, supported: true,
        reason: 'A segmentation mask of this type was found.',
      });
    } else {
      statements.push({
        kind: 'type', type, text: `Reports ${type}.`, supported: false,
        reason: 'No mask of this type was found in the photo.',
      });
      continue;                               // severity of a phantom damage is moot
    }

    const sev = normaliseSeverity(c?.severity);
    if (sev) {
      const measured = detected.get(type);
      statements.push({
        kind: 'severity', type,
        text: `Calls the ${type} ${sev}.`,
        supported: sev === measured,
        reason: sev === measured
          ? `Matches the measured area share (${measured}).`
          : `The measured area share is ${measured}.`,
      });
    }
  }

  // Damage the segmenter found but the description never mentions. Not a
  // hallucination, so it is counted separately and shown as an omission.
  const missed = [...detected.keys()].filter(t => !claimedTypes.has(t));

  const total = statements.length;
  const unsupported = statements.filter(s => !s.supported).length;
  return {
    statements,
    missed,
    counts: {
      total,
      unsupported,
      // The brief's headline metric: share of statements the image does not support.
      hallucinationRate: total ? unsupported / total : 0,
    },
  };
}

// The description with flagged statements removed — "after cross-checking".
export function supportedOnly(claimed, result) {
  const bad = new Set(
    result.statements
      .filter(s => s.kind === 'type' && !s.supported)
      .map(s => s.type),
  );
  const damages = (claimed?.damages || []).filter(c => {
    const t = normaliseType(c?.type);
    return t && !bad.has(t);
  });
  return { ...claimed, damages };
}
