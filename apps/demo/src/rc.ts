import {
  activate,
  fetchAndActivate,
  getRemoteConfig,
  getValue,
  onConfigUpdate,
  type RemoteConfig,
} from 'firebase/remote-config';
import type { FirebaseApp } from 'firebase/app';
import {
  defaultRouting,
  parseRouting,
  routingParamName,
  serializeRouting,
  type RoutingConfig,
} from '@routelab/shared';

export interface RoutingState {
  config: RoutingConfig;
  source: 'remote' | 'default' | 'static' | 'invalid';
  errors?: string[];
}

export function createRemoteConfig(app: FirebaseApp, featureKeys: string[]): RemoteConfig {
  const rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = 0; // demo: always fetch on refresh
  rc.defaultConfig = Object.fromEntries(
    featureKeys.map((k) => [routingParamName(k), serializeRouting(defaultRouting())]),
  );
  return rc;
}

export function readRouting(rc: RemoteConfig, featureKey: string): RoutingState {
  const v = getValue(rc, routingParamName(featureKey));
  const parsed = parseRouting(v.asString());
  if (!parsed.ok) return { config: defaultRouting(), source: 'invalid', errors: parsed.errors };
  return { config: parsed.value, source: v.getSource() };
}

export async function refresh(rc: RemoteConfig): Promise<void> {
  await fetchAndActivate(rc);
}

/** Real-time updates (SDK 12.x has onConfigUpdate on web). Returns an unsubscribe function. */
export function subscribe(
  rc: RemoteConfig,
  onChange: () => void,
  onError: (e: Error) => void,
): () => void {
  return onConfigUpdate(rc, {
    next: () => {
      activate(rc).then(onChange, onError);
    },
    error: (e) => onError(e),
    complete: () => {},
  });
}
