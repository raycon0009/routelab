import type { TestCase } from '@routelab/engine';
import moderation from '../../../../datasets/moderation.civil.json';
import summary from '../../../../datasets/summary.recipes.json';
import extraction from '../../../../datasets/extraction.recipes.json';
import { DEFAULT_MODERATION_SCHEMA } from './samples';

export interface BuiltinSet {
  id: string;
  name: string;
  contentWarning?: string;
  cases: TestCase[];
}

const asCases = (x: { cases: unknown[] }) => x.cases as TestCase[];

export const BUILTIN_SETS: BuiltinSet[] = [
  {
    id: 'moderation.civil',
    name: 'Moderation — Civil Comments sample (cached)',
    contentWarning: (moderation as { contentWarning?: string }).contentWarning,
    cases: asCases(moderation as { cases: unknown[] }),
  },
  {
    id: 'summary.recipes',
    name: 'Recipe summaries (synthetic)',
    cases: asCases(summary as { cases: unknown[] }),
  },
  {
    id: 'extraction.recipes',
    name: 'Recipe extraction (synthetic)',
    cases: asCases(extraction as { cases: unknown[] }),
  },
];

export { DEFAULT_MODERATION_SCHEMA };

const HF =
  'https://datasets-server.huggingface.co/rows?dataset=google/civil_comments&config=default&split=test&length=100&offset=';

/** Fetches Civil Comments live (a few pages). Falls back to the cached set on failure. */
export async function fetchCivilLive(
  pages: number,
  onProgress: (msg: string) => void,
): Promise<TestCase[]> {
  const out = { remove: [] as TestCase[], escalate: [] as TestCase[], allow: [] as TestCase[] };
  const quota = { remove: 20, escalate: 10, allow: 20 };
  for (let i = 0; i < pages; i++) {
    onProgress(`Fetching page ${i + 1}/${pages}…`);
    const res = await fetch(HF + ((i * 1531 + 7) % 96000));
    if (!res.ok) throw new Error(`Hugging Face returned ${res.status}`);
    const json = (await res.json()) as {
      rows: { row_idx: number; row: { text: string; toxicity: number } }[];
    };
    for (const { row_idx, row } of json.rows) {
      if (row.text.length < 15 || row.text.length > 1500) continue;
      const label =
        row.toxicity >= 0.8
          ? 'remove'
          : row.toxicity >= 0.4 && row.toxicity <= 0.6
            ? 'escalate'
            : row.toxicity === 0
              ? 'allow'
              : null;
      if (label && out[label].length < quota[label])
        out[label].push({ id: `civil-${row_idx}`, input: row.text, expected: label });
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return [...out.remove, ...out.escalate, ...out.allow];
}
