
import { useState, useEffect } from 'react';

export type Language = 'en' | 'fa';

const translations = {
  en: {
    you: 'You',
    placeholder: 'Describe your app...',
    footer: 'Powered by Gemini 3 Pro & Flash Lite',
    welcome: 'Welcome',
    projects: 'Projects',
    newProject: 'New Project',
    deploy: 'Preview',
    settings: 'Settings',
    admin: 'Admin',
    logout: 'Log out',
    syncing: 'Syncing...',
    local: 'Local Mode',
    cloud: 'Cloud Connected',
    preview: 'Preview',
    code: 'Code',
    split: 'Split',
    adminPanel: 'Admin Control Panel',
    ready: 'Ready to build something amazing today?',
    selectProject: 'Select a Project',
    saveConnect: 'Save & Connect',
    disconnect: 'Disconnect',
    requiredSql: 'Required SQL Setup',
    managedCode: 'Database configuration is managed via source code. Updates here are disabled.',
    configureGlobal: 'Configure the global database connection for the application.',
    projectUrl: 'Project URL',
    anonKey: 'Anon Key',
    publish: 'Publish',
    live: 'Live',
    visitors: 'Visitors',
    editDomain: 'Edit domain',
    manageDomains: 'Manage domains',
    whoCanAccess: 'Who can access?',
    anyone: 'Anyone',
    securityScan: 'Security Scan',
    reviewSecurity: 'Review security',
    updated: 'Updated'
  },
  fa: {
    you: 'شما',
    placeholder: 'برنامه خود را توصیف کنید...',
    footer: 'قدرت گرفته از جمنای',
    welcome: 'خوش آمدید',
    projects: 'پروژه‌ها',
    newProject: 'پروژه جدید',
    deploy: 'پیش‌نمایش',
    settings: 'تنظیمات',
    admin: 'مدیریت',
    logout: 'خروج',
    syncing: 'همگام‌سازی...',
    local: 'حالت محلی',
    cloud: 'متصل به ابری',
    preview: 'پیش‌نمایش',
    code: 'کد',
    split: 'دوتایی',
    adminPanel: 'پنل مدیریت',
    ready: 'آماده‌اید امروز چیزی شگفت‌انگیز بسازید؟',
    selectProject: 'یک پروژه انتخاب کنید',
    saveConnect: 'ذخیره و اتصال',
    disconnect: 'قطع اتصال',
    requiredSql: 'تنظیمات SQL مورد نیاز',
    managedCode: 'تنظیمات دیتابیس از طریق کد مدیریت می‌شود.',
    configureGlobal: 'تنظیمات اتصال پایگاه داده جهانی برای برنامه.',
    projectUrl: 'آدرس پروژه',
    anonKey: 'کلید ناشناس',
    publish: 'انتشار',
    live: 'زنده',
    visitors: 'بازدیدکننده',
    editDomain: 'ویرایش دامنه',
    manageDomains: 'مدیریت دامنه‌ها',
    whoCanAccess: 'چه کسی دسترسی دارد؟',
    anyone: 'همه',
    securityScan: 'اسکن امنیتی',
    reviewSecurity: 'بررسی امنیت',
    updated: 'به‌روز شد'
  }
};

// Global Event Bus for Language
const listeners = new Set<(lang: Language) => void>();
let currentLang: Language = 'en';

export const setLanguage = (lang: Language) => {
  currentLang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
  // Apply font based on language
  document.body.style.fontFamily = lang === 'fa' ? '"Vazirmatn", sans-serif' : '"Inter", sans-serif';
  listeners.forEach(l => l(lang));
};

export const useTranslation = () => {
  const [lang, setLang] = useState<Language>(currentLang);

  useEffect(() => {
    const handler = (l: Language) => setLang(l);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return {
    t: (key: keyof typeof translations['en']) => (translations[lang] as any)[key] || key,
    dir: lang === 'fa' ? 'rtl' : 'ltr',
    lang,
    setLanguage
  };
};
