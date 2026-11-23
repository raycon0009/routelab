import { describe, it, expect } from 'vitest';
import { ENGINE_VERSION } from './index';
describe('skeleton', () => {
  it('exports a version', () => {
    expect(ENGINE_VERSION).toBeTruthy();
  });
});
