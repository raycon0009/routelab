import { describe, it, expect, vi } from 'vitest';
import {
  corsOriginAllowed,
  parsePayload,
  publish,
  validate,
  withRoutingParam,
  type RcApi,
} from './handlers';
import { defaultRouting } from '../../../packages/shared/src/routing';

const routing = {
  ...defaultRouting(),
  mode: 'PREFER_ON_DEVICE' as const,
  updatedAt: '2026-11-25T00:00:00.000Z',
};
const fakeApi = (): RcApi & { published: unknown[] } => {
  const published: unknown[] = [];
  return {
    published,
    getTemplate: async () => ({
      etag: 'e1',
      parameters: { routing_test: { defaultValue: { value: 'hello' } } },
    }),
    validateTemplate: async (t) => t,
    publishTemplate: vi.fn(async (t) => (published.push(t), { ...t, etag: 'e2' })),
  };
};

describe('publisher handlers', () => {
  it('rejects bad payloads', () => {
    expect(parsePayload(null).ok).toBe(false);
    expect(parsePayload({ featureKey: 'x', routing: { mode: 'NOPE' } }).ok).toBe(false);
    expect(parsePayload({ routing }).ok).toBe(false);
  });
  it('accepts a valid payload', () =>
    expect(parsePayload({ featureKey: 'moderation', routing }).ok).toBe(true));
  it('adds a JSON-typed parameter and keeps the others and the etag', () => {
    const t = withRoutingParam(
      { etag: 'e1', parameters: { a: 1 } },
      { featureKey: 'Comment Moderation', routing },
    );
    expect(t.etag).toBe('e1');
    expect(t.parameters.a).toBe(1);
    const p = t.parameters.routing_comment_moderation as {
      valueType: string;
      defaultValue: { value: string };
    };
    expect(p.valueType).toBe('JSON');
    expect(JSON.parse(p.defaultValue.value)).toEqual(routing);
  });
  it('validate never publishes', async () => {
    const api = fakeApi();
    await validate(api, { featureKey: 'm', routing });
    expect(api.publishTemplate).not.toHaveBeenCalled();
  });
  it('publish sends the merged template', async () => {
    const api = fakeApi();
    const r = await publish(api, { featureKey: 'm', routing });
    expect(r.etag).toBe('e2');
    expect(Object.keys((api.published[0] as { parameters: object }).parameters)).toEqual([
      'routing_test',
      'routing_m',
    ]);
  });
  it('CORS only for localhost origins', () => {
    expect(corsOriginAllowed('http://localhost:5173')).toBe(true);
    expect(corsOriginAllowed('http://127.0.0.1:5174')).toBe(true);
    expect(corsOriginAllowed('https://evil.example')).toBe(false);
    expect(corsOriginAllowed('http://localhost.evil.com')).toBe(false);
    expect(corsOriginAllowed(undefined)).toBe(false);
  });
});

describe('real template objects', () => {
  it('keeps etag when it is a prototype getter (firebase-admin class)', () => {
    class T {
      parameters = {};
      get etag() {
        return 'abc';
      }
    }
    const t = withRoutingParam(new T() as never, { featureKey: 'm', routing });
    expect(t.etag).toBe('abc');
  });
});
