import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Inter } from 'next/font/google';
import { locales, type Locale } from '@/i18n';
import LocaleHtml from '../components/LocaleHtml';

const inter = Inter({ subsets: ['latin'] });

// Force dynamic rendering in dev mode
export const dynamic = 'force-dynamic';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);

  let messages;
  try {
    // Pass locale explicitly to getMessages
    messages = await getMessages({ locale });
  } catch (error) {
    // Fallback: load messages directly
    const messagesModule = await import(`../../messages/${locale}.json`);
    messages = messagesModule.default;
  }

  // Set direction based on locale: RTL for Hebrew, LTR for English
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={inter.className}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <LocaleHtml />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

