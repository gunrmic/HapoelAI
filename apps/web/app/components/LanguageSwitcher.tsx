"use client";

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { type Locale } from '@/i18n';
import { useEffect, useState, useRef } from 'react';
import styles from './LanguageSwitcher.module.scss';

export default function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [currentLocale, setCurrentLocale] = useState<Locale>(locale);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Update currentLocale when pathname changes
  useEffect(() => {
    const pathLocale = pathname.split('/')[1];
    if (pathLocale === 'he' || pathLocale === 'en') {
      setCurrentLocale(pathLocale as Locale);
    }
  }, [pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

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
    setIsOpen(false);
  };

  const languages: Array<{ locale: Locale; flag: string; name: string }> = [
    { locale: 'he', flag: '🇮🇱', name: 'עברית' },
    { locale: 'en', flag: '🇺🇸', name: 'English' },
  ];

  return (
    <div className={styles.languageSwitcher} ref={dropdownRef}>
      <button
        className={styles.languageButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Switch language"
        aria-expanded={isOpen}
        type="button"
      >
        <span className={styles.flag}>
          {currentLocale === 'he' ? '🇮🇱' : '🇺🇸'}
        </span>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && (
        <div className={styles.dropdown}>
          {languages.map((lang) => (
            <button
              key={lang.locale}
              className={`${styles.dropdownItem} ${currentLocale === lang.locale ? styles.active : ''}`}
              onClick={() => switchLocale(lang.locale)}
              type="button"
            >
              <span className={styles.flag}>{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

