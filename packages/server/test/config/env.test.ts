import { describe, expect, it, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('env configuration', () => {
  it('derives gemini api key and other defaults from process env', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'secret-key');
    vi.stubEnv('GEMINI_FILE_SEARCH_STORE_ID', 'stores/123');
    vi.stubEnv('GEMINI_MODEL', 'custom-model');

    const { env, assertGeminiApiKey } = await import('../../src/config/env');

    expect(env).toMatchObject({
      geminiApiKey: 'secret-key',
      fileSearchStoreId: 'stores/123',
      defaultModel: 'custom-model',
    });
    expect(assertGeminiApiKey()).toBe('secret-key');
  });

  it('throws when no gemini api key is available', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('VERCEL_GEMINI_API_KEY', '');

    const { assertGeminiApiKey } = await import('../../src/config/env');

    expect(() => assertGeminiApiKey()).toThrow(/GEMINI_API_KEY is required/);
  });
});


