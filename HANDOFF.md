# HANDOFF — RouteLab for #BuildHybridAI 2026

Read this file and `BUILD_PLAN.md` before doing anything. This is the full context from the research session (22 Nov 2026, IST). Update the **Status** and **Decisions log** sections at the end of every session.

---

## How to start a new session (copy one of these prompts)

**Model policy (user preference, 24 Nov):** run every build session on **Sonnet 5.5**. Inside it, call an **Opus subagent** (Agent tool, `model: "opus"`) only for unknown SDK/API research, tricky logic with tests, or an error that survives 2 fix attempts. Brief Opus small: goal, exact error, 2–3 file paths. Never use Opus for UI, styling, datasets or docs. Cap Opus calls per session (default 6) and log each one in the Decisions log as "escalated: why → outcome".

**Build session (Claude Code, in the repo, Sonnet 5.5):**

> Read HANDOFF.md and BUILD_PLAN.md. We are on Day N. Do the Day N tasks marked for you, in order. Before coding, list what you will do and any blockers. Run tests after each task. At the end, update the Status and Decisions log sections of HANDOFF.md.

**Debug session:**

> Read HANDOFF.md. Here is the problem: <paste error / behaviour>. Find the cause before changing code, then fix it and note it in the Decisions log.

**Review session (use Opus):**

> Read HANDOFF.md and BUILD_PLAN.md, then review the current repo against the four judging criteria. List the top 5 problems, ranked, with concrete fixes.

---

## The hackathon (verified 22 Nov 2026)

- **Event:** #BuildHybridAI 2026, run by Google/Firebase on Devpost: https://firebasehybridaihackathon.devpost.com/ (rules: /rules, updates: /updates). Gallery not yet published.
- **Dates:** submissions close **30 Nov 2026, 2:00 PM PT (1 Dec, 3:30 AM IST)**. Judging 10–16 Dec. Winners around 21 Dec.
- **Prizes:** Grand $10k, 1st runner-up $7k, 2nd runner-up $4k, Best iOS / Android / Web-Chrome $3k each. One grand + up to one "Best of".
- **Must:** Firebase AI Logic used at runtime (imported and called, not just in README); App Check (debug tokens accepted); public GitHub/GitLab repo with OSI licence in About; English text description; YouTube demo ≤ 3 min showing the app running; hosted URL strongly encouraged; free to use.
- **Judging (equal weights, 1–5 each, averaged; ties broken in this order):**
  1. Technological Implementation — how well built, how effectively it uses AI Logic hybrid inference
  2. Design — complete, coherent product, not just a proof of concept
  3. Potential Impact — credible, specific case for a real problem and audience, shown in the demo
  4. Quality of the Idea — creative, non-obvious use of AI Logic; genuine understanding of the problem space
- **Named judge:** Ankita Saxena, Product Manager for Firebase AI Logic (blog: firebase.blog/author/ankita-saxena). Her framing: "intelligent distribution of AI"; she values offline, cost, latency; recent posts on TTS, Maps and Search grounding. Other judges unknown.
- **Multi-platform** gets "strong consideration" for the Grand Prize. We are **web only** by choice.
- **Quota:** Sprint 3 Google Account Quota request deadline **Wed 25 Nov, 10:00 AM PT (11:30 PM IST)** — only needed for billed models.

## Why RouteLab (research summary)

- About 30+ public competitor repos found. Crowded themes: PII redaction before cloud (Veil, Redact Relay, PII-Zero, Satark, NanoShield, Airlock, EdgeMesh…), notes/summaries/study tools, field medical triage, scam shields, letter explainers (Fumi, Airlock, Plainly). Routers exist (hybrid-ai-router library, EdgeMesh workbench, Satark dev eval page) but none found that evaluates on AI Logic's own routes **and** publishes routing to Remote Config.
- Google already ships an LLM-as-judge comparison sample (GoogleChromeLabs/web-ai-demos, `compare_judge.js`) and docs for Remote Config + AI Logic. RouteLab's new part is the full loop: test on both AI Logic routes → freeze/refusal detection → per-feature verdict → Remote Config → live app.
- Ideas tested and killed: ChartSense (Nano 12/20 on synthetic charts, 2/5 when bars are identified only by colour), ModQueue (see below), Parent Inbox (crowded + Nano can't write Indian languages), RailSaathi (Nano web isn't on phones; Trail clone).

