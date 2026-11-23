import { describe, it, expect } from 'vitest';
import { recommend } from './recommend';
import { bucketLabel, DEFAULT_BUCKET_EDGES } from './metrics';
import type { BucketMetric, Route, RouteMetrics } from './types';

/** Build byLength buckets on the default edges [0,200,500,1200,3000] from [n, accuracy] pairs. */
function buckets(spec: Array<[number, number | null]>): BucketMetric[] {
  return DEFAULT_BUCKET_EDGES.map((min, i) => {
    const max = DEFAULT_BUCKET_EDGES[i + 1] ?? Infinity;
    const [n, accuracy] = spec[i] ?? [0, null];
    return { label: bucketLabel(min, max), min, max, n, accuracy: n ? accuracy : null };
  });
}

function metrics(route: Route, over: Partial<RouteMetrics> = {}): RouteMetrics {
  return {
    route,
    total: 30,
    evaluated: 30,
    skipped: 0,
    rateLimited: 0,
    accuracy: 0.9,
    refusalRate: 0,
    schemaFailRate: 0,
    timeoutRate: 0,
    errorCount: 0,
    p50Ms: 100,
    p95Ms: 200,
    estCostUsd: route === 'device' ? 0 : 0.01,
    byLength: buckets([]),
    ...over,
  };
}
const device = (over: Partial<RouteMetrics> = {}) => metrics('device', over);
const cloud = (over: Partial<RouteMetrics> = {}) => metrics('cloud', over);
const text = (r: { reasons: string[] }) => r.reasons.join(' ');

describe('recommend – rule 1 (reliability)', () => {
  it('any device timeout forces ONLY_IN_CLOUD even with perfect accuracy', () => {
    const r = recommend(device({ accuracy: 1, timeoutRate: 0.05, evaluated: 20 }), cloud(), {
      threshold: 0.8,
    });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(r.maxDeviceChars).toBeNull();
    expect(text(r)).toMatch(/timed out on 5% .*n=20/);
  });

  it('refusal rate above 10% forces ONLY_IN_CLOUD', () => {
    const r = recommend(device({ accuracy: 1, refusalRate: 0.15 }), cloud(), { threshold: 0.8 });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(text(r)).toMatch(/refused 15% .*n=30.*10% limit/);
  });

  it('refusal rate of exactly 10% is allowed', () => {
    const r = recommend(device({ accuracy: 0.95, refusalRate: 1 / 10, evaluated: 10 }), cloud(), {
      threshold: 0.8,
    });
    expect(r.mode).toBe('PREFER_ON_DEVICE');
  });

  it('reports both timeouts and refusals when both fail', () => {
    const r = recommend(device({ timeoutRate: 0.1, refusalRate: 0.2 }), cloud(), {
      threshold: 0.8,
    });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(r.reasons.filter((s) => /timed out|refused/.test(s))).toHaveLength(2);
  });
});

describe('recommend – rule 2 (evidence)', () => {
  it('9 evaluated device cases is not enough evidence', () => {
    const r = recommend(device({ accuracy: 1, evaluated: 9 }), cloud(), { threshold: 0.8 });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(text(r).toLowerCase()).toContain('not enough device evidence');
    expect(text(r)).toContain('n=9');
  });

  it('exactly 10 evaluated device cases is enough', () => {
    const r = recommend(device({ accuracy: 1, evaluated: 10 }), cloud(), { threshold: 0.8 });
    expect(r.mode).toBe('PREFER_ON_DEVICE');
  });

  it('honours a custom minDeviceCases', () => {
    const r = recommend(device({ accuracy: 1, evaluated: 15 }), cloud(), {
      threshold: 0.8,
      minDeviceCases: 20,
    });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(text(r)).toMatch(/n=15.*20 required/);
  });
});

