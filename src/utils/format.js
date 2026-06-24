import { getRuntimeLocale } from '../i18n/locales'

function isArabicLocale() {
  return String(getRuntimeLocale() || '').startsWith('ar')
}

function localizedFallback() {
  return isArabicLocale() ? 'الفريق' : 'Équipe'
}

export function toNumber(value, fallback = 0) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

export function formatNumber(value, digits = 3) {
  return new Intl.NumberFormat(getRuntimeLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNumber(value))
}

export function formatCurrency(value) {
  return `${formatNumber(value)} TND`
}

export function formatCount(value) {
  return new Intl.NumberFormat(getRuntimeLocale(), {
    maximumFractionDigits: 0,
  }).format(toNumber(value))
}

export function formatDate(value) {
  if (!value) return '--'
  return new Date(value).toLocaleDateString(getRuntimeLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateTime(value) {
  if (!value) return '--'
  return new Date(value).toLocaleString(getRuntimeLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(value) {
  if (!value) return '--'
  return new Date(value).toLocaleTimeString(getRuntimeLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatLongDate(value) {
  if (!value) return '--'
  return new Date(value).toLocaleDateString(getRuntimeLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function formatElapsedSince(value, now = new Date()) {
  if (!value) return '--'

  const startedAt = new Date(value)
  const currentDate = now instanceof Date ? now : new Date(now)
  const diffMs = Math.max(0, currentDate.getTime() - startedAt.getTime())
  const totalMinutes = Math.floor(diffMs / 60000)
  const ar = isArabicLocale()

  if (totalMinutes < 1) {
    const totalSeconds = Math.max(1, Math.floor(diffMs / 1000))
    return ar ? `${totalSeconds} ث` : `${totalSeconds} s`
  }

  if (totalMinutes < 60) {
    return ar ? `${totalMinutes} دق` : `${totalMinutes} min`
  }

  const totalHours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60

  if (totalHours < 24) {
    if (remainingMinutes > 0) {
      return ar ? `${totalHours} س ${remainingMinutes} دق` : `${totalHours} h ${remainingMinutes} min`
    }

    return ar ? `${totalHours} س` : `${totalHours} h`
  }

  const totalDays = Math.floor(totalHours / 24)
  const remainingHours = totalHours % 24

  if (remainingHours > 0) {
    return ar ? `${totalDays} ي ${remainingHours} س` : `${totalDays} j ${remainingHours} h`
  }

  return ar ? `${totalDays} ي` : `${totalDays} j`
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || localizedFallback()
}

export function unwrapStatus(status) {
  if (typeof status === 'string') return status
  return status?.value ?? ''
}

export function routeStatusLabel(status) {
  const value = unwrapStatus(status)
  const ar = isArabicLocale()
  const map = ar
    ? {
        open: 'مفتوحة',
        closed: 'مغلقة',
      }
    : {
        open: 'Ouverte',
        closed: 'Clôturée',
      }

  return map[value] ?? (ar ? 'غير معروفة' : 'Inconnue')
}

export function invoiceStatusLabel(status) {
  const value = unwrapStatus(status)
  const ar = isArabicLocale()
  const map = ar
    ? {
        draft: 'مسودة',
        sent: 'مرسلة',
        paid: 'مدفوعة',
        cancelled: 'ملغاة',
      }
    : {
        draft: 'Brouillon',
        sent: 'Envoyée',
        paid: 'Payée',
        cancelled: 'Annulée',
      }

  return map[value] ?? map.draft
}

export function paymentStatusLabel(status) {
  const value = unwrapStatus(status)
  const ar = isArabicLocale()
  const map = ar
    ? {
        unpaid: 'غير مدفوعة',
        partial: 'جزئية',
        paid: 'مدفوعة',
      }
    : {
        unpaid: 'Impayée',
        partial: 'Partielle',
        paid: 'Payée',
      }

  return map[value] ?? map.unpaid
}
