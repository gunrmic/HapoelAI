import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FileSearchStore,
  ListFileSearchStoresParameters,
  UploadToFileSearchStoreResponse,
  UploadToFileSearchStoreOperation,
  ImportFileResponse,
  ImportFileOperation,
  GenerateContentResponse,
} from '@google/genai';
import { env } from '../config/env.ts';
import { getGenAiClient } from '../clients/genai.ts';
import { waitForOperation } from '../utils/operations.ts';
import type {
  CitationEntry,
  FileSearchAnswer,
  GroundingContext,
  ImportFileParams,
  NormalizedCitation,
  QueryFileSearchOptions,
  UploadFileToStoreResult,
  UploadFileToStoreParams,
  ImportFileResult,
} from '../types/fileSearch.ts';

const DEFAULT_TOP_K = 8;

export async function createFileSearchStore(displayName: string): Promise<FileSearchStore> {
  const ai = getGenAiClient();
  return ai.fileSearchStores.create({
    config: { displayName },
  });
}

export async function getFileSearchStore(name: string): Promise<FileSearchStore> {
  const ai = getGenAiClient();
  return ai.fileSearchStores.get({ name });
}

export async function listFileSearchStores(
  options: ListFileSearchStoresParameters = {},
): Promise<FileSearchStore[]> {
  const ai = getGenAiClient();
  const pager = await ai.fileSearchStores.list(options);
  const stores: FileSearchStore[] = [];

  for await (const store of pager) {
    stores.push(store);
  }

  return stores;
}

export async function uploadFileToStore(
  params: UploadFileToStoreParams,
): Promise<UploadFileToStoreResult> {
  const {
    fileSearchStoreName,
    filePath,
    displayName,
    mimeType,
    customMetadata,
    chunkingConfig,
    wait = true,
    pollOptions,
  } = params;

  if (!fileSearchStoreName) {
    throw new Error('fileSearchStoreName is required');
  }
  if (!filePath) {
    throw new Error('filePath is required');
  }

  const absolutePath = path.resolve(filePath);
  await fs.access(absolutePath);

  const ai = getGenAiClient();
  const operation = await ai.fileSearchStores.uploadToFileSearchStore({
    fileSearchStoreName,
    file: absolutePath,
    config: {
      displayName,
      mimeType,
      customMetadata,
      chunkingConfig,
    },
  });

  if (!wait) {
    return operation;
  }

  const completed = await waitForOperation(operation, pollOptions);
  return completed.response ?? operation;
}

export async function importFileFromLibrary(
  params: ImportFileParams,
): Promise<ImportFileResult> {
  const {
    fileSearchStoreName,
    fileName,
    customMetadata,
    chunkingConfig,
    wait = true,
    pollOptions,
  } = params;

  if (!fileSearchStoreName) {
    throw new Error('fileSearchStoreName is required');
  }
  if (!fileName) {
    throw new Error('fileName is required');
  }

  const ai = getGenAiClient();
  const operation = await ai.fileSearchStores.importFile({
    fileSearchStoreName,
    fileName,
    config: {
      customMetadata,
      chunkingConfig,
    },
  });

  if (!wait) {
    return operation;
  }

  const completed = await waitForOperation(operation, pollOptions);
  return completed.response ?? operation;
}

export async function queryFileSearchStore(
  question: string,
  options: QueryFileSearchOptions = {},
): Promise<FileSearchAnswer> {
  const {
    fileSearchStoreName = env.fileSearchStoreId,
    model = env.defaultModel,
    topK = DEFAULT_TOP_K,
    metadataFilter,
    systemInstruction,
  } = options;

  if (!fileSearchStoreName) {
    throw new Error(
      'No FileSearch store specified. Pass fileSearchStoreName or set GEMINI_FILE_SEARCH_STORE_ID.',
    );
  }

  const ai = getGenAiClient();
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ text: question }],
      },
    ],
    config: {
      systemInstruction,
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: [fileSearchStoreName],
            topK,
            metadataFilter,
          },
        },
      ],
      responseModalities: ['TEXT'],
    },
  });

  return formatFileSearchAnswer(response);
}

function formatFileSearchAnswer(response: GenerateContentResponse): FileSearchAnswer {
  const text = response.text ? response.text.trim() : '';
  const citations = extractCitations(response);
  return {
    text,
    citations,
    raw: response,
  };
}

function extractCitations(response: GenerateContentResponse): CitationEntry[] {
  const results: CitationEntry[] = [];
  const seenKeys = new Set<string>();

  for (const [defaultIndex, candidate] of (response.candidates ?? []).entries()) {
    const candidateIndex = candidate.index ?? defaultIndex;

    for (const citation of candidate.citationMetadata?.citations ?? []) {
      const key = `direct|${candidateIndex}|${citation.uri}|${citation.startIndex}|${citation.endIndex}`;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);
      results.push({
        type: 'direct',
        candidateIndex,
        uri: citation.uri,
        title: citation.title,
        license: citation.license,
        startIndex: citation.startIndex,
        endIndex: citation.endIndex,
      });
    }

    const groundingMetadata = candidate.groundingMetadata;
    if (!groundingMetadata) {
      continue;
    }

    const chunks = groundingMetadata.groundingChunks ?? [];
    const supports = groundingMetadata.groundingSupports ?? [];

    supports.forEach((support, supportIndex) => {
      const chunkIndices = support.groundingChunkIndices ?? [];
      chunkIndices.forEach((chunkIndex) => {
        const chunk = chunks[chunkIndex];
        if (!chunk) {
          return;
        }

        const context: GroundingContext | undefined =
          chunk.retrievedContext ?? chunk.web ?? chunk.maps;
        if (!context) {
          return;
        }

        const key = `retrieval|${candidateIndex}|${chunkIndex}|${context.uri}|${support.segment?.startIndex}|${support.segment?.endIndex}`;
        if (seenKeys.has(key)) {
          return;
        }
        seenKeys.add(key);

        results.push({
          type: 'retrieval',
          candidateIndex,
          chunkIndex,
          supportIndex,
          uri: context.uri,
          title: context.title,
          text: context.text ?? support.segment?.text,
          segment: support.segment,
          confidenceScores: support.confidenceScores,
        });
      });
    });
  }

  return results;
}

export function normalizeCitations(citations: CitationEntry[]): NormalizedCitation[] {
  const byKey = new Map<string, NormalizedCitation>();

  citations.forEach((citation) => {
    if (!citation.uri) {
      return;
    }

    const key = `${citation.uri}|${citation.title ?? ''}|${citation.text ?? ''}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        uri: citation.uri,
        title: citation.title,
        text: citation.text,
        type: citation.type,
        candidateIndex: citation.candidateIndex,
        segment: citation.segment,
        confidence: citation.confidenceScores?.[0],
        label: byKey.size + 1,
      });
    }
  });

  return Array.from(byKey.values()).map((entry, index) => ({
    ...entry,
    label: index + 1,
  }));
}

