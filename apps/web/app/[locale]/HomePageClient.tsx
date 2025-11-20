"use client";

import Image from 'next/image';
import { FormEvent, useMemo, useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import styles from './page.module.scss';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { type Locale } from '@/i18n';
import { getRandomQuestions, getRandomQuestionExcluding } from '../constants/questions';

type AskResponse = {
  answer?: string;
  image?: string;
  citations?: Array<{
    label: number;
    uri?: string;
    title?: string;
    text?: string;
  }>;
};

type AskError = {
  error: string;
};

// Speech Recognition types
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

declare var webkitSpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

export default function HomePageClient() {
  const t = useTranslations();
  const localeFromHook = useLocale() as Locale;
  const pathname = usePathname();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [randomQuestions, setRandomQuestions] = useState<string[]>([]);
  const [clickedQuestionIndex, setClickedQuestionIndex] = useState<number | null>(null);
  const [isSpeechRecognitionAvailable, setIsSpeechRecognitionAvailable] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Determine locale from pathname to ensure it's always accurate
  const locale = useMemo(() => {
    const pathLocale = pathname.split('/')[1];
    if (pathLocale === 'en' || pathLocale === 'he') {
      return pathLocale as Locale;
    }
    return localeFromHook;
  }, [pathname, localeFromHook]);

  const hasAnswer = useMemo(() => Boolean(answer?.answer || answer?.image), [answer]);

  // Initialize random questions when component mounts or locale changes
  useEffect(() => {
    const newQuestions = getRandomQuestions(locale, 4);
    setRandomQuestions(newQuestions);
    // Clear answer when locale changes so user sees fresh questions
    setAnswer(null);
    setQuestion('');
    setError(null);
  }, [locale]);

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

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = 
        (window as any).SpeechRecognition || 
        (window as any).webkitSpeechRecognition;
      
      setIsSpeechRecognitionAvailable(!!SpeechRecognition);
      
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onstart = () => {
          setIsListening(true);
        };
        
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
          setQuestion(prev => prev ? `${prev} ${transcript}` : transcript);
          setIsListening(false);
        };
        
        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          if (event.error === 'not-allowed') {
            setError(t('speech.microphonePermissionError'));
          } else if (event.error === 'no-speech') {
            setIsListening(false);
          } else {
            setError(t('speech.recognitionError'));
          }
        };
        
        recognition.onend = () => {
          setIsListening(false);
        };
        
        recognitionRef.current = recognition;
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [t]);

  // Update speech recognition language when locale changes
  useEffect(() => {
    if (recognitionRef.current) {
      const langCode = locale === 'he' ? 'he-IL' : 'en-US';
      recognitionRef.current.lang = langCode;
    }
  }, [locale]);

  // Cleanup speech when answer changes, locale changes, or component unmounts
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsSpeaking(false);
      setIsPaused(false);
      setIsListening(false);
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

  const handleStartListening = () => {
    if (!recognitionRef.current) {
      setError(t('speech.notSupported'));
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        setError(null); // Clear any previous errors
        const langCode = locale === 'he' ? 'he-IL' : 'en-US';
        recognitionRef.current.lang = langCode;
        recognitionRef.current.start();
      } catch (err) {
        console.error('Error starting speech recognition:', err);
        setError(t('speech.startError'));
        setIsListening(false);
      }
    }
  };

  async function askQuestion(questionText: string, questionIndex?: number | null) {
    const trimmed = questionText.trim();

    if (!trimmed) {
      setError(t('form.emptyQuestionError'));
      return;
    }

    // Use the passed index parameter, or fall back to state (for backwards compatibility)
    const indexToReplace = questionIndex !== undefined ? questionIndex : clickedQuestionIndex;

    setQuestion(trimmed);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, locale }),
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as AskError | null;
        throw new Error(errorPayload?.error ?? t('emptyState.unexpectedError'));
      }

      const payload: AskResponse = await response.json();
      setAnswer(payload);
      
      // Replace the clicked question with a new one if it was from the suggested questions
      if (indexToReplace !== null && indexToReplace !== undefined) {
        const currentIndex = indexToReplace;
        setRandomQuestions(prev => {
          // Create a new array to ensure React detects the change
          const newQuestions = [...prev];
          // Get a new question that's not in the current list (excluding all current questions)
          const newQuestion = getRandomQuestionExcluding(locale, newQuestions);
          // Replace the question at the clicked index
          newQuestions[currentIndex] = newQuestion;
          // Return a new array reference to ensure React detects the change
          return [...newQuestions];
        });
        setClickedQuestionIndex(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('emptyState.genericError'));
      setAnswer(null);
      setClickedQuestionIndex(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await askQuestion(question);
  }

  function handleQuestionClick(questionText: string, index: number) {
    // Pass the index directly to askQuestion instead of relying on state
    askQuestion(questionText, index);
  }

  return (
    <main className={styles.page}>
      <LanguageSwitcher />
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
      </header>

      <section className={styles.card}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.textareaWrapper}>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t('form.placeholder')}
              disabled={loading || isListening}
            />
            {isSpeechRecognitionAvailable && (
              <button
                type="button"
                onClick={handleStartListening}
                className={`${styles.micButton} ${isListening ? styles.micButtonActive : ''}`}
                disabled={loading}
                aria-label={isListening ? t('speech.stopListening') : t('speech.startListening')}
                title={isListening ? t('speech.stopListening') : t('speech.startListening')}
              >
                {isListening ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                )}
              </button>
            )}
          </div>

          <div className={styles.formActions}>
            <button type="submit" disabled={loading || isListening}>
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

        {!error && randomQuestions.length > 0 && (
          <div className={styles.suggestedQuestions}>
            <h3 className={styles.suggestedQuestionsTitle}>{t('suggestedQuestions.title')}</h3>
            <div className={styles.questionsList}>
              {randomQuestions.map((q, index) => (
                <button
                  key={`${index}-${q}`}
                  type="button"
                  onClick={() => handleQuestionClick(q, index)}
                  className={styles.questionButton}
                  disabled={loading}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasAnswer && answer && (
          <div className={styles.answer}>
            {answer.image ? (
              <div className={styles.imageResponse}>
                {answer.image.startsWith('http://') || answer.image.startsWith('https://') ? (
                  // Use regular img tag for external URLs
                  <img
                    src={answer.image}
                    alt="Response image"
                    style={{ width: '100%', height: 'auto', maxWidth: '100%' }}
                  />
                ) : (
                  // Use Next.js Image for internal URLs
                  <Image
                    src={answer.image}
                    alt="Response image"
                    width={800}
                    height={600}
                    style={{ width: '100%', height: 'auto', maxWidth: '100%' }}
                  />
                )}
              </div>
            ) : (
              <>
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

                {answer.citations && answer.citations.length > 0 && (
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
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

