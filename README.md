# ClaimSnap — car-damage triage (prototype)

Everything runs in the browser. Photos are never uploaded.

```
index.html      UI
app.js          pipeline: segment -> severity -> describe -> cross-check
seg.js          YOLO11n-seg decoding (boxes, per-class NMS, mask prototypes)
severity.js     damage mask area / car mask area -> minor | moderate | severe
vlm.js          SmolVLM-256M-Instruct via Transformers.js (WebGPU, wasm fallback)
crosscheck.js   checks every model statement against the segmentation output
models/         best.onnx + car-seg.onnx  (not in git — see below)
```

## Models

Both come out of step 7 of the notebook:

- `models/best.onnx` — YOLO11n-seg trained on CarDD, 6 damage classes (~12 MB)
- `models/car-seg.onnx` — stock COCO YOLO11n-seg, used only to measure the car
  area that severity is a share of (~12 MB)

Without `car-seg.onnx` the app still runs, but severity is measured against the
whole frame and is labelled as such — a close-up and a wide shot of the same
dent then score differently, so don't quote those numbers.

## Run locally

ES modules and the ONNX files need a real server, not `file://`:

```bash
python3 -m http.server 8000 --directory claimsnap
```

Then open `http://localhost:8000`.

## Deploy

A Hugging Face **Static** Space: upload `index.html`, the four `.js` files and
`models/`. Transformers.js pulls SmolVLM from the Hub on first use (~200 MB,
cached by the browser afterwards).

**Licence:** CarDD is licensed for research use and must not be redistributed.
Put no CarDD image, annotation file or archive in the Space — only the trained
weights and your own test photos. Cite the paper (Wang, Li & Wu, *CarDD: A New
Dataset for Vision-Based Car Damage Detection*, IEEE T-ITS 24(7):7202–7214,
2023) wherever the work is written up.

## What the cross-check does

The vision-language model is asked for fixed JSON:

```json
{"damages":[{"type":"","location":"","severity":""}],"summary":""}
```

Each claim becomes one or two checkable statements:

| Statement | Supported when |
|---|---|
| reports *dent* | a dent mask was segmented |
| calls the dent *moderate* | the measured area share lands in the same bucket |

Unsupported statements are **flagged on screen** and left out of the adjuster
summary. The "after cross-checking" hallucination rate is therefore 0% by
construction — the number worth reporting is how much had to be removed, which
step 11 of the notebook measures over 50 test images.

Part names in `location` are **not** verified: there is no part model yet, so
"on the driver door" is the model's word alone. Shown, never checked.

## Limits

- Scratch and crack are the weak classes (mask mAP50-95 0.28 and 0.16), so a
  missed hairline scratch is expected behaviour, not a bug.
- No damage detected is not the same as no damage.
- Severity is an area measure, not a repair estimate.
- Edited, duplicated or re-used photographs are not detected at all.
- No claim is approved or denied here. A human adjuster decides.
