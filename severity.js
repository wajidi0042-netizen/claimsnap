// Area-based severity: how much of the car does this piece of damage cover?
//
// The CarDD annotations give damage masks but no car mask, so the denominator
// comes from a COCO-pretrained YOLO11n-seg run on the same photo (car/bus/truck).
// If no vehicle is found we fall back to the whole letterboxed frame and say so,
// because a tight crop and a wide shot of the same dent are not comparable.

// Share-of-car thresholds. Starting points only — tune them against the
// 50-image manual rating study (see the notebook) before quoting agreement.
export const THRESHOLDS = { minor: 0.02, moderate: 0.10 };

export const LEVELS = ['minor', 'moderate', 'severe'];

export function levelFor(ratio) {
  if (ratio < THRESHOLDS.minor) return 'minor';
  if (ratio < THRESHOLDS.moderate) return 'moderate';
  return 'severe';
}

/**
 * Union of the vehicle masks, so two overlapping boxes for one car don't
 * double-count the denominator.
 * Returns { area, mask, found }, area in 160-space cells.
 */
export function carArea(vehicleDets, mpArea) {
  if (!vehicleDets.length) return { area: mpArea, mask: null, found: false };

  const union = new Uint8Array(mpArea);
  for (const d of vehicleDets) {
    for (let i = 0; i < mpArea; i++) if (d.mask[i]) union[i] = 1;
  }
  let area = 0;
  for (let i = 0; i < mpArea; i++) if (union[i]) area++;
  return { area: area || mpArea, mask: union, found: area > 0 };
}

/**
 * Attach a severity to every damage detection.
 * Both areas are measured in the same 160x160 mask space, so the ratio is
 * independent of the photo's resolution.
 */
export function scoreSeverity(damageDets, car) {
  for (const d of damageDets) {
    d.ratio = d.maskArea / car.area;
    d.severity = levelFor(d.ratio);
    d.severityApprox = !car.found;
  }
  return damageDets;
}

// Worst single piece of damage drives the headline severity for the photo.
export function overallSeverity(damageDets) {
  if (!damageDets.length) return null;
  return damageDets.reduce(
    (worst, d) => (LEVELS.indexOf(d.severity) > LEVELS.indexOf(worst) ? d.severity : worst),
    'minor',
  );
}
