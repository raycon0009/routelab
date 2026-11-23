import { describe, it, expect } from 'vitest';
import { callWithTimeout, isRateLimitError, runEvaluation } from './runner';
import type {
  CallOptions,
  HealthStatus,
  ModelAdapter,
  ModelResponse,
  Route,
  RunEvent,
  TestCase,
} from './types';

const cases = (n: number, len = 10): TestCase[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, input: 'x'.repeat(len), expected: 'allow' }));

type Handler = (
  route: Route,
  input: string,
  opts: CallOptions,
  callNo: number,
) => Promise<ModelResponse>;

function fake(
  handler: Handler,
  health: HealthStatus[] | (() => HealthStatus) = ['healthy'],
): ModelAdapter & {
  calls: number;
  healthCalls: number;
} {
  const state = { calls: 0, healthCalls: 0 };
  const adapter = {
    get calls() {
      return state.calls;
    },
    get healthCalls() {
      return state.healthCalls;
    },
    async call(route: Route, input: string, opts: CallOptions) {
      state.calls += 1;
      return handler(route, input, opts, state.calls);
    },
    async healthCheck() {
      const i = state.healthCalls++;
      return typeof health === 'function'
        ? health()
        : (health[Math.min(i, health.length - 1)] ?? 'healthy');
    },
  };
  return adapter;
}

const ok = (label = 'allow'): ModelResponse => ({
  text: JSON.stringify({ label }),
  inferenceSource: 'x',
  usage: { promptTokens: 10, outputTokens: 5 },
});
const never: Handler = () => new Promise(() => {});
const fast = { sleep: async () => {}, deviceTimeoutMs: 30, cloudTimeoutMs: 30 };
const grader = { type: 'enum', values: ['allow', 'remove', 'escalate'] } as const;

describe('callWithTimeout', () => {
  it('resolves when fn finishes in time', async () => {
    expect(await callWithTimeout(async () => 7, 50)).toBe(7);
  });
  it('rejects with TimeoutError even when fn ignores the signal', async () => {
    await expect(callWithTimeout(() => new Promise(() => {}), 10)).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });
  it('aborts the signal on timeout', async () => {
    let sig: AbortSignal | undefined;
    await callWithTimeout((s) => ((sig = s), new Promise(() => {})), 10).catch(() => {});
    expect(sig?.aborted).toBe(true);
  });
  it('propagates parent abort', async () => {
    const ac = new AbortController();
    let sig: AbortSignal | undefined;
    const p = callWithTimeout((s) => ((sig = s), new Promise(() => {})), 1000, ac.signal).catch(
      () => {},
    );
    ac.abort();
    expect(sig?.aborted).toBe(true);
    void p;
  });
});

describe('isRateLimitError', () => {
  it('recognises status 429', () => expect(isRateLimitError({ status: 429 })).toBe(true));
  it('recognises RESOURCE_EXHAUSTED in message', () =>
    expect(isRateLimitError(new Error('[429] RESOURCE_EXHAUSTED: quota'))).toBe(true));
  it('ignores other errors', () => expect(isRateLimitError(new Error('boom'))).toBe(false));
});

