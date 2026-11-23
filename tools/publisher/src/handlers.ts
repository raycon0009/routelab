import {
  routingParamName,
  validateRouting,
  type RoutingConfig,
} from '../../../packages/shared/src/routing';

/** The slice of firebase-admin's RemoteConfig we use; lets tests fake it. */
export interface RcTemplate {
  etag?: string;
  version?: unknown;
  parameters: Record<string, unknown>;
  [k: string]: unknown;
}
export interface RcApi {
  getTemplate(): Promise<RcTemplate>;
  validateTemplate(t: RcTemplate): Promise<RcTemplate>;
  publishTemplate(t: RcTemplate): Promise<RcTemplate>;
}

export interface PublishPayload {
  featureKey: string;
  routing: RoutingConfig;
}

export function parsePayload(
  body: unknown,
): { ok: true; value: PublishPayload } | { ok: false; errors: string[] } {
  if (!body || typeof body !== 'object')
    return { ok: false, errors: ['body must be a JSON object'] };
  const b = body as Record<string, unknown>;
  if (typeof b.featureKey !== 'string' || !b.featureKey)
    return { ok: false, errors: ['featureKey required'] };
  const r = validateRouting(b.routing);
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, value: { featureKey: b.featureKey, routing: r.value } };
}

/** Adds/replaces the routing_<key> parameter in a copy of the template (JSON type, valid JSON only). */
export function withRoutingParam(template: RcTemplate, p: PublishPayload): RcTemplate {
  const name = routingParamName(p.featureKey);
  return {
    ...template,
    etag: template.etag,
    version: template.version,
    parameters: {
      ...template.parameters,
      [name]: {
        defaultValue: { value: JSON.stringify(p.routing) },
        valueType: 'JSON',
        description: 'Managed by RouteLab',
      },
    },
  };
}

export async function validate(api: RcApi, p: PublishPayload) {
  const t = withRoutingParam(await api.getTemplate(), p);
  await api.validateTemplate(t);
  return { ok: true, param: routingParamName(p.featureKey), value: p.routing };
}

export async function publish(api: RcApi, p: PublishPayload) {
  const t = withRoutingParam(await api.getTemplate(), p); // keeps the ETag from getTemplate
  const out = await api.publishTemplate(t);
  return { ok: true, param: routingParamName(p.featureKey), etag: out.etag ?? null };
}

export function corsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
