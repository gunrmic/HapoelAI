"use client";

import Image from 'next/image';
import { FormEvent, useMemo, useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import styles from './page.module.scss';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { type Locale } from '@/i18n';

type AskResponse = {
  answer: string;
  citations: Array<{
    label: number;
    uri?: string;
    title?: string;
    text?: string;
  }>;
};

type AskError = {
  error: string;
};

export default function HomePageClient() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const hasAnswer = useMemo(() => Boolean(answer?.answer), [answer]);

  // Initialize speech synthesis and load voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      
      // Load voices (some browsers need this)
      const loadVoices = () => {
        if (synthRef.current) {
          synthRef.current.getVoices();
        }
      };
      
      loadVoices();
      // Some browsers fire the voiceschanged event when voices are loaded
      if (synthRef.current.onvoiceschanged !== undefined) {
        synthRef.current.onvoiceschanged = loadVoices;
      }
    }
  }, []);

  // Cleanup speech when answer changes, locale changes, or component unmounts
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      setIsSpeaking(false);
      setIsPaused(false);
      utteranceRef.current = null;
    };
  }, [answer, locale]);

  const handleSpeak = () => {
    if (!answer?.answer || !synthRef.current) return;

    if (isPaused && utteranceRef.current) {
      // Resume if paused
      synthRef.current.resume();
      setIsPaused(false);
      setIsSpeaking(true);
    } else if (isSpeaking) {
      // Pause if speaking
      synthRef.current.pause();
      setIsPaused(true);
    } else {
      // Start speaking
      const utterance = new SpeechSynthesisUtterance(answer.answer);
      
      // Set language based on locale
      const langCode = locale === 'he' ? 'he-IL' : 'en-US';
      utterance.lang = langCode;
      
      // Set voice properties for a more robotic sound
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 0.8; // Lower pitch for more robotic sound
      utterance.volume = 1;
      
      // Find appropriate voice for the locale
      const findVoice = (voices: SpeechSynthesisVoice[]) => {
        if (locale === 'he') {
          // For Hebrew, prioritize Hebrew voices
          return voices.find(voice => 
            voice.lang.startsWith('he') || 
            voice.lang.startsWith('iw') // 'iw' is the old code for Hebrew
          ) || voices.find(voice => 
            voice.name.toLowerCase().includes('hebrew') ||
            voice.name.toLowerCase().includes('he-')
          );
        } else {
          // For English, look for English voices with robotic names
          return voices.find(voice => 
            (voice.lang.startsWith('en') && (
              voice.name.toLowerCase().includes('zira') || 
              voice.name.toLowerCase().includes('samantha') ||
              voice.name.toLowerCase().includes('alex')
            ))
          ) || voices.find(voice => voice.lang.startsWith('en'));
        }
      };
      
      // Get voices (may need to be called multiple times in some browsers)
      let voices = synthRef.current.getVoices();
      if (voices.length === 0) {
        // If no voices loaded yet, try again after a short delay
        setTimeout(() => {
          voices = synthRef.current?.getVoices() || [];
          const selectedVoice = findVoice(voices);
          if (selectedVoice && utteranceRef.current) {
            utteranceRef.current.voice = selectedVoice;
            // Ensure language is set correctly
            utteranceRef.current.lang = langCode;
          }
        }, 100);
      } else {
        const selectedVoice = findVoice(voices);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setIsPaused(false);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      synthRef.current.speak(utterance);
    }
  };

  const handleStop = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      utteranceRef.current = null;
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();

    if (!trimmed) {
      setError(t('form.emptyQuestionError'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as AskError | null;
        throw new Error(errorPayload?.error ?? t('emptyState.unexpectedError'));
      }

      const payload: AskResponse = await response.json();
      setAnswer(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('emptyState.genericError'));
      setAnswer(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div
          className={`${styles.logoFrame} ${loading ? styles.logoFrameLoading : ''}`}
          aria-live="polite"
          aria-busy={loading}
        >
          <Image
            src="/Hapoel_Tel_Aviv.svg.png"
            alt={t('common.logoAlt')}
            width={96}
            height={96}
            priority
          />
          {loading && <span className={styles.spinner} aria-hidden />}
        </div>
        <h1>{t('common.title')}</h1>
        <LanguageSwitcher />
      </header>

      <section className={styles.card}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t('form.placeholder')}
            disabled={loading}
          />

          <div className={styles.formActions}>
            <button type="submit" disabled={loading}>
              {loading ? t('form.thinking') : t('form.submitButton')}
            </button>
          </div>
        </form>

        {error && (
          <div className={styles.emptyState}>
            <strong>{t('emptyState.errorTitle')}</strong>
            <span>{error}</span>
          </div>
        )}

        {!error && !hasAnswer && (
          <div className={styles.emptyState}>
            <strong>{t('emptyState.noAnswer')}</strong>
            <span>{t('emptyState.suggestions')}</span>
          </div>
        )}

        {hasAnswer && answer && (
          <div className={styles.answer}>
            <div className={styles.answerHeader}>
              <h2>{t('answer.title')}</h2>
              {typeof window !== 'undefined' && 'speechSynthesis' in window && (
                <div className={styles.ttsControls}>
                  <button
                    type="button"
                    onClick={handleSpeak}
                    className={styles.ttsButton}
                    aria-label={isSpeaking && !isPaused ? t('tts.pause') : t('tts.play')}
                    title={isSpeaking && !isPaused ? t('tts.pause') : t('tts.play')}
                  >
                    {isSpeaking && !isPaused ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5.5 3.5A.5.5 0 0 1 6 4v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5zm5 0A.5.5 0 0 1 11 4v8a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5z"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                      </svg>
                    )}
                  </button>
                  {isSpeaking && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className={styles.ttsButton}
                      aria-label={t('tts.stop')}
                      title={t('tts.stop')}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z"/>
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            <p>{answer.answer}</p>

            {answer.citations.length > 0 && (
              <div className={styles.references}>
                <h3>{t('answer.references')}</h3>
                <ul>
                  {answer.citations.map((citation) => (
                    <li key={citation.label}>
                      {citation.uri ? (
                        <a href={citation.uri} target="_blank" rel="noreferrer">
                          [{citation.label}] {citation.title ?? citation.uri}
                        </a>
                      ) : (
                        <span>[{citation.label}] {citation.title ?? t('answer.source')}</span>
                      )}
                      {citation.text && <span>{citation.text}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

