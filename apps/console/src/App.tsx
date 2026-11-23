import { NavLink, Route, Routes } from 'react-router-dom';
import { useFirebase } from './lib/firebase';
import { Spike } from './pages/Spike';

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
          <Route path="/spike" element={<Spike />} />
          <Route path="*" element={<p>Home (coming)</p>} />
        </Routes>
      </main>
    </>
  );
}
