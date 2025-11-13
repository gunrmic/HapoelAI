import { setTimeout as delay } from 'node:timers/promises';

export type RetryOptions = {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableStatusCodes?: number[];
  retryableErrorMessages?: string[];
};

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 10_000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;
const DEFAULT_RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];
const DEFAULT_RETRYABLE_ERROR_MESSAGES = [
  'overloaded',
  'unavailable',
  'temporarily unavailable',
  'rate limit',
  'too many requests',
  'service unavailable',
  'internal error',
  'bad gateway',
  'gateway timeout',
];

const NON_RETRYABLE_ERROR_MESSAGES = [
  'storage limit',
  'reached the storage limit',
  'resource exhausted',
  'quota exceeded',
];

function isRetryableError(error: unknown, options: RetryOptions): boolean {
  const {
    retryableStatusCodes = DEFAULT_RETRYABLE_STATUS_CODES,
    retryableErrorMessages = DEFAULT_RETRYABLE_ERROR_MESSAGES,
  } = options;

  if (!(error instanceof Error)) {
    return false;
  }

  const errorMessage = error.message.toLowerCase();
  const errorString = String(error).toLowerCase();

  // First check for non-retryable errors (permanent failures)
  for (const keyword of NON_RETRYABLE_ERROR_MESSAGES) {
    if (errorMessage.includes(keyword) || errorString.includes(keyword)) {
      return false; // Don't retry permanent errors like storage limits
    }
  }

  // Try to parse JSON from error message (Google APIs sometimes return JSON in error messages)
  try {
    // Look for JSON objects in the error message
    const jsonMatch = error.message.match(/\{[\s\S]*"code"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // RESOURCE_EXHAUSTED with storage limit is not retryable
      if (parsed.status === 'RESOURCE_EXHAUSTED') {
        const message = (parsed.message || '').toLowerCase();
        if (message.includes('storage limit') || message.includes('reached the storage limit')) {
          return false; // Don't retry storage limit errors
        }
        // Other RESOURCE_EXHAUSTED errors might be retryable (like rate limits)
        return true;
      }
      if (parsed.code && retryableStatusCodes.includes(parsed.code)) {
        return true;
      }
      if (parsed.status === 'UNAVAILABLE') {
        return true;
      }
    }
  } catch {
    // Not JSON, continue with other checks
  }

  // Check if error message contains retryable keywords
  for (const keyword of retryableErrorMessages) {
    if (errorMessage.includes(keyword) || errorString.includes(keyword)) {
      return true;
    }
  }

  // Check if error has a status code property
  const statusCode = (error as { statusCode?: number }).statusCode;
  if (statusCode && retryableStatusCodes.includes(statusCode)) {
    return true;
  }

  // Check if error has a code property (common in HTTP errors)
  const code = (error as { code?: number | string }).code;
  if (code) {
    const codeNumber = typeof code === 'string' ? parseInt(code, 10) : code;
    if (!isNaN(codeNumber) && retryableStatusCodes.includes(codeNumber)) {
      return true;
    }
  }

  // Check for status property (Google API errors often have status: "UNAVAILABLE")
  const status = (error as { status?: string }).status;
  if (status && (status === 'UNAVAILABLE' || status === 'RESOURCE_EXHAUSTED')) {
    return true;
  }

  // Check error message for status codes (e.g., "code:503" or "status:503")
  for (const statusCode of retryableStatusCodes) {
    if (
      errorMessage.includes(`code:${statusCode}`) ||
      errorMessage.includes(`status:${statusCode}`) ||
      errorMessage.includes(`"code":${statusCode}`) ||
      errorMessage.includes(`"code": ${statusCode}`)
    ) {
      return true;
    }
  }

  return false;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
  } = options;

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this was the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!isRetryableError(error, options)) {
        break;
      }

      // Wait before retrying with exponential backoff
      await delay(Math.min(delayMs, maxDelayMs));
      delayMs *= backoffMultiplier;
    }
  }

  // If we get here, all retries failed
  throw lastError;
}

