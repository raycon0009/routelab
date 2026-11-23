# OVERNIGHT BUILD — RouteLab, Days 1–5 code

## How to start it (for the human)

1. In the Claude desktop app, open a **new Code session** in `C:\Hackathon projects\RouteLab`.
2. Set the permission mode to **Auto** (or "accept edits") so it does not stop for prompts.
3. Keep the PC plugged in and set Windows sleep to **Never** for tonight.
4. Paste this one line and go to bed:

> Read OVERNIGHT.md, HANDOFF.md and BUILD_PLAN.md, then carry out OVERNIGHT.md from start to finish without waiting for me. Write MORNING.md before you stop.

---

## Instructions for the overnight agent

You are building RouteLab unattended. The human is asleep. Read `HANDOFF.md` and `BUILD_PLAN.md` first. **Where this file disagrees with BUILD_PLAN.md, this file wins** (it contains decisions made after the plan was written).

### 0. Ground rules

- **Do not ask questions and do not wait for answers.** The global "ask until clear" preference is suspended for this session. When something is ambiguous, pick the simplest option that fits this file, write the choice in the Decisions log, and keep going. Put anything that truly needs the human in `MORNING.md` under "Questions".
- **Never stop early because one task is blocked.** Stub it behind a clear interface, note it in `MORNING.md`, move to the next task.
- **Verify APIs from the installed code, not memory.** For `firebase/ai`, `firebase/remote-config`, `firebase/app-check` and `firebase-admin`, read the `.d.ts` files in `node_modules` before writing calls. Record what you found (exact names/shapes) in the Decisions log.
- Work in small steps. After each numbered task: `npm run build`, `npm test`, `npm run lint` must pass, then commit and push.

### 0b. Model use and escalation (saves usage)

- **This session runs on Sonnet 5.5** and does all routine work itself.
- **Use an Opus subagent** (Agent tool, `subagent_type: "general-purpose"`, `model: "opus"`) only in these cases:
  1. **Planned:** before coding T2/T3, ask Opus to read the installed `firebase/ai` (and `firebase/remote-config`) `.d.ts` files and return the exact API for: hybrid modes, on-device create options with output language, `inferenceSource`, structured output, AbortSignal/timeout support, triggering the Nano download, and `onConfigUpdate` on web. Sonnet implements from that answer.
  2. **Planned:** for T4 `recommend.ts`, ask Opus to write the rules and their unit tests; Sonnet wires them in.
  3. **On trouble:** the same build/test/type error survives **2** fix attempts; or an SDK type/behaviour does not match this file; or a fix would require changing a safety rule or a decision here.
- **Brief Opus small:** the goal, the exact error output, and the 2–3 relevant file paths. Ask for a diagnosis plus a concrete fix (diff or code). Sonnet applies it, runs the checks, and logs "escalated: <why> → <outcome>" in the Decisions log.
- **Never escalate** for UI, styling, datasets, README, or a routine first-try test failure. Max **8** Opus calls tonight; after that, stub and note in MORNING.md.

### 1. Hard safety rules (never break these)

- **Secret key:** the service-account key is at `C:\Hackathon projects\routelab-sa.json`. Never open, print, copy or move it. Never put its contents anywhere. Code refers to it only by path through the `GOOGLE_APPLICATION_CREDENTIALS` env var.
- **.gitignore before first commit**, including: `node_modules/`, `dist/`, `.env*` (except `.env.example`), `*-sa.json`, `*adminsdk*.json`, `service-account*.json`, `.firebase/`, `*.log`.
- Before every commit, run `git status` and check that no `.json` key file or `.env` file is staged.
- **Allowed:** `git init`, create the public GitHub repo `raycon0009/routelab` with `gh repo create routelab --public --source . --push`, normal commits and `git push`.
- **Not allowed:** `firebase deploy` of any kind, publishing Remote Config, changing Firebase/Google Cloud settings, enabling billing, force-push, deleting branches, installing global packages, anything that costs money.
- Cloud model calls from scripts: at most **30** total tonight, only for smoke tests. Nano cannot be tested unattended; do not try to drive Chrome.

### 2. Fixed facts and decisions

