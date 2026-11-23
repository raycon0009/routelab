import { computeRouteMetrics, type PriceTable } from './metrics';
import { recommend } from './recommend';
import type { CaseResult, RecommendOptions, RunSummary } from './types';

export function summarizeRun(
  results: CaseResult[],
  deviceEvaluated: string,
  opts: RecommendOptions & { price?: PriceTable; edges?: number[] },
): RunSummary {
  const device = computeRouteMetrics('device', results, opts);
  const cloud = computeRouteMetrics('cloud', results, opts);
  return { device, cloud, recommendation: recommend(device, cloud, opts), deviceEvaluated };
}
