"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import en from './i18n/en.json';
import es from './i18n/es.json';

export type Locale = 'en' | 'es';

const translations: Record<Locale, Record<string, any>> = { en, es };

interface I18nContextType {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
    locale: 'es',
    setLocale: () => { },
    t: (key: string) => key,
});

function getNestedValue(obj: any, path: string): string {
    const result = path.split('.').reduce((acc, part) => acc?.[part], obj);
    return typeof result === 'string' ? result : path;
}

export function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('locale');
            if (saved === 'en' || saved === 'es') return saved;
        }
        return 'es'; // Default to Spanish
    });

    const setLocale = useCallback((newLocale: Locale) => {
        setLocaleState(newLocale);
        if (typeof window !== 'undefined') {
            localStorage.setItem('locale', newLocale);
        }
    }, []);

    const t = useCallback((key: string): string => {
        return getNestedValue(translations[locale], key);
    }, [locale]);

    return (
        <I18nContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export const useTranslation = () => useContext(I18nContext);
