import { getRuntimeLocale, translate } from '../i18n/locales'

function t(key, params = {}) {
  return translate(getRuntimeLocale(), key, params)
}

const TYPE_CONFIG = {
  LowStockNotification: {
    icon: 'alert-outline',
    color: '#d97706',
    bg: '#ffedd5',
    labelKey: 'activity.types.lowStock',
  },
  DailySummaryNotification: {
    icon: 'chart-line',
    color: '#0d9488',
    bg: '#ccfbf1',
    labelKey: 'activity.types.dailySummary',
  },
  default: {
    icon: 'bell-outline',
    color: '#64748b',
    bg: '#e2e8f0',
    labelKey: 'activity.types.default',
  },
}

const ACTIVITY_KIND_CONFIG = {
  'route.session.opened': {
    icon: 'truck-fast-outline',
    color: '#0d9488',
    bg: '#ccfbf1',
    labelKey: 'activity.kinds.routeSessionOpened',
  },
  'route.session.closed': {
    icon: 'flag-checkered',
    color: '#f97316',
    bg: '#ffedd5',
    labelKey: 'activity.kinds.routeSessionClosed',
  },
  'route.load.updated': {
    icon: 'truck-plus-outline',
    color: '#2563eb',
    bg: '#dbeafe',
    labelKey: 'activity.kinds.routeLoadUpdated',
  },
  'route.returns.updated': {
    icon: 'backup-restore',
    color: '#d97706',
    bg: '#ffedd5',
    labelKey: 'activity.kinds.routeReturnsUpdated',
  },
  'invoice.created': {
    icon: 'file-document-plus-outline',
    color: '#8b5cf6',
    bg: '#ede9fe',
    labelKey: 'activity.kinds.invoiceCreated',
  },
  'invoice.payment.recorded': {
    icon: 'cash-check',
    color: '#059669',
    bg: '#d1fae5',
    labelKey: 'activity.kinds.invoicePaymentRecorded',
  },
  'product.created': {
    icon: 'package-variant-plus',
    color: '#0891b2',
    bg: '#cffafe',
    labelKey: 'activity.kinds.productCreated',
  },
  'product.updated': {
    icon: 'package-variant-closed',
    color: '#0284c7',
    bg: '#dbeafe',
    labelKey: 'activity.kinds.productUpdated',
  },
  'product.deleted': {
    icon: 'package-variant-remove',
    color: '#dc2626',
    bg: '#fee2e2',
    labelKey: 'activity.kinds.productDeleted',
  },
  'customer.created': {
    icon: 'account-plus-outline',
    color: '#14b8a6',
    bg: '#ccfbf1',
    labelKey: 'activity.kinds.customerCreated',
  },
  'customer.updated': {
    icon: 'account-edit-outline',
    color: '#0f766e',
    bg: '#ccfbf1',
    labelKey: 'activity.kinds.customerUpdated',
  },
  'customer.deleted': {
    icon: 'account-remove-outline',
    color: '#dc2626',
    bg: '#fee2e2',
    labelKey: 'activity.kinds.customerDeleted',
  },
  'customer.assignment.updated': {
    icon: 'account-switch-outline',
    color: '#2563eb',
    bg: '#dbeafe',
    labelKey: 'activity.kinds.customerAssignmentUpdated',
  },
  'expense.created': {
    icon: 'receipt',
    color: '#f59e0b',
    bg: '#ffedd5',
    labelKey: 'activity.kinds.expenseCreated',
  },
  'expense.updated': {
    icon: 'file-document-edit-outline',
    color: '#d97706',
    bg: '#ffedd5',
    labelKey: 'activity.kinds.expenseUpdated',
  },
  'expense.deleted': {
    icon: 'delete-outline',
    color: '#dc2626',
    bg: '#fee2e2',
    labelKey: 'activity.kinds.expenseDeleted',
  },
  'inventory.adjusted': {
    icon: 'scale-balance',
    color: '#7c3aed',
    bg: '#ede9fe',
    labelKey: 'activity.kinds.inventoryAdjusted',
  },
  'config.item.created': {
    icon: 'tune',
    color: '#0d9488',
    bg: '#ccfbf1',
    labelKey: 'activity.kinds.configItemCreated',
  },
  'config.item.updated': {
    icon: 'tune',
    color: '#0891b2',
    bg: '#cffafe',
    labelKey: 'activity.kinds.configItemUpdated',
  },
  'config.item.deleted': {
    icon: 'tune',
    color: '#dc2626',
    bg: '#fee2e2',
    labelKey: 'activity.kinds.configItemDeleted',
  },
  'settings.updated': {
    icon: 'cog-outline',
    color: '#6366f1',
    bg: '#e0e7ff',
    labelKey: 'activity.kinds.settingsUpdated',
  },
  'camion.created': {
    icon: 'truck-plus-outline',
    color: '#0d9488',
    bg: '#ccfbf1',
    labelKey: 'activity.kinds.camionCreated',
  },
  'camion.updated': {
    icon: 'truck-check-outline',
    color: '#2563eb',
    bg: '#dbeafe',
    labelKey: 'activity.kinds.camionUpdated',
  },
  'user.created': {
    icon: 'account-plus-outline',
    color: '#16a34a',
    bg: '#dcfce7',
    labelKey: 'activity.kinds.userCreated',
  },
  'user.updated': {
    icon: 'account-cog-outline',
    color: '#4f46e5',
    bg: '#e0e7ff',
    labelKey: 'activity.kinds.userUpdated',
  },
  'session.reported': {
    icon: 'cellphone',
    color: '#14b8a6',
    bg: '#ccfbf1',
    labelKey: 'activity.kinds.sessionReported',
  },
  'session.offline': {
    icon: 'cellphone-off',
    color: '#f97316',
    bg: '#ffedd5',
    labelKey: 'activity.kinds.sessionOffline',
  },
  'bug.report.created': {
    icon: 'bug-outline',
    color: '#dc2626',
    bg: '#fee2e2',
    labelKey: 'activity.kinds.bugReportCreated',
  },
  'developer.broadcast': {
    icon: 'bullhorn-variant-outline',
    color: '#0f766e',
    bg: '#ccfbf1',
    labelKey: 'activity.kinds.developerBroadcast',
  },
}

