// SmolVLM-256M-Instruct through Transformers.js, asked three short questions.
// WebGPU when the browser has it, wasm (CPU) otherwise, as the brief requires.
//
// The model is deliberately small and will get things wrong — that is the point.
// crosscheck.js is what makes its output safe to show.

import {
  AutoProcessor, AutoModelForVision2Seq, RawImage, env,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

export const MODEL_ID = 'HuggingFaceTB/SmolVLM-256M-Instruct';

// Three short questions instead of one long JSON prompt. A 256M model given the
// JSON template tends to echo it back empty (0 of 50 usable in the evaluation),
// so each question is answered in isolation and the JSON is assembled in code,
// not written by the model.
const QUESTIONS = [
  { key: 'type', maxTokens: 8,
    text: 'What kind of damage is visible on this car? Answer with one of: dent, scratch, crack, glass shatter, lamp broken, tire flat, none.' },
  { key: 'location', maxTokens: 10,
    text: 'Which part of the car is damaged? Answer in two or three words, for example "front bumper".' },
  { key: 'severity', maxTokens: 4,
    text: 'How severe is the damage? Answer with one word: minor, moderate or severe.' },
];

let loading = null;
let backend = null;

export function backendName() { return backend; }

async function pickDevice() {
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch { /* fall through to cpu */ }
  }
  return 'wasm';
}

export function load(onProgress) {
  if (loading) return loading;
  loading = (async () => {
    env.allowLocalModels = false;
    const device = await pickDevice();
    const processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback: onProgress });
    const model = await AutoModelForVision2Seq.from_pretrained(MODEL_ID, {
      // q4 on GPU, the smaller q8 on CPU where memory bandwidth is the limit.
      dtype: device === 'webgpu' ? 'q4' : 'q8',
      device,
      progress_callback: onProgress,
    });
    backend = device;
    return { processor, model };
  })();
  return loading;
}

// Pull the first balanced {...} out of the model's text. Small models like to
// wrap JSON in prose or stop a brace short.
export function extractJson(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;

  const stack = [];
  let inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      stack.pop();
      if (!stack.length) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
      }
    }
  }

  // Ran out of tokens mid-object: close whatever is still open and try once more.
  let tail = text.slice(start);
  if (inStr) tail += '"';
  tail = tail.replace(/,\s*$/, '');
  while (stack.length) tail += stack.pop();
  try { return JSON.parse(tail); } catch { return null; }
}

async function ask(processor, model, image, question, maxNewTokens) {
  const messages = [{
    role: 'user',
    content: [{ type: 'image' }, { type: 'text', text: question }],
  }];
  const text = processor.apply_chat_template(messages, { add_generation_prompt: true });
  const inputs = await processor(text, [image], { do_image_splitting: false });
  const generated = await model.generate({
    ...inputs,
    max_new_tokens: maxNewTokens,
    do_sample: false,            // greedy: reproducible, which the eval needs
  });
  const promptLen = inputs.input_ids.dims.at(-1);
  const decoded = processor.batch_decode(
    generated.slice(null, [promptLen, null]),
    { skip_special_tokens: true },
  );
  return (decoded[0] ?? '').trim();
}

// Build the JSON the cross-check expects from the three answers.
export function assemble(answers) {
  const type = (answers.type || '').trim().toLowerCase().replace(/[."']/g, '');
  if (!type || /^(none|no|nothing)\b/.test(type)) return { damages: [], summary: '' };
  return {
    damages: [{
      type,
      location: (answers.location || '').trim().replace(/[."']/g, ''),
      severity: (answers.severity || '').trim().toLowerCase().replace(/[."']/g, ''),
    }],
    summary: '',
  };
}

/**
 * Describe one image with three isolated questions.
 * Returns { json, raw, ms, mode } — json is null only if the model gave no
 * answer at all, which the caller should surface rather than hide.
 */
export async function describe(imgEl) {
  const { processor, model } = await load();
  const t0 = performance.now();
  const image = await RawImage.fromURL(imgEl.src);

  const answers = {};
  for (const q of QUESTIONS) {
    answers[q.key] = await ask(processor, model, image, q.text, q.maxTokens);
  }
  const raw = QUESTIONS.map(q => `${q.key}: ${answers[q.key] || '(empty)'}`).join('\n');
  const anyAnswer = Object.values(answers).some(a => a && a.trim());

  return {
    json: anyAnswer ? assemble(answers) : null,
    raw,
    ms: performance.now() - t0,
    mode: 'three-question',
  };
}
