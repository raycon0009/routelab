/**
 * Cloud model used for every cloud call.
 * Source: https://firebase.google.com/docs/ai-logic/models — listed as "billing not required"
 * for the Gemini Developer API (checked 24 Nov 2026).
 */
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';

export const DEFAULT_DEVICE_TIMEOUT_MS = 20_000;
export const HEALTH_CHECK_TIMEOUT_MS = 15_000;
/**
 * The first Nano call in a page (and after Chrome unloads an idle model) loads the model:
 * measured 25 Nov on the dev PC (Chrome 158, perf class Medium) at ~24 s (create 10 s + first
 * prompt 14 s), both after a Chrome restart and after a page reload. Warm calls take 0.5–6 s.
 * So the first device call in a page gets this longer limit.
 */
export const DEVICE_WARMUP_TIMEOUT_MS = 90_000;
