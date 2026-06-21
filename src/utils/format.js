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
