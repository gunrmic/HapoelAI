import { setTimeout as delay } from 'node:timers/promises';
import type { Operation } from '@google/genai';
import { getGenAiClient } from '../clients/genai.ts';
import type { OperationPollOptions } from '../types/fileSearch.ts';

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;

export async function waitForOperation<TResponse, TOperation extends Operation<TResponse>>(
  operation: TOperation,
  options: OperationPollOptions<TOperation> = {},
): Promise<TOperation> {
  const { pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, timeoutMs = DEFAULT_TIMEOUT_MS, onProgress } =
    options;
  const ai = getGenAiClient();

  let latest: TOperation = operation;
  const startedAt = Date.now();

  while (!latest.done) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Operation ${latest.name ?? ''} timed out after ${timeoutMs}ms`);
    }

    await delay(pollIntervalMs);
    const updated = (await ai.operations.get<TResponse, TOperation>({
      operation: latest,
    })) as TOperation;
    latest = updated;
    onProgress?.(updated);
  }

  if (latest.error) {
    throw new Error(
      `Operation ${latest.name ?? ''} failed: ${JSON.stringify(latest.error, null, 2)}`,
    );
  }

  return latest;
}

