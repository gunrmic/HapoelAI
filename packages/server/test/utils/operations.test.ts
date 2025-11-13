import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Operation } from '@google/genai';

const getOperationMock = vi.fn();

vi.mock('node:timers/promises', () => ({
  setTimeout: () => Promise.resolve(),
}));

vi.mock('../../src/clients/genai', () => ({
  getGenAiClient: () => ({
    operations: {
      get: getOperationMock,
    },
  }),
}));

import { waitForOperation } from '../../src/utils/operations';

type TestOperation = Partial<Operation<unknown>> & {
  name?: string;
  done: boolean;
  response?: unknown;
  error?: { code?: number; message?: string };
  _fromAPIResponse: Operation<unknown>['_fromAPIResponse'];
};

const noopFromApiResponse =
  (({ apiResponse }) => apiResponse as unknown as Operation<unknown>) as Operation<unknown>['_fromAPIResponse'];

function createOperation(overrides: Partial<TestOperation>): TestOperation {
  return {
    name: 'operation',
    done: false,
    _fromAPIResponse: noopFromApiResponse,
    ...overrides,
  };
}

describe('waitForOperation', () => {
beforeEach(() => {
  getOperationMock.mockReset();
});

  it('returns immediately when the operation is already done', async () => {
    const operation = createOperation({ name: 'ready', done: true });

    const result = await waitForOperation(operation);

    expect(result).toBe(operation);
    expect(getOperationMock).not.toHaveBeenCalled();
  });

  it('polls until the operation reports done', async () => {
    const initial = createOperation({ name: 'poll', done: false });
    const intermediate = createOperation({ name: 'poll', done: false });
    const final = createOperation({ name: 'poll', done: true, response: { status: 'ok' } });

    getOperationMock
      .mockResolvedValueOnce(intermediate)
      .mockResolvedValueOnce(final);

    const result = await waitForOperation(initial, {
      pollIntervalMs: 5,
      timeoutMs: 50,
    });

    expect(result).toEqual(final);
    expect(getOperationMock).toHaveBeenCalledTimes(2);
  });

  it('invokes onProgress callback for each poll iteration', async () => {
    const initial = createOperation({ name: 'progress', done: false });
    const firstPoll = createOperation({ name: 'progress', done: false });
    const final = createOperation({ name: 'progress', done: true });
    const onProgress = vi.fn();

    getOperationMock.mockResolvedValueOnce(firstPoll).mockResolvedValueOnce(final);

    await waitForOperation(initial, {
      pollIntervalMs: 5,
      timeoutMs: 50,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, firstPoll);
    expect(onProgress).toHaveBeenNthCalledWith(2, final);
  });

  it('throws when the operation exceeds timeout', async () => {
    const operation = createOperation({ name: 'slow', done: false });
    let now = 0;

    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    getOperationMock.mockImplementation(() => {
      now += 100;
      return createOperation({ ...operation });
    });

    await expect(
      waitForOperation(operation, { pollIntervalMs: 5, timeoutMs: 50 }),
    ).rejects.toThrow(/timed out/);

    dateNowSpy.mockRestore();
  });

  it('throws when the final operation contains an error', async () => {
    const initial = createOperation({ name: 'error', done: false });
    const final = createOperation({
      name: 'error',
      done: true,
      error: { code: 500, message: 'boom' },
    });

    getOperationMock.mockResolvedValueOnce(final);

    await expect(waitForOperation(initial)).rejects.toThrow(/failed/);
  });
});


