import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadFileToStoreParams } from '../../src/types/fileSearch';

const createStoreMock = vi.fn();
const getStoreMock = vi.fn();
const listStoresMock = vi.fn();
const uploadMock = vi.fn();
const importMock = vi.fn();
const listDocumentsMock = vi.fn();
const generateContentMock = vi.fn();
const waitForOperationMock = vi.fn();
const accessMock = vi.fn();
const mockedEnv: {
  geminiApiKey?: string;
  fileSearchStoreId?: string;
  defaultModel: string;
} = {
  geminiApiKey: 'test-key',
  fileSearchStoreId: 'stores/test-store',
  defaultModel: 'test-model',
};

vi.mock('../../src/config/env', () => ({
  env: mockedEnv,
}));

vi.mock('node:fs/promises', () => ({
  default: { access: accessMock },
  access: accessMock,
}));

vi.mock('../../src/clients/genai', () => ({
  getGenAiClient: () => ({
    fileSearchStores: {
      create: createStoreMock,
      get: getStoreMock,
      list: listStoresMock,
      uploadToFileSearchStore: uploadMock,
      importFile: importMock,
      documents: {
        list: listDocumentsMock,
      },
    },
    models: {
      generateContent: generateContentMock,
    },
  }),
}));

vi.mock('../../src/utils/operations', () => ({
  waitForOperation: waitForOperationMock,
}));

import {
  createFileSearchStore,
  getFileSearchStore,
  listFileSearchStores,
  uploadFileToStore,
  listDocumentsInStore,
  importFileFromLibrary,
  queryFileSearchStore,
  normalizeCitations,
} from '../../src/services/fileSearchService';

type AsyncIterableResult<T> = AsyncIterable<T> & { [Symbol.asyncIterator](): AsyncIterator<T> };