- Firebase project ID `route-lab-f50dc`, plan **Spark (free)**. Web config is in `HANDOFF.md`. Put it in `packages/shared/src/firebaseConfig.ts` (public client config, fine to commit). Do not use Analytics.
- AI Logic backend: **Gemini Developer API** (`GoogleAIBackend`). No Vertex AI.
- Cloud model: one constant `CLOUD_MODEL` in shared config. Pick a current model that the Firebase AI Logic docs list as available on the no-cost tier (check the docs online; prefer a "flash-lite" class model). Write the choice and source in the Decisions log.
- **On-device calls must always set the output language to English** (Chrome warns otherwise). Find how AI Logic passes on-device create options (look for `onDeviceParams` / `createOptions` / `expectedOutputs` in the types).
- **App Check:** reCAPTCHA **v3** provider (not Enterprise). Site key goes in `VITE_RECAPTCHA_SITE_KEY`; when missing, enable the debug token (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` in dev only) and show a small warning in the UI. Wire it, but do not register anything in the console (the human will).
- **Remote Config publishing: local publisher**, no Cloud Function. See task 7.
- **Auth:** anonymous sign-in. Firestore rules: owner-only under `users/{uid}/**`, plus a read-only public collection `publicRuns/**` (for reference runs judges can see). Write `firestore.rules` but do not deploy.
- **Firestore paths** (fixes the plan's invalid summary path):
  ```
  users/{uid}/projects/{projectId}
    features/{featureId}
    testsets/{testsetId}
    runs/{runId}                 { ..., summary: { device, cloud, recommendation } }   // summary is a FIELD
    runs/{runId}/results/{caseId}_{route}
  ```
- **Remote Config parameter** `routing_<featureKey>` (featureKey = lowercase `[a-z0-9_]`, sanitised), type JSON, valid JSON only (no comments):
  `{"mode":"PREFER_ON_DEVICE","maxDeviceChars":1200,"deviceTimeoutMs":20000,"cloudModel":"...","evidenceRunId":"...","updatedAt":"ISO"}`. `maxDeviceChars` may be `null`.
- Cut from tonight: LLM judge (leave a typed stub only), CSV import (paste only).

### 3. Repo layout (npm workspaces, TypeScript strict, ESM)

```
apps/console/        Vite + React + TS (RouteLab console)
apps/demo/           Vite + React + TS ("Kitchen Table" demo)
packages/engine/     pure TS: runner, graders, metrics, recommend, types (+ Vitest)
packages/shared/     firebaseConfig, CLOUD_MODEL, Remote Config schema + parse/validate, model adapters for firebase/ai
tools/publisher/     local Node publisher (firebase-admin)
tools/datasets/      scripts that build datasets/*.json
datasets/            built-in test sets (JSON)
firebase.json, .firebaserc (default: route-lab-f50dc), firestore.rules, firestore.indexes.json
LICENSE (Apache-2.0), README.md (stub), .gitignore, .env.example
```

Use React Router for the console. Keep styling simple: one CSS file with variables, no UI framework needed (polish is Day 6). Hosting config in `firebase.json` with two targets (`console`, `demo`) but do not create sites or deploy.

### 4. Tasks, in order (commit + push after each)

**T1 — Scaffold.** Everything in section 3, `npm install`, root scripts `build`, `test`, `lint`, `dev:console`, `dev:demo`, `publisher`. ESLint + Prettier. `git init`, first commit, create and push the public repo. _Done when:_ build/test/lint pass on an empty skeleton and the repo is on GitHub.

**T2 — Spike page** (`apps/console`, route `/spike`). Buttons: "Cloud call", "Device call", "Both", "Download Nano", "Health check", "Force timeout (1 ms)". Each shows output, `inferenceSource`, latency, `usageMetadata`, error. Uses structured output (JSON schema `{label: enum[allow,remove,escalate], reason: string}`). Shows `LanguageModel.availability()` and Chrome version. _Done when:_ it builds; cloud path smoke-tested from a script if possible. Device path goes on the morning checklist.

**T3 — Timeout + health check** in `packages/shared/src/adapters.ts`:

- `callWithTimeout(fn, ms)`: pass an `AbortSignal` if the SDK accepts one (check types), and always race against a timer. Outcome `timeout` on expiry.
- `healthCheck()`: tiny device prompt ("Reply with OK"), 15 s limit → `healthy | unhealthy | unavailable`.
- Document clearly: a timeout frees the page but **does not un-wedge Nano**; after a wedge only a Chrome restart helps.

**T4 — Engine** (`packages/engine`), fully unit-tested with fake adapters:

- `runner.ts`: device calls sequential with per-call timeout; health check before the run and after any timeout; if unhealthy, mark remaining device cases `skipped_unhealthy` and record `deviceEvaluated: n of N`. Cloud calls concurrency 4 with **exponential backoff on 429/RESOURCE_EXHAUSTED** (max 5 tries); if still failing, outcome `rate_limited` — never counted as a wrong answer. Emits progress events. Supports cancel.
- `graders.ts`: `exact`, `enum` (case-insensitive), `contains` (all keywords), `jsonSchemaValid`, `regex`, `refusal` detector. `llmJudge` = typed stub that throws "not implemented".
- `metrics.ts`: per route — evaluated count, accuracy, refusal rate, schema-fail rate, timeout rate, rate-limited count, p50/p95 latency, estimated cost (token counts × price table; device = $0), accuracy by length bucket (each bucket reports n).
- `recommend.ts` (deterministic, each verdict returns plain-English reasons):
  1. Any device timeout, or device refusal rate > 10% → `ONLY_IN_CLOUD`.
  2. Fewer than 10 device cases evaluated → `ONLY_IN_CLOUD`, reason "not enough device evidence".
  3. Device accuracy ≥ threshold **and** ≥ cloud accuracy − 5 pts → `PREFER_ON_DEVICE`.
  4. Else a length cutoff where every bucket below it has n ≥ 8 and meets rule 3 → `PREFER_ON_DEVICE` + `maxDeviceChars`.
  5. Else `ONLY_IN_CLOUD`.
- _Done when:_ ≥ 30 meaningful tests, all green, covering each rule, the wedge path, 429 retry, and cancel.

**T5 — Datasets** (`tools/datasets`, outputs to `datasets/`):

- `moderation.civil.json`: from `https://datasets-server.huggingface.co/rows?dataset=google/civil_comments&config=default&split=test&offset=<n>&length=100`. Collect ~40 toxic (toxicity ≥ 0.8, expected `remove`), ~20 borderline (0.4–0.6, expected `escalate`), ~40 clean (0.0, expected `allow`). Keep source row index for each. Max ~60 requests, 1 s apart. Check the dataset licence on its Hugging Face page and record it in the Decisions log. Add a content warning in the file header field.
- `summary.recipes.json` (~25 short recipe texts you write, varied lengths 200–3000 chars, with expected keywords) and `extraction.recipes.json` (~20 recipe texts → expected `{ingredients[], totalMinutes}`). Original text only.
- The console must also be able to fetch Civil Comments live; the JSON is the fallback.

**T6 — Console screens:** anonymous auth on load; Projects list → Project → Features (create/edit: name, system prompt, user template with `{{input}}`, output schema, grader, threshold) → Test sets (paste one per line, or load a built-in set) → Run screen (live progress, per-case rows, device-unhealthy "Restart Chrome" banner, cancel) → Report screen (device vs cloud metrics side by side with n, verdict + reasons, accuracy-by-length table, filterable failures table with exact input/output). Environment panel: Chrome version, Nano availability, Download Nano, health check. Results saved to Firestore with batched writes. Empty, loading and error states for each screen (plain is fine). Seed button: "Load sample features" creates Moderation + Recipe summary features with their datasets.

**T7 — Local publisher + Apply:**

- `tools/publisher`: plain Node `http` server bound to **127.0.0.1:8787**. Uses `firebase-admin` with `GOOGLE_APPLICATION_CREDENTIALS` (read from `tools/publisher/.env`, which is gitignored; ship `.env.example` with `GOOGLE_APPLICATION_CREDENTIALS=C:\Hackathon projects\routelab-sa.json`). CORS allow only `http://localhost:*` and `http://127.0.0.1:*`. Endpoints: `GET /health`, `POST /validate` (builds the template and calls `validateTemplate`, never publishes), `POST /publish` (get template → set/replace `routing_<key>` → publish with ETag). Validate the payload against the shared schema.
- **Tonight you may run `/health` and `/validate` only. Do not call `/publish`.**
- Console **Apply** button on the Report screen: shows the exact JSON that will be published, then calls the publisher. If the publisher is not reachable, explain how to start it (`npm run publisher`) instead of failing. Records `appliedAt` + payload on the run doc.

**T8 — Demo app "Kitchen Table"** (`apps/demo`): a few seeded recipes with comment threads. Two features: comment moderation (on submit) and recipe summary (button). Each reads `routing_<key>` from Remote Config (`fetchAndActivate`, `minimumFetchIntervalMillis: 0` in dev, plus `onConfigUpdate` real-time if the web SDK types have it — check), builds the AI Logic model with that mode, applies `maxDeviceChars` (long input → cloud) and `deviceTimeoutMs`. **On device timeout: retry in the cloud and stop using the device for the rest of the session** (circuit breaker, visible in UI). Badge per result ("on-device" / "cloud" from `inferenceSource`), running estimated cost counter, a "Routing" panel showing the current config and `evidenceRunId`, and a "Refresh routing" button.

**T9 — README stub:** what it is, how to run each app and the publisher, App Check debug-token note for judges, links to the files that import `firebase/ai`. Short; Day 7 rewrites it.

If you run out of time, stop in this order of priority: T1–T4 must be finished; then T7, T8, T6, T5, T9.

### 5. Before you stop

1. Final `npm run build && npm test && npm run lint`, commit, push.
2. Write **`MORNING.md`** in the repo root:
   - **Done** — each task with status and commit hash.
   - **Morning checklist for the human**, in order, each step with the exact command and what they should see. Must include: start console (`npm run dev:console`), open `/spike`, Cloud call, Device call, Force timeout, Health check; register reCAPTCHA v3 key and App Check (exact console clicks); copy `.env.example` files; start the publisher, `/health`; run Load sample features → small moderation run; Apply (the first real Remote Config publish — human does it); start demo app and see routing change.
   - **Questions** that need the human.
   - **Known problems / stubs.**
3. Update `HANDOFF.md`: Status table and Decisions log (append with dates).
