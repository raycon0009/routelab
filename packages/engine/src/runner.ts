import { grade } from './graders';
import type {
  CaseResult,
  GraderSpec,
  HealthStatus,
  ModelAdapter,
  ModelResponse,
  Route,
  RunEvent,
  TestCase,
} from './types';

export interface RunConfig {
  cases: TestCase[];
  adapter: ModelAdapter;
  grader: GraderSpec;
  routes?: Route[];
  deviceTimeoutMs?: number;
  cloudTimeoutMs?: number;
  cloudConcurrency?: number;
  /** Minimum gap between cloud call starts, to stay under a requests-per-minute quota (default 0). */
  cloudMinIntervalMs?: number;
  /** Max tries for a rate-limited cloud call (default 5). */
  maxTries?: number;
  backoffBaseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onEvent?: (e: RunEvent) => void;
  /** Abort to cancel the run. */
  signal?: AbortSignal;
}

export interface RunOutput {
  results: CaseResult[];
  cancelled: boolean;
  deviceEvaluated: string;
  /** Health status at the end of the device route (null if the device route did not run). */
  deviceHealth: HealthStatus | null;
}

export class CallTimeoutError extends Error {
  override name = 'TimeoutError';
  constructor(ms: number) {
    super(`timed out after ${ms} ms`);
  }
}

const EVALUATED_OUTCOMES = new Set(['ok', 'refusal', 'schema_fail', 'timeout']);

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
    customErrorData?: { status?: unknown };
  };
  if (e.status === 429 || e.customErrorData?.status === 429) return true;
  const code = String(e.code ?? '');
  const msg = String(e.message ?? '');
  return (
    /resource[-_ ]exhausted|too[-_ ]many[-_ ]requests/i.test(code) ||
    /\b429\b|RESOURCE_EXHAUSTED|quota exceeded/i.test(msg)
  );
}

/** Runs `fn` with an AbortSignal and always races a timer, so a call that ignores the signal still ends. */
export async function callWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  parent?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) controller.abort(parent.reason);
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new CallTimeoutError(ms);
          controller.abort(err);
          reject(err);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
  }
}

