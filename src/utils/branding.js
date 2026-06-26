import { BASE_URL } from '../services/api'

export const DEFAULT_BRAND_SOURCE = require('../../assets/icon.png')

function cleanString(value) {
  return String(value ?? '').trim()
}

function isDeveloperUser(user) {
  return user?.role === 'developer'
}

function shouldUseCompanyBrand(user) {
  return Boolean(user?.company?.id) && !isDeveloperUser(user)
}

function resolveApiOrigin() {
  try {
    return new URL(BASE_URL).origin
  } catch {
    return ''
  }
}

export function resolveCompanyLogoUrl(user) {
  if (!shouldUseCompanyBrand(user)) {
    return ''
  }

  const rawLogo = cleanString(user?.company?.logo_url)

  if (!rawLogo) {
    return ''
  }

  if (/^https?:\/\//i.test(rawLogo)) {
    return rawLogo
  }

  const origin = resolveApiOrigin()
  if (!origin) {
    return rawLogo
  }

  if (rawLogo.startsWith('/')) {
    return `${origin}${rawLogo}`
  }

  return `${origin}/${rawLogo.replace(/^\/+/, '')}`
}

export function resolveBrandImageSource(user, fallbackToDefault = true) {
  const logoUrl = resolveCompanyLogoUrl(user)

  if (logoUrl) {
    return { uri: logoUrl }
  }

  return fallbackToDefault ? DEFAULT_BRAND_SOURCE : null
}

export function resolveBrandName(user) {
  if (!shouldUseCompanyBrand(user)) {
    return 'Gestion de vente'
  }

  return cleanString(user?.company?.name) || 'Gestion de vente'
}

export function resolveBrandCaption(user) {
  if (isDeveloperUser(user)) {
    return 'Compte developpeur'
  }

  if (shouldUseCompanyBrand(user)) {
    return ''
  }

  return 'Plateforme'
}

export function resolveBrandHint(user) {
  if (shouldUseCompanyBrand(user)) {
    return ''
  }

  return 'Icone plateforme par defaut.'
}
