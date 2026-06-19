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
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCount, formatCurrency, formatDateTime, formatNumber, toNumber } from '../../utils/format'

function sessionLabel(routeSession) {
  if (!routeSession) return 'Sans session'
  return routeSession.status === 'open' ? 'Session ouverte' : 'Session cloturee'
}

export default function CamionScreen() {
  const navigation = useNavigation()
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

  const lowStockCount = useMemo(() => stock.filter((item) => {
    const minStock = Math.max(toNumber(item.product?.min_stock, 1), 1)
    return toNumber(item.qty) <= minStock
  }).length, [stock])

  const totalValue = useMemo(() => stock.reduce((sum, item) => {
    const unitPrice = toNumber(item.product?.sale_price ?? item.product?.depot_price ?? item.product?.price)
    return sum + toNumber(item.qty) * unitPrice
  }, 0), [stock])

  return (
    <View style={s.root}>
      <FlatList
        data={stock}
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
                <Text style={s.rowName}>{item.product?.name || 'Produit'}</Text>
                <Text style={s.rowMeta}>
                  {item.product?.reference || item.product?.unit || 'Camion'}
                  {`  ·  min ${formatNumber(minStock)}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[s.rowQty, { color: isLow ? T.warning : T.primaryDark }]}>
                  {formatNumber(item.qty)}
                </Text>
                <StatusChip label={isLow ? 'Stock bas' : 'OK'} tone={isLow ? 'warning' : 'success'} />
              </View>
            </View>
          )
        }}
        ListHeaderComponent={(
          <View style={s.headerWrap}>
            <PageHeader
              title="Mon camion"
              subtitle={session?.status === 'open' ? 'Session ouverte : chargements audites' : 'Stock embarque du jour'}
              actionIcon="map-marker-path"
              actionLabel={session?.status === 'open' ? 'Session' : 'Ouvrir'}
              onActionPress={() => navigation.navigate('Session')}
            />

            <View style={[s.assignmentCard, cardShadow]}>
              <View style={s.assignmentTop}>
                <View style={s.assignmentIcon}>
                  <MaterialCommunityIcons name="truck-fast-outline" size={22} color={T.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.assignmentLabel}>Camion physique</Text>
                  <Text style={s.assignmentTitle}>{configuredCamion?.name || 'Aucun camion assigne'}</Text>
                  <Text style={s.assignmentMeta}>
                    {configuredCamion?.plate
                      ? `Immatriculation ${configuredCamion.plate}`
                      : 'Affectez le camion depuis Session & GPS pour lier le véhicule réel.'}
                  </Text>
                </View>
                <StatusChip
                  label={sessionLabel(routeSession)}
                  tone={routeSession?.status === 'open' ? 'success' : 'warning'}
                />
              </View>

              <View style={s.assignmentFacts}>
                <View style={s.assignmentFact}>
                  <Text style={s.assignmentFactLabel}>Session</Text>
                  <Text style={s.assignmentFactValue}>{routeSession?.id ? `#${routeSession.id}` : 'Aucune'}</Text>
                </View>
                <View style={s.assignmentFact}>
                  <Text style={s.assignmentFactLabel}>Zone</Text>
                  <Text style={s.assignmentFactValue}>{routeSession?.zone?.name || 'Non definie'}</Text>
                </View>
                <View style={s.assignmentFact}>
                  <Text style={s.assignmentFactLabel}>Ouverture</Text>
                  <Text style={s.assignmentFactValue}>{routeSession?.opened_at ? formatDateTime(routeSession.opened_at) : 'Non demarree'}</Text>
                </View>
              </View>
            </View>

            <View style={s.summaryGrid}>
              <MetricCard
                label="Produits"
                value={formatCount(stock.length)}
                hint="Références présentes"
                icon="package-variant-closed"
                color={T.primary}
              />
              <MetricCard
                label="Stock bas"
                value={formatCount(lowStockCount)}
                hint="Sur seuil minimum"
                icon="alert-circle-outline"
                color={lowStockCount > 0 ? T.warning : T.success}
              />
            </View>

            <View style={s.summaryGrid}>
              <MetricCard
                label="Valeur estimee"
                value={formatCurrency(totalValue)}
                hint="Base prix mobile"
                icon="cash-register"
                color={T.info}
              />
              <View style={[s.banner, cardShadow]}>
                <StatusChip
                  label={session?.status === 'open' ? 'Audit actif' : 'Session fermee'}
                  tone={session?.status === 'open' ? 'success' : 'warning'}
                />
                <Text style={s.bannerTitle}>Chargement et retours</Text>
                <Text style={s.bannerText}>
                  Utilisez le module Réappro pour déclarer dépôt vers camion et retours, puis gardez Session & GPS pour l'affectation du camion et le suivi terrain.
                </Text>
                <TouchableOpacity style={s.bannerButton} onPress={() => navigation.navigate('Reappro')}>
                  <Text style={s.bannerButtonText}>Ouvrir Réappro</Text>
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
                <Text style={s.emptyText}>Aucun stock camion disponible.</Text>
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
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: T.surfaceAlt,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '700',
    color: T.text,
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  rowQty: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: T.textMuted,
  },
})