export function formatNotificationAge(dateStr) {
  if (!dateStr) return t('activity.age.justNow')

  const minutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (minutes < 1) return t('activity.age.justNow')
  if (minutes < 60) return t('activity.age.minutesAgo', { count: minutes })

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('activity.age.hoursAgo', { count: hours })

  return t('activity.age.daysAgo', { count: Math.floor(hours / 24) })
}

export function notificationMessage(notification, fallbackLabel) {
  return notification?.data?.message || fallbackLabel || ''
}

export function resolveNotificationConfig(notification) {
  if (notification?.type === 'OpsActivityNotification') {
    const activity = ACTIVITY_KIND_CONFIG[notification?.data?.kind] ?? TYPE_CONFIG.default

    return {
      ...activity,
      label: t(activity.labelKey),
    }
  }

  const config = TYPE_CONFIG[notification?.type] ?? TYPE_CONFIG.default

  return {
    ...config,
    label: t(config.labelKey),
  }
}

export function notificationChanges(notification, limit = 4) {
  const explicitChanges = notification?.data?.changes

  if (Array.isArray(explicitChanges)) {
    return explicitChanges
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .slice(0, limit)
  }

  const stockItems = notification?.data?.items
  if (Array.isArray(stockItems)) {
    return stockItems
      .map((item) => {
        const productName = String(item?.product_name ?? '').trim()
        const depotName = String(item?.depot_name ?? '').trim() || t('activity.defaultDepot')
        const qty = Number(item?.qty ?? 0)
        const minStock = Number(item?.min_stock ?? 0)

        if (!productName) {
          return ''
        }

        return t('activity.stockItem', { productName, depotName, qty, minStock })
      })
      .filter(Boolean)
      .slice(0, limit)
  }

  return []
}

export function resolveNotificationTarget(notification) {
  const invoiceId = notification?.data?.invoice_id ?? notification?.data?.invoice?.id ?? null

  if (invoiceId) {
    return {
      screen: 'InvoiceDetail',
      params: { id: invoiceId },
    }
  }

  const kind = notification?.data?.kind

  switch (kind) {
    case 'route.session.opened':
    case 'route.session.closed':
    case 'route.load.updated':
    case 'route.returns.updated':
    case 'session.reported':
    case 'session.offline':
      return { tab: 'session' }
    case 'invoice.created':
    case 'invoice.payment.recorded':
      return { tab: 'invoices' }
    case 'customer.created':
    case 'customer.updated':
    case 'customer.deleted':
    case 'customer.assignment.updated':
      return { tab: 'customers' }
    case 'inventory.adjusted':
    case 'camion.created':
    case 'camion.updated':
      return { tab: 'stock' }
    case 'developer.broadcast':
      return { tab: 'notifications' }
    default:
      if (notification?.type === 'LowStockNotification') {
        return { tab: 'stock' }
      }

      return null
  }
}
