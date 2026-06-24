import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import MetricCard from '../../components/MetricCard'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import {
  firstName,
  formatCount,
  formatCurrency,
  formatDateTime,
  formatLongDate,
  formatTime,
  routeStatusLabel,
  toNumber,
} from '../../utils/format'

function sameCalendarDate(left, right = new Date()) {
  const leftDate = new Date(left)
  return leftDate.getDate() === right.getDate()
    && leftDate.getMonth() === right.getMonth()
    && leftDate.getFullYear() === right.getFullYear()
}

function locationText(location, t) {
  const source = location?.coords ?? location
  if (!Number.isFinite(source?.latitude) || !Number.isFinite(source?.longitude)) {
    return t('repDashboard.location.none')
  }

  return `${source.latitude.toFixed(5)}, ${source.longitude.toFixed(5)}`
}

export default function RepDashboardScreen() {
  const navigation = useNavigation()
  const { user } = useAuth()
  const { t } = useI18n()
  const {
    session,
    currentLocation,
    locationPermission,
    trackingState,
    refreshSession,
    captureCurrentLocation,
  } = useTracking()

  const [invoices, setInvoices] = useState([])
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

    try {
      const [invoiceResponse, stockResponse] = await Promise.all([
        api.get('/invoices', { params: { period: 'month' } }),
        api.get('/camion'),
        refreshSession(),
      ])

      setInvoices(Array.isArray(invoiceResponse.data) ? invoiceResponse.data : invoiceResponse.data?.data ?? [])
      setStock(Array.isArray(stockResponse.data?.stock) ? stockResponse.data.stock : [])
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || t('repDashboard.loadError'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [refreshSession, t])

  useFocusEffect(useCallback(() => {
    load()
    const interval = setInterval(() => load(), 45000)
    return () => clearInterval(interval)
  }, [load]))

  const todayInvoices = useMemo(
    () => invoices.filter((item) => sameCalendarDate(item.created_at)),
    [invoices],
  )

  const todayRevenue = useMemo(
    () => todayInvoices.reduce((sum, item) => sum + toNumber(item.total), 0),
    [todayInvoices],
  )

  const monthRevenue = useMemo(
    () => invoices.reduce((sum, item) => sum + toNumber(item.total), 0),
    [invoices],
  )

  const lowStockCount = useMemo(() => {
    return stock.filter((item) => {
      const minStock = Math.max(toNumber(item.product?.min_stock, 1), 1)
      return toNumber(item.qty) <= minStock
    }).length
  }, [stock])

  const sessionTone = !session
    ? 'warning'
    : session.status === 'open'
      ? 'success'
      : 'info'

  const latestLocation = currentLocation?.coords
    ? currentLocation
    : session?.latestLocation

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
    >
      <PageHeader
        title={t('repDashboard.headerTitle', { name: firstName(user?.name) })}
        subtitle={formatLongDate(new Date())}
        actionIcon="account-circle-outline"
        actionLabel={t('common.account')}
        onActionPress={() => navigation.navigate('Profile')}
      />

      {!!error && (
        <View style={s.noticeDanger}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
          <Text style={s.noticeDangerText}>{error}</Text>
        </View>
      )}

      <View style={[s.heroCard, cardShadow]}>
        <View style={s.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>{t('repDashboard.hero.title')}</Text>
            <Text style={s.heroSubtitle}>{t('repDashboard.hero.subtitle')}</Text>
          </View>
          <StatusChip
            label={session ? routeStatusLabel(session.status) : t('repDashboard.hero.toOpen')}
            tone={sessionTone}
          />
        </View>

        {!session ? (
          <>
            <Text style={s.heroText}>{t('repDashboard.hero.noSessionText')}</Text>
            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Session')} activeOpacity={0.85}>
                <MaterialCommunityIcons name="truck-fast-outline" size={18} color="#fff" />
                <Text style={s.primaryButtonText}>{t('repDashboard.hero.chooseCamion')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Session')}>
                <Text style={s.secondaryButtonText}>{t('repDashboard.hero.viewSessionModule')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={s.factGrid}>
              <View style={s.factItem}>
                <Text style={s.factLabel}>{t('repDashboard.hero.openedAt')}</Text>
                <Text style={s.factValue}>{formatTime(session.opened_at)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>{t('repDashboard.hero.gpsPoints')}</Text>
                <Text style={s.factValue}>{formatCount(session.locations_count || 0)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>{t('repDashboard.hero.gpsPermission')}</Text>
                <Text style={s.factValue}>{locationPermission === 'granted' ? t('repDashboard.hero.permissionGranted') : t('repDashboard.hero.permissionPending')}</Text>
              </View>
            </View>

            <View style={s.bannerRow}>
              <StatusChip
                label={trackingState.active ? t('repDashboard.hero.trackingActive') : t('repDashboard.hero.trackingPending')}
                tone={trackingState.active ? 'success' : 'warning'}
              />
              <StatusChip
                label={trackingState.lastSyncAt ? t('repDashboard.hero.syncAt', { time: formatTime(trackingState.lastSyncAt) }) : t('repDashboard.hero.syncAuto')}
                tone={trackingState.lastSyncAt ? 'info' : 'neutral'}
              />
            </View>

            <View style={s.locationCard}>
              <Text style={s.locationLabel}>{t('repDashboard.location.title')}</Text>
              <Text style={s.locationValue}>{locationText(latestLocation, t)}</Text>
              <Text style={s.locationMeta}>
                {session.latestLocation?.recorded_at
                  ? t('repDashboard.location.lastReported', { date: formatDateTime(session.latestLocation.recorded_at) })
                  : t('repDashboard.location.nextReport')}
              </Text>
            </View>

            <View style={s.camionCard}>
              <Text style={s.locationLabel}>{t('repDashboard.camion.title')}</Text>
              <Text style={s.camionValue}>{session.camion?.name || t('repDashboard.camion.none')}</Text>
              <Text style={s.locationMeta}>
                {session.camion?.plate
                  ? t('repDashboard.camion.plate', { plate: session.camion.plate })
                  : t('repDashboard.camion.hint')}
              </Text>
            </View>

            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Session')}>
                <MaterialCommunityIcons name="map-marker-path" size={18} color="#fff" />
                <Text style={s.primaryButtonText}>{t('repDashboard.hero.manageSession')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => captureCurrentLocation('manual')}>
                <Text style={s.secondaryButtonText}>{t('repDashboard.hero.sendPosition')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={s.grid}>
        <MetricCard
          label={t('repDashboard.metrics.todayRevenue')}
          value={formatCurrency(todayRevenue)}
          hint={t('repDashboard.metrics.invoiceCount', { count: formatCount(todayInvoices.length) })}
          icon="cash-fast"
          color={T.primary}
        />
        <MetricCard
          label={t('repDashboard.metrics.monthRevenue')}
          value={formatCurrency(monthRevenue)}
          hint={t('repDashboard.metrics.invoiceCount', { count: formatCount(invoices.length) })}
          icon="calendar-month-outline"
          color={T.info}
        />
      </View>

      <View style={s.grid}>
        <MetricCard
          label={t('repDashboard.metrics.camionStock')}
          value={formatCount(stock.length)}
          hint={t('repDashboard.metrics.alertCount', { count: formatCount(lowStockCount) })}
          icon="truck-outline"
          color={T.primaryDark}
        />
        <MetricCard
          label={t('repDashboard.metrics.mobileGps')}
          value={trackingState.lastSyncAt ? formatTime(trackingState.lastSyncAt) : '--'}
          hint={trackingState.error || t('repDashboard.metrics.liveMode')}
          icon="crosshairs-gps"
          color={trackingState.error ? T.warning : T.success}
        />
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>{t('repDashboard.quickActions.title')}</Text>
        <View style={s.quickGrid}>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('InvoiceCreate')}>
            <MaterialCommunityIcons name="file-document-plus-outline" size={20} color={T.primary} />
            <Text style={s.quickLabel}>{t('navigation.createInvoice')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Factures')}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={20} color={T.info} />
            <Text style={s.quickLabel}>{t('repDashboard.quickActions.history')}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.quickGrid}>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Camion')}>
            <MaterialCommunityIcons name="truck-cargo-container" size={20} color={T.warning} />
            <Text style={s.quickLabel}>{t('repDashboard.quickActions.myCamion')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Reappro')}>
            <MaterialCommunityIcons name="truck-delivery-outline" size={20} color={T.success} />
            <Text style={s.quickLabel}>{t('navigation.reappro')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>{t('repDashboard.latestInvoices.title')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Factures')}>
            <Text style={s.linkText}>{t('dashboard.viewAll')}</Text>
          </TouchableOpacity>
        </View>

        {loading && invoices.length === 0 ? (
          <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
        ) : invoices.length === 0 ? (
          <Text style={s.emptyText}>{t('repDashboard.latestInvoices.empty')}</Text>
        ) : (
          invoices.slice(0, 5).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={s.invoiceRow}
              onPress={() => navigation.navigate('InvoiceDetail', { id: item.id, initialInvoice: item })}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.invoiceNumber}>{item.number}</Text>
                <Text style={s.invoiceCustomer}>{item.customer_name}</Text>
                <Text style={s.invoiceMeta}>{formatDateTime(item.created_at)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={s.invoiceTotal}>{formatCurrency(item.total)}</Text>
                <StatusChip
                  label={item.payment_status === 'paid' ? t('dashboard.paidStatus') : t('dashboard.followUpStatus')}
                  tone={item.payment_status === 'paid' ? 'success' : 'warning'}
                />
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.background,
  },
  content: {
    padding: 20,
    paddingBottom: 44,
  },
  heroCard: {
    backgroundColor: T.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 14,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: T.text,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: T.textSecondary,
  },
  heroText: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 20,
    color: T.textSecondary,
  },
  heroActions: {
    marginTop: 16,
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.primary,
    borderRadius: 16,
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  factGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  factItem: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: T.surfaceAlt,
  },
  factLabel: {
    fontSize: 11,
    color: T.textMuted,
  },
  factValue: {
    marginTop: 5,
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  bannerRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  locationCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  camionCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  locationLabel: {
    fontSize: 12,
    color: T.textMuted,
  },
  locationValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: T.primaryDark,
  },
  camionValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  locationMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  sectionCard: {
    marginTop: 2,
    marginBottom: 14,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.border,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.primary,
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  invoiceNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: T.primaryDark,
  },
  invoiceCustomer: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  invoiceMeta: {
    marginTop: 3,
    fontSize: 12,
    color: T.textMuted,
  },
  invoiceTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  emptyText: {
    fontSize: 13,
    color: T.textMuted,
  },
  noticeDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 14,
  },
  noticeDangerText: {
    flex: 1,
    fontSize: 13,
    color: T.danger,
  },
})
