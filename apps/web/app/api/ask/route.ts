import { NextResponse } from 'next/server';
import { answerQuestion } from '@aihapoel/server';

export const runtime = 'nodejs';

type RateLimitState = {
  count: number;
  firstRequestTs: number;
  blockedUntil?: number;
};

const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX = 5;
const BLOCK_DURATION_MS = 10 * 60 * 1_000;
const BLOCK_MESSAGE = 'Too many requests. You are blocked for 10 minutes.';

const rateLimiter: Map<string, RateLimitState> = new Map();

function getClientIdentifier(request: Request): string {
  const forwardedHeader = request.headers.get('x-forwarded-for') ?? '';
  const ip = forwardedHeader.split(',')[0]?.trim();
  return ip || 'unknown';
}

function rateLimitClient(identifier: string): { allowed: boolean; message?: string } {
  const now = Date.now();
  const current = rateLimiter.get(identifier);

  if (current?.blockedUntil && current.blockedUntil > now) {
    const remainingMinutes = Math.ceil((current.blockedUntil - now) / 60_000);
    return {
      allowed: false,
      message: remainingMinutes > 1 ? BLOCK_MESSAGE : 'Too many requests. Try again in under a minute.',
    };
  }

  if (!current) {
    rateLimiter.set(identifier, { count: 1, firstRequestTs: now });
    return { allowed: true };
  }

  const withinWindow = now - current.firstRequestTs <= RATE_LIMIT_WINDOW_MS;
  if (withinWindow) {
    current.count += 1;
    if (current.count > RATE_LIMIT_MAX) {
      rateLimiter.set(identifier, {
        ...current,
        blockedUntil: now + BLOCK_DURATION_MS,
      });
      return { allowed: false, message: BLOCK_MESSAGE };
    }
    rateLimiter.set(identifier, current);
    return { allowed: true };
  }

  // window expired: reset
  rateLimiter.set(identifier, { count: 1, firstRequestTs: now });
  return { allowed: true };
}

export async function POST(request: Request) {
  const identifier = getClientIdentifier(request);
  const rateLimitResult = rateLimitClient(identifier);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: rateLimitResult.message ?? 'Rate limit exceeded. Try again later.' },
      { status: 429 },
    );
  }

  const { question } = (await request.json().catch(() => ({}))) as { question?: string };

  if (!question || typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'Question is required.' }, { status: 400 });
  }

  try {
    const result = await answerQuestion(question);
    return NextResponse.json({
      answer: result.answer,
      citations: result.citations.map(({ label, title, uri, text }) => ({
        label,
        title,
        uri,
        text,
      })),
    });
  } catch (error) {
    let message = 'Unexpected error while contacting the agent.';
    let status = 500;

    if (error instanceof Error) {
      message = error.message;
      
      // Check for specific error types that should return different status codes
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes('overloaded') ||
        errorMessage.includes('unavailable') ||
        errorMessage.includes('503')
      ) {
        // After retries are exhausted, return 503 to indicate service unavailable
        status = 503;
        message = 'The AI service is temporarily unavailable. Please try again in a moment.';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        status = 429;
      }
    }

    return NextResponse.json({ error: message }, { status });
  }
}

