export function toNumber(value, fallback = 0) {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

export function formatNumber(value, digits = 3) {
  return new Intl.NumberFormat('fr-TN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNumber(value))
}

export function formatCurrency(value) {
  return `${formatNumber(value)} TND`
}

export function formatCount(value) {
  return new Intl.NumberFormat('fr-TN', {
    maximumFractionDigits: 0,
  }).format(toNumber(value))
}

export function formatDate(value) {
  if (!value) return '--'
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateTime(value) {
  if (!value) return '--'
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(value) {
  if (!value) return '--'
  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatElapsedSince(value, now = new Date()) {
  if (!value) return '--'

  const startedAt = new Date(value)
  const currentDate = now instanceof Date ? now : new Date(now)
  const diffMs = Math.max(0, currentDate.getTime() - startedAt.getTime())
  const totalMinutes = Math.floor(diffMs / 60000)

  if (totalMinutes < 1) {
    const totalSeconds = Math.max(1, Math.floor(diffMs / 1000))
    return `${totalSeconds} s`
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }

  const totalHours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60

  if (totalHours < 24) {
    return remainingMinutes > 0 ? `${totalHours} h ${remainingMinutes} min` : `${totalHours} h`
  }

  const totalDays = Math.floor(totalHours / 24)
  const remainingHours = totalHours % 24

  return remainingHours > 0 ? `${totalDays} j ${remainingHours} h` : `${totalDays} j`
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'Equipe'
}

export function unwrapStatus(status) {
  if (typeof status === 'string') return status
  return status?.value ?? ''
}

export function routeStatusLabel(status) {
  const value = unwrapStatus(status)
  const map = {
    open: 'Ouverte',
    closed: 'Clôturée',
  }
  return map[value] ?? 'Inconnue'
}

export function invoiceStatusLabel(status) {
  const value = unwrapStatus(status)
  const map = {
    draft: 'Brouillon',
    sent: 'Envoyée',
    paid: 'Payée',
    cancelled: 'Annulée',
  }
  return map[value] ?? 'Brouillon'
}

export function paymentStatusLabel(status) {
  const value = unwrapStatus(status)
  const map = {
    unpaid: 'Impayée',
    partial: 'Partielle',
    paid: 'Payée',
  }
  return map[value] ?? 'Impayée'
}
