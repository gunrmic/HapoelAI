import { NextResponse } from 'next/server';
import { answerQuestion } from '@aihapoel/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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

type BlacklistEntry = {
  question: string;
  image: string;
};

function loadBlacklist(): BlacklistEntry[] {
  try {
    // Try multiple possible paths
    const possiblePaths = [
      join(process.cwd(), 'apps/web/app/constants/blacklist.json'),
      join(process.cwd(), 'app/constants/blacklist.json'),
      join(__dirname, '../constants/blacklist.json'),
    ];
    
    let blacklistPath: string | null = null;
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        blacklistPath = path;
        break;
      }
    }
    
    if (!blacklistPath) {
      console.error('Blacklist file not found. Tried paths:', possiblePaths);
      return [];
    }
    
    const blacklistContent = readFileSync(blacklistPath, 'utf-8');
    const blacklist = JSON.parse(blacklistContent) as BlacklistEntry[];
    
    if (!Array.isArray(blacklist)) {
      console.error('Blacklist is not an array:', typeof blacklist);
      return [];
    }
    
    console.log('Loaded blacklist with', blacklist.length, 'entries');
    return blacklist;
  } catch (error) {
    console.error('Error loading blacklist:', error);
    return [];
  }
}

function extractWords(text: string): string[] {
  // Split by whitespace, punctuation, and normalize
  // This works for both Hebrew and English
  // For Hebrew, we don't need toLowerCase but it doesn't hurt
  const words = text
    .trim()
    .split(/\s+/)
    .map((word) => {
      // Remove punctuation and diacritics, keep only letters and numbers
      const cleaned = word.replace(/[^\p{L}\p{N}]/gu, '');
      // Normalize Hebrew text (remove diacritics for better matching)
      return cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    })
    .filter((word) => word.length > 0); // Remove empty strings
  
  return words;
}

function allWordsPresent(blacklistQuestion: string, askedQuestion: string): boolean {
  const blacklistWords = extractWords(blacklistQuestion);
  const askedWords = extractWords(askedQuestion);
  
  // Debug logging (can be removed in production)
  if (blacklistWords.length > 0) {
    console.log('Blacklist words:', blacklistWords);
    console.log('Asked words:', askedWords);
    console.log('All words present:', blacklistWords.every((word) => askedWords.includes(word)));
  }
  
  // Check if all words from blacklist question appear in asked question
  return blacklistWords.every((word) => askedWords.includes(word));
}

function findBlacklistEntry(question: string, blacklist: BlacklistEntry[]): BlacklistEntry | null {
  return (
    blacklist.find(
      (entry) => allWordsPresent(entry.question, question)
    ) || null
  );
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

  const { question, locale } = (await request.json().catch(() => ({}))) as {
    question?: string;
    locale?: string;
  };

  if (!question || typeof question !== 'string' || !question.trim()) {
    return NextResponse.json({ error: 'Question is required.' }, { status: 400 });
  }

  // Check if question is blacklisted
  const blacklist = loadBlacklist();
  const blacklistEntry = findBlacklistEntry(question, blacklist);
  if (blacklistEntry && blacklistEntry.image) {
    console.log('Question matched blacklist, returning image:', blacklistEntry.image);
    return NextResponse.json({
      image: blacklistEntry.image,
    });
  }

  try {
    // Guide the model to respond in the user's locale
    const systemInstruction =
      locale === 'he'
        ? 'ענה בעברית ברורה וקצרה. כאשר יש ציטוטים או כותרות באנגלית, ניתן להשאירם באנגלית, אך את ההסברים יש לנסח בעברית.'
        : 'Answer concisely in English.';

    const result = await answerQuestion(question, { systemInstruction });
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

