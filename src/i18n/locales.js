import * as SecureStore from 'expo-secure-store'
import arTN from './messages/ar-TN'
import frTN from './messages/fr-TN'

export const DEFAULT_LOCALE = 'ar-TN'
export const FALLBACK_LOCALE = 'fr-TN'
export const LOCALE_STORAGE_KEY = 'irtiwaa_locale'

export const SUPPORTED_LOCALES = [
  { code: 'ar-TN', direction: 'rtl', flag: 'tn' },
  { code: 'fr-TN', direction: 'ltr', flag: 'tn' },
]

const DICTIONARIES = {
  'ar-TN': arTN,
  'fr-TN': frTN,
}

let runtimeLocale = DEFAULT_LOCALE

function resolveKeyPath(source, key) {
  return String(key || '')
    .split('.')
    .reduce((carry, part) => (carry && Object.prototype.hasOwnProperty.call(carry, part) ? carry[part] : undefined), source)
}

function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, token) => {
    const value = params[token]
    return value === undefined || value === null ? '' : String(value)
  })
}

export function normalizeLocale(locale) {
  const raw = String(locale || '').trim().replace('_', '-').toLowerCase()

  if (raw.startsWith('fr')) {
    return 'fr-TN'
  }

  if (raw.startsWith('ar')) {
    return 'ar-TN'
  }

  return DEFAULT_LOCALE
}

export function normalizeIntlLocale(locale) {
  return normalizeLocale(locale)
}

export function getLocaleMeta(locale) {
  const normalized = normalizeLocale(locale)
  return SUPPORTED_LOCALES.find((item) => item.code === normalized) ?? SUPPORTED_LOCALES[0]
}

export async function getStoredLocale() {
  try {
    return normalizeLocale(await SecureStore.getItemAsync(LOCALE_STORAGE_KEY))
  } catch {
    return DEFAULT_LOCALE
  }
}

export async function setStoredLocale(locale) {
  try {
    await SecureStore.setItemAsync(LOCALE_STORAGE_KEY, normalizeLocale(locale))
  } catch {}
}

export function setRuntimeLocale(locale) {
  runtimeLocale = normalizeLocale(locale)
}

export function getRuntimeLocale() {
  return runtimeLocale
}

export function getRawTranslation(locale, key) {
  const normalized = normalizeLocale(locale)
  return resolveKeyPath(DICTIONARIES[normalized], key) ?? resolveKeyPath(DICTIONARIES[FALLBACK_LOCALE], key)
}

export function translate(locale, key, params = {}) {
  const value = getRawTranslation(locale, key)

  if (typeof value === 'function') {
    return value(params)
  }

  if (typeof value === 'string') {
    return interpolate(value, params)
  }

  return typeof key === 'string' ? key : ''
}