describe('recommend – rule 3 (overall accuracy)', () => {
  it('device accuracy exactly at the threshold passes', () => {
    const r = recommend(device({ accuracy: 0.85 }), cloud({ accuracy: 0.85 }), { threshold: 0.85 });
    expect(r).toMatchObject({ mode: 'PREFER_ON_DEVICE', maxDeviceChars: null });
    expect(text(r)).toMatch(/85% \(n=30\) meets the 85% threshold/);
  });

  it('device exactly 5 points below cloud passes (float-safe)', () => {
    // 0.9 - 0.05 === 0.8500000000000001 in IEEE754; must still pass.
    const r = recommend(device({ accuracy: 0.85 }), cloud({ accuracy: 0.9 }), { threshold: 0.8 });
    expect(r).toMatchObject({ mode: 'PREFER_ON_DEVICE', maxDeviceChars: null });
    expect(text(r)).toContain('within 5 points of cloud');
  });

  it('device more than 5 points below cloud fails and falls through to cloud', () => {
    const r = recommend(device({ accuracy: 0.84 }), cloud({ accuracy: 0.9 }), { threshold: 0.8 });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(text(r)).toContain('more than 5 points below cloud');
  });

  it('device below threshold goes to cloud with the numbers stated', () => {
    const r = recommend(device({ accuracy: 0.7 }), cloud({ accuracy: 0.6 }), { threshold: 0.8 });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(text(r)).toMatch(/70% \(n=30\) below the 80% threshold/);
  });

  it('null cloud accuracy: only the threshold applies', () => {
    const pass = recommend(device({ accuracy: 0.81 }), cloud({ accuracy: null }), {
      threshold: 0.8,
    });
    expect(pass.mode).toBe('PREFER_ON_DEVICE');
    expect(text(pass)).toContain('only the threshold applies');
    const fail = recommend(device({ accuracy: 0.79 }), cloud({ accuracy: null }), {
      threshold: 0.8,
    });
    expect(fail.mode).toBe('ONLY_IN_CLOUD');
  });

  it('null device accuracy (nothing graded) cannot pass', () => {
    const r = recommend(device({ accuracy: null }), cloud(), { threshold: 0.5 });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(text(r)).toContain('device accuracy unknown');
  });
});

