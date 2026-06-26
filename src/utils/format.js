import { FIXED_DATE_TIME_LOCALE, getRuntimeLocale } from '../i18n/locales'

const DATE_FORMATTER = new Intl.DateTimeFormat(FIXED_DATE_TIME_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(FIXED_DATE_TIME_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const TIME_FORMATTER = new Intl.DateTimeFormat(FIXED_DATE_TIME_LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
})

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat(FIXED_DATE_TIME_LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function isArabicLocale() {
  return String(getRuntimeLocale() || '').startsWith('ar')
}

function toValidDate(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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
  const date = toValidDate(value)
  if (!date) return '--'
  return DATE_FORMATTER.format(date)
}

export function formatDateTime(value) {
  const date = toValidDate(value)
  if (!date) return '--'
  return DATE_TIME_FORMATTER.format(date)
}

export function formatTime(value) {
  const date = toValidDate(value)
  if (!date) return '--'
  return TIME_FORMATTER.format(date)
}

export function formatLongDate(value) {
  const date = toValidDate(value)
  if (!date) return '--'
  return LONG_DATE_FORMATTER.format(date)
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
