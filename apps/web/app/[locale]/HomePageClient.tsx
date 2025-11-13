"use client";

import Image from 'next/image';
import { FormEvent, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import styles from './page.module.scss';
import LanguageSwitcher from '../components/LanguageSwitcher';

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
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAnswer = useMemo(() => Boolean(answer?.answer), [answer]);

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
            <h2>{t('answer.title')}</h2>
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

