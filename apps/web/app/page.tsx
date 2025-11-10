"use client";

import Image from 'next/image';
import { FormEvent, useMemo, useState, useMemo as useMemoAlias } from 'react';
import styles from './page.module.scss';

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

export default function HomePage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAnswer = useMemo(() => Boolean(answer?.answer), [answer]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();

    if (!trimmed) {
      setError('Please enter a question about Hapoel Tel Aviv first.');
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
        throw new Error(errorPayload?.error ?? 'Unexpected server error.');
      }

      const payload: AskResponse = await response.json();
      setAnswer(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong, please try again.');
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
            alt="Hapoel Tel Aviv Crest"
            width={96}
            height={96}
            priority
          />
          {loading && <span className={styles.spinner} aria-hidden />}
        </div>
        <h1>Hapoel Tel Aviv AI</h1>
      </header>

      <section className={styles.card}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. מי היה הקפטן של הפועל תל אביב בעונת 2015/16?"
            disabled={loading}
          />

          <div className={styles.formActions}>
            <button type="submit" disabled={loading}>
              {loading ? 'Thinking…' : 'Ask Hapoel AI'}
            </button>
          </div>
        </form>

        {error && (
          <div className={styles.emptyState}>
            <strong>We could not answer that.</strong>
            <span>{error}</span>
          </div>
        )}

        {!error && !hasAnswer && (
          <div className={styles.emptyState}>
            <strong>Your answers will appear here.</strong>
            <span>Start with season history, iconic players, match recaps, or club records.</span>
          </div>
        )}

        {hasAnswer && answer && (
          <div className={styles.answer}>
            <h2>Answer</h2>
            <p>{answer.answer}</p>

            {answer.citations.length > 0 && (
              <div className={styles.references}>
                <h3>References</h3>
                <ul>
                  {answer.citations.map((citation) => (
                    <li key={citation.label}>
                      {citation.uri ? (
                        <a href={citation.uri} target="_blank" rel="noreferrer">
                          [{citation.label}] {citation.title ?? citation.uri}
                        </a>
                      ) : (
                        <span>[{citation.label}] {citation.title ?? 'Source'}</span>
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

