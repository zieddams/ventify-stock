import { BASE_URL } from '../services/api'

export const DEFAULT_BRAND_SOURCE = require('../../assets/irtiwaa-mark.png')

function cleanString(value) {
  return String(value ?? '').trim()
}

function resolveApiOrigin() {
  try {
    return new URL(BASE_URL).origin
  } catch {
    return ''
  }
}

export function resolveCompanyLogoUrl(user) {
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
  return cleanString(user?.company?.name) || 'Gestion de vente'
}

export function resolveBrandCaption(user) {
  if (user?.company?.id) {
    return 'Societe connectee'
  }

  if (user?.role === 'developer') {
    return 'Compte developpeur'
  }

  return 'Plateforme'
}

export function resolveBrandHint(user) {
  if (user?.company?.id) {
    return 'Logo actif du compte connecte.'
  }

  return 'Icone plateforme par defaut.'
}
