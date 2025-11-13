"use client";

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type Locale } from '@/i18n';

export default function LocaleHtml() {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>('he');

  // Extract locale from pathname
  useEffect(() => {
    const pathLocale = pathname.split('/')[1];
    if (pathLocale === 'he' || pathLocale === 'en') {
      setLocale(pathLocale as Locale);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const dir = locale === 'he' ? 'rtl' : 'ltr';
      document.documentElement.lang = locale;
      // Set direction: RTL for Hebrew, LTR for English
      document.documentElement.dir = dir;
    }
  }, [locale, pathname]);

  return null;
}

