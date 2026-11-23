import type { BucketMetric, Recommendation, RecommendOptions, RouteMetrics } from './types';

/** Tolerance for floating-point comparisons (e.g. 0.9 - 0.05 !== 0.85 exactly). */
const EPS = 1e-9;
const MAX_REFUSAL_RATE = 0.1;
const CLOUD_MARGIN = 0.05;

const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`;
const pts = (x: number): string => `${Math.round(x * 1000) / 10} points`;

interface AccuracyTest {
  pass: boolean;
  /** Plain-English explanation of the comparison. */
  detail: string;
}

/**
 * Rule-3 test: device accuracy must reach the threshold and be no more than 5 points
 * below cloud accuracy. When cloud accuracy is null only the threshold applies.
 */
function accuracyTest(
  deviceAcc: number | null,
  deviceN: number,
  cloudAcc: number | null,
  cloudN: number | null,
  threshold: number,
  scope: string,
): AccuracyTest {
  if (deviceAcc === null) {
    return {
      pass: false,
      detail: `${scope}: device accuracy unknown (no graded cases, n=${deviceN}).`,
    };
  }
  const meetsThreshold = deviceAcc >= threshold - EPS;
  const meetsCloud = cloudAcc === null || deviceAcc >= cloudAcc - CLOUD_MARGIN - EPS;
  const cloudPart =
    cloudAcc === null
      ? 'cloud accuracy unknown, so only the threshold applies'
      : `cloud ${pct(cloudAcc)}${cloudN !== null ? ` (n=${cloudN})` : ''}, ` +
        (meetsCloud
          ? `within ${pts(CLOUD_MARGIN)} of cloud`
          : `more than ${pts(CLOUD_MARGIN)} below cloud`);
  const thresholdPart = meetsThreshold
    ? `meets the ${pct(threshold)} threshold`
    : `below the ${pct(threshold)} threshold`;
  return {
    pass: meetsThreshold && meetsCloud,
    detail: `${scope}: device accuracy ${pct(deviceAcc)} (n=${deviceN}) ${thresholdPart}; ${cloudPart}.`,
  };
}

/** Pooled accuracy over buckets, weighting each bucket by its n. */
function pool(buckets: BucketMetric[]): { acc: number | null; n: number } {
  let n = 0;
  let right = 0;
  for (const b of buckets) {
    if (b.accuracy === null || b.n <= 0) continue;
    n += b.n;
    right += b.accuracy * b.n;
  }
  return { acc: n ? right / n : null, n };
}

interface Cutoff {
  maxDeviceChars: number;
  detail: string;
}

function findLengthCutoff(
  device: RouteMetrics,
  cloud: RouteMetrics,
  threshold: number,
  minBucketCases: number,
): { cutoff: Cutoff | null; why: string } {
  const buckets = [...device.byLength].sort((a, b) => a.min - b.min);
  if (buckets.length === 0) return { cutoff: null, why: 'No length buckets were available.' };

  const first = buckets[0]!;
  if (first.n < minBucketCases) {
    return {
      cutoff: null,
      why:
        `No length cutoff: the shortest bucket (${first.label} chars) has only n=${first.n} device cases, ` +
        `fewer than the ${minBucketCases} required.`,
    };
  }

  // Trailing empty buckets are not counted as "below" a cutoff: the last usable
  // prefix ends at the last non-empty bucket.
  let lastNonEmpty = -1;
  buckets.forEach((b, i) => {
    if (b.n > 0) lastNonEmpty = i;
  });

  const cloudBuckets = [...cloud.byLength].sort((a, b) => a.min - b.min);
  let best: Cutoff | null = null;
  let blockedBy: BucketMetric | null = null;
  let lastFailure = '';

  // k = number of included buckets; buckets[k] is the first excluded one, whose min is the cutoff.
  for (let k = 1; k <= lastNonEmpty + 1 && k < buckets.length; k++) {
    const included = buckets.slice(0, k);
    const small = included.find((b) => b.n < minBucketCases);
    if (small) {
      blockedBy = small;
      break; // every larger prefix also contains this bucket
    }
    const cutoffChars = buckets[k]!.min;
    const dev = pool(included);
    const cloudRange = pool(cloudBuckets.filter((b) => b.min >= first.min && b.max <= cutoffChars));
    const useCloudRange = cloudRange.acc !== null;
    const cloudAcc = useCloudRange ? cloudRange.acc : cloud.accuracy;
    const cloudN = useCloudRange ? cloudRange.n : cloud.evaluated;
    const scope = `Inputs under ${cutoffChars} chars`;
    const test = accuracyTest(dev.acc, dev.n, cloudAcc, cloudN, threshold, scope);
    if (test.pass) best = { maxDeviceChars: cutoffChars, detail: test.detail };
    else lastFailure = test.detail;
  }

  if (best) return { cutoff: best, why: '' };
  const parts: string[] = [];
  if (lastFailure) parts.push(`No length cutoff passes the accuracy test. ${lastFailure}`);
  if (blockedBy) {
    parts.push(
      `${lastFailure ? 'The cutoff cannot extend further' : 'No length cutoff'}: bucket ${blockedBy.label} chars ` +
        `has only n=${blockedBy.n} device cases, fewer than the ${minBucketCases} required.`,
    );
  }
  return {
    cutoff: null,
    why: parts.length
      ? parts.join(' ')
      : 'No length cutoff: there is no shorter range of inputs to restrict the device to.',
  };
}

export function recommend(
  device: RouteMetrics,
  cloud: RouteMetrics,
  opts: RecommendOptions,
): Recommendation {
  const minDeviceCases = opts.minDeviceCases ?? 10;
  const minBucketCases = opts.minBucketCases ?? 8;
  const threshold = opts.threshold;
  const n = device.evaluated;

  const withNotes = (rec: Recommendation): Recommendation => {
    if (cloud.rateLimited > 0) {
      rec.reasons.push(
        `Cloud had ${cloud.rateLimited} rate-limited case(s); these were not counted as wrong answers.`,
      );
    }
    return rec;
  };
  const cloudOnly = (reasons: string[]): Recommendation =>
    withNotes({ mode: 'ONLY_IN_CLOUD', maxDeviceChars: null, reasons });

  // Rule 1: reliability.
  const reliability: string[] = [];
  if (device.timeoutRate > 0) {
    reliability.push(
      `Device timed out on ${pct(device.timeoutRate)} of evaluated cases (n=${n}); any timeout rules out on-device.`,
    );
  }
  if (device.refusalRate > MAX_REFUSAL_RATE + EPS) {
    reliability.push(
      `Device refused ${pct(device.refusalRate)} of evaluated cases (n=${n}), above the ${pct(MAX_REFUSAL_RATE)} limit.`,
    );
  }
  if (reliability.length) return cloudOnly(reliability);

  // Rule 2: enough evidence.
  if (n < minDeviceCases) {
    return cloudOnly([
      `Not enough device evidence: only n=${n} device cases evaluated, fewer than the ${minDeviceCases} required.`,
    ]);
  }

  // Rule 3: device is good enough overall.
  const overall = accuracyTest(
    device.accuracy,
    n,
    cloud.accuracy,
    cloud.evaluated,
    threshold,
    'Overall',
  );
  if (overall.pass) {
    return withNotes({ mode: 'PREFER_ON_DEVICE', maxDeviceChars: null, reasons: [overall.detail] });
  }

  // Rule 4: good enough on shorter inputs.
  const { cutoff, why } = findLengthCutoff(device, cloud, threshold, minBucketCases);
  if (cutoff) {
    return withNotes({
      mode: 'PREFER_ON_DEVICE',
      maxDeviceChars: cutoff.maxDeviceChars,
      reasons: [
        overall.detail,
        cutoff.detail,
        `Route inputs under ${cutoff.maxDeviceChars} chars to the device and longer ones to the cloud.`,
      ],
    });
  }

  // Rule 5: cloud only.
  return cloudOnly([overall.detail, why]);
}
