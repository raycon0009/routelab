import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildModel,
  buildUserPrompt,
  createAI,
  generate,
  initFirebase,
  routedGenerate,
  type Breaker,
  type RoutedResult,
} from '@routelab/shared';
import { DEFAULT_CLOUD_PRICE } from '@routelab/engine';
import { FEATURES, RECIPES } from './data';
import { createRemoteConfig, readRouting, refresh, subscribe, type RoutingState } from './rc';

interface Verdict {
  result?: RoutedResult;
  text?: string;
  error?: string;
  busy?: boolean;
}

const keys = [FEATURES.moderation.key, FEATURES.summary.key];

export function App() {
  const fb = useMemo(
    () =>
      initFirebase({
        recaptchaSiteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY || undefined,
        dev: import.meta.env.DEV,
      }),
    [],
  );
  const ai = useMemo(() => createAI(fb.app), [fb]);
  const rc = useMemo(() => createRemoteConfig(fb.app, keys), [fb]);
  const breaker = useRef<Breaker>({ deviceDisabled: false });
  const [, force] = useState(0);
  const [routing, setRouting] = useState<Record<string, RoutingState>>({});
  const [status, setStatus] = useState('not fetched yet');
  const [cost, setCost] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Record<string, string[]>>({});

  const reread = useCallback(() => {
    setRouting(Object.fromEntries(keys.map((k) => [k, readRouting(rc, k)])));
  }, [rc]);

  const doRefresh = useCallback(async () => {
    setStatus('fetching…');
    try {
      await refresh(rc);
      reread();
      setStatus(`fetched ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      reread();
      setStatus(`fetch failed (using defaults): ${(e as Error).message}`);
    }
  }, [rc, reread]);

  useEffect(() => {
    reread();
    void doRefresh();
    return subscribe(
      rc,
      () => {
        reread();
        setStatus(`live update ${new Date().toLocaleTimeString()}`);
      },
      () => {},
    );
  }, [rc, reread, doRefresh]);

  async function runFeature(
    id: string,
    feat: typeof FEATURES.moderation | typeof FEATURES.summary,
    input: string,
  ) {
    setVerdicts((v) => ({ ...v, [id]: { busy: true } }));
    const state = routing[feat.key];
    if (!state) return;
    try {
      const prompt = buildUserPrompt(feat.userTemplate, input);
      const result = await routedGenerate(
        state.config,
        input,
        breaker.current,
        (mode, _i, signal) => {
          const model = buildModel(
            ai,
            mode,
            {
              systemPrompt: feat.systemPrompt,
              userTemplate: feat.userTemplate,
              outputSchema: feat.schema as never,
            },
            { cloudModel: state.config.cloudModel },
          );
          return generate(model, prompt, signal);
        },
      );
      if (result.servedBy === 'cloud') {
        const u = result.response.usage;
        const inTok = u?.promptTokens ?? Math.ceil(input.length / 4);
        const outTok = u?.outputTokens ?? Math.ceil(result.response.text.length / 4);
        setCost(
          (c) =>
            c +
            (inTok * DEFAULT_CLOUD_PRICE.inputPerMTok +
              outTok * DEFAULT_CLOUD_PRICE.outputPerMTok) /
              1e6,
        );
      }
      setVerdicts((v) => ({ ...v, [id]: { result, text: result.response.text } }));
    } catch (e) {
      setVerdicts((v) => ({ ...v, [id]: { error: (e as Error).message } }));
    }
    force((n) => n + 1);
  }

  const mod = routing[FEATURES.moderation.key];
  const sum = routing[FEATURES.summary.key];

  return (
    <main>
      <h1>Kitchen Table</h1>
      <p className="muted">
        A tiny recipe community whose AI routing is controlled by RouteLab through Remote Config.
      </p>
      {fb.appCheckMode !== 'recaptcha' && (
        <div className="banner warn">
          No reCAPTCHA site key set: App Check debug-token mode (dev). Register the debug token from
          the console.
        </div>
      )}
      {breaker.current.deviceDisabled && (
        <div className="banner bad">
          Circuit breaker open: the on-device model timed out, so this session now uses the cloud
          only.
        </div>
      )}
      <div className="card">
        <div className="row">
          <b>Routing</b> <span className="muted">{status}</span>
          <button onClick={() => void doRefresh()}>Refresh routing</button>
          <span style={{ marginLeft: 'auto' }}>
            Est. cloud cost this session: <b>${cost.toFixed(6)}</b>
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Mode</th>
              <th>Max device chars</th>
              <th>Timeout</th>
              <th>Cloud model</th>
              <th>Evidence run</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Comment moderation', mod],
              ['Recipe summary', sum],
            ].map(([name, s]) => {
              const st = s as RoutingState | undefined;
              return (
                <tr key={name as string}>
                  <td>{name as string}</td>
                  <td>{st?.config.mode}</td>
                  <td>{st?.config.maxDeviceChars ?? '–'}</td>
                  <td>{st?.config.deviceTimeoutMs} ms</td>
                  <td>{st?.config.cloudModel}</td>
                  <td>{st?.config.evidenceRunId || '–'}</td>
                  <td>
                    {st?.source}
                    {st?.errors ? ` (${st.errors[0]})` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {RECIPES.map((r) => (
        <div className="card" key={r.id}>
          <h2 style={{ marginTop: 0 }}>{r.title}</h2>
          <p>{r.body}</p>
          <div className="row">
            <button
              className="primary"
              disabled={!sum || verdicts[`s-${r.id}`]?.busy}
              onClick={() => void runFeature(`s-${r.id}`, FEATURES.summary, r.body)}
            >
              Summarise recipe
            </button>
            <Badge v={verdicts[`s-${r.id}`]} />
          </div>
          {verdicts[`s-${r.id}`]?.text && (
            <p>
              <i>{verdicts[`s-${r.id}`]!.text}</i>
            </p>
          )}
          <h2>Comments</h2>
          {[...r.comments, ...(extra[r.id] ?? [])].map((c, i) => {
            const id = `m-${r.id}-${i}`;
            const v = verdicts[id];
            let label = '';
            try {
              label = (JSON.parse(v?.text ?? '{}') as { label?: string }).label ?? '';
            } catch {
              label = '';
            }
            return (
              <div key={id} className={`comment ${label === 'remove' ? 'removed' : ''}`}>
                <div>{c}</div>
                <div className="row">
                  <button
                    disabled={!mod || v?.busy}
                    onClick={() => void runFeature(id, FEATURES.moderation, c)}
                  >
                    Moderate
                  </button>
                  {label && (
                    <span
                      className={`pill ${label === 'allow' ? 'ok' : label === 'remove' ? 'bad' : 'warn'}`}
                    >
                      {label}
                    </span>
                  )}
                  <Badge v={v} />
                  {v?.text && <span className="muted">{v.text}</span>}
                </div>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="Write a comment…"
              value={draft[r.id] ?? ''}
              onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })}
            />
            <button
              disabled={!(draft[r.id] ?? '').trim()}
              onClick={() => {
                const text = draft[r.id]!.trim();
                const idx = r.comments.length + (extra[r.id]?.length ?? 0);
                setExtra({ ...extra, [r.id]: [...(extra[r.id] ?? []), text] });
                setDraft({ ...draft, [r.id]: '' });
                void runFeature(`m-${r.id}-${idx}`, FEATURES.moderation, text); // moderation runs on submit
              }}
            >
              Post
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}

function Badge({ v }: { v?: Verdict }) {
  if (!v) return null;
  if (v.busy) return <span className="muted">working…</span>;
  if (v.error)
    return (
      <span className="pill bad" title={v.error}>
        error
      </span>
    );
  if (!v.result) return null;
  const r = v.result;
  return (
    <span title={r.reason}>
      <span className={`badge ${r.servedBy === 'on-device' ? 'device' : 'cloud'}`}>
        {r.servedBy}
      </span>
      {r.fellBackAfterTimeout && <span className="pill warn"> device timeout → cloud</span>}
    </span>
  );
}
