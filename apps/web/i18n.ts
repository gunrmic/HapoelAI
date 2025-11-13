import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

export const locales = ['en', 'he'] as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ locale }) => {
  // getRequestConfig can be called multiple times, including with undefined locale
  // during certain rendering contexts. We should only validate when locale is actually provided.
  if (!locale) {
    // Return a default config when locale is undefined (e.g., during client component hydration)
    // This prevents notFound() from being called during NextIntlClientProvider rendering
    return {
      locale: 'he', // fallback to default
      messages: (await import(`./messages/he.json`)).default,
    };
  }

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // TypeScript now knows locale is a string after the checks
  return {
    locale: locale as string,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});

