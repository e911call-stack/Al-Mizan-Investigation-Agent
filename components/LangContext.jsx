'use client';
import { createContext, useContext, useState, useEffect } from 'react';

const LangContext = createContext({ lang: 'en', toggle: () => {} });

export function LangProvider({ children }) {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const toggle = () => setLang(l => (l === 'en' ? 'ar' : 'en'));

  return <LangContext.Provider value={{ lang, toggle }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