## Our own Nano test results (Chrome 158, Windows, "Browser 1", 22 Nov)

- Mild synthetic moderation comments (30): 0 refusals, 24/24 clear cases correct, **never** answered "escalate", removed 4/6 borderline. ~5 s per call. 6 parallel calls: 37 s total.
- **Real Civil Comments (toxicity ≥ 0.8):** first 11 → removed 5, **allowed 5**, escalated 1. Item 12 (67 chars) **hung indefinitely**; afterwards every Nano call (even "Say hi") timed out, even after page reload, until Chrome restart.
- Use these as the demo story. Re-run inside RouteLab on Day 7 so the numbers come from the product itself.

## Technical facts (see BUILD_PLAN.md section 3 for the full list)

- Firebase JS SDK ≥ 12.5.0, Chrome desktop ≥ 139. Modes: PREFER_ON_DEVICE, ONLY_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD. `inferenceSource` on responses.
- On-device web: single-turn text, JPEG/PNG images, structured output, streaming. No multi-turn, audio, PDF, tools, grounding. Multimodal ≤ 9,216 tokens. Output languages en/ja/es/de/fr.
- Hardware: 22 GB free disk; GPU > 4 GB VRAM or 16 GB RAM + 4 cores. Not on mobile Chrome.
- Remote Config can't be written from the client; use Admin SDK in a Cloud Function (Blaze) or `firebase deploy --only remoteconfig`.
- Test data: Civil Comments via `https://datasets-server.huggingface.co/rows?dataset=google/civil_comments&config=default&split=test&offset=<n>&length=100` (the `/filter` endpoint returned "index is loading" on 22 Nov).

## Unverified — check before relying on them

- Whether AI Logic `generateContent` accepts an AbortSignal.
- Whether Remote Config real-time updates work on web.
- The exact API to trigger the Nano download from AI Logic (competitors use `initializeDeviceModel()`).
- Civil Comments licence wording for redistribution (we load it at runtime to avoid shipping it).
- Which cloud models are "billing not required" today.

## Team context (fill in)

- Team size / skills: 1 person; Claude Code writes most of the code, the person does console setup, Nano testing, review, video.
- Machine(s) with Nano: Windows PC, Chrome 158 ("Browser 1"). Nano is available for text + image there.
- Hours per day available: ~5
- Billing/Blaze possible? **No — zero budget.** Stay on Spark. No Cloud Functions, no Vertex AI backend, no billed models.

## Firebase project (created 24 Nov)

- Display name "Route Lab", project ID **`route-lab-f50dc`**, plan Spark.
- Web app config (public client config, not a secret; restrict the API key to our Hosting domains + localhost before submission):

```js
const firebaseConfig = {
  apiKey: 'AIzaSyDVi-89c6zjvpBvG4IIHvAzAXdWAYm8w18',
  authDomain: 'route-lab-f50dc.firebaseapp.com',
  projectId: 'route-lab-f50dc',
  storageBucket: 'route-lab-f50dc.firebasestorage.app',
  messagingSenderId: '438221186982',
  appId: '1:438221186982:web:a15d65c49b3b1d3c265167',
  measurementId: 'G-HD94ZNLEW5',
};
```

- We do not use Analytics; do not call `getAnalytics`.
- Service-account key for the local publisher: `C:\Hackathon projects\routelab-sa.json` (outside the repo; never read it into chat, never commit; also add `*-sa.json` and `*adminsdk*.json` to `.gitignore`).
- Console setup done 24 Nov: web app registered, Firestore (Standard, production mode), Remote Config test param `routing_test` = `hello`. AI monitoring skipped. Firestore confirmed: `(default)`, Standard, `asia-south1`. Firebase CLI installed and logged in (`firebase.cmd` works from the agent shell). GitHub CLI logged in as `raycon0009`. Nano: `LanguageModel.availability()` = `'available'` on 24 Nov (Chrome 158, perf class Medium). Gemini Developer API enabled and Anonymous auth enabled (confirmed by user 24 Nov). **Day 1 console setup complete.**
- Chrome warns when no output language is given. Always pass an output language (`en`) in the on-device create options (AI Logic `onDeviceParams.createOptions`, e.g. `expectedOutputs: [{ type: "text", languages: ["en"] }]` — verify exact shape in the Day 1 spike). The user's Chrome has an ad blocker; ignore `ERR_BLOCKED_BY_CLIENT` noise in consoles.

