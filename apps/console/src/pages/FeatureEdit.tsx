import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sanitizeFeatureKey } from '@routelab/shared';
import { useFirebase } from '../lib/firebase';
import { getFeature, saveFeature, type Feature, type GraderType } from '../lib/store';

const EMPTY: Omit<Feature, 'id'> = {
  name: '',
  key: '',
  systemPrompt: '',
  userTemplate: '{{input}}',
  outputSchema: '',
  graderType: 'contains',
  threshold: 0.8,
};

export function FeatureEdit() {
  const { pid = '', fid = 'new' } = useParams();
  const { db, user } = useFirebase();
  const nav = useNavigate();
  const [f, setF] = useState<Omit<Feature, 'id'>>(EMPTY);
  const [loading, setLoading] = useState(fid !== 'new');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (fid === 'new' || !user) return;
    getFeature(db, user.uid, pid, fid).then(
      (x) => {
        if (x) setF(x);
        else setErr('Feature not found');
        setLoading(false);
      },
      (e: Error) => {
        setErr(e.message);
        setLoading(false);
      },
    );
  }, [db, user, pid, fid]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const templateOk = f.userTemplate.includes('{{input}}');
  let schemaOk = true;
  if (f.outputSchema.trim()) {
    try {
      JSON.parse(f.outputSchema);
    } catch {
      schemaOk = false;
    }
  }
  if (f.graderType === 'jsonSchemaValid' && !f.outputSchema.trim()) schemaOk = false;

  if (loading) return <p className="muted">Loading…</p>;
  return (
    <>
      <p>
        <Link to={`/p/${pid}`}>← Project</Link>
      </p>
      <h1>{fid === 'new' ? 'New feature' : 'Edit feature'}</h1>
      {err && <div className="banner bad">{err}</div>}
      <div className="card">
        <label>Name</label>
        <input
          value={f.name}
          onChange={(e) =>
            setF((p) => ({
              ...p,
              name: e.target.value,
              key: p.key || sanitizeFeatureKey(e.target.value),
            }))
          }
        />
        <label>
          Remote Config key (parameter will be routing_{sanitizeFeatureKey(f.key || f.name)})
        </label>
        <input value={f.key} onChange={(e) => set('key', e.target.value)} />
        <label>System prompt</label>
        <textarea value={f.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} />
        <label>User template (must contain {'{{input}}'})</label>
        <textarea value={f.userTemplate} onChange={(e) => set('userTemplate', e.target.value)} />
        {!templateOk && (
          <div className="banner warn">
            Template has no {'{{input}}'}; the input will be appended.
          </div>
        )}
        <label>Output JSON schema (optional; enables structured output)</label>
        <textarea value={f.outputSchema} onChange={(e) => set('outputSchema', e.target.value)} />
        {!schemaOk && (
          <div className="banner bad">
            Schema must be valid JSON (and is required for the jsonSchemaValid grader).
          </div>
        )}
        <div className="grid2">
          <div>
            <label>Grader</label>
            <select
              value={f.graderType}
              onChange={(e) => set('graderType', e.target.value as GraderType)}
            >
              <option value="enum">enum (label matches expected)</option>
              <option value="contains">contains (all expected keywords)</option>
              <option value="jsonSchemaValid">jsonSchemaValid (+ expected object)</option>
              <option value="exact">exact</option>
              <option value="regex">regex</option>
            </select>
          </div>
          <div>
            <label>Accuracy threshold (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(f.threshold * 100)}
              onChange={(e) =>
                set('threshold', Math.min(1, Math.max(0, Number(e.target.value) / 100)))
              }
            />
          </div>
        </div>
        {f.graderType === 'regex' && (
          <>
            <label>Regex pattern</label>
            <input
              value={f.graderPattern ?? ''}
              onChange={(e) => set('graderPattern', e.target.value)}
            />
          </>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="primary"
            disabled={!f.name.trim() || !schemaOk || !user}
            onClick={async () => {
              try {
                await saveFeature(db, user!.uid, pid, {
                  ...f,
                  id: fid === 'new' ? undefined : fid,
                });
                nav(`/p/${pid}`);
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}
