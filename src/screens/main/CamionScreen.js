import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
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
import { useI18n } from '../../contexts/I18nContext'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCount, formatCurrency, formatDateTime, formatNumber, toNumber } from '../../utils/format'

function sessionLabel(routeSession, t) {
  if (!routeSession) return t('camion.assignment.noSession')
  return routeSession.status === 'open' ? t('camion.assignment.sessionOpen') : t('camion.assignment.sessionClosed')
}

export default function CamionScreen() {
  const navigation = useNavigation()
  const { t } = useI18n()
  const { session } = useTracking()
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [configuredCamion, setConfiguredCamion] = useState(null)
  const [routeSession, setRouteSession] = useState(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

    try {
      const response = await api.get('/camion')
      setStock(Array.isArray(response.data?.stock) ? response.data.stock : [])
      setConfiguredCamion(response.data?.configured_camion ?? null)
      setRouteSession(response.data?.route_session ?? null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    load()
    const interval = setInterval(() => load(), 45000)
    return () => clearInterval(interval)
  }, [load]))

  const sortedStock = useMemo(() => {
    return [...stock].sort((left, right) => {
      const leftMin = Math.max(toNumber(left.product?.min_stock, 1), 1)
      const rightMin = Math.max(toNumber(right.product?.min_stock, 1), 1)
      const leftLow = toNumber(left.qty) <= leftMin ? 1 : 0
      const rightLow = toNumber(right.qty) <= rightMin ? 1 : 0

      if (leftLow !== rightLow) {
        return rightLow - leftLow
      }

      return String(left.product?.name || '').localeCompare(String(right.product?.name || ''))
    })
  }, [stock])

  const lowStockCount = useMemo(() => sortedStock.filter((item) => {
    const minStock = Math.max(toNumber(item.product?.min_stock, 1), 1)
    return toNumber(item.qty) <= minStock
  }).length, [sortedStock])

  const totalValue = useMemo(() => sortedStock.reduce((sum, item) => {
    const unitPrice = toNumber(item.product?.sale_price ?? item.product?.depot_price ?? item.product?.price)
    return sum + toNumber(item.qty) * unitPrice
  }, 0), [sortedStock])

  return (
    <View style={s.root}>
      <FlatList
        data={sortedStock}
        keyExtractor={(item) => String(item.product_id)}
        renderItem={({ item }) => {
          const minStock = Math.max(toNumber(item.product?.min_stock, 1), 1)
          const isLow = toNumber(item.qty) <= minStock

          return (
            <View style={[s.row, cardShadow, isLow && s.rowLow]}>
              <View style={s.rowIcon}>
                <MaterialCommunityIcons
                  name={isLow ? 'alert-outline' : 'cube-outline'}
                  size={18}
                  color={isLow ? T.warning : T.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{item.product?.name || t('camion.productFallback')}</Text>
                <Text style={s.rowMeta}>
                  {item.product?.reference || item.product?.unit || t('camion.rowStockFallback')}
                  {` · ${t('camion.minLabel', { value: formatNumber(minStock) })}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[s.rowQty, { color: isLow ? T.warning : T.primaryDark }]}>
                  {formatNumber(item.qty)}
                </Text>
                <StatusChip label={isLow ? t('camion.lowStatus') : t('camion.okStatus')} tone={isLow ? 'warning' : 'success'} />
              </View>
            </View>
          )
        }}
        ListHeaderComponent={(
          <View style={s.headerWrap}>
            <PageHeader
              title={t('camion.title')}
              subtitle={session?.status === 'open' ? t('camion.subtitleOpen') : t('camion.subtitleClosed')}
              actionIcon="clipboard-list-outline"
              actionLabel={t('navigation.session')}
              onActionPress={() => navigation.navigate('Session')}
            />

            <View style={[s.assignmentCard, cardShadow]}>
              <View style={s.assignmentTop}>
                <View style={s.assignmentIcon}>
                  <MaterialCommunityIcons name="truck-fast-outline" size={22} color={T.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.assignmentLabel}>{t('camion.assignment.title')}</Text>
                  <Text style={s.assignmentTitle}>{configuredCamion?.name || t('camion.assignment.none')}</Text>
                  <Text style={s.assignmentMeta}>
                    {configuredCamion?.plate
                      ? t('camion.assignment.plate', { plate: configuredCamion.plate })
                      : t('camion.assignment.hint')}
                  </Text>
                </View>
                <StatusChip
                  label={sessionLabel(routeSession, t)}
                  tone={routeSession?.status === 'open' ? 'success' : 'warning'}
                />
              </View>

              <View style={s.assignmentFacts}>
                <View style={s.assignmentFact}>
                  <Text style={s.assignmentFactLabel}>{t('camion.assignment.sessionLabel')}</Text>
                  <Text style={s.assignmentFactValue}>{routeSession?.id ? `#${routeSession.id}` : t('camion.assignment.noSession')}</Text>
                </View>
                <View style={s.assignmentFact}>
                  <Text style={s.assignmentFactLabel}>{t('camion.assignment.openedAt')}</Text>
                  <Text style={s.assignmentFactValue}>{routeSession?.opened_at ? formatDateTime(routeSession.opened_at) : t('camion.assignment.notStarted')}</Text>
                </View>
                <View style={s.assignmentFact}>
                  <Text style={s.assignmentFactLabel}>{t('camion.assignment.zone')}</Text>
                  <Text style={s.assignmentFactValue}>{routeSession?.zone?.name || t('camion.assignment.noZone')}</Text>
                </View>
              </View>
            </View>

            <View style={s.summaryGrid}>
              <MetricCard
                label={t('camion.metrics.products')}
                value={formatCount(sortedStock.length)}
                hint={t('camion.metrics.productsHint')}
                icon="package-variant-closed"
                color={T.primary}
              />
              <MetricCard
                label={t('camion.metrics.lowStock')}
                value={formatCount(lowStockCount)}
                hint={t('camion.metrics.lowStockHint')}
                icon="alert-circle-outline"
                color={lowStockCount > 0 ? T.warning : T.success}
              />
            </View>

            <View style={s.summaryGrid}>
              <MetricCard
                label={t('camion.metrics.estimatedValue')}
                value={formatCurrency(totalValue)}
                hint={t('camion.metrics.estimatedValueHint')}
                icon="cash-register"
                color={T.info}
              />
              <View style={[s.banner, cardShadow]}>
                <StatusChip
                  label={session?.status === 'open' ? t('camion.banner.activeSession') : t('camion.banner.closedSession')}
                  tone={session?.status === 'open' ? 'success' : 'warning'}
                />
                <Text style={s.bannerTitle}>{t('camion.banner.title')}</Text>
                <Text style={s.bannerText}>{t('camion.banner.text')}</Text>
                <TouchableOpacity style={s.bannerButton} onPress={() => navigation.navigate('Reappro')}>
                  <Text style={s.bannerButtonText}>{t('camion.banner.action')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={s.emptyWrap}>
            {loading ? (
              <ActivityIndicator color={T.primary} size="large" />
            ) : (
              <>
                <MaterialCommunityIcons name="truck-outline" size={36} color={T.textMuted} />
                <Text style={s.emptyText}>{t('camion.empty')}</Text>
              </>
            )}
          </View>
        )}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
      />
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.background,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  headerWrap: {
    marginBottom: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  assignmentCard: {
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  assignmentTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  assignmentIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecfeff',
  },
  assignmentLabel: {
    fontSize: 12,
    color: T.textMuted,
  },
  assignmentTitle: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '800',
    color: T.text,
  },
  assignmentMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  assignmentFacts: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  assignmentFact: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: T.surfaceAlt,
  },
  assignmentFactLabel: {
    fontSize: 11,
    color: T.textMuted,
  },
  assignmentFactValue: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '800',
    color: T.text,
  },
  banner: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 16,
  },
  bannerTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  bannerText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: T.textSecondary,
  },
  bannerButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    backgroundColor: T.primary,
  },
  bannerButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    marginBottom: 10,
  },
  rowLow: {
    borderColor: '#fdba74',
    backgroundColor: '#fff7ed',
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surfaceAlt,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  rowQty: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: T.textMuted,
  },
})
