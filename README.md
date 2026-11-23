# RouteLab

Measure before you route. RouteLab evaluates an AI prompt on both Firebase AI Logic routes (on-device Gemini Nano in Chrome vs cloud), recommends a routing per feature, and publishes it to Firebase Remote Config. A demo app ("Kitchen Table") picks the routing up without a redeploy.

> Work in progress for #BuildHybridAI 2026. This README is a stub; the full write-up comes later.

## Run it

```powershell
npm install
npm run dev:console    # RouteLab console  -> http://localhost:5173  (try /spike first)
npm run dev:demo       # Kitchen Table demo -> http://localhost:5174
npm run publisher      # local Remote Config publisher on 127.0.0.1:8787
npm run build; npm test; npm run lint
```

1. Copy `apps/console/.env.example` to `apps/console/.env.local` (same for `apps/demo`). Put your reCAPTCHA v3 site key in `VITE_RECAPTCHA_SITE_KEY`.
2. Publisher: copy `tools/publisher/.env.example` to `tools/publisher/.env` and point `GOOGLE_APPLICATION_CREDENTIALS` at a service-account key kept **outside** the repo.

## App Check for judges

AI Logic requires App Check. Without a reCAPTCHA key, dev builds use the **debug token**: open the app, copy the token printed in the browser console, and register it in Firebase Console → App Check → Apps → Manage debug tokens.

## Where Firebase AI Logic is used

- [packages/shared/src/adapters.ts](packages/shared/src/adapters.ts) — `getAI`, `getGenerativeModel`, hybrid modes, `inferenceSource`, `initializeDeviceModel`
- [packages/shared/src/routed.ts](packages/shared/src/routed.ts) — applying a routing config, device timeout, circuit breaker
- [apps/console/src/pages/Spike.tsx](apps/console/src/pages/Spike.tsx) and [apps/console/src/pages/Run.tsx](apps/console/src/pages/Run.tsx) — evaluation runs
- [apps/demo/src/App.tsx](apps/demo/src/App.tsx) — the demo app reading routing from Remote Config

## Layout

`apps/console`, `apps/demo`, `packages/engine` (runner, graders, metrics, recommend), `packages/shared` (Firebase glue), `tools/publisher`, `tools/datasets`, `datasets/`.

License: Apache-2.0.