describe('runEvaluation: happy path', () => {
  it('runs both routes and grades answers', async () => {
    const a = fake(async (route) => ok(route === 'device' ? 'remove' : 'allow'));
    const out = await runEvaluation({ cases: cases(4), adapter: a, grader, ...fast });
    const dev = out.results.filter((r) => r.route === 'device');
    const cl = out.results.filter((r) => r.route === 'cloud');
    expect(dev).toHaveLength(4);
    expect(cl).toHaveLength(4);
    expect(dev.every((r) => r.outcome === 'ok' && r.correct === false)).toBe(true);
    expect(cl.every((r) => r.outcome === 'ok' && r.correct === true)).toBe(true);
    expect(out.deviceEvaluated).toBe('4 of 4');
  });
  it('can run a single route', async () => {
    const a = fake(async () => ok());
    const out = await runEvaluation({
      cases: cases(3),
      adapter: a,
      grader,
      routes: ['cloud'],
      ...fast,
    });
    expect(out.results.every((r) => r.route === 'cloud')).toBe(true);
    expect(out.deviceHealth).toBeNull();
    expect(a.healthCalls).toBe(0);
  });
  it('emits started, results and finished events with progress', async () => {
    const events: RunEvent[] = [];
    await runEvaluation({
      cases: cases(2),
      adapter: fake(async () => ok()),
      grader,
      ...fast,
      onEvent: (e) => events.push(e),
    });
    expect(events[0]).toEqual({ type: 'started', total: 4 });
    expect(events.filter((e) => e.type === 'result')).toHaveLength(4);
    expect(events.at(-1)).toMatchObject({ type: 'finished', cancelled: false });
  });
  it('device calls are strictly sequential', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const a = fake(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 3));
      inFlight--;
      return ok();
    });
    await runEvaluation({ cases: cases(5), adapter: a, grader, routes: ['device'], ...fast });
    expect(maxInFlight).toBe(1);
  });
  it('cloud calls respect the concurrency limit of 4', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const a = fake(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok();
    });
    await runEvaluation({ cases: cases(12), adapter: a, grader, routes: ['cloud'], ...fast });
    expect(maxInFlight).toBe(4);
  });
});

describe('runEvaluation: classification', () => {
  it('marks refusals and does not call them correct', async () => {
    const a = fake(async () => ({ text: "I'm sorry, I can't help with that." }));
    const out = await runEvaluation({
      cases: cases(2),
      adapter: a,
      grader,
      routes: ['cloud'],
      ...fast,
    });
    expect(out.results.every((r) => r.outcome === 'refusal' && r.correct === false)).toBe(true);
  });
  it('marks invalid labels as schema_fail', async () => {
    const a = fake(async () => ok('banana'));
    const out = await runEvaluation({
      cases: cases(1),
      adapter: a,
      grader,
      routes: ['cloud'],
      ...fast,
    });
    expect(out.results[0]).toMatchObject({ outcome: 'schema_fail', correct: false });
  });
  it('records other errors as outcome error, ungraded', async () => {
    const a = fake(async () => {
      throw new Error('network down');
    });
    const out = await runEvaluation({
      cases: cases(1),
      adapter: a,
      grader,
      routes: ['cloud'],
      ...fast,
    });
    expect(out.results[0]).toMatchObject({ outcome: 'error', correct: null });
  });
});

