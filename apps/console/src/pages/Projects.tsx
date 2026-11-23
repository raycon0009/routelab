import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFirebase } from '../lib/firebase';
import { useAsync } from '../lib/useAsync';
import { createProject, listProjects } from '../lib/store';
import { EnvPanel } from '../components/EnvPanel';

export function Projects() {
  const { db, user } = useFirebase();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const projects = useAsync(
    () => (user ? listProjects(db, user.uid) : Promise.resolve([])),
    [user?.uid],
  );
  return (
    <>
      <h1>Projects</h1>
      <EnvPanel />
      <div className="card">
        {!user && <p className="muted">Signing in anonymously…</p>}
        {projects.loading && user && <p className="muted">Loading…</p>}
        {projects.error && (
          <div className="banner bad">Could not load projects: {projects.error}</div>
        )}
        {projects.data?.length === 0 && (
          <p className="muted">
            No projects yet. Create one below, then click “Load sample features”.
          </p>
        )}
        <ul>
          {projects.data?.map((p) => (
            <li key={p.id}>
              <Link to={`/p/${p.id}`}>{p.name}</Link>
            </li>
          ))}
        </ul>
        <div className="row">
          <input
            style={{ maxWidth: 300 }}
            placeholder="New project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="primary"
            disabled={!user || !name.trim()}
            onClick={async () => {
              const id = await createProject(db, user!.uid, name.trim());
              nav(`/p/${id}`);
            }}
          >
            Create project
          </button>
        </div>
      </div>
    </>
  );
}