function isTimeout(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'TimeoutError';
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runEvaluation(cfg: RunConfig): Promise<RunOutput> {
  const routes = cfg.routes ?? ['device', 'cloud'];
  const emit = cfg.onEvent ?? (() => {});
  const sleep = cfg.sleep ?? defaultSleep;
  const deviceTimeoutMs = cfg.deviceTimeoutMs ?? 20_000;
  const cloudTimeoutMs = cfg.cloudTimeoutMs ?? 30_000;
  const maxTries = cfg.maxTries ?? 5;
  const backoffBase = cfg.backoffBaseMs ?? 500;
  const total = cfg.cases.length * routes.length;
  const results: CaseResult[] = [];
  let done = 0;
  let deviceHealth: HealthStatus | null = null;

  const cancelled = () => cfg.signal?.aborted === true;
  const push = (result: CaseResult) => {
    results.push(result);
    done += 1;
    emit({ type: 'result', result, done, total });
  };
  const skipped = (
    c: TestCase,
    route: Route,
    outcome: 'skipped_unhealthy' | 'cancelled',
  ): CaseResult => ({
    caseId: c.id,
    route,
    inputChars: c.input.length,
    input: c.input,
    outcome,
    correct: null,
    ms: 0,
  });

  emit({ type: 'started', total });

  /** One model call -> CaseResult (no retries). Throws only for rate-limit so callers can retry. */
  async function callOnce(c: TestCase, route: Route): Promise<CaseResult> {
    const timeoutMs = route === 'device' ? deviceTimeoutMs : cloudTimeoutMs;
    const t0 = Date.now();
    const base = { caseId: c.id, route, inputChars: c.input.length, input: c.input };
    let resp: ModelResponse;
    try {
      resp = await callWithTimeout(
        (signal) => cfg.adapter.call(route, c.input, { signal, timeoutMs }),
        timeoutMs,
        cfg.signal,
      );
    } catch (err) {
      const ms = Date.now() - t0;
      if (isTimeout(err))
        return { ...base, outcome: 'timeout', correct: false, ms, error: errMsg(err) };
      if (cancelled()) return { ...base, outcome: 'cancelled', correct: null, ms };
      if (isRateLimitError(err)) throw err;
      return { ...base, outcome: 'error', correct: null, ms, error: errMsg(err) };
    }
    const ms = Date.now() - t0;
    const extra = {
      output: resp.text,
      inferenceSource: resp.inferenceSource,
      usage: resp.usage,
      ms,
    };
    try {
      const g = grade(cfg.grader, resp.text, c.expected);
      if (g.refusal)
        return { ...base, ...extra, outcome: 'refusal', correct: false, error: g.note };
      if (!g.schemaOk)
        return { ...base, ...extra, outcome: 'schema_fail', correct: false, error: g.note };
      return { ...base, ...extra, outcome: 'ok', correct: g.correct };
    } catch (err) {
      return { ...base, ...extra, outcome: 'error', correct: null, error: errMsg(err) };
    }
  }

  async function runDevice() {
    const before = await cfg.adapter.healthCheck();
    deviceHealth = before;
    emit({ type: 'health', status: before, phase: 'before' });
    let healthy = before === 'healthy';
    for (const c of cfg.cases) {
      if (cancelled()) {
        push(skipped(c, 'device', 'cancelled'));
        continue;
      }
      if (!healthy) {
        push(skipped(c, 'device', 'skipped_unhealthy'));
        continue;
      }
      const r = await callOnce(c, 'device').catch((err): CaseResult => ({
        caseId: c.id,
        route: 'device',
        inputChars: c.input.length,
        input: c.input,
        outcome: 'rate_limited',
        correct: null,
        ms: 0,
        error: errMsg(err),
      }));
      push(r);
      if (r.outcome === 'timeout') {
        const after = await cfg.adapter.healthCheck();
        deviceHealth = after;
        emit({ type: 'health', status: after, phase: 'after_timeout' });
        if (after !== 'healthy') healthy = false;
      }
    }
  }

  async function cloudWithRetry(c: TestCase): Promise<CaseResult> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      if (cancelled()) return skipped(c, 'cloud', 'cancelled');
      try {
        const r = await callOnce(c, 'cloud');
        return { ...r, attempts: attempt };
      } catch (err) {
        lastErr = err;
        if (attempt < maxTries) await sleep(backoffBase * 2 ** (attempt - 1));
      }
    }
    return {
      caseId: c.id,
      route: 'cloud',
      inputChars: c.input.length,
      input: c.input,
      outcome: 'rate_limited',
      correct: null,
      ms: 0,
      attempts: maxTries,
      error: errMsg(lastErr),
    };
  }

  async function runCloud() {
    const concurrency = Math.max(1, cfg.cloudConcurrency ?? 4);
    const minGap = cfg.cloudMinIntervalMs ?? 0;
    let nextSlot = 0;
    let next = 0;
    const worker = async () => {
      while (next < cfg.cases.length) {
        const c = cfg.cases[next++]!;
        if (minGap > 0) {
          const now = Date.now();
          const start = Math.max(now, nextSlot);
          nextSlot = start + minGap;
          if (start > now) await sleep(start - now);
        }
        push(await cloudWithRetry(c));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, cfg.cases.length) }, worker));
  }

  await Promise.all([
    routes.includes('device') ? runDevice() : null,
    routes.includes('cloud') ? runCloud() : null,
  ]);

  const devRows = results.filter((r) => r.route === 'device');
  const evaluatedN = devRows.filter((r) => EVALUATED_OUTCOMES.has(r.outcome)).length;
  const deviceEvaluated = `${evaluatedN} of ${cfg.cases.length}`;
  emit({ type: 'finished', cancelled: cancelled(), deviceEvaluated });
  return { results, cancelled: cancelled(), deviceEvaluated, deviceHealth };
}