describe('recommend – rule 4 (length cutoff)', () => {
  it('happy path: picks the largest qualifying cutoff', () => {
    // short: 95%, medium: 90%, long: 50% -> overall ~78% fails; <500 pooled 92.5% passes.
    const d = device({
      accuracy: 0.783,
      byLength: buckets([
        [10, 0.95],
        [10, 0.9],
        [10, 0.5],
      ]),
    });
    const c = cloud({
      accuracy: 0.9,
      byLength: buckets([
        [10, 0.9],
        [10, 0.9],
        [10, 0.9],
      ]),
    });
    const r = recommend(d, c, { threshold: 0.85 });
    expect(r).toMatchObject({ mode: 'PREFER_ON_DEVICE', maxDeviceChars: 500 });
    expect(text(r)).toMatch(/under 500 chars: device accuracy 92.5% \(n=20\)/);
    expect(text(r)).toMatch(/cloud 90% \(n=20\)/);
  });

  it('a small bucket (n<8) blocks extending the cutoff past it', () => {
    const d = device({
      accuracy: 0.75,
      byLength: buckets([
        [10, 0.95],
        [7, 1],
        [10, 0.4],
      ]),
    });
    const r = recommend(d, cloud({ accuracy: 0.9, byLength: [] }), { threshold: 0.85 });
    // <500 would pool to 97%, but the 200–499 bucket only has n=7, so stop at 200.
    expect(r).toMatchObject({ mode: 'PREFER_ON_DEVICE', maxDeviceChars: 200 });
  });

  it('a small first bucket means no cutoff at all', () => {
    const d = device({
      accuracy: 0.7,
      byLength: buckets([
        [7, 1],
        [10, 0.9],
        [13, 0.4],
      ]),
    });
    const r = recommend(d, cloud({ accuracy: 0.9 }), { threshold: 0.85 });
    expect(r).toMatchObject({ mode: 'ONLY_IN_CLOUD', maxDeviceChars: null });
    expect(text(r)).toMatch(/shortest bucket \(0–199 chars\) has only n=7/);
  });

  it('compares against cloud accuracy for the same length range when available', () => {
    // Device 90% on short inputs. Cloud overall is 80%, but on short inputs cloud is 100%.
    const d = device({
      accuracy: 0.6,
      byLength: buckets([
        [10, 0.9],
        [20, 0.45],
      ]),
    });
    const withRange = cloud({
      accuracy: 0.8,
      byLength: buckets([
        [10, 1],
        [20, 0.7],
      ]),
    });
    expect(recommend(d, withRange, { threshold: 0.85 }).mode).toBe('ONLY_IN_CLOUD');
    // Without cloud buckets, falls back to cloud overall (80%) and the cutoff passes.
    const noRange = cloud({ accuracy: 0.8, byLength: [] });
    expect(recommend(d, noRange, { threshold: 0.85 })).toMatchObject({
      mode: 'PREFER_ON_DEVICE',
      maxDeviceChars: 200,
    });
  });

  it('empty buckets at the tail do not block; cutoff sits at the first empty bucket', () => {
    // Device only saw inputs < 500 chars. Cloud overall (97%) is dragged up by long cases
    // device never saw; over the same range cloud is 92%.
    const d = device({
      accuracy: 0.9,
      evaluated: 20,
      byLength: buckets([
        [10, 0.9],
        [10, 0.9],
        [0, null],
      ]),
    });
    const c = cloud({
      accuracy: 0.97,
      byLength: buckets([
        [10, 0.9],
        [10, 0.94],
        [30, 1],
      ]),
    });
    const r = recommend(d, c, { threshold: 0.85 });
    expect(r).toMatchObject({ mode: 'PREFER_ON_DEVICE', maxDeviceChars: 500 });
  });
});

describe('recommend – rule 5 and notes', () => {
  it('ONLY_IN_CLOUD explains why no cutoff worked', () => {
    const d = device({
      accuracy: 0.6,
      byLength: buckets([
        [10, 0.6],
        [10, 0.6],
        [10, 0.6],
      ]),
    });
    const r = recommend(d, cloud({ accuracy: 0.9 }), { threshold: 0.85 });
    expect(r.mode).toBe('ONLY_IN_CLOUD');
    expect(text(r)).toContain('No length cutoff passes the accuracy test');
    expect(text(r)).toMatch(
      /under 1200 chars: device accuracy 60% \(n=30\) below the 85% threshold/,
    );
  });

  it('notes cloud rate-limited cases on every verdict, and only when present', () => {
    const limited = cloud({ rateLimited: 3 });
    const onDevice = recommend(device({ accuracy: 0.95 }), limited, { threshold: 0.8 });
    const inCloud = recommend(device({ timeoutRate: 0.1 }), limited, { threshold: 0.8 });
    for (const r of [onDevice, inCloud]) {
      expect(text(r)).toContain('3 rate-limited case(s); these were not counted as wrong answers');
    }
    const none = recommend(device({ accuracy: 0.95 }), cloud(), { threshold: 0.8 });
    expect(text(none)).not.toContain('rate-limited');
  });

  it('is deterministic and does not mutate its inputs', () => {
    const d = device({
      accuracy: 0.783,
      byLength: buckets([
        [10, 0.95],
        [10, 0.9],
        [10, 0.5],
      ]).reverse(),
    });
    const c = cloud({ rateLimited: 1 });
    const snapshot = JSON.stringify([d, c]);
    const a = recommend(d, c, { threshold: 0.85 });
    const b = recommend(d, c, { threshold: 0.85 });
    expect(a).toEqual(b);
    expect(a.maxDeviceChars).toBe(500); // unsorted buckets are sorted by min
    expect(JSON.stringify([d, c])).toBe(snapshot);
  });
});
