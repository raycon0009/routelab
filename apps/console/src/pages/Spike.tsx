import { useEffect, useState } from 'react';
import {
  buildModel,
  callWithTimeout,
  chromeVersion,
  DEFAULT_DEVICE_TIMEOUT_MS,
  DEVICE_WARMUP_TIMEOUT_MS,
  isDeviceWarm,
  downloadNano,
  generate,
  getDeviceAvailability,
  healthCheck,
  type DeviceAvailability,
} from '@routelab/shared';
import type { JsonSchema } from '@routelab/engine';
import { useFirebase } from '../lib/firebase';

const SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    label: { type: 'string', enum: ['allow', 'remove', 'escalate'] },
    reason: { type: 'string' },
  },
  required: ['label', 'reason'],
};
const FEATURE = {
  systemPrompt:
    'You moderate comments for a cooking community. Answer with label allow, remove or escalate and a short reason.',
  userTemplate: 'Comment: {{input}}',
  outputSchema: SCHEMA,
};

interface Outcome {
  title: string;
  output?: string;
  inferenceSource?: string;
  ms?: number;
  usage?: unknown;
  error?: string;
}

export function Spike() {
  const { ai, bundle, user } = useFirebase();
  const [input, setInput] = useState('This recipe is garbage and so are you.');
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState<DeviceAvailability | '...'>('...');
  const [progress, setProgress] = useState<number | null>(null);
  const [health, setHealth] = useState<string>('not run');

  useEffect(() => {
    getDeviceAvailability().then(setAvailability);
  }, []);

  async function run(title: string, mode: 'ONLY_IN_CLOUD' | 'ONLY_ON_DEVICE', timeoutMs: number) {
    const t0 = performance.now();
    // A cold Nano needs ~24 s to load; give the first real device call the warm-up limit.
    if (mode === 'ONLY_ON_DEVICE' && timeoutMs >= DEFAULT_DEVICE_TIMEOUT_MS && !isDeviceWarm()) {
      timeoutMs = DEVICE_WARMUP_TIMEOUT_MS;
      title = `${title} (cold start, ${DEVICE_WARMUP_TIMEOUT_MS / 1000} s limit)`;
    }
    const model = buildModel(ai, mode, FEATURE);
    const prompt = FEATURE.userTemplate.replace('{{input}}', input);
    try {
      const r = await callWithTimeout(
        (signal) =>
          generate(model, prompt, signal, mode === 'ONLY_IN_CLOUD' ? timeoutMs : undefined),
        timeoutMs,
      );
      return {
        title,
        output: r.text,
        inferenceSource: r.inferenceSource,
        usage: r.usage,
        ms: Math.round(performance.now() - t0),
      } as Outcome;
    } catch (e) {
      return {
        title,
        error: `${(e as Error).name}: ${(e as Error).message}`,
        ms: Math.round(performance.now() - t0),
      } as Outcome;
    }
  }

  async function go(jobs: Array<() => Promise<Outcome>>) {
    setBusy(true);
    try {
      const out = await Promise.all(jobs.map((j) => j()));
      setOutcomes((prev) => [...out, ...prev]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Spike: hybrid call, timeout, health</h1>
      <div className="card">
        <div>
          Chrome version: <b>{chromeVersion()}</b> · Nano availability: <b>{availability}</b> · App
          Check: <b>{bundle.appCheckMode}</b> · Signed in:{' '}
          <b>{user ? user.uid.slice(0, 8) : 'no'}</b>
        </div>
        {bundle.appCheckMode !== 'recaptcha' && (
          <div className="banner warn" style={{ marginTop: 8 }}>
            No reCAPTCHA site key (VITE_RECAPTCHA_SITE_KEY): using App Check debug-token mode. Copy
            the debug token from the browser console into Firebase Console → App Check → Manage
            debug tokens.
          </div>
        )}
        <label>Comment to classify</label>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="primary"
            disabled={busy}
            onClick={() => go([() => run('Cloud', 'ONLY_IN_CLOUD', 30000)])}
          >
            Cloud call
          </button>
          <button
            disabled={busy}
            onClick={() => go([() => run('Device', 'ONLY_ON_DEVICE', 20000)])}
          >
            Device call
          </button>
          <button
            disabled={busy}
            onClick={() =>
              go([
                () => run('Cloud', 'ONLY_IN_CLOUD', 30000),
                () => run('Device', 'ONLY_ON_DEVICE', 20000),
              ])
            }
          >
            Both
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await downloadNano(ai, setProgress);
                setAvailability(await getDeviceAvailability());
              } catch (e) {
                setOutcomes((p) => [{ title: 'Download Nano', error: (e as Error).message }, ...p]);
              } finally {
                setBusy(false);
              }
            }}
          >
            Download Nano {progress !== null && `(${Math.round(progress * 100)}%)`}
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setHealth('running…');
              const t0 = performance.now();
              setHealth(`${await healthCheck(ai)} (${Math.round(performance.now() - t0)} ms)`);
              setBusy(false);
            }}
          >
            Health check
          </button>
          <button
            disabled={busy}
            onClick={() => go([() => run('Device (forced 1 ms timeout)', 'ONLY_ON_DEVICE', 1)])}
          >
            Force timeout (1 ms)
          </button>
        </div>
        <p className="muted">
          Health: {health}. A timeout frees the page but does not un-wedge Nano; only a Chrome
          restart does.
        </p>
      </div>
      {outcomes.map((o, i) => (
        <div className="card" key={i}>
          <b>{o.title}</b> {o.ms !== undefined && <span className="muted">· {o.ms} ms</span>}{' '}
          {o.inferenceSource && <span className="pill ok">{o.inferenceSource}</span>}
          {o.error && <pre style={{ color: 'var(--bad)' }}>{o.error}</pre>}
          {o.output && <pre>{o.output}</pre>}
          {o.usage !== undefined && <pre>usage: {JSON.stringify(o.usage)}</pre>}
        </div>
      ))}
    </>
  );
}
