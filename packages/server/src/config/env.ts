import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isDevelopment = NODE_ENV === 'development';

if (isDevelopment) {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidateEnvPaths = [
    resolve(moduleDir, '../../../../.env'), // repository root
    resolve(moduleDir, '../../.env'), // packages/server/.env (optional)
  ];

  for (const envPath of candidateEnvPaths) {
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
    }
  }
}

type EnvConfig = {
  geminiApiKey?: string;
  fileSearchStoreId?: string;
  defaultModel: string;
};

export const env: EnvConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.VERCEL_GEMINI_API_KEY,
  fileSearchStoreId:
    process.env.GEMINI_FILE_SEARCH_STORE_ID ?? process.env.VERCEL_GEMINI_FILE_SEARCH_STORE_ID,
  defaultModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
};

export function assertGeminiApiKey(): string {
  if (!env.geminiApiKey) {
    throw new Error(
      'GEMINI_API_KEY is required. Set it in your local .env file or configure it via Vercel environment variables.',
    );
  }

  return env.geminiApiKey;
}

export const envFlags = {
  nodeEnv: NODE_ENV,
  isDevelopment,
};

if (isDevelopment) {
  console.info('[env] Loaded environment configuration:', {
    nodeEnv: NODE_ENV,
    hasGeminiApiKey: Boolean(env.geminiApiKey),
    fileSearchStoreId: env.fileSearchStoreId ?? '<undefined>',
    defaultModel: env.defaultModel,
  });
}

