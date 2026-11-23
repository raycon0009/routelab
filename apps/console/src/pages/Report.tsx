import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { summarizeRun, type CaseResult, type RouteMetrics } from '@routelab/engine';
import {
  CLOUD_MODEL,
  defaultRouting,
  serializeRouting,
  type RoutingConfig,
} from '@routelab/shared';
import { useFirebase } from '../lib/firebase';
import { useAsync } from '../lib/useAsync';
import { getFeature, getRun, loadResults, markApplied } from '../lib/store';

const pct = (x: number | null) => (x === null ? '–' : `${(x * 100).toFixed(0)}%`);
const PUBLISHER = 'http://127.0.0.1:8787';

function MetricsCard({ m }: { m: RouteMetrics }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{m.route === 'device' ? 'On-device (Gemini Nano)' : 'Cloud'}</h2>
      <table>
        <tbody>
          <tr>
            <td>Evaluated</td>
            <td>
              {m.evaluated} of {m.total}
              {m.skipped ? ` (${m.skipped} skipped)` : ''}
            </td>
          </tr>
          <tr>
            <td>Accuracy</td>
            <td>
              <b>{pct(m.accuracy)}</b> (n = {m.evaluated})
            </td>
          </tr>
          <tr>
            <td>Refusal rate</td>
            <td>{pct(m.refusalRate)}</td>
          </tr>
          <tr>
            <td>Schema-fail rate</td>
            <td>{pct(m.schemaFailRate)}</td>
          </tr>
          <tr>
            <td>Timeout rate</td>
            <td>{pct(m.timeoutRate)}</td>
          </tr>
          <tr>
            <td>Rate-limited (not counted as wrong)</td>
            <td>{m.rateLimited}</td>
          </tr>
          <tr>
            <td>Latency p50 / p95</td>
            <td>
              {m.p50Ms ?? '–'} / {m.p95Ms ?? '–'} ms
            </td>
          </tr>
          <tr>
            <td>Estimated cost</td>
            <td>${m.estCostUsd.toFixed(5)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Report() {
  const { pid = '', rid = '' } = useParams();
  const { db, user } = useFirebase();
  const uid = user?.uid;
  const data = useAsync(async () => {
    if (!uid) return null;
    const run = await getRun(db, uid, pid, rid);
    if (!run) return null;
    const [results, feature] = await Promise.all([
      loadResults(db, uid, pid, rid),
      getFeature(db, uid, pid, run.featureId),
    ]);
    return { run, results, feature };
  }, [uid, pid, rid]);
  const [filter, setFilter] = useState<'all' | 'device' | 'cloud'>('all');
  const [onlyFail, setOnlyFail] = useState(true);
  const [apply, setApply] = useState<{ payload: unknown; status: string } | null>(null);

  if (data.loading) return <p className="muted">Loading report…</p>;
  if (data.error) return <div className="banner bad">{data.error}</div>;
  if (!data.data)
    return (
      <div className="banner warn">
        Run not found. <Link to={`/p/${pid}`}>Back</Link>
      </div>
    );
  const { run, results, feature } = data.data;
  const summary = summarizeRun(results, run.deviceEvaluated, {
    threshold: feature?.threshold ?? 0.8,
  });
  const rec = summary.recommendation;
  const routing: RoutingConfig = {
    ...defaultRouting(),
    mode: rec.mode,
    maxDeviceChars: rec.maxDeviceChars,
    cloudModel: CLOUD_MODEL,
    evidenceRunId: rid,
    updatedAt: run.appliedAt ? new Date(run.appliedAt).toISOString() : '',
  };
  const preview = {
    featureKey: feature?.key ?? 'feature',
    routing: { ...routing, updatedAt: routing.updatedAt || new Date().toISOString() },
  };
  const failures = results.filter(
    (r: CaseResult) =>
      (filter === 'all' || r.route === filter) && (!onlyFail || r.correct !== true),
  );

  async function doApply() {
    setApply({ payload: preview, status: 'Checking publisher…' });
    try {
      const h = await fetch(`${PUBLISHER}/health`).then(
        (r) => r.json() as Promise<{ ok: boolean; error?: string }>,
      );
      if (!h.ok) throw new Error(h.error ?? 'publisher not ready');
    } catch {
      setApply({ payload: preview, status: 'NOT_REACHABLE' });
      return;
    }
    try {
      const body = {
        ...preview,
        routing: { ...preview.routing, updatedAt: new Date().toISOString() },
      };
      const res = await fetch(`${PUBLISHER}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = (await res.json()) as { ok: boolean; error?: string; errors?: string[] };
      if (!out.ok) throw new Error(out.error ?? out.errors?.join('; ') ?? 'publish failed');
      await markApplied(db, uid!, pid, rid, body);
      setApply({ payload: body, status: 'Published to Remote Config.' });
      data.reload();
    } catch (e) {
      setApply({ payload: preview, status: `Failed: ${(e as Error).message}` });
    }
  }

  return (
    <>
      <p>
        <Link to={`/p/${pid}`}>← Project</Link>
      </p>
      <h1>Report: {feature?.name ?? run.featureId}</h1>
      <p className="muted">
        {new Date(run.startedAt).toLocaleString()} · Chrome {run.env.chromeVersion} · Nano{' '}
        {run.env.nanoAvailability} · device evaluated {run.deviceEvaluated}
      </p>
      <div className={`banner ${rec.mode === 'PREFER_ON_DEVICE' ? 'ok' : 'warn'}`}>
        <b>
          Verdict: {rec.mode}
          {rec.maxDeviceChars ? ` (inputs up to ${rec.maxDeviceChars} chars)` : ''}
        </b>
        <ul style={{ margin: '6px 0 0' }}>
          {rec.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="grid2">
        <MetricsCard m={summary.device} />
        <MetricsCard m={summary.cloud} />
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Accuracy by input length</h2>
        <table>
          <thead>
            <tr>
              <th>Chars</th>
              <th>Device acc. (n)</th>
              <th>Cloud acc. (n)</th>
            </tr>
          </thead>
          <tbody>
            {summary.device.byLength.map((b, i) => {
              const c = summary.cloud.byLength[i];
              return (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td>
                    {pct(b.accuracy)} ({b.n})
                  </td>
                  <td>
                    {pct(c?.accuracy ?? null)} ({c?.n ?? 0})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Apply routing</h2>
        <p className="muted">
          Publishes this exact JSON to Remote Config parameter{' '}
          <code>routing_{preview.featureKey}</code> through the local publisher.
        </p>
        <pre>{JSON.stringify(preview.routing, null, 2)}</pre>
        <pre>{serializeRouting(preview.routing)}</pre>
        {run.appliedAt && (
          <div className="banner ok">Applied {new Date(run.appliedAt).toLocaleString()}</div>
        )}
        <button className="primary" onClick={() => void doApply()}>
          Apply to Remote Config
        </button>
        {apply?.status === 'NOT_REACHABLE' && (
          <div className="banner warn" style={{ marginTop: 8 }}>
            The local publisher is not running. Start it in a terminal with{' '}
            <code>npm run publisher</code> (needs tools/publisher/.env), then click Apply again. The
            hosted console cannot publish; it needs the local publisher.
          </div>
        )}
        {apply && apply.status !== 'NOT_REACHABLE' && <p>{apply.status}</p>}
      </div>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Cases</h2>
          <select
            style={{ width: 'auto' }}
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">both routes</option>
            <option value="device">device</option>
            <option value="cloud">cloud</option>
          </select>
          <label style={{ margin: 0 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={onlyFail}
              onChange={(e) => setOnlyFail(e.target.checked)}
            />{' '}
            only failures / not correct
          </label>
          <span className="muted">{failures.length} rows</span>
        </div>
        {failures.length === 0 && <p className="muted">Nothing to show with this filter.</p>}
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Route</th>
              <th>Outcome</th>
              <th>Chars</th>
              <th>Input / output / error</th>
            </tr>
          </thead>
          <tbody>
            {failures.slice(0, 300).map((r, i) => (
              <tr key={i}>
                <td>{r.caseId}</td>
                <td>{r.route}</td>
                <td>{r.outcome}</td>
                <td>{r.inputChars}</td>
                <td>
                  <pre>IN: {r.input ?? ''}</pre>
                  <pre>OUT: {r.output ?? r.error ?? ''}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
