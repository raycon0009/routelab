import { describe, it, expect } from 'vitest';
import {
  chooseRoute,
  defaultRouting,
  parseRouting,
  routingParamName,
  sanitizeFeatureKey,
  serializeRouting,
} from './routing';

describe('routing', () => {
  it('sanitises keys', () => {
    expect(sanitizeFeatureKey('Comment Moderation!')).toBe('comment_moderation');
    expect(sanitizeFeatureKey('###')).toBe('feature');
    expect(routingParamName('Recipe Summary')).toBe('routing_recipe_summary');
  });
  it('round-trips a valid config', () => {
    const r = {
      ...defaultRouting(),
      mode: 'PREFER_ON_DEVICE' as const,
      maxDeviceChars: 1200,
      updatedAt: new Date().toISOString(),
    };
    const p = parseRouting(serializeRouting(r));
    expect(p).toEqual({ ok: true, value: r });
  });
  it('accepts null maxDeviceChars', () => {
    expect(parseRouting(serializeRouting(defaultRouting())).ok).toBe(true);
  });
  it('rejects bad JSON, bad mode and bad numbers', () => {
    expect(parseRouting('{').ok).toBe(false);
    expect(parseRouting(JSON.stringify({ ...defaultRouting(), mode: 'X' })).ok).toBe(false);
    expect(parseRouting(JSON.stringify({ ...defaultRouting(), deviceTimeoutMs: -1 })).ok).toBe(
      false,
    );
    expect(parseRouting(JSON.stringify({ ...defaultRouting(), maxDeviceChars: 1.5 })).ok).toBe(
      false,
    );
  });
  it('chooseRoute honours mode, length cutoff and circuit breaker', () => {
    const r = { ...defaultRouting(), mode: 'PREFER_ON_DEVICE' as const, maxDeviceChars: 100 };
    expect(chooseRoute(r, 50, false)).toBe('device-first');
    expect(chooseRoute(r, 101, false)).toBe('cloud');
    expect(chooseRoute(r, 50, true)).toBe('cloud');
    expect(chooseRoute({ ...r, mode: 'ONLY_IN_CLOUD' }, 5, false)).toBe('cloud');
  });
});
