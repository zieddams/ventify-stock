import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import {
  firstName,
  formatCount,
  formatCurrency,
  formatDateTime,
  formatElapsedSince,
  formatTime,
  routeStatusLabel,
  toNumber,
} from '../../utils/format'

function parseItems(data) {
  return Array.isArray(data) ? data : data?.data ?? []
}

function sameCalendarDate(left, right = new Date()) {
  const leftDate = new Date(left)

  return leftDate.getDate() === right.getDate()
    && leftDate.getMonth() === right.getMonth()
    && leftDate.getFullYear() === right.getFullYear()
}

function sessionHint(session, configuredCamion) {
  if (!session) {
    return 'Aucune session active'
  }

  return session.camion?.name || configuredCamion?.name || 'Camion a definir'
}

export default function DashboardScreen() {
  const navigation = useNavigation()
  const { user, isRep } = useAuth()
  const { session, refreshSession } = useTracking()

  const [invoices, setInvoices] = useState([])
  const [stock, setStock] = useState([])
  const [configuredCamion, setConfiguredCamion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    }

    try {
      const [invoiceResponse, camionResponse] = await Promise.all([
        api.get('/invoices', {
          params: {
            period: 'month',
            rep_id: user?.id,
          },
        }),
        api.get('/camion'),
        refreshSession(),
      ])

      setInvoices(parseItems(invoiceResponse.data))
      setStock(Array.isArray(camionResponse.data?.stock) ? camionResponse.data.stock : [])
      setConfiguredCamion(camionResponse.data?.configured_camion ?? null)
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Le tableau de bord mobile n a pas pu etre charge.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [refreshSession, user?.id])

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

  const lowStockCount = useMemo(() => stock.filter((item) => {
    const minStock = Math.max(toNumber(item.product?.min_stock, 1), 1)
    return toNumber(item.qty) <= minStock
  }).length, [stock])

  const sessionInvoiceCount = useMemo(() => {
    if (!Array.isArray(session?.invoices)) {
      return 0
    }

    return session.invoices.filter((invoice) => invoice?.status !== 'cancelled').length
  }, [session?.invoices])

  const sessionTone = !session ? 'warning' : session.status === 'open' ? 'success' : 'info'

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
    >
      <PageHeader
        title={`Bonjour ${firstName(user?.name)}`}
        subtitle="Votre espace mobile"
        actionIcon="account-circle-outline"
        actionLabel="Compte"
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
            <Text style={s.heroTitle}>Ma journee</Text>
            <Text style={s.heroSubtitle}>
              {session
                ? 'Votre session et vos ventes du jour.'
                : 'Demarrez une session pour commencer la journee.'}
            </Text>
          </View>
          <StatusChip
            label={session ? routeStatusLabel(session.status) : 'Sans session'}
            tone={sessionTone}
          />
        </View>

        {!isRep() ? (
          <View style={s.infoBlock}>
            <Text style={s.infoBlockTitle}>Compte commercial requis</Text>
            <Text style={s.infoBlockText}>
              Ce mobile reste optimise pour le commercial qui ouvre une session, gere son camion et facture ses clients.
            </Text>
          </View>
        ) : !session ? (
          <>
            <Text style={s.heroText}>
              Aucune session n est active aujourd hui. Choisissez un camion puis preparez le chargement initial avant de facturer.
            </Text>
            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Session')} activeOpacity={0.85}>
                <MaterialCommunityIcons name="truck-fast-outline" size={18} color="#fff" />
                <Text style={s.primaryButtonText}>Nouvelle session</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Stock')}>
                <Text style={s.secondaryButtonText}>Voir mon stock</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={s.factGrid}>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Ouverture</Text>
                <Text style={s.factValue}>{formatTime(session.opened_at)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Duree</Text>
                <Text style={s.factValue}>{formatElapsedSince(session.opened_at)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Camion</Text>
                <Text style={s.factValue}>{sessionHint(session, configuredCamion)}</Text>
              </View>
            </View>

            <View style={s.sessionGrid}>
              <View style={s.sessionMetric}>
                <Text style={s.sessionMetricLabel}>Ventes</Text>
                <Text style={s.sessionMetricValue}>{formatCurrency(session.total_sold || 0)}</Text>
              </View>
              <View style={s.sessionMetric}>
                <Text style={s.sessionMetricLabel}>Credit</Text>
                <Text style={s.sessionMetricValue}>{formatCurrency(session.credit_given || 0)}</Text>
              </View>
              <View style={s.sessionMetric}>
                <Text style={s.sessionMetricLabel}>Factures</Text>
                <Text style={s.sessionMetricValue}>{formatCount(sessionInvoiceCount)}</Text>
              </View>
            </View>

            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Session')}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={18} color="#fff" />
                <Text style={s.primaryButtonText}>Gerer la session</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Reappro')}>
                <Text style={s.secondaryButtonText}>Recharger le camion</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={s.grid}>
        <MetricCard
          label="Factures du jour"
          value={formatCount(todayInvoices.length)}
          hint={formatCurrency(todayRevenue)}
          icon="file-document-outline"
          color={T.primary}
        />
        <MetricCard
          label="Factures du mois"
          value={formatCount(invoices.length)}
          hint={formatCurrency(monthRevenue)}
          icon="calendar-month-outline"
          color={T.info}
        />
      </View>

      <View style={s.grid}>
        <MetricCard
          label="Stock camion"
          value={formatCount(stock.length)}
          hint={`${formatCount(lowStockCount)} alerte(s)`}
          icon="truck-outline"
          color={lowStockCount > 0 ? T.warning : T.primaryDark}
        />
        <MetricCard
          label="Session du jour"
          value={session ? routeStatusLabel(session.status) : '--'}
          hint={session ? formatDateTime(session.updated_at || session.opened_at) : 'Aucune session'}
          icon="clock-outline"
          color={session ? T.success : T.textMuted}
        />
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Actions rapides</Text>
        <View style={s.quickGrid}>
          <TouchableOpacity
            style={s.quickAction}
            onPress={() => {
              if (session?.status !== 'open') {
                Alert.alert('Session requise', 'Ouvrez d abord une session commerciale avant de creer une facture.')
                return
              }

              navigation.navigate('InvoiceCreate')
            }}
          >
            <MaterialCommunityIcons name="file-document-plus-outline" size={20} color={T.primary} />
            <Text style={s.quickLabel}>Nouvelle facture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Factures')}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={20} color={T.info} />
            <Text style={s.quickLabel}>Mes factures</Text>
          </TouchableOpacity>
        </View>
        <View style={s.quickGrid}>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Clients')}>
            <MaterialCommunityIcons name="account-group-outline" size={20} color={T.warning} />
            <Text style={s.quickLabel}>Mes clients</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Stock')}>
            <MaterialCommunityIcons name="truck-cargo-container" size={20} color={T.success} />
            <Text style={s.quickLabel}>Stock camion</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Dernieres factures</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Factures')}>
            <Text style={s.linkText}>Tout voir</Text>
          </TouchableOpacity>
        </View>

        {loading && invoices.length === 0 ? (
          <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
        ) : invoices.length === 0 ? (
          <Text style={s.emptyText}>Aucune facture enregistree pour ce compte.</Text>
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
                  label={item.payment_status === 'paid' ? 'Reglee' : 'A suivre'}
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
  sessionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  sessionMetric: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: '#f4fbfa',
  },
  sessionMetricLabel: {
    fontSize: 11,
    color: T.textMuted,
  },
  sessionMetricValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  infoBlock: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoBlockTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.info,
  },
  infoBlockText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: T.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: T.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  quickAction: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 8,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
    textAlign: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.primary,
  },
  invoiceRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  invoiceCustomer: {
    marginTop: 4,
    fontSize: 13,
    color: T.textSecondary,
  },
  invoiceMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  invoiceTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: T.primaryDark,
  },
  emptyText: {
    marginTop: 14,
    fontSize: 13,
    color: T.textMuted,
  },
  noticeDanger: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  noticeDangerText: {
    flex: 1,
    fontSize: 13,
    color: T.danger,
  },
})
