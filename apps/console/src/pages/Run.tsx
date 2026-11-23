import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  runEvaluation,
  summarizeRun,
  type CaseResult,
  type HealthStatus,
  type JsonSchema,
  type RunEvent,
} from '@routelab/engine';
import {
  chromeVersion,
  createModelAdapter,
  getDeviceAvailability,
  CLOUD_MODEL,
} from '@routelab/shared';
import { useFirebase } from '../lib/firebase';
import { useAsync } from '../lib/useAsync';
import { graderSpecFor, listFeatures, listTestSets, saveRun } from '../lib/store';

export function RunPage() {
  const { pid = '' } = useParams();
  const { db, user, ai } = useFirebase();
  const nav = useNavigate();
  const uid = user?.uid;
  const features = useAsync(
    () => (uid ? listFeatures(db, uid, pid) : Promise.resolve([])),
    [uid, pid],
  );
  const sets = useAsync(() => (uid ? listTestSets(db, uid, pid) : Promise.resolve([])), [uid, pid]);
  const [fid, setFid] = useState('');
  const [tid, setTid] = useState('');
  const [limit, setLimit] = useState(0);
  const [cloud, setCloud] = useState(true);
  const [device, setDevice] = useState(true);
  const [rows, setRows] = useState<CaseResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!fid && features.data?.[0]) setFid(features.data[0].id);
    if (!tid && sets.data?.[0]) setTid(sets.data[0].id);
  }, [features.data, sets.data, fid, tid]);

  async function start() {
    const feature = features.data?.find((f) => f.id === fid);
    const set = sets.data?.find((s) => s.id === tid);
    if (!feature || !set || !uid) return;
    setErr(null);
    setRows([]);
    setHealth(null);
    setRunning(true);
    const ac = new AbortController();
    abort.current = ac;
    const cases = limit > 0 ? set.cases.slice(0, limit) : set.cases;
    const startedAt = Date.now();
    try {
      const adapter = createModelAdapter(
        ai,
        {
          systemPrompt: feature.systemPrompt,
          userTemplate: feature.userTemplate,
          outputSchema: feature.outputSchema.trim()
            ? (JSON.parse(feature.outputSchema) as JsonSchema)
            : undefined,
        },
        { cloudModel: CLOUD_MODEL },
      );
      const routes = [
        ...(device ? (['device'] as const) : []),
        ...(cloud ? (['cloud'] as const) : []),
      ];
      const out = await runEvaluation({
        cases,
        adapter,
        grader: graderSpecFor(feature),
        routes,
        deviceTimeoutMs: 20_000,
        signal: ac.signal,
        onEvent: (e: RunEvent) => {
          if (e.type === 'result') {
            setRows((r) => [...r, e.result]);
            setProgress({ done: e.done, total: e.total });
          }
          if (e.type === 'health') setHealth(e.status);
        },
      });
      const summary = summarizeRun(out.results, out.deviceEvaluated, {
        threshold: feature.threshold,
      });
      const availability = await getDeviceAvailability();
      const rid = await saveRun(
        db,
        uid,
        pid,
        {
          featureId: feature.id,
          testsetId: set.id,
          startedAt,
          status: out.cancelled ? 'cancelled' : 'finished',
          env: { chromeVersion: chromeVersion(), nanoAvailability: availability },
          summary,
          deviceEvaluated: out.deviceEvaluated,
        },
        out.results,
      );
      nav(`/p/${pid}/r/${rid}`);
    } catch (e) {
      setErr((e as Error).message);
      setRunning(false);
    }
  }

  if (features.loading || sets.loading) return <p className="muted">Loading…</p>;
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  return (
    <>
      <p>
        <Link to={`/p/${pid}`}>← Project</Link>
      </p>
      <h1>New run</h1>
      {err && <div className="banner bad">{err}</div>}
      {(health === 'unhealthy' || health === 'unavailable') && (
        <div className="banner bad">
          {health === 'unavailable'
            ? 'Gemini Nano is not available here, so device cases are skipped (cloud still runs).'
            : 'The on-device model looks stuck (health check failed). Restart Chrome to un-wedge Nano; a timeout only frees this page. Remaining device cases are skipped.'}
        </div>
      )}
      <div className="card">
        <div className="grid2">
          <div>
            <label>Feature</label>
            <select value={fid} onChange={(e) => setFid(e.target.value)} disabled={running}>
              {features.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Test set</label>
            <select value={tid} onChange={(e) => setTid(e.target.value)} disabled={running}>
              {sets.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.cases.length})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label style={{ margin: 0 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={device}
              onChange={(e) => setDevice(e.target.checked)}
            />{' '}
            On-device
          </label>
          <label style={{ margin: 0 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={cloud}
              onChange={(e) => setCloud(e.target.checked)}
            />{' '}
            Cloud
          </label>
          <label style={{ margin: 0 }}>
            Limit cases (0 = all){' '}
            <input
              type="number"
              style={{ width: 80 }}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
          <button
            className="primary"
            disabled={running || !fid || !tid || (!device && !cloud)}
            onClick={() => void start()}
          >
            Start run
          </button>
          {running && <button onClick={() => abort.current?.abort()}>Cancel</button>}
        </div>
        {progress && (
          <div style={{ marginTop: 10 }}>
            <div className="bar">
              <div style={{ width: `${pct}%` }} />
            </div>
            <span className="muted">
              {progress.done}/{progress.total} calls
            </span>
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Route</th>
                <th>Outcome</th>
                <th>Correct</th>
                <th>ms</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice()
                .reverse()
                .map((r, i) => (
                  <tr key={i}>
                    <td>{r.caseId}</td>
                    <td>{r.route}</td>
                    <td>
                      <span className={`pill ${r.outcome === 'ok' ? 'ok' : 'warn'}`}>
                        {r.outcome}
                      </span>
                    </td>
                    <td>{r.correct === null ? '–' : r.correct ? '✓' : '✗'}</td>
                    <td>{r.ms}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
