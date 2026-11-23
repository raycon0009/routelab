import type { BucketMetric, CaseResult, Route, RouteMetrics } from './types';

export interface PriceTable {
  /** USD per 1M tokens */
  inputPerMTok: number;
  outputPerMTok: number;
}

/** Placeholder prices for estimation only; override with the real model's pricing. */
export const DEFAULT_CLOUD_PRICE: PriceTable = { inputPerMTok: 0.1, outputPerMTok: 0.4 };

/** Lower bounds (chars) of length buckets; the last bucket is open-ended. */
export const DEFAULT_BUCKET_EDGES = [0, 200, 500, 1200, 3000];

const EVALUATED = new Set(['ok', 'refusal', 'schema_fail', 'timeout']);

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? null;
}

export function bucketLabel(min: number, max: number): string {
  return max === Infinity ? `${min}+` : `${min}–${max - 1}`;
}

export function accuracyByLength(
  results: CaseResult[],
  edges: number[] = DEFAULT_BUCKET_EDGES,
): BucketMetric[] {
  return edges.map((min, i) => {
    const max = edges[i + 1] ?? Infinity;
    const inBucket = results.filter(
      (r) => r.correct !== null && r.inputChars >= min && r.inputChars < max,
    );
    const right = inBucket.filter((r) => r.correct === true).length;
    return {
      label: bucketLabel(min, max),
      min,
      max,
      n: inBucket.length,
      accuracy: inBucket.length ? right / inBucket.length : null,
    };
  });
}

export function estimateCostUsd(results: CaseResult[], price: PriceTable): number {
  let usd = 0;
  for (const r of results) {
    if (!EVALUATED.has(r.outcome)) continue;
    const inTok = r.usage?.promptTokens ?? Math.ceil(r.inputChars / 4);
    const outTok = r.usage?.outputTokens ?? Math.ceil((r.output?.length ?? 0) / 4);
    usd += (inTok * price.inputPerMTok + outTok * price.outputPerMTok) / 1_000_000;
  }
  return usd;
}

export function computeRouteMetrics(
  route: Route,
  allResults: CaseResult[],
  opts: { price?: PriceTable; edges?: number[] } = {},
): RouteMetrics {
  const results = allResults.filter((r) => r.route === route);
  const evaluatedRows = results.filter((r) => EVALUATED.has(r.outcome));
  const evaluated = evaluatedRows.length;
  const graded = results.filter((r) => r.correct !== null);
  const rate = (outcome: string) =>
    evaluated ? evaluatedRows.filter((r) => r.outcome === outcome).length / evaluated : 0;
  const latencies = evaluatedRows
    .filter((r) => r.outcome !== 'timeout')
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  return {
    route,
    total: results.length,
    evaluated,
    skipped: results.filter((r) => r.outcome === 'skipped_unhealthy' || r.outcome === 'cancelled')
      .length,
    rateLimited: results.filter((r) => r.outcome === 'rate_limited').length,
    accuracy: graded.length
      ? graded.filter((r) => r.correct === true).length / graded.length
      : null,
    refusalRate: rate('refusal'),
    schemaFailRate: rate('schema_fail'),
    timeoutRate: rate('timeout'),
    errorCount: results.filter((r) => r.outcome === 'error').length,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    estCostUsd:
      route === 'device' ? 0 : estimateCostUsd(results, opts.price ?? DEFAULT_CLOUD_PRICE),
    byLength: accuracyByLength(graded, opts.edges),
  };
}
