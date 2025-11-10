import type { NormalizedCitation, QueryFileSearchOptions } from '../types/fileSearch.js';
import { queryFileSearchStore, normalizeCitations } from '../services/fileSearchService.js';

export type AnswerQuestionResult = {
  answer: string;
  citations: NormalizedCitation[];
  raw: Awaited<ReturnType<typeof queryFileSearchStore>>['raw'];
};

export async function answerQuestion(
  question: string,
  options: QueryFileSearchOptions = {},
): Promise<AnswerQuestionResult> {
  const trimmedQuestion = question?.trim();
  if (!trimmedQuestion) {
    throw new Error('A non-empty question is required.');
  }

  const result = await queryFileSearchStore(trimmedQuestion, options);
  const citations = normalizeCitations(result.citations);

  return {
    answer: result.text,
    citations,
    raw: result.raw,
  };
}

