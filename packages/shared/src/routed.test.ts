import { describe, it, expect } from 'vitest';
import { routedGenerate, type GenerateFn } from './routed';
import { defaultRouting } from './routing';

const r = { ...defaultRouting(), mode: 'PREFER_ON_DEVICE' as const, maxDeviceChars: 20, deviceTimeoutMs: 20 };
const resp = (src: string) => ({ text: 'x', inferenceSource: src });

describe('routedGenerate', () => {
  it('short input uses the configured device-first mode', async () => {
    const modes: string[] = [];
    const g: GenerateFn = async (m) => (modes.push(m), resp('on_device'));
    const out = await routedGenerate(r, 'short', { deviceDisabled: false }, g);
    expect(modes).toEqual(['PREFER_ON_DEVICE']);
    expect(out.servedBy).toBe('on-device');
  });
  it('long input goes to the cloud', async () => {
    const modes: string[] = [];
    const g: GenerateFn = async (m) => (modes.push(m), resp('in_cloud'));
    const out = await routedGenerate(r, 'x'.repeat(21), { deviceDisabled: false }, g);
    expect(modes).toEqual(['ONLY_IN_CLOUD']);
    expect(out.servedBy).toBe('cloud');
    expect(out.reason).toContain('over the 20-char');
  });
  it('device timeout retries in cloud and trips the breaker', async () => {
    const breaker = { deviceDisabled: false };
    const modes: string[] = [];
    const g: GenerateFn = (m) => {
      modes.push(m);
      return m === 'ONLY_IN_CLOUD' ? Promise.resolve(resp('in_cloud')) : new Promise(() => {});
    };
    const out = await routedGenerate(r, 'short', breaker, g);
    expect(out.fellBackAfterTimeout).toBe(true);
    expect(breaker.deviceDisabled).toBe(true);
    expect(modes).toEqual(['PREFER_ON_DEVICE', 'ONLY_IN_CLOUD']);
    const out2 = await routedGenerate(r, 'short', breaker, g);
    expect(out2.reason).toContain('disabled');
    expect(modes.at(-1)).toBe('ONLY_IN_CLOUD');
  });
  it('non-timeout errors propagate', async () => {
    const g: GenerateFn = async () => {
      throw new Error('boom');
    };
    await expect(routedGenerate(r, 'short', { deviceDisabled: false }, g)).rejects.toThrow('boom');
  });
  it('ONLY_IN_CLOUD config never touches the device', async () => {
    const modes: string[] = [];
    const g: GenerateFn = async (m) => (modes.push(m), resp('in_cloud'));
    await routedGenerate({ ...r, mode: 'ONLY_IN_CLOUD' }, 'hi', { deviceDisabled: false }, g);
    expect(modes).toEqual(['ONLY_IN_CLOUD']);
  });
});
