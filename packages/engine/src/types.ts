export type Route = 'device' | 'cloud';

/** What happened to one call. `rate_limited` and `skipped_unhealthy` are never counted as wrong answers. */
export type Outcome =
  | 'ok'
  | 'timeout'
  | 'refusal'
  | 'schema_fail'
  | 'error'
  | 'rate_limited'
  | 'skipped_unhealthy'
  | 'cancelled';

export type HealthStatus = 'healthy' | 'unhealthy' | 'unavailable';

export interface TestCase {
  id: string;
  input: string;
  /** Expected answer; meaning depends on the grader (string, keywords[], object...). */
  expected?: unknown;
}

export interface Usage {
  promptTokens?: number;
  outputTokens?: number;
}

export interface ModelResponse {
  text: string;
  /** Reported by Firebase AI Logic: where the answer was computed. */
  inferenceSource?: string;
  usage?: Usage;
}

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs: number;
}

/**
 * The only thing the engine knows about models. The real implementation (firebase/ai)
 * lives in @routelab/shared; tests use fakes.
 */
export interface ModelAdapter {
  call(route: Route, input: string, opts: CallOptions): Promise<ModelResponse>;
  /** Tiny device prompt; resolves with the status. Must not throw. */
  healthCheck(): Promise<HealthStatus>;
}

export interface TimeoutErrorLike {
  name: 'TimeoutError';
}

export type GraderSpec =
  | { type: 'exact' }
  | { type: 'enum'; values?: string[]; field?: string }
  | { type: 'contains' }
  | { type: 'jsonSchemaValid'; schema: JsonSchema }
  | { type: 'regex'; pattern: string; flags?: string }
  | { type: 'llmJudge' };

/** Minimal JSON-schema subset the engine understands. */
export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
}

export interface GradeResult {
  /** null = could not be graded (no expected answer). */
  correct: boolean | null;
  schemaOk: boolean;
  refusal: boolean;
  note?: string;
}

export interface CaseResult {
  caseId: string;
  route: Route;
  inputChars: number;
  input?: string;
  outcome: Outcome;
  output?: string;
  inferenceSource?: string;
  /** true/false when graded; null when not graded or not evaluated. */
  correct: boolean | null;
  ms: number;
  usage?: Usage;
  error?: string;
  attempts?: number;
}

export interface BucketMetric {
  label: string;
  /** inclusive lower bound, exclusive upper bound (Infinity for the last). */
  min: number;
  max: number;
  n: number;
  accuracy: number | null;
}

export interface RouteMetrics {
  route: Route;
  total: number;
  /** Cases that actually reached a model and returned (ok, refusal, schema_fail, timeout...). */
  evaluated: number;
  skipped: number;
  rateLimited: number;
  accuracy: number | null;
  refusalRate: number;
  schemaFailRate: number;
  timeoutRate: number;
  errorCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  estCostUsd: number;
  byLength: BucketMetric[];
}

export type RoutingMode =
  'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD' | 'PREFER_IN_CLOUD' | 'ONLY_ON_DEVICE';

export interface Recommendation {
  mode: RoutingMode;
  maxDeviceChars: number | null;
  reasons: string[];
}

export interface RunSummary {
  device: RouteMetrics;
  cloud: RouteMetrics;
  recommendation: Recommendation;
  deviceEvaluated: string; // e.g. "34 of 100"
}

export interface RecommendOptions {
  /** Feature accuracy threshold, 0..1 */
  threshold: number;
  /** minimum device cases evaluated (default 10) */
  minDeviceCases?: number;
  /** min cases per length bucket (default 8) */
  minBucketCases?: number;
}

export type RunEvent =
  | { type: 'started'; total: number }
  | { type: 'health'; status: HealthStatus; phase: 'before' | 'after_timeout' }
  | { type: 'result'; result: CaseResult; done: number; total: number }
  | { type: 'finished'; cancelled: boolean; deviceEvaluated: string };
