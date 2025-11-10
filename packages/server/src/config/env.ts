import dotenv from 'dotenv';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isDevelopment = NODE_ENV === 'development';

if (isDevelopment) {
  dotenv.config();
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

