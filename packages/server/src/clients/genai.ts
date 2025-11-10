import { GoogleGenAI } from '@google/genai';
import { assertGeminiApiKey, env } from '../config/env.ts';

let singleton: GoogleGenAI | undefined;

export function getGenAiClient(): GoogleGenAI {
  if (!singleton) {
    const apiKey = assertGeminiApiKey();
    singleton = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
    });
  }

  return singleton;
}

