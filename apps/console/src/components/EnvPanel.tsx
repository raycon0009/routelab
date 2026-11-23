import { useEffect, useState } from 'react';
import {
  chromeVersion,
  downloadNano,
  getDeviceAvailability,
  healthCheck,
  type DeviceAvailability,
} from '@routelab/shared';
import { useFirebase } from '../lib/firebase';

export function EnvPanel() {
  const { ai, bundle } = useFirebase();
  const [avail, setAvail] = useState<DeviceAvailability | '...'>('...');
  const [progress, setProgress] = useState<number | null>(null);
  const [health, setHealth] = useState('not run');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    getDeviceAvailability().then(setAvail);
  }, []);
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Environment</h2>
      <div>
        Chrome <b>{chromeVersion()}</b> · Gemini Nano: <b>{avail}</b> · Health: <b>{health}</b> ·
        App Check: <b>{bundle.appCheckMode}</b>
      </div>
      {avail === 'unavailable' && (
        <p className="muted">
          No Nano on this machine: RouteLab still works cloud-only. For on-device testing use
          desktop Chrome 139+ with enough disk (22 GB free) and a capable GPU or 16 GB RAM.
        </p>
      )}
      {bundle.appCheckMode !== 'recaptcha' && (
        <div className="banner warn">
          No reCAPTCHA v3 key (VITE_RECAPTCHA_SITE_KEY). Using the App Check debug token: copy it
          from the browser console into Firebase Console → App Check → Manage debug tokens.
        </div>
      )}
      <div className="row">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await downloadNano(ai, setProgress);
              setAvail(await getDeviceAvailability());
            } catch (e) {
              setErr((e as Error).message);
            }
            setBusy(false);
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
      </div>
      {err && <pre style={{ color: 'var(--bad)' }}>{err}</pre>}
    </div>
  );
}
