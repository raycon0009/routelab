import type { RoutingMode } from '@routelab/engine';
import { CLOUD_MODEL, DEFAULT_DEVICE_TIMEOUT_MS } from './config';

export const ROUTING_MODES: RoutingMode[] = [
  'PREFER_ON_DEVICE',
  'ONLY_IN_CLOUD',
  'PREFER_IN_CLOUD',
  'ONLY_ON_DEVICE',
];

/** Value of the Remote Config parameter `routing_<featureKey>` (JSON string). */
export interface RoutingConfig {
  mode: RoutingMode;
  maxDeviceChars: number | null;
  deviceTimeoutMs: number;
  cloudModel: string;
  evidenceRunId: string;
  updatedAt: string;
}

/** Lowercase [a-z0-9_] only. */
export function sanitizeFeatureKey(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return k || 'feature';
}

export const routingParamName = (featureKey: string) => `routing_${sanitizeFeatureKey(featureKey)}`;

export function defaultRouting(): RoutingConfig {
  return {
    mode: 'ONLY_IN_CLOUD',
    maxDeviceChars: null,
    deviceTimeoutMs: DEFAULT_DEVICE_TIMEOUT_MS,
    cloudModel: CLOUD_MODEL,
    evidenceRunId: '',
    updatedAt: '',
  };
}

export type ParseResult = { ok: true; value: RoutingConfig } | { ok: false; errors: string[] };

/** Validates an unknown value (already parsed JSON) against the routing schema. */
export function validateRouting(v: unknown): ParseResult {
  const errors: string[] = [];
  if (!v || typeof v !== 'object' || Array.isArray(v))
    return { ok: false, errors: ['not an object'] };
  const o = v as Record<string, unknown>;
  if (!ROUTING_MODES.includes(o.mode as RoutingMode))
    errors.push('mode must be one of ' + ROUTING_MODES.join(', '));
  if (!(
    o.maxDeviceChars === null ||
    (Number.isInteger(o.maxDeviceChars) && (o.maxDeviceChars as number) > 0)
  ))
    errors.push('maxDeviceChars must be null or a positive integer');
  if (!(Number.isInteger(o.deviceTimeoutMs) && (o.deviceTimeoutMs as number) > 0))
    errors.push('deviceTimeoutMs must be a positive integer');
  if (typeof o.cloudModel !== 'string' || !o.cloudModel)
    errors.push('cloudModel must be a non-empty string');
  if (typeof o.evidenceRunId !== 'string') errors.push('evidenceRunId must be a string');
  if (
    typeof o.updatedAt !== 'string' ||
    (o.updatedAt !== '' && Number.isNaN(Date.parse(o.updatedAt)))
  )
    errors.push('updatedAt must be an ISO date string');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      mode: o.mode as RoutingMode,
      maxDeviceChars: o.maxDeviceChars as number | null,
      deviceTimeoutMs: o.deviceTimeoutMs as number,
      cloudModel: o.cloudModel as string,
      evidenceRunId: o.evidenceRunId as string,
      updatedAt: o.updatedAt as string,
    },
  };
}

/** Parses the Remote Config string value. Never throws. */
export function parseRouting(raw: string): ParseResult {
  try {
    return validateRouting(JSON.parse(raw));
  } catch {
    return { ok: false, errors: ['not valid JSON'] };
  }
}

export function serializeRouting(r: RoutingConfig): string {
  return JSON.stringify(r);
}

/** Decide which route an input should take given a routing config and circuit-breaker state. */
export function chooseRoute(
  r: RoutingConfig,
  inputChars: number,
  deviceDisabled: boolean,
): 'device-first' | 'cloud' {
  if (deviceDisabled) return 'cloud';
  if (r.mode === 'ONLY_IN_CLOUD') return 'cloud';
  if (r.maxDeviceChars !== null && inputChars > r.maxDeviceChars) return 'cloud';
  return 'device-first';
}
