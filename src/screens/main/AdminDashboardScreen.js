import { useCallback, useState } from 'react'
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
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { firstName, formatCount, formatCurrency, formatDateTime } from '../../utils/format'

export default function AdminDashboardScreen() {
  const navigation = useNavigation()
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

    try {
      const response = await api.get('/stats')
      setStats(response.data)
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Les statistiques mobiles ne sont pas disponibles pour ce profil.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    load()
    const interval = setInterval(() => load(), 60000)
    return () => clearInterval(interval)
  }, [load]))

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}>
      <PageHeader
        title={`Bonjour ${firstName(user?.name)}`}
        subtitle={`Vue pilotage mobile - ${formatDateTime(new Date())}`}
        actionIcon="account-circle-outline"
        actionLabel="Compte"
        onActionPress={() => navigation.navigate('Profile')}
      />

      {loading && !stats ? (
        <ActivityIndicator color={T.primary} size="large" style={{ marginTop: 80 }} />
      ) : (
        <>
          {!!error && (
            <View style={s.noticeDanger}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
              <Text style={s.noticeDangerText}>{error}</Text>
            </View>
          )}

          {stats && (
            <>
              <View style={s.grid}>
                <MetricCard
                  label="CA aujourd'hui"
                  value={formatCurrency(stats.today_revenue)}
                  hint="Mise à jour auto chaque minute"
                  icon="cash-multiple"
                  color={T.primary}
                />
                <MetricCard
                  label="CA du mois"
                  value={formatCurrency(stats.month_revenue)}
                  icon="calendar-month"
                  color={T.info}
                />
              </View>

              <View style={s.grid}>
                <MetricCard
                  label="Bénéfice"
                  value={formatCurrency(stats.month_profit)}
                  icon="trending-up"
                  color={T.success}
                />
                <MetricCard
                  label="Impayes"
                  value={formatCurrency(stats.unpaid_total)}
                  icon="credit-card-clock-outline"
                  color={T.danger}
                />
              </View>

              <View style={s.grid}>
                <MetricCard
                  label="Factures du mois"
                  value={formatCount(stats.month_invoices)}
                  icon="file-document-multiple-outline"
                  color={T.primaryDark}
                />
                <MetricCard
                  label="Routes ouvertes"
                  value={formatCount(stats.open_routes)}
                  icon="truck-fast-outline"
                  color={T.warning}
                />
              </View>

              <View style={[s.sectionCard, cardShadow]}>
                <View style={s.sectionTop}>
                  <Text style={s.sectionTitle}>Stock depot surveille</Text>
                  <StatusChip
                    label={(stats.low_depot_stock ?? []).length > 0 ? 'Alerte stock' : 'Stable'}
                    tone={(stats.low_depot_stock ?? []).length > 0 ? 'warning' : 'success'}
                  />
                </View>

                {(stats.low_depot_stock ?? []).length === 0 ? (
                  <Text style={s.emptyText}>Aucun produit depot en alerte pour le moment.</Text>
                ) : (
                  stats.low_depot_stock.slice(0, 8).map((item) => (
                    <View key={item.product?.id || item.product_id} style={s.stockRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.stockName}>{item.product?.name || 'Produit'}</Text>
                        <Text style={s.stockMeta}>Min attendu: {item.product?.min_stock ?? 1}</Text>
                      </View>
                      <Text style={s.stockQty}>{item.qty} {item.product?.unit || 'u'}</Text>
                    </View>
                  ))
                )}
              </View>

              <View style={[s.sectionCard, cardShadow]}>
                <View style={s.sectionTop}>
                  <Text style={s.sectionTitle}>Actions rapides</Text>
                  <StatusChip label="Mobile staff" tone="info" />
                </View>

                <View style={s.quickGrid}>
                  <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Factures')}>
                    <MaterialCommunityIcons name="file-document-outline" size={20} color={T.primary} />
                    <Text style={s.quickLabel}>Factures</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Profile')}>
                    <MaterialCommunityIcons name="account-cog-outline" size={20} color={T.info} />
                    <Text style={s.quickLabel}>Compte</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </>
      )}
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
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  sectionCard: {
    marginTop: 12,
    backgroundColor: T.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: T.border,
  },
  sectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  emptyText: {
    fontSize: 13,
    color: T.textMuted,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  stockName: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  stockMeta: {
    marginTop: 2,
    fontSize: 12,
    color: T.textMuted,
  },
  stockQty: {
    fontSize: 14,
    fontWeight: '800',
    color: T.warning,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
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

