// Builds datasets/moderation.civil.json from Civil Comments via the Hugging Face datasets-server.
// Run: npm run fetch:civil   (max ~60 requests, 1 s apart)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const URL_BASE =
  'https://datasets-server.huggingface.co/rows?dataset=google/civil_comments&config=default&split=test&length=100&offset=';
const QUOTA = { remove: 40, escalate: 20, allow: 40 };
const MAX_REQUESTS = 60;

interface Row {
  row_idx: number;
  row: { text: string; toxicity: number };
}

const out: { remove: unknown[]; escalate: unknown[]; allow: unknown[] } = {
  remove: [],
  escalate: [],
  allow: [],
};
const full = () =>
  (Object.keys(QUOTA) as (keyof typeof QUOTA)[]).every((k) => out[k].length >= QUOTA[k]);

function add(label: keyof typeof QUOTA, r: Row) {
  if (out[label].length >= QUOTA[label]) return;
  if (r.row.text.length > 1500 || r.row.text.length < 15) return;
  out[label].push({
    id: `civil-${r.row_idx}`,
    sourceRow: r.row_idx,
    input: r.row.text,
    expected: label,
    toxicity: r.row.toxicity,
  });
}

for (let i = 0; i < MAX_REQUESTS && !full(); i++) {
  const offset = (i * 1531) % 96000; // spread across the test split
  const res = await fetch(URL_BASE + offset);
  if (!res.ok) {
    console.log('request failed', res.status, offset);
  } else {
    const json = (await res.json()) as { rows: Row[] };
    for (const r of json.rows) {
      const t = r.row.toxicity;
      if (t >= 0.8) add('remove', r);
      else if (t >= 0.4 && t <= 0.6) add('escalate', r);
      else if (t === 0) add('allow', r);
    }
  }
  console.log(
    i + 1,
    'remove',
    out.remove.length,
    'escalate',
    out.escalate.length,
    'allow',
    out.allow.length,
  );
  await new Promise((r) => setTimeout(r, 1000));
}

const here = dirname(fileURLToPath(import.meta.url));
const cases = [...out.remove, ...out.escalate, ...out.allow];
writeFileSync(
  join(here, '..', '..', '..', 'datasets', 'moderation.civil.json'),
  JSON.stringify(
    {
      id: 'moderation.civil',
      title: 'Comment moderation (Civil Comments sample)',
      contentWarning:
        'Contains real internet comments that include insults, profanity and hateful language. Shown for evaluation only.',
      source:
        'https://huggingface.co/datasets/google/civil_comments (test split via datasets-server)',
      license: 'CC0-1.0 (per the Hugging Face dataset card, checked 24 Nov 2026)',
      labels: ['allow', 'remove', 'escalate'],
      labelRule: 'toxicity >= 0.8 -> remove; 0.4..0.6 -> escalate; 0.0 -> allow',
      cases,
    },
    null,
    1,
  ),
);
console.log('wrote', cases.length, 'cases');
