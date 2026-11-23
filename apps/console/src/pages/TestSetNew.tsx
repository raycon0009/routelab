import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TestCase } from '@routelab/engine';
import { useFirebase } from '../lib/firebase';
import { saveTestSet } from '../lib/store';
import { BUILTIN_SETS, fetchCivilLive } from '../lib/builtin';

/** One case per line. Optional expected answer after " ||| ". */
export function parsePasted(text: string): TestCase[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const [input, expected] = line.split(' ||| ');
      return {
        id: `p${i + 1}`,
        input: input!.trim(),
        ...(expected ? { expected: expected.trim() } : {}),
      };
    });
}

export function TestSetNew() {
  const { pid = '' } = useParams();
  const { db, user } = useFirebase();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(label: string, source: string, cases: TestCase[]) {
    setBusy(true);
    setErr(null);
    try {
      await saveTestSet(db, user!.uid, pid, { name: label, source, cases });
      nav(`/p/${pid}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  const pasted = parsePasted(text);
  return (
    <>
      <p>
        <Link to={`/p/${pid}`}>← Project</Link>
      </p>
      <h1>New test set</h1>
      {err && <div className="banner bad">{err}</div>}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Built-in sets</h2>
        {BUILTIN_SETS.map((b) => (
          <div className="row" key={b.id} style={{ marginBottom: 6 }}>
            <button disabled={busy} onClick={() => void save(b.name, `builtin:${b.id}`, b.cases)}>
              Add
            </button>
            <span>{b.name}</span> <span className="muted">{b.cases.length} cases</span>
            {b.contentWarning && (
              <span className="pill warn" title={b.contentWarning}>
                content warning
              </span>
            )}
          </div>
        ))}
        <div className="row">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const cases = await fetchCivilLive(5, setMsg);
                await save(
                  'Moderation — Civil Comments (live fetch)',
                  'huggingface:google/civil_comments',
                  cases,
                );
              } catch (e) {
                setErr(`Live fetch failed (${(e as Error).message}). Use the cached set above.`);
                setBusy(false);
              }
            }}
          >
            Fetch Civil Comments live
          </button>
          <span className="muted">{msg}</span>
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Paste cases</h2>
        <p className="muted">
          One case per line. Add the expected answer after <code> ||| </code> (for example{' '}
          <code>You are awful ||| remove</code>).
        </p>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <textarea
          style={{ minHeight: 160 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="muted">{pasted.length} cases</p>
        <button
          className="primary"
          disabled={busy || !name.trim() || pasted.length === 0}
          onClick={() => void save(name.trim(), 'pasted', pasted)}
        >
          Save test set
        </button>
      </div>
    </>
  );
}
