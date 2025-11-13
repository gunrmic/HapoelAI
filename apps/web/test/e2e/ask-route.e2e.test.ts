import { beforeEach, describe, expect, it, vi } from 'vitest';

const answerQuestionMock = vi.fn();

vi.mock('@aihapoel/server', () => ({
  answerQuestion: answerQuestionMock,
}));

function buildRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      ...headers,
    }),
    body: JSON.stringify(body),
  });
}

describe('POST /api/ask', () => {
  beforeEach(() => {
    vi.resetModules();
    answerQuestionMock.mockReset();
  });

  it('returns an answer payload when the question is valid', async () => {
    answerQuestionMock.mockResolvedValue({
      answer: 'Hapoel Tel Aviv lifted the cup.',
      citations: [
        { label: 1, title: 'Official site', uri: 'https://example.com', text: 'Recap' },
      ],
    });

    const { POST } = await import('../../app/api/ask/route');

    const response = await POST(
      buildRequest(
        { question: 'Who won the cup?' },
        { 'x-forwarded-for': '203.0.113.5' },
      ),
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { answer: string; citations: unknown[] };
    expect(payload).toEqual({
      answer: 'Hapoel Tel Aviv lifted the cup.',
      citations: [
        { label: 1, title: 'Official site', uri: 'https://example.com', text: 'Recap' },
      ],
    });
    expect(answerQuestionMock).toHaveBeenCalledWith('Who won the cup?');
  });

  it('returns a validation error when the question is missing', async () => {
    const { POST } = await import('../../app/api/ask/route');

    const response = await POST(buildRequest({}));

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toMatch(/Question is required/);
    expect(answerQuestionMock).not.toHaveBeenCalled();
  });

  it('enforces the rate limit for repeated callers', async () => {
    answerQuestionMock.mockResolvedValue({
      answer: 'Rate limit test',
      citations: [],
    });

    const { POST } = await import('../../app/api/ask/route');

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
    const request = buildRequest({ question: 'Test?' }, { 'x-forwarded-for': '198.51.100.1' });

    for (let i = 0; i < 5; i++) {
      const response = await POST(request);
      expect(response.status).toBe(200);
    }

    const blocked = await POST(request);
    expect(blocked.status).toBe(429);
    const payload = (await blocked.json()) as { error: string };
    expect(payload.error).toMatch(/Too many requests/);
    nowSpy.mockRestore();
  });

  it('propagates errors from the agent as 500 responses', async () => {
    answerQuestionMock.mockRejectedValue(new Error('Agent failed'));

    const { POST } = await import('../../app/api/ask/route');

    const response = await POST(buildRequest({ question: 'What happened?' }));

    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toMatch(/Agent failed/);
  });
});