---

## Status (update every session)

| Day | Task                                 | State       | Notes                                                                                                          |
| --- | ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------- |
| 0   | Research, idea selection, kill tests | Done        | RouteLab chosen                                                                                                |
| 1   | Setup + spikes                       | Done        | Spikes, scaffold, App Check debug tokens done 24 Nov.                                                          |
| 2–5 | Engine, console, runs, apply, demo   | Done (v1)   | Moderation → `ONLY_IN_CLOUD`, Recipe summary → `PREFER_ON_DEVICE`, both applied and read by the demo (24 Nov). |
| 6   | Polish                               | Not started |                                                                                                                |
| 7   | Evidence, docs, video draft          | Not started |                                                                                                                |
| 8   | Submit                               | Not started |                                                                                                                |

## Decisions log (append, newest last)

- 22 Nov — Chose RouteLab after kill tests. Web only. Target Best Web/Chrome.
- 22 Nov — Device calls run sequentially with timeouts and a health check, because Nano froze on a real toxic comment.
- 24 Nov — Zero budget: stay on Spark. AI Logic uses the **Gemini Developer API** backend (free tier), not Vertex AI. Apply publishes via a **local publisher** (Node + Admin SDK + service-account key on the dev PC, called from the console on localhost); no Cloud Function. Hosted console shows Apply as "needs local publisher". No quota request needed.
- 24 Nov — App Check provider: use **reCAPTCHA v3** (free, no billing) instead of reCAPTCHA Enterprise, unless Enterprise is confirmed to work without billing.
- 24 Nov — Schedule slipped one day (Day 1 not started on 23 Nov). Re-baseline needed.
- 24 Nov — First live tests: cloud path works (`in_cloud`, ~3 s, valid JSON, `gemini-3.5-flash-lite`). Device path: plain Nano prompt OK in ~0.5 s, but a prompt with `responseConstraint` = object schema `{label enum, reason string}` never returned, and afterwards `LanguageModel.create()` itself hung (>20 s) in a fresh tab → Nano wedged again, needs Chrome restart. The spike's device call (same schema) also hit the 20 s timeout. Suspect: JSON-schema constrained decoding with a free-text field wedges Nano on this machine. Next: after restart, test no-constraint (JSON asked in prompt) first, then enum-only constraint.
- 24 Nov — After Chrome restart, tested via Claude in Chrome: **cold start ~24 s** (create 10 s + first prompt 14 s) on the first device call in every page load; warm calls 0.5–6 s. All constraint shapes work warm: none (JSON in prompt, 2.9 s, wrapped in ```json fences), enum-only (1.9 s), object label-only (1.4 s), full `{label, reason}` schema (6 s). App spike: Device call `on_device` 3.2 s, Health check healthy, forced 1 ms timeout caught. **Conclusion:** the first spike timeout was the cold start (24 s > 20 s limit), not the schema. The earlier wedge (schema prompt never returned, then `create()` hung) did not reproduce; treat it as intermittent — exactly what the health check exists for. **Fix:** first device call per page gets a 90 s warm-up limit (`DEVICE_WARMUP_TIMEOUT_MS`, `isDeviceWarm()` in shared adapters; `Breaker.deviceWarm`/`warmupTimeoutMs` in `routed.ts` so the demo's circuit breaker doesn't trip on the cold start). Health check's first run doubles as warm-up. 90 tests green.
- 24 Nov — Firestore rules deployed (`firebase deploy --only firestore:rules`). Verified: console created project "Kitchen Table" in Firestore with no permission errors. Note for agents: the agent's sandboxed shell times out reaching `firestore.googleapis.com` / `firebaserules.googleapis.com`; run Firebase deploys in the user's Terminal panel instead.
- 24 Nov — **First real RouteLab run** (run `z5UxF51icGSuj2nQ67Vj`, project "Kitchen Table", Moderation × Civil Comments, 10 cases). Cloud: 10/10 evaluated, 90% accuracy, p50 1.9 s / p95 3.1 s, est. $0.0002. Device: warm-up passed, then the **first case `civil-6` (191 chars, toxic political comment) hung past 20 s**; the follow-up health check failed and the other 9 cases were marked `skipped_unhealthy`. Afterwards a fresh `LanguageModel.create()` + "Reply with OK" was still pending after 30 s → Nano wedged again, reproducing the 22 Nov freeze inside the product. Verdict `ONLY_IN_CLOUD` ("device timed out on 100% of evaluated cases (n=1)"). Publisher `/health` OK. Small UI gap: skipped rows show empty IN text.
- 24 Nov — **First Remote Config publish via Apply** (user-approved): `routing_moderation` = `ONLY_IN_CLOUD`, evidence run `z5UxF51icGSuj2nQ67Vj`. `firebase remoteconfig:get` shows template version 2 (09:30:54Z, by the Admin SDK service account, incremental update), with `routing_test` kept. Claude in Chrome note: two browsers are connected; the Nano Chrome with the console's anonymous user is **"Browser 1"** — select it with `select_browser` if tab calls fail with "No group with id".
- 24 Nov — Demo app (`npm run dev:demo`, :5174) reads Remote Config correctly: Comment moderation shows `ONLY_IN_CLOUD`, evidence `z5UxF51icGSuj2nQ67Vj`, source `remote`; Recipe summary falls back to the default. But Moderate fails with **401 "Firebase App Check token is invalid"**: App Check debug tokens are generated per origin, so the demo on :5174 has its own token that isn't registered (the console's :5173 token is). Fix options: register the demo's token too, or have both apps read one fixed token from a gitignored `VITE_APPCHECK_DEBUG_TOKEN`.
- 24 Nov — Registered the demo's debug token via CLI (`appcheck:debugtokens:create … --display-name demo-localhost-5174 --no-save-local`, user-approved; the CLI needs `--display-name` or it stops at an interactive prompt). **End-to-end loop verified:** demo Moderate on the toxic dal comment → `remove`, badge `cloud`, reason "routing says cloud only"; friendly comment → `allow`, `cloud`; cost counter $0.000035. Revoke both localhost debug tokens before submission (or keep them only for judges' instructions).
- 24 Nov — Overnight unattended build of Days 1–5 code planned in `OVERNIGHT.md` (it overrides BUILD_PLAN.md where they differ). Repo: public `raycon0009/routelab`. Overnight may commit + push; no Firebase deploys, no Remote Config publishes. LLM judge and CSV import cut. Results go to `MORNING.md`.
- 24 Nov (overnight) — Built T1–T9 per OVERNIGHT.md; see MORNING.md. Repo https://github.com/raycon0009/routelab.
- 24 Nov — API facts (installed firebase 12.19.0, @firebase/ai 2.16.0; read from .d.ts/runtime by an Opus subagent): `getAI(app, {backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens})`; `getGenerativeModel(ai, {mode, inCloudParams: {model, systemInstruction, generationConfig}, onDeviceParams: {createOptions, promptOptions}}, {timeout})`; `InferenceMode` values `PREFER_ON_DEVICE|ONLY_ON_DEVICE|ONLY_IN_CLOUD|PREFER_IN_CLOUD`; `response.inferenceSource` is `'on_device'|'in_cloud'`; `generateContent(prompt, {signal, timeout})` but signal/timeout reach only the cloud request; English on device = `createOptions.expectedInputs/expectedOutputs [{type:'text',languages:['en']}]`; on-device system prompt via `createOptions.initialPrompts`, schema via `promptOptions.responseConstraint`; `usageMetadata` is undefined on device; Nano download = `model.initializeDeviceModel(onProgress)` (user gesture); no public availability helper (use `LanguageModel.availability()`); Remote Config web has `onConfigUpdate(rc, {next,error,complete})` (call `activate` in next); App Check `initializeAppCheck(app,{provider:new ReCaptchaV3Provider(key)})` before getAI.
- 24 Nov — `CLOUD_MODEL = gemini-3.5-flash-lite` (docs: https://firebase.google.com/docs/ai-logic/models, "billing not required"). SDK default is 2.5-flash-lite; we set the model explicitly. Escalations: 2 Opus calls (API research; recommend rules + tests), none on trouble.
- 24 Nov — Civil Comments licence: CC0-1.0 per the Hugging Face dataset card; we still load it at runtime and ship a 100-case cached sample with a content warning.
- 24 Nov — `/validate` on the publisher needs the template ETag; firebase-admin templates expose `etag` as a prototype getter, so it must be copied explicitly (spread drops it). Fixed + tested.
- 24 Nov — Cloud smoke test from a Node script failed with 401 "App Check token is invalid" (App Check is enforced for AI Logic): cloud path needs a registered debug token. Firestore rules are written, not deployed.
- 24 Nov — Git identity for commits: user `raycon0009`, GitHub noreply email (set in repo-local config).
- 24 Nov — **Recipe summary run** (run `iByvSB2DAbFDIY105WqA`, Recipe summary × Recipe summaries (synthetic), 25 cases, after a full Chrome restart). Device: 25/25 evaluated, **96% accuracy** (only `summary-13`, 1327 chars, wrong), p50 6.6 s / p95 7.9 s, 0 refusals/timeouts/schema fails; the warm-up passed. Cloud: 21/25 evaluated, 100%, p50 1.5 s; **4 cases rate-limited** (free tier `gemini-3.5-flash-lite` = 15 requests/min, 4 parallel calls plus retries exceeded it; not counted as wrong). By length: 200–499 chars 100%/100%, 500–1199 100%/100%, 1200–2999 device 93% (n=14) vs cloud 100% (n=10); the test set has no inputs under 200 or over 3000 chars. Verdict `PREFER_ON_DEVICE`, `maxDeviceChars` null. **Applied** (user-approved) to `routing_recipe_summary`, evidence run `iByvSB2DAbFDIY105WqA`. Demo (:5174): Refresh routing shows Recipe summary `PREFER_ON_DEVICE`, source `remote`; Summarise recipe on the dal recipe → badge `on-device`. Not tested: cloud fallback for a long recipe (needs `maxDeviceChars`). No Opus escalations this session.
- 24 Nov — Fix: runner now records `input` on skipped, cancelled and rate-limited rows so the report's IN column is no longer empty. Open: lower `cloudConcurrency` or pace cloud calls to stay under the free-tier 15 RPM limit; add shorter/longer recipes to the summary set so `maxDeviceChars` can be exercised.
- 24 Nov — Cloud rate-limit fix: runner option `cloudMinIntervalMs` (console sets 4.5 s, about 13 calls/min, under the free-tier 15 RPM) and retry backoff base 4 s (4/8/16/32 s). Recipe summary set grew from 25 to 31 cases: three very short (105-111 chars) and three very long (3324, 3825, 4499 chars) so the report can recommend `maxDeviceChars`. The old applied verdict (run `iByvSB2DAbFDIY105WqA`) stays live until a re-run on the 31-case set is applied. Cloud calls for a full 31-case run now take about 2.5 min.
- 25 Nov — **Re-run on the 31-case summary set** (run `Nvx42kyWoh8oivBStrfc`, Browser 1; Browser 2's Claude in Chrome tab calls failed with "No group with id", so it was not used). Device 31/31, **96.8%** (one miss: `summary-15`, 1451 chars), p50 7.6 s / p95 9.4 s. Cloud 31/31, **100%**, p50 1.5 s, **0 rate-limited** (throttle works). By length: 0-199 100% (n=3), 200-499 100% (2), 500-1199 100% (9), 1200-2999 device 93% vs cloud 100% (14), 3000+ 100% (3). Verdict `PREFER_ON_DEVICE`, `maxDeviceChars` null, so no length cap is recommended and the cloud fallback for long recipes cannot be shown from this feature. **Applied** (user-approved) to `routing_recipe_summary`, evidence run now `Nvx42kyWoh8oivBStrfc` (the Apply button may have fired more than once; the publish is idempotent). The stored test set was a stale 25-case copy; "Load sample features" now updates in place (`35f0a1b`).
- 25 Nov — escalated (Opus, 1 of 6, requested by the user): gap analysis of the repo against the hackathon rules and a day-by-day plan to 30 Nov → plan saved outside the repo in the session notes folder as `remaining-plan.md`. Main findings: App Check works only on localhost (hosted builds send no token), nothing is hosted, README is a stub, no video, hosted judges see none of our runs, the moderation verdict rests on one device case.
- 25 Nov — escalated (Opus, 2 of 6, requested by the user): win-probability review beyond the remaining-work plan → `win-strategy.md` in the session notes folder. Core pitch: `PREFER_ON_DEVICE` falls back only when Nano is missing, not on a hang or wrong answer; RouteLab adds a measured verdict plus a runtime circuit breaker. Re-check against `@firebase/ai` 2.16.0 source that on-device calls ignore `timeout`/`signal` before claiming it publicly. Realistic target: Best Web/Chrome.
