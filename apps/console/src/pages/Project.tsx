import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFirebase } from '../lib/firebase';
import { useAsync } from '../lib/useAsync';
import {
  deleteFeature,
  deleteTestSet,
  getProject,
  listFeatures,
  listRuns,
  listTestSets,
  saveFeature,
  saveTestSet,
} from '../lib/store';
import { BUILTIN_SETS } from '../lib/builtin';
import { SAMPLE_FEATURES } from '../lib/samples';

export function ProjectPage() {
  const { pid = '' } = useParams();
  const { db, user } = useFirebase();
  const uid = user?.uid;
  const project = useAsync(
    () => (uid ? getProject(db, uid, pid) : Promise.resolve(null)),
    [uid, pid],
  );
  const features = useAsync(
    () => (uid ? listFeatures(db, uid, pid) : Promise.resolve([])),
    [uid, pid],
  );
  const sets = useAsync(() => (uid ? listTestSets(db, uid, pid) : Promise.resolve([])), [uid, pid]);
  const runs = useAsync(() => (uid ? listRuns(db, uid, pid) : Promise.resolve([])), [uid, pid]);
  const [seeding, setSeeding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function seed() {
    if (!uid) return;
    setSeeding(true);
    setErr(null);
    try {
      for (const s of SAMPLE_FEATURES) {
        await saveFeature(db, uid, pid, s.feature);
        const b = BUILTIN_SETS.find((x) => x.id === s.builtinSetId)!;
        await saveTestSet(db, uid, pid, {
          name: b.name,
          source: `builtin:${b.id}`,
          featureKey: s.feature.key,
          cases: b.cases,
        });
      }
      features.reload();
      sets.reload();
    } catch (e) {
      setErr((e as Error).message);
    }
    setSeeding(false);
  }

  if (project.loading) return <p className="muted">Loading…</p>;
  if (project.error) return <div className="banner bad">{project.error}</div>;
  if (!project.data)
    return (
      <div className="banner warn">
        Project not found. <Link to="/">Back to projects</Link>
      </div>
    );
  return (
    <>
      <p>
        <Link to="/">← Projects</Link>
      </p>
      <h1>{project.data.name}</h1>
      {err && <div className="banner bad">{err}</div>}
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Features</h2>
          <Link to={`/p/${pid}/f/new`}>
            <button>New feature</button>
          </Link>
          <button disabled={seeding} onClick={() => void seed()}>
            {seeding ? 'Loading…' : 'Load sample features'}
          </button>
        </div>
        {features.data?.length === 0 && <p className="muted">No features yet.</p>}
        <table>
          <tbody>
            {features.data?.map((f) => (
              <tr key={f.id}>
                <td>
                  <Link to={`/p/${pid}/f/${f.id}`}>{f.name}</Link>
                </td>
                <td className="muted">
                  routing_{f.key} · grader {f.graderType} · threshold{' '}
                  {Math.round(f.threshold * 100)}%
                </td>
                <td>
                  <button
                    onClick={async () => {
                      await deleteFeature(db, uid!, pid, f.id);
                      features.reload();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Test sets</h2>
          <Link to={`/p/${pid}/t/new`}>
            <button>New test set</button>
          </Link>
        </div>
        {sets.data?.length === 0 && <p className="muted">No test sets yet.</p>}
        <table>
          <tbody>
            {sets.data?.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="muted">
                  {t.cases.length} cases · {t.source}
                </td>
                <td>
                  <button
                    onClick={async () => {
                      await deleteTestSet(db, uid!, pid, t.id);
                      sets.reload();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Runs</h2>
          <Link to={`/p/${pid}/run`}>
            <button className="primary" disabled={!features.data?.length || !sets.data?.length}>
              New run
            </button>
          </Link>
        </div>
        {runs.data?.length === 0 && <p className="muted">No runs yet.</p>}
        <table>
          <tbody>
            {runs.data?.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to={`/p/${pid}/r/${r.id}`}>{new Date(r.startedAt).toLocaleString()}</Link>
                </td>
                <td className="muted">
                  {features.data?.find((f) => f.id === r.featureId)?.name ?? r.featureId} ·{' '}
                  {r.status} · device {r.deviceEvaluated} · {r.summary.recommendation.mode}
                  {r.appliedAt ? ' · applied' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