describe('runEvaluation: device wedge path', () => {
  it('timeout then unhealthy -> remaining device cases skipped_unhealthy', async () => {
    const a = fake(
      (route, _i, _o, n) =>
        route === 'device' && n >= 3
          ? never(route, '', { timeoutMs: 0 }, n)
          : Promise.resolve(ok()),
      ['healthy', 'unhealthy'],
    );
    const out = await runEvaluation({
      cases: cases(8),
      adapter: a,
      grader,
      routes: ['device'],
      ...fast,
    });
    const dev = out.results.filter((r) => r.route === 'device');
    expect(dev.filter((r) => r.outcome === 'ok')).toHaveLength(2);
    expect(dev.filter((r) => r.outcome === 'timeout')).toHaveLength(1);
    expect(dev.filter((r) => r.outcome === 'skipped_unhealthy')).toHaveLength(5);
    expect(out.deviceEvaluated).toBe('3 of 8');
    expect(out.deviceHealth).toBe('unhealthy');
  });
  it('timeout but healthy afterwards -> run continues', async () => {
    let n = 0;
    const a = fake(
      () => (++n === 2 ? never('device', '', { timeoutMs: 0 }, n) : Promise.resolve(ok())),
      ['healthy'],
    );
    const out = await runEvaluation({
      cases: cases(4),
      adapter: a,
      grader,
      routes: ['device'],
      ...fast,
    });
    expect(out.results.filter((r) => r.outcome === 'timeout')).toHaveLength(1);
    expect(out.results.filter((r) => r.outcome === 'ok')).toHaveLength(3);
    expect(out.deviceEvaluated).toBe('4 of 4');
  });
  it('timeouts count as wrong answers (correct=false)', async () => {
    const a = fake(never);
    const out = await runEvaluation({
      cases: cases(1),
      adapter: a,
      grader,
      routes: ['device'],
      ...fast,
    });
    expect(out.results[0]).toMatchObject({ outcome: 'timeout', correct: false });
  });
  it('unhealthy before the run skips every device case without calling the model', async () => {
    const a = fake(async () => ok(), ['unhealthy']);
    const out = await runEvaluation({
      cases: cases(3),
      adapter: a,
      grader,
      routes: ['device'],
      ...fast,
    });
    expect(out.results.every((r) => r.outcome === 'skipped_unhealthy')).toBe(true);
    expect(a.calls).toBe(0);
    expect(out.deviceEvaluated).toBe('0 of 3');
  });
  it('unavailable Nano also skips the device route', async () => {
    const a = fake(async () => ok(), ['unavailable']);
    const out = await runEvaluation({ cases: cases(2), adapter: a, grader, ...fast });
    expect(
      out.results
        .filter((r) => r.route === 'device')
        .every((r) => r.outcome === 'skipped_unhealthy'),
    ).toBe(true);
    expect(out.results.filter((r) => r.route === 'cloud').every((r) => r.outcome === 'ok')).toBe(
      true,
    );
  });
  it('emits health events', async () => {
    const events: RunEvent[] = [];
    await runEvaluation({
      cases: cases(1),
      adapter: fake(async () => ok()),
      grader,
      routes: ['device'],
      ...fast,
      onEvent: (e) => events.push(e),
    });
    expect(events.find((e) => e.type === 'health')).toMatchObject({
      status: 'healthy',
      phase: 'before',
    });
  });
});

describe('runEvaluation: 429 handling', () => {
  it('retries rate limits with exponential backoff and then succeeds', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const a = fake(async () => {
      if (++n <= 3) throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
      return ok();
    });
    const out = await runEvaluation({
      cases: cases(1),
      adapter: a,
      grader,
      routes: ['cloud'],
      ...fast,
      backoffBaseMs: 100,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(out.results[0]).toMatchObject({ outcome: 'ok', correct: true, attempts: 4 });
    expect(sleeps).toEqual([100, 200, 400]);
  });
  it('gives up after 5 tries as rate_limited, never as a wrong answer', async () => {
    const a = fake(async () => {
      throw Object.assign(new Error('429 too many requests'), { status: 429 });
    });
    const out = await runEvaluation({
      cases: cases(1),
      adapter: a,
      grader,
      routes: ['cloud'],
      ...fast,
    });
    expect(a.calls).toBe(5);
    expect(out.results[0]).toMatchObject({ outcome: 'rate_limited', correct: null, attempts: 5 });
  });
  it('non-429 errors are not retried', async () => {
    const a = fake(async () => {
      throw new Error('bad request');
    });
    await runEvaluation({ cases: cases(1), adapter: a, grader, routes: ['cloud'], ...fast });
    expect(a.calls).toBe(1);
  });
});

describe('runEvaluation: cancel', () => {
  it('stops after cancel and marks the remaining cases cancelled', async () => {
    const ac = new AbortController();
    const a = fake(async () => {
      ac.abort();
      return ok();
    });
    const out = await runEvaluation({
      cases: cases(5),
      adapter: a,
      grader,
      routes: ['device'],
      signal: ac.signal,
      ...fast,
    });
    expect(out.cancelled).toBe(true);
    expect(out.results.filter((r) => r.outcome === 'cancelled')).toHaveLength(4);
    expect(a.calls).toBe(1);
  });
  it('cancel before start makes no model calls', async () => {
    const ac = new AbortController();
    ac.abort();
    const a = fake(async () => ok());
    const out = await runEvaluation({
      cases: cases(3),
      adapter: a,
      grader,
      signal: ac.signal,
      ...fast,
    });
    expect(a.calls).toBe(0);
    expect(out.results.every((r) => r.outcome === 'cancelled')).toBe(true);
  });
});
