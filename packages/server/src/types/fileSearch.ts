import type {
  UploadToFileSearchStoreConfig,
  ImportFileConfig,
  UploadToFileSearchStoreOperation,
  UploadToFileSearchStoreResponse,
  ImportFileOperation,
  ImportFileResponse,
  FileSearch,
  GenerateContentResponse,
  GroundingChunk,
  GroundingSupport,
} from '@google/genai';
import type { Operation } from '@google/genai';

export type UploadFileToStoreParams = {
  fileSearchStoreName: string;
  filePath: string;
  displayName?: string;
  mimeType?: string;
  customMetadata?: UploadToFileSearchStoreConfig['customMetadata'];
  chunkingConfig?: UploadToFileSearchStoreConfig['chunkingConfig'];
  wait?: boolean;
  pollOptions?: OperationPollOptions<UploadToFileSearchStoreOperation>;
};

export type ImportFileParams = {
  fileSearchStoreName: string;
  fileName: string;
  customMetadata?: ImportFileConfig['customMetadata'];
  chunkingConfig?: ImportFileConfig['chunkingConfig'];
  wait?: boolean;
  pollOptions?: OperationPollOptions<ImportFileOperation>;
};

export type UploadFileToStoreResult =
  | UploadToFileSearchStoreOperation
  | UploadToFileSearchStoreResponse;

export type ImportFileResult = ImportFileOperation | ImportFileResponse;

export type OperationPollOptions<TOperation extends Operation<unknown>> = {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onProgress?: (operation: TOperation) => void;
};

export type QueryFileSearchOptions = {
  fileSearchStoreName?: string;
  model?: string;
  topK?: NonNullable<FileSearch['topK']>;
  metadataFilter?: FileSearch['metadataFilter'];
  systemInstruction?: string;
};

export type FileSearchAnswer = {
  text: string;
  citations: CitationEntry[];
  raw: GenerateContentResponse;
};

export type CitationEntry = {
  type: 'direct' | 'retrieval';
  candidateIndex: number;
  uri?: string;
  title?: string;
  license?: string;
  startIndex?: number;
  endIndex?: number;
  chunkIndex?: number;
  supportIndex?: number;
  text?: string;
  segment?: GroundingSupport['segment'];
  confidenceScores?: GroundingSupport['confidenceScores'];
};

export type NormalizedCitation = {
  uri: string;
  title?: string;
  text?: string;
  type?: CitationEntry['type'];
  candidateIndex?: number;
  segment?: GroundingSupport['segment'];
  confidence?: number;
  label: number;
};

export type GroundingContext = GroundingChunk['retrievedContext'] | GroundingChunk['maps'];


