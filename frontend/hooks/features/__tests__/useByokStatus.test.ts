import { describe, it, expect } from 'vitest';
import { deriveByokStage } from '../useByokStatus';

describe('deriveByokStage', () => {
  it('null status → null', () => {
    expect(deriveByokStage(null)).toBeNull();
  });

  it('no key configured → needs_key', () => {
    expect(
      deriveByokStage({
        configured: false,
        activeProviders: [],
        hasModelConfig: false,
      })
    ).toBe('needs_key');
  });

  it('key configured but no model → needs_model (the stuck-after-key gap)', () => {
    expect(
      deriveByokStage({
        configured: true,
        activeProviders: ['openai'],
        hasModelConfig: false,
      })
    ).toBe('needs_model');
  });

  it('key + model → ready', () => {
    expect(
      deriveByokStage({
        configured: true,
        activeProviders: ['openai'],
        hasModelConfig: true,
      })
    ).toBe('ready');
  });
});
