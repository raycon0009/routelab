import { callWithTimeout } from '@routelab/engine';
import { chooseRoute, type RoutingConfig } from './routing';
import type { ModelResponse } from '@routelab/engine';
import type { SdkMode } from './adapters';

export interface RoutedResult {
  response: ModelResponse;
  /** Where the answer actually came from (from inferenceSource when the SDK reports it). */
  servedBy: 'on-device' | 'cloud';
  /** True when the device timed out on this call and we retried in the cloud. */
  fellBackAfterTimeout: boolean;
  /** Why this route was chosen (shown in the UI). */
  reason: string;
}

export interface Breaker {
  deviceDisabled: boolean;
}

export type GenerateFn = (mode: SdkMode, input: string, signal: AbortSignal) => Promise<ModelResponse>;

export function servedByOf(inferenceSource: string | undefined, fallback: 'on-device' | 'cloud') {
  if (inferenceSource === 'on_device') return 'on-device' as const;
  if (inferenceSource === 'in_cloud') return 'cloud' as const;
  return fallback;
}

/**
 * Applies a routing config to one input:
 *  - long input (> maxDeviceChars) -> cloud
 *  - device timeout -> retry in the cloud and trip the circuit breaker (device unused for the session)
 */
export async function routedGenerate(
  routing: RoutingConfig,
  input: string,
  breaker: Breaker,
  generate: GenerateFn,
): Promise<RoutedResult> {
  const route = chooseRoute(routing, input.length, breaker.deviceDisabled);
  if (route === 'cloud') {
    const reason = breaker.deviceDisabled
      ? 'device disabled for this session (earlier timeout)'
      : routing.mode === 'ONLY_IN_CLOUD'
        ? 'routing says cloud only'
        : `input is ${input.length} chars, over the ${routing.maxDeviceChars}-char device limit`;
    const response = await callWithTimeout((s) => generate('ONLY_IN_CLOUD', input, s), 60_000);
    return { response, servedBy: servedByOf(response.inferenceSource, 'cloud'), fellBackAfterTimeout: false, reason };
  }
  try {
    const response = await callWithTimeout((s) => generate(routing.mode as SdkMode, input, s), routing.deviceTimeoutMs);
    return {
      response,
      servedBy: servedByOf(response.inferenceSource, routing.mode === 'PREFER_IN_CLOUD' ? 'cloud' : 'on-device'),
      fellBackAfterTimeout: false,
      reason: `mode ${routing.mode}`,
    };
  } catch (e) {
    if ((e as Error)?.name !== 'TimeoutError') throw e;
    breaker.deviceDisabled = true;
    const response = await callWithTimeout((s) => generate('ONLY_IN_CLOUD', input, s), 60_000);
    return {
      response,
      servedBy: servedByOf(response.inferenceSource, 'cloud'),
      fellBackAfterTimeout: true,
      reason: `device timed out after ${routing.deviceTimeoutMs} ms; retried in cloud and device is now off`,
    };
  }
}
