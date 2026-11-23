# MORNING — overnight build report (24 Nov 2026)

Repo: https://github.com/raycon0009/routelab (public, Apache-2.0). `npm run build`, `npm test` (89 tests) and `npm run lint` are green.

## Done

| Task                                                                 | Status                                                                                          | Commit           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------- |
| T1 Scaffold + public repo                                            | Done                                                                                            | a7d0ec4          |
| T2 Spike page (`/spike`)                                             | Done (builds; cloud call blocked by App Check until you register a token; device path untested) | 6d38ae8          |
| T3 callWithTimeout + healthCheck (`packages/shared/src/adapters.ts`) | Done                                                                                            | 6d38ae8          |
| T4 Engine: runner, graders, metrics, recommend (+ tests)             | Done, 70+ engine tests                                                                          | 6d38ae8          |
| T7 Local publisher + Apply button                                    | Done. `/health` and `/validate` tested live against Remote Config. `/publish` NOT called.       | 0b72f98, c6a6b06 |
| T8 Demo app Kitchen Table                                            | Done (builds; not run against live Remote Config values)                                        | 87e9e4e          |
| T6 Console screens                                                   | Done (builds; loads in a browser; no real run yet)                                              | c6a6b06          |
| T5 Datasets                                                          | Done: 100 Civil Comments cases (40 remove / 20 escalate / 40 allow), 25 summary, 20 extraction  | c6a6b06          |
| T9 README stub                                                       | Done                                                                                            | final commit     |

Opus calls used: 2 of 8 (API research, recommend rules). No cloud model calls succeeded (1 attempt, rejected by App Check). No deploys, no Remote Config publish, service-account key never opened.

## Morning checklist (in order)

1. **Pull + install:** `git pull; npm install`
2. **Env files:** copy `apps/console/.env.example` to `apps/console/.env.local` and `apps/demo/.env.example` to `apps/demo/.env.local` (leave the key empty until step 4). Publisher: `tools/publisher/.env` already exists on this PC (gitignored); on another PC copy `tools/publisher/.env.example`.
3. **Start console:** `npm run dev:console`, open http://localhost:5173/spike. You should see Chrome version, Nano availability, App Check `debug`, and a yellow warning.
4. **App Check debug token (quickest):** open the browser console; copy the line `Firebase App Check debug token: …`. Firebase Console → Build → App Check → Apps → your web app → ⋮ → **Manage debug tokens** → Add debug token, paste, save. Also in App Check → APIs, make sure Firebase AI Logic is the one enforced (or leave unenforced for now). Reload.
5. **reCAPTCHA v3 key (for hosted use):** https://www.google.com/recaptcha/admin → create, type **reCAPTCHA v3**, add domains `localhost`, `route-lab-f50dc.web.app`, `route-lab-f50dc.firebaseapp.com`. Copy the **site key** into `VITE_RECAPTCHA_SITE_KEY` in both `.env.local` files; copy the **secret key** into Firebase Console → App Check → Apps → web app → Register → reCAPTCHA v3. Restart the dev server.
6. **Spike page:** click **Cloud call** (expect JSON `{label, reason}`, source `in_cloud`, usage shown), **Device call** (source `on_device`), **Force timeout (1 ms)** (expect a TimeoutError card, page stays usable), **Health check** (expect `healthy`). If the cloud call fails with 404/model-not-found, change `CLOUD_MODEL` in `packages/shared/src/config.ts` (see Questions).
7. **Publisher:** new terminal, `npm run publisher`. In another terminal: `curl http://127.0.0.1:8787/health` → `{"ok":true,...}`.
8. **Sample run:** in the console, create a project → **Load sample features** → New run → Moderation + the Civil Comments set, **Limit cases = 10** → Start run. Expect live rows, then the Report with verdict and reasons.
9. **Apply (first real Remote Config publish, you do it):** on the Report click **Apply to Remote Config**, check the JSON, publish. Verify in Firebase Console → Remote Config that `routing_moderation` appears (the publisher already publishes it, so no extra "Publish changes" click is needed).
10. **Demo app:** `npm run dev:demo` → http://localhost:5174. The Routing table should show your mode and `evidenceRunId`. Moderate a comment and look at the badge (on-device / cloud). Re-run + Apply with a different result and click **Refresh routing** (or wait for the real-time update).

## Questions

- `CLOUD_MODEL` is `gemini-3.5-flash-lite` (Firebase docs list it as "billing not required"). Installed SDK 12.19 defaults to `gemini-2.5-flash-lite`. Keep mine, or switch?
- Should the demo require reCAPTCHA in production hosting, or use debug tokens for judges (README says debug tokens)?

## Known problems / stubs

- Cloud path could not be smoke-tested from a script: App Check rejects unregistered clients (401). It needs your debug token (step 4).
- On-device (Nano) path is entirely untested. Per the installed SDK: the per-call `signal`/`timeout` only reach the cloud request, so on device I rely on the timer race. The on-device system prompt is passed via `createOptions.initialPrompts` and the schema via `promptOptions.responseConstraint` (inferred from SDK runtime code, not from docs). Verify in the spike.
- A timeout does **not** un-wedge Nano; only restarting Chrome does.
- LLM judge: typed stub that throws "not implemented". CSV import: not built (paste only).
- The console cached moderation set contains real internet comments including toxic language (content warning is in the file).
- Firestore rules are written (`firestore.rules`) but **not deployed**; the console will get permission errors on Firestore until you run `firebase deploy --only firestore:rules` (overnight rules forbid deploys). Firestore is in production mode, so this is required before step 8.
- Hosting is configured in `firebase.json` (targets `console` and `demo`) but no sites were created and nothing was deployed.
- Cost estimates use placeholder prices (`DEFAULT_CLOUD_PRICE` in `packages/engine/src/metrics.ts`).
- No unit tests for React components; UI is plain (polish is Day 6).
