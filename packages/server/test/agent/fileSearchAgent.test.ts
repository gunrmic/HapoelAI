import { describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const normalizeMock = vi.fn();

vi.mock('../../src/services/fileSearchService', () => ({
  queryFileSearchStore: queryMock,
  normalizeCitations: normalizeMock,
}));

import { answerQuestion } from '../../src/agent/fileSearchAgent';

describe('answerQuestion', () => {
  it('throws when the question is empty or whitespace', async () => {
    await expect(answerQuestion('')).rejects.toThrow(/non-empty question/);
    await expect(answerQuestion('   ')).rejects.toThrow(/non-empty question/);
  });

  it('trims the question and returns formatted answer', async () => {
    queryMock.mockResolvedValue({
      text: 'Forza Hapoel!',
      citations: [{ uri: 'https://example.com', label: 1 }],
      raw: { text: 'Forza Hapoel!' },
    });
    normalizeMock.mockReturnValue([{ uri: 'https://example.com', label: 1 }]);

    const result = await answerQuestion('  Who won?  ');

    expect(queryMock).toHaveBeenCalledWith('Who won?', {});
    expect(normalizeMock).toHaveBeenCalledWith([{ uri: 'https://example.com', label: 1 }]);
    expect(result).toEqual({
      answer: 'Forza Hapoel!',
      citations: [{ uri: 'https://example.com', label: 1 }],
      raw: { text: 'Forza Hapoel!' },
    });
  });
});


