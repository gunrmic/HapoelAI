import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.fn();

class FakeGoogleGenAI {
  fileSearchStores = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    uploadToFileSearchStore: vi.fn(),
    importFile: vi.fn(),
    documents: {
      list: vi.fn(),
    },
  };

  models = {
    generateContent: generateContentMock,
  };

  constructor(public options: { apiKey: string; apiVersion?: string }) {}
}

vi.mock('@google/genai', () => ({
  GoogleGenAI: FakeGoogleGenAI,
}));

const assertGeminiApiKeyMock = vi.fn();
const mockedEnv = {
  geminiApiKey: 'integration-key',
  defaultModel: 'gemini-2.5-flash',
  fileSearchStoreId: 'stores/default',
};

vi.mock('../../src/config/env', () => ({
  assertGeminiApiKey: assertGeminiApiKeyMock,
  env: mockedEnv,
}));

describe('answerQuestion integration', () => {
  beforeEach(() => {
    vi.resetModules();
    generateContentMock.mockReset();
    assertGeminiApiKeyMock.mockReset();
  });

  it('returns trimmed answers and normalized citations using the Gemini client', async () => {
    assertGeminiApiKeyMock.mockReturnValue('integration-key');

    generateContentMock.mockResolvedValue({
      text: ' Hapoel won the match. ',
      candidates: [
        {
          index: 0,
          citationMetadata: {
            citations: [
              {
                uri: 'https://example.com/report',
                title: 'Match Report',
                startIndex: 0,
                endIndex: 42,
              },
            ],
          },
          groundingMetadata: {
            groundingChunks: [
              {
                retrievedContext: {
                  uri: 'https://example.com/context',
                  title: 'Official Recap',
                  text: 'Detailed recap of the final.',
                },
              },
            ],
            groundingSupports: [
              {
                groundingChunkIndices: [0],
                segment: {
                  startIndex: 10,
                  endIndex: 20,
                  text: 'Recap segment',
                },
                confidenceScores: [0.88],
              },
            ],
          },
        },
      ],
    });

    const { answerQuestion } = await import('../../src/agent/fileSearchAgent');

    const result = await answerQuestion('  Who won the final?  ');

    expect(assertGeminiApiKeyMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Who won the final?' }],
        },
      ],
      config: expect.objectContaining({
        tools: [
          expect.objectContaining({
            fileSearch: expect.objectContaining({
              fileSearchStoreNames: ['stores/default'],
            }),
          }),
        ],
      }),
    });

    expect(result.answer).toBe('Hapoel won the match.');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({
      label: 1,
      uri: 'https://example.com/report',
      title: 'Match Report',
      text: 'Detailed recap of the final.',
    });
    expect(result.raw?.text).toBeDefined();
  });

  it('propagates errors from Gemini as thrown errors', async () => {
    assertGeminiApiKeyMock.mockReturnValue('integration-key');
    generateContentMock.mockRejectedValue(new Error('Gemini unavailable'));

    const { answerQuestion } = await import('../../src/agent/fileSearchAgent');

    await expect(answerQuestion('Will it rain?')).rejects.toThrow(/Gemini unavailable/);
  });
});


