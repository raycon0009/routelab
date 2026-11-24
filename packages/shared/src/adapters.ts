import {
  GoogleAIBackend,
  InferenceMode,
  getAI,
  getGenerativeModel,
  type AI,
  type GenerativeModel,
} from 'firebase/ai';
import type { FirebaseApp } from 'firebase/app';
import {
  callWithTimeout,
  type CallOptions,
  type HealthStatus,
  type JsonSchema,
  type ModelAdapter,
  type ModelResponse,
  type Route,
} from '@routelab/engine';
import { CLOUD_MODEL, DEVICE_WARMUP_TIMEOUT_MS, HEALTH_CHECK_TIMEOUT_MS } from './config';

/** True once a device call has succeeded in this page, i.e. Nano is loaded in memory. */
let deviceWarm = false;
export const isDeviceWarm = () => deviceWarm;

/**
 * Timeouts: `callWithTimeout` passes an AbortSignal AND races a timer. A timeout frees the page
 * but does NOT un-wedge Gemini Nano. After a wedge only a Chrome restart helps.
 * (Per @firebase/ai 2.16: the per-call `signal`/`timeout` only reach the CLOUD request; the
 * on-device path ignores them, so the timer race is what actually protects us on device.)
 */
export { callWithTimeout };

export const ENGLISH_ONLY = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

export type DeviceAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelGlobal {
  availability(opts?: unknown): Promise<DeviceAvailability>;
}

export function getLanguageModel(): LanguageModelGlobal | undefined {
  return (globalThis as unknown as { LanguageModel?: LanguageModelGlobal }).LanguageModel;
}

/** Direct Prompt API check (AI Logic exposes no public availability helper). */
export async function getDeviceAvailability(): Promise<DeviceAvailability> {
  const lm = getLanguageModel();
  if (!lm) return 'unavailable';
  try {
    return await lm.availability(ENGLISH_ONLY);
  } catch {
    return 'unavailable';
  }
}

export function chromeVersion(): string {
  const m = /Chrome\/(\d+[\d.]*)/.exec(typeof navigator === 'undefined' ? '' : navigator.userAgent);
  return m?.[1] ?? 'unknown';
}

export interface FeaturePrompt {
  systemPrompt: string;
  /** Contains `{{input}}`. */
  userTemplate: string;
  /** JSON schema for structured output (plain JSON schema object). */
  outputSchema?: JsonSchema;
}

export const buildUserPrompt = (template: string, input: string) =>
  template.includes('{{input}}')
    ? template.split('{{input}}').join(input)
    : `${template}\n\n${input}`;

export type SdkMode = 'PREFER_ON_DEVICE' | 'ONLY_ON_DEVICE' | 'ONLY_IN_CLOUD' | 'PREFER_IN_CLOUD';

export function createAI(app: FirebaseApp, opts: { limitedUseAppCheck?: boolean } = {}): AI {
  return getAI(app, {
    backend: new GoogleAIBackend(),
    useLimitedUseAppCheckTokens: opts.limitedUseAppCheck,
  });
}

/** Builds a hybrid model. On-device gets the system prompt and schema through its own params. */
export function buildModel(
  ai: AI,
  mode: SdkMode,
  feature: FeaturePrompt,
  opts: { cloudModel?: string; timeoutMs?: number } = {},
): GenerativeModel {
  const schema = feature.outputSchema as unknown as Record<string, unknown> | undefined;
  return getGenerativeModel(
    ai,
    {
      mode: InferenceMode[mode],
      inCloudParams: {
        model: opts.cloudModel ?? CLOUD_MODEL,
        systemInstruction: feature.systemPrompt,
        generationConfig: schema
          ? { responseMimeType: 'application/json', responseJsonSchema: schema }
          : undefined,
      },
      onDeviceParams: {
        createOptions: {
          ...ENGLISH_ONLY,
          initialPrompts: [
            { role: 'system', content: [{ type: 'text', value: feature.systemPrompt }] },
          ],
        },
        promptOptions: schema ? { responseConstraint: schema } : undefined,
      },
    },
    opts.timeoutMs ? { timeout: opts.timeoutMs } : undefined,
  );
}

export async function generate(
  model: GenerativeModel,
  prompt: string,
  signal?: AbortSignal,
  timeout?: number,
): Promise<ModelResponse> {
  const { response } = await model.generateContent(prompt, { signal, timeout });
  if (String(response.inferenceSource) === 'on_device') deviceWarm = true;
  return {
    text: response.text(),
    inferenceSource: response.inferenceSource,
    usage: response.usageMetadata
      ? {
          promptTokens: response.usageMetadata.promptTokenCount,
          outputTokens: response.usageMetadata.candidatesTokenCount,
        }
      : undefined,
  };
}

/** Starts the Nano download. Must run on a user gesture (button click). */
export async function downloadNano(ai: AI, onProgress?: (fraction: number) => void): Promise<void> {
  const model = buildModel(ai, 'ONLY_ON_DEVICE', {
    systemPrompt: 'Reply briefly.',
    userTemplate: '{{input}}',
  });
  await model.initializeDeviceModel(onProgress);
}

/** Real adapter used by the console: one forced model per route. */
export function createModelAdapter(
  ai: AI,
  feature: FeaturePrompt,
  opts: { cloudModel?: string } = {},
): ModelAdapter {
  const models: Partial<Record<Route, GenerativeModel>> = {};
  const get = (route: Route) =>
    (models[route] ??= buildModel(
      ai,
      route === 'device' ? 'ONLY_ON_DEVICE' : 'ONLY_IN_CLOUD',
      feature,
      opts,
    ));
  return {
    call: (route: Route, input: string, o: CallOptions) =>
      generate(
        get(route),
        buildUserPrompt(feature.userTemplate, input),
        o.signal,
        route === 'cloud' ? o.timeoutMs : undefined,
      ),
    healthCheck: () => healthCheck(ai),
  };
}

/**
 * Tiny device prompt. `unavailable` when Nano is not present at all.
 * The first check in a page doubles as the warm-up and gets DEVICE_WARMUP_TIMEOUT_MS, because a
 * cold Nano needs ~24 s to load; later checks use the normal 15 s limit.
 */
export async function healthCheck(ai: AI, timeoutMs?: number): Promise<HealthStatus> {
  const availability = await getDeviceAvailability();
  if (availability !== 'available') return 'unavailable';
  const limit = timeoutMs ?? (deviceWarm ? HEALTH_CHECK_TIMEOUT_MS : DEVICE_WARMUP_TIMEOUT_MS);
  try {
    const model = buildModel(ai, 'ONLY_ON_DEVICE', {
      systemPrompt: 'Follow the instruction.',
      userTemplate: '{{input}}',
    });
    const r = await callWithTimeout((signal) => generate(model, 'Reply with OK', signal), limit);
    const ok = r.text.trim().length > 0;
    if (ok) deviceWarm = true;
    return ok ? 'healthy' : 'unhealthy';
  } catch {
    return 'unhealthy';
  }
}
