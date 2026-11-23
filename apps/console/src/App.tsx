import { NavLink, Route, Routes } from 'react-router-dom';
import { useFirebase } from './lib/firebase';
import { Spike } from './pages/Spike';
import { Projects } from './pages/Projects';
import { ProjectPage } from './pages/Project';
import { FeatureEdit } from './pages/FeatureEdit';
import { TestSetNew } from './pages/TestSetNew';
import { RunPage } from './pages/Run';
import { Report } from './pages/Report';

export function App() {
  const { authError } = useFirebase();
  return (
    <>
      <header className="top">
        <NavLink to="/" className="brand">
          RouteLab
        </NavLink>
        <NavLink to="/spike">Spike</NavLink>
      </header>
      <main>
        {authError && <div className="banner bad">Sign-in failed: {authError}</div>}
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/p/:pid" element={<ProjectPage />} />
          <Route path="/p/:pid/f/:fid" element={<FeatureEdit />} />
          <Route path="/p/:pid/t/new" element={<TestSetNew />} />
          <Route path="/p/:pid/run" element={<RunPage />} />
          <Route path="/p/:pid/r/:rid" element={<Report />} />
          <Route path="/spike" element={<Spike />} />
          <Route path="*" element={<p>Not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
