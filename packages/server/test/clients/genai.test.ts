import { beforeEach, describe, expect, it, vi } from 'vitest';

const assertGeminiApiKeyMock = vi.fn();
const googleGenAiConstructor = vi.fn();

class FakeGoogleGenAI {
  constructor(options: unknown) {
    googleGenAiConstructor(options);
  }
}

vi.mock('@google/genai', () => ({
  GoogleGenAI: FakeGoogleGenAI,
}));

vi.mock('../../src/config/env', () => ({
  assertGeminiApiKey: assertGeminiApiKeyMock,
  env: {
    defaultModel: 'test-model',
    geminiApiKey: 'key',
    fileSearchStoreId: 'stores/test',
  },
}));

describe('getGenAiClient', () => {
  beforeEach(() => {
    vi.resetModules();
    assertGeminiApiKeyMock.mockReset();
    googleGenAiConstructor.mockReset();
  });

  it('creates a singleton GoogleGenAI client using the Gemini API key', async () => {
    assertGeminiApiKeyMock.mockReturnValue('api-key');

    const { getGenAiClient } = await import('../../src/clients/genai');

    const first = getGenAiClient();
    const second = getGenAiClient();

    expect(first).toBe(second);
    expect(assertGeminiApiKeyMock).toHaveBeenCalledTimes(1);
    expect(googleGenAiConstructor).toHaveBeenCalledTimes(1);
    expect(googleGenAiConstructor).toHaveBeenCalledWith({
      apiKey: 'api-key',
      apiVersion: 'v1beta',
    });
  });

  it('bubbles up errors from assertGeminiApiKey', async () => {
    assertGeminiApiKeyMock.mockImplementation(() => {
      throw new Error('missing key');
    });

    const { getGenAiClient } = await import('../../src/clients/genai');

    expect(() => getGenAiClient()).toThrowError(/missing key/);
    expect(googleGenAiConstructor).not.toHaveBeenCalled();
  });
});


