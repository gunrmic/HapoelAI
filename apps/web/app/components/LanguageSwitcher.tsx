"use client";

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { type Locale } from '@/i18n';
import { useEffect, useState } from 'react';
import styles from './LanguageSwitcher.module.scss';

export default function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [currentLocale, setCurrentLocale] = useState<Locale>(locale);

  // Update currentLocale when pathname changes
  useEffect(() => {
    const pathLocale = pathname.split('/')[1];
    if (pathLocale === 'he' || pathLocale === 'en') {
      setCurrentLocale(pathLocale as Locale);
    }
  }, [pathname]);

  const switchLocale = (newLocale: Locale) => {
    // Get the actual URL from the browser
    const currentPath = typeof window !== 'undefined' 
      ? window.location.pathname 
      : `/${currentLocale}`;
    
    // Extract the path after the locale
    // currentPath will be like "/he", "/en", "/he/...", "/en/..."
    let pathAfterLocale = '/';
    
    // Remove any locale prefix to get the path after it
    const match = currentPath.match(/^\/(he|en)(\/.*)?$/);
    if (match) {
      pathAfterLocale = match[2] || '/';
    }
    
    // Construct the new path with the new locale
    const newPath = pathAfterLocale === '/' 
      ? `/${newLocale}` 
      : `/${newLocale}${pathAfterLocale}`;
    
    // Use router.replace to avoid adding to history
    router.replace(newPath as any);
  };

  // Toggle between Hebrew and English based on the actual current locale
  const nextLocale: Locale = currentLocale === 'he' ? 'en' : 'he';

  return (
    <button
      className={styles.languageButton}
      onClick={() => switchLocale(nextLocale)}
      aria-label="Switch language"
      type="button"
    >
      {currentLocale === 'en' ? 'עברית' : 'English'}
    </button>
  );
}