function makeAsyncIterable<T>(items: T[]): AsyncIterableResult<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe('fileSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue(undefined);
  });

  it('creates a file search store with the provided display name', async () => {
    const store = { name: 'stores/1' };
    createStoreMock.mockResolvedValue(store);

    const result = await createFileSearchStore('New Store');

    expect(createStoreMock).toHaveBeenCalledWith({ config: { displayName: 'New Store' } });
    expect(result).toEqual(store);
  });

  it('retrieves a file search store by name', async () => {
    const store = { name: 'stores/2' };
    getStoreMock.mockResolvedValue(store);

    const result = await getFileSearchStore('stores/2');

    expect(getStoreMock).toHaveBeenCalledWith({ name: 'stores/2' });
    expect(result).toEqual(store);
  });

  it('lists all file search stores by awaiting the async iterator', async () => {
    const stores = [{ name: 'stores/1' }, { name: 'stores/2' }];
    listStoresMock.mockResolvedValue(makeAsyncIterable(stores));

    const result = await listFileSearchStores();

    expect(listStoresMock).toHaveBeenCalledWith({});
    expect(result).toEqual(stores);
  });

  it('uploads a file to a store and returns the operation when wait=false', async () => {
    const operation = { name: 'operations/1', done: false };
    uploadMock.mockResolvedValue(operation);

    const result = await uploadFileToStore({
      fileSearchStoreName: 'stores/1',
      filePath: './README.md',
      wait: false,
    });

    expect(accessMock).toHaveBeenCalled();
    expect(uploadMock).toHaveBeenCalledWith({
      fileSearchStoreName: 'stores/1',
      file: expect.stringContaining('README.md'),
      config: {
        displayName: undefined,
        mimeType: undefined,
        customMetadata: undefined,
        chunkingConfig: undefined,
      },
    });
    expect(result).toEqual(operation);
    expect(waitForOperationMock).not.toHaveBeenCalled();
  });

  it('waits for completion when wait=true', async () => {
    const operation = { name: 'operations/2', done: false };
    const completed = { name: 'operations/2', done: true, response: { status: 'ok' } };
    uploadMock.mockResolvedValue(operation);
    waitForOperationMock.mockResolvedValue(completed);

    const result = await uploadFileToStore({
      fileSearchStoreName: 'stores/1',
      filePath: './README.md',
      wait: true,
    });

    expect(waitForOperationMock).toHaveBeenCalledWith(operation, undefined);
    expect(result).toEqual(completed.response);
  });

  it('uploads a file with optional metadata and chunking config', async () => {
    const operation = { name: 'operations/with-config', done: false };
    uploadMock.mockResolvedValue(operation);
    const customMetadata = [
      { key: 'season', stringValue: '2015/16' },
    ] as UploadFileToStoreParams['customMetadata'];
    const chunkingConfig = { chunkSize: 512 } as UploadFileToStoreParams['chunkingConfig'];

    await uploadFileToStore({
      fileSearchStoreName: 'stores/with-config',
      filePath: './README.md',
      displayName: 'Club History',
      mimeType: 'application/pdf',
      customMetadata,
      chunkingConfig,
      wait: false,
    });

    expect(uploadMock).toHaveBeenCalledWith({
      fileSearchStoreName: 'stores/with-config',
      file: expect.stringContaining('README.md'),
      config: {
        displayName: 'Club History',
        mimeType: 'application/pdf',
        customMetadata,
        chunkingConfig,
      },
    });
  });

  it('throws when uploadFileToStore is missing required arguments', async () => {
    await expect(
      uploadFileToStore({
        fileSearchStoreName: '',
        filePath: './README.md',
      }),
    ).rejects.toThrow(/fileSearchStoreName is required/);

    await expect(
      uploadFileToStore({
        fileSearchStoreName: 'stores/invalid',
        filePath: '',
      }),
    ).rejects.toThrow(/filePath is required/);
  });

  it('lists documents in a store and clamps page size between 1 and 20', async () => {
    const documents = [{ name: 'documents/1' }, { name: 'documents/2' }];
    listDocumentsMock.mockResolvedValue(makeAsyncIterable(documents));

    const result = await listDocumentsInStore('stores/1', { pageSize: 50 });

    expect(listDocumentsMock).toHaveBeenCalledWith({
      parent: 'stores/1',
      config: { pageSize: 20 },
    });
    expect(result).toEqual(documents);
  });

  it('throws when listDocumentsInStore is called without a store name', async () => {
    await expect(listDocumentsInStore('')).rejects.toThrow(/fileSearchStoreName is required/);
  });

  it('imports a file from library and waits when wait=true', async () => {
    const operation = { name: 'operations/import', done: false };
    const completed = { name: 'operations/import', done: true, response: { status: 'ok' } };
    importMock.mockResolvedValue(operation);
    waitForOperationMock.mockResolvedValue(completed);

    const result = await importFileFromLibrary({
      fileSearchStoreName: 'stores/1',
      fileName: 'documents/hapoel.pdf',
    });

    expect(importMock).toHaveBeenCalledWith({
      fileSearchStoreName: 'stores/1',
      fileName: 'documents/hapoel.pdf',
      config: {
        customMetadata: undefined,
        chunkingConfig: undefined,
      },
    });
    expect(waitForOperationMock).toHaveBeenCalledWith(operation, undefined);
    expect(result).toEqual(completed.response ?? completed);
  });

  it('returns the raw operation immediately when importFileFromLibrary wait=false', async () => {
    const operation = { name: 'operations/import', done: false };
    importMock.mockResolvedValue(operation);

    const result = await importFileFromLibrary({
      fileSearchStoreName: 'stores/1',
      fileName: 'documents/hapoel.pdf',
      wait: false,
    });

    expect(waitForOperationMock).not.toHaveBeenCalled();
    expect(result).toEqual(operation);
  });

  it('queries a file search store with defaults from env', async () => {
    const response = {
      text: 'Hello from Gemini',
      candidates: [],
    };
    generateContentMock.mockResolvedValue(response);

    const result = await queryFileSearchStore('Who won?', { topK: 5 });

    expect(generateContentMock).toHaveBeenCalledWith({
      model: 'test-model',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Who won?' }],
        },
      ],
      config: {
        systemInstruction: undefined,
        tools: [
          {
            fileSearch: {
              fileSearchStoreNames: ['stores/test-store'],
              topK: 5,
              metadataFilter: undefined,
            },
          },
        ],
        responseModalities: ['TEXT'],
      },
    });
    expect(result.text).toBe('Hello from Gemini');
  });

  it('passes metadata filters and system instructions when provided', async () => {
    generateContentMock.mockResolvedValue({
      text: 'Filtered Answer',
      candidates: [],
    });

    await queryFileSearchStore('Filtered?', {
      topK: 3,
      metadataFilter: 'season:"2015/16"',
      systemInstruction: 'Focus on captains',
    });

    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          systemInstruction: 'Focus on captains',
          tools: [
            expect.objectContaining({
              fileSearch: expect.objectContaining({
                metadataFilter: 'season:"2015/16"',
              }),
            }),
          ],
        }),
      }),
    );
  });

  it('extracts citation metadata from the Gemini response', async () => {
    generateContentMock.mockResolvedValue({
      text: 'Answer with citations ',
      candidates: [
        {
          index: 0,
          citationMetadata: {
            citations: [
              {
                uri: 'https://example.com/1',
                title: 'Article 1',
                startIndex: 0,
                endIndex: 10,
              },
            ],
          },
          groundingMetadata: {
            groundingChunks: [
              {
                retrievedContext: {
                  uri: 'https://example.com/context',
                  title: 'Context Title',
                  text: 'Context Text',
                },
              },
            ],
            groundingSupports: [
              {
                groundingChunkIndices: [0],
                segment: {
                  startIndex: 5,
                  endIndex: 15,
                  text: 'Segment text',
                },
                confidenceScores: [0.9],
              },
            ],
          },
        },
      ],
    });

    const result = await queryFileSearchStore('Who scored?');

    expect(result.text).toBe('Answer with citations');
    expect(result.citations).toEqual([
      {
        type: 'direct',
        candidateIndex: 0,
        uri: 'https://example.com/1',
        title: 'Article 1',
        license: undefined,
        startIndex: 0,
        endIndex: 10,
      },
      {
        type: 'retrieval',
        candidateIndex: 0,
        chunkIndex: 0,
        supportIndex: 0,
        uri: 'https://example.com/context',
        title: 'Context Title',
        text: 'Context Text',
        segment: {
          startIndex: 5,
          endIndex: 15,
          text: 'Segment text',
        },
        confidenceScores: [0.9],
      },
    ]);
  });

  it('throws when the default store id is missing', async () => {
    const originalStoreId = mockedEnv.fileSearchStoreId;
    mockedEnv.fileSearchStoreId = undefined;

    await expect(queryFileSearchStore('Who scored?')).rejects.toThrow(/No FileSearch store specified/);

    mockedEnv.fileSearchStoreId = originalStoreId;
  });

  it('normalizes citations into unique labels', () => {
    const citations = [
      {
        type: 'direct' as const,
        candidateIndex: 0,
        uri: 'https://example.com',
        title: 'Example',
      },
      {
        type: 'retrieval' as const,
        candidateIndex: 1,
        uri: 'https://example.com',
        title: 'Example',
      },
    ];

    const normalized = normalizeCitations(citations);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      uri: 'https://example.com',
      title: 'Example',
      label: 1,
    });
  });

  it('normalizes citations by uri, title, and text while preserving first occurrence details', () => {
    const citations = [
      {
        type: 'direct' as const,
        candidateIndex: 0,
        uri: 'https://example.com',
        title: 'Example',
        text: 'First snippet',
        segment: { startIndex: 0, endIndex: 5, text: 'First snippet' },
        confidenceScores: [0.95],
      },
      {
        type: 'retrieval' as const,
        candidateIndex: 1,
        uri: 'https://example.com',
        title: 'Example',
        text: 'First snippet',
        segment: { startIndex: 10, endIndex: 20, text: 'Different segment' },
        confidenceScores: [0.85],
      },
      {
        type: 'retrieval' as const,
        candidateIndex: 2,
        uri: 'https://example.com/other',
        title: 'Example 2',
        text: 'Another snippet',
      },
    ];

    const normalized = normalizeCitations(citations);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toMatchObject({
      uri: 'https://example.com',
      title: 'Example',
      text: 'First snippet',
      type: 'direct',
      candidateIndex: 0,
      label: 1,
      confidence: 0.95,
    });
    expect(normalized[1]).toMatchObject({
      uri: 'https://example.com/other',
      title: 'Example 2',
      text: 'Another snippet',
      label: 2,
    });
  });
});


