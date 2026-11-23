/**
 * Cloud model used for every cloud call.
 * Source: https://firebase.google.com/docs/ai-logic/models — listed as "billing not required"
 * for the Gemini Developer API (checked 24 Nov 2026).
 */
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';

export const DEFAULT_DEVICE_TIMEOUT_MS = 20_000;
export const HEALTH_CHECK_TIMEOUT_MS = 15_000;
