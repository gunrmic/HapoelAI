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
  ListDocumentsConfig,
  Document,
} from '@google/genai';
import { env, envFlags } from '../config/env';
import { getGenAiClient } from '../clients/genai';
import { waitForOperation } from '../utils/operations';
import { retryWithBackoff } from '../utils/retry';
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
} from '../types/fileSearch';

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

export async function listDocumentsInStore(
  fileSearchStoreName: string,
  config: ListDocumentsConfig = {},
): Promise<Document[]> {
  if (!fileSearchStoreName) {
    throw new Error('fileSearchStoreName is required');
  }

  const ai = getGenAiClient();
  const effectiveConfig: ListDocumentsConfig = { ...config };
  if (effectiveConfig.pageSize === undefined) {
    effectiveConfig.pageSize = 20;
  } else if (effectiveConfig.pageSize < 1) {
    effectiveConfig.pageSize = 1;
  } else if (effectiveConfig.pageSize > 20) {
    effectiveConfig.pageSize = 20;
  }

  const pager = await ai.fileSearchStores.documents.list({
    parent: fileSearchStoreName,
    config: effectiveConfig,
  });

  const documents: Document[] = [];
  for await (const document of pager) {
    documents.push(document);
  }

  return documents;
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
    fileSearchStoreName,
    model = env.defaultModel,
    topK = DEFAULT_TOP_K,
    metadataFilter,
    systemInstruction,
    enableWebGrounding = env.enableWebGrounding,
    webGroundingSite = env.webGroundingSite,
  } = options;

  // Support multiple stores: use provided store, or parse comma-separated env var, or single env var
  let storeNames: string[] = [];
  
  if (fileSearchStoreName) {
    // Single store provided
    storeNames = [fileSearchStoreName];
  } else if (env.fileSearchStoreId) {
    // Parse comma-separated stores from env, or use single store
    storeNames = env.fileSearchStoreId.split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Log which stores are being used
  if (envFlags.isDevelopment && storeNames.length > 0) {
    console.info(`[file-search] Using ${storeNames.length} file search store(s): ${storeNames.join(', ')}`);
  }

  // Build tools array - at least one tool must be enabled
  const tools: Array<{ fileSearch?: any; grounding?: any }> = [];

  // Add file search tool if stores are available
  if (storeNames.length > 0) {
    tools.push({
      fileSearch: {
        fileSearchStoreNames: storeNames,
        topK,
        metadataFilter,
      },
    });
  }

  // Add web grounding tool if enabled
  if (enableWebGrounding) {
    tools.push({
      grounding: {},
    });
  }

  // Ensure at least one tool is enabled
  if (tools.length === 0) {
    throw new Error(
      'No search tools enabled. Either specify a FileSearch store (via fileSearchStoreName or GEMINI_FILE_SEARCH_STORE_ID) or enable web grounding (via enableWebGrounding option or ENABLE_WEB_GROUNDING env var).',
    );
  }

  const ai = getGenAiClient();
  
  // If web grounding is enabled with a specific site, modify the question and system instruction
  let enhancedQuestion = question;
  let enhancedSystemInstruction = systemInstruction;
  
  if (enableWebGrounding && webGroundingSite) {
    try {
      const siteUrl = new URL(webGroundingSite.startsWith('http') ? webGroundingSite : `https://${webGroundingSite}`);
      const siteDomain = siteUrl.hostname;
      
      // Enhance the question to emphasize searching only the specified site
      enhancedQuestion = `${question}\n\nPlease search specifically on ${siteDomain} (${siteUrl.toString()}) for this information.`;
      
      // Update system instruction to restrict web search to the specified domain
      enhancedSystemInstruction = systemInstruction 
        ? `${systemInstruction}\n\nIMPORTANT: When using web search (grounding), ONLY search and reference content from ${siteDomain}. Ignore results from any other domains.`
        : `IMPORTANT: When using web search (grounding), ONLY search and reference content from ${siteDomain}. Ignore results from any other domains.`;
      
      if (envFlags.isDevelopment) {
        console.info(`[web-grounding] Restricting web search to: ${siteDomain}`);
      }
    } catch (error) {
      console.warn(`[web-grounding] Invalid webGroundingSite URL: ${webGroundingSite}. Using default behavior.`);
    }
  }
  
  // Retry with exponential backoff for transient errors (503, 429, etc.)
  const response = await retryWithBackoff(
    () =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: enhancedQuestion }],
          },
        ],
        config: {
          systemInstruction: enhancedSystemInstruction,
          tools,
          responseModalities: ['TEXT'],
        },
      }),
    {
      maxRetries: 3,
      initialDelayMs: 1_000,
      maxDelayMs: 10_000,
      backoffMultiplier: 2,
    },
  );

  const answer = formatFileSearchAnswer(response);
  
  // Filter citations to only include results from the specified site if web grounding is enabled
  if (enableWebGrounding && webGroundingSite) {
    try {
      const siteUrl = new URL(webGroundingSite.startsWith('http') ? webGroundingSite : `https://${webGroundingSite}`);
      const siteDomain = siteUrl.hostname;
      
      const beforeFilterCount = answer.citations.length;
      answer.citations = filterCitationsByDomain(answer.citations, siteDomain);
      
      if (envFlags.isDevelopment) {
        console.info(`[web-grounding] Filtered citations: ${answer.citations.length} from ${siteDomain} (was ${beforeFilterCount})`);
      }
    } catch (error) {
      // If URL parsing fails, don't filter
      console.warn(`[web-grounding] Could not filter citations: ${error}`);
    }
  }
  
  return answer;
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

        const contextText =
          'text' in context && typeof context.text === 'string'
            ? context.text
            : support.segment?.text;

        results.push({
          type: 'retrieval',
          candidateIndex,
          chunkIndex,
          supportIndex,
          uri: context.uri,
          title: context.title,
          text: contextText,
          segment: support.segment,
          confidenceScores: support.confidenceScores,
        });
      });
    });
  }

  return results;
}

function filterCitationsByDomain(
  citations: CitationEntry[],
  domain: string,
): CitationEntry[] {
  return citations.filter((citation) => {
    if (!citation.uri) {
      // Keep citations without URI (likely from file search)
      return true;
    }
    try {
      const citationUrl = new URL(citation.uri);
      return citationUrl.hostname === domain;
    } catch {
      // If URI is not a valid URL, keep it (might be from file search)
      return true;
    }
  });
}

export function normalizeCitations(
  citations: CitationEntry[],
): NormalizedCitation[] {
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

