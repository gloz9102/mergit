import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ko from './locales/ko.json'

const saved = localStorage.getItem('lang')
const initial = saved ?? (navigator.language.startsWith('ko') ? 'ko' : 'en')

// resources가 인라인이므로 init()은 동기 완료됨 — 첫 렌더 전에 isInitialized가 true라 suspense가 트리거되지 않는다
void i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

export function setLanguage(lang: 'ko' | 'en'): void {
  localStorage.setItem('lang', lang)
  void i18n.changeLanguage(lang)
}

export default i18n
