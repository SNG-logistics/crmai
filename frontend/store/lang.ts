import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang, TranslationKey } from '../lib/i18n';
import { translations } from '../lib/i18n';

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

export const useLang = create<LangState>()(
  persist(
    (set, get) => ({
      lang: 'th',
      setLang: (lang) => set({ lang }),
      t: (key) => {
        const lang = get().lang;
        return translations[key]?.[lang] ?? translations[key]?.th ?? key;
      },
    }),
    { name: 'crm_lang' }
  )
);
