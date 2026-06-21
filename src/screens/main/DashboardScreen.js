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

  const camionLabel = session.camion?.name || configuredCamion?.name || 'Camion non défini'
  const openedLabel = session.opened_at ? formatTime(session.opened_at) : 'heure inconnue'

  return `${camionLabel} · ${openedLabel}`
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
      setError(err.response?.data?.message || 'Le tableau de bord mobile n’a pas pu être chargé.')
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

  const sessionTone = !session
    ? 'warning'
    : session.status === 'open'
      ? 'success'
      : 'info'

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
    >
      <PageHeader
        title={`Bonjour ${firstName(user?.name)}`}
        subtitle="Votre espace commercial"
        actionIcon="cog-outline"
        actionLabel="Réglages"
        onActionPress={() => navigation.navigate('Réglages')}
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
            <Text style={s.heroTitle}>Ma journée</Text>
            <Text style={s.heroSubtitle}>
              L’écran d’accueil reste volontairement simple. Les détails système et GPS restent réservés au back-office.
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
              Ce compte peut consulter les données mobiles, mais l’ouverture et la gestion terrain restent réservées au commercial.
            </Text>
          </View>
        ) : !session ? (
          <>
            <Text style={s.heroText}>
              Aucune session n’est active pour aujourd’hui. Choisissez le camion réel puis chargez le stock initial pour démarrer.
            </Text>
            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Session')} activeOpacity={0.85}>
                <MaterialCommunityIcons name="truck-fast-outline" size={18} color="#fff" />
                <Text style={s.primaryButtonText}>Démarrer une session</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Clients')}>
                <Text style={s.secondaryButtonText}>Voir mes clients</Text>
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
                <Text style={s.factLabel}>Camion</Text>
                <Text style={s.factValue}>{session.camion?.name || configuredCamion?.name || 'À définir'}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Mise à jour</Text>
                <Text style={s.factValue}>{session.updated_at ? formatTime(session.updated_at) : '--'}</Text>
              </View>
            </View>

            <View style={s.sessionSummaryCard}>
              <Text style={s.sessionSummaryLabel}>Session active</Text>
              <Text style={s.sessionSummaryValue}>{sessionHint(session, configuredCamion)}</Text>
              <Text style={s.sessionSummaryMeta}>
                Les ventes, recharges et mouvements restent synchronisés avec la plateforme web en arrière-plan.
              </Text>
            </View>

            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Session')}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={18} color="#fff" />
                <Text style={s.primaryButtonText}>Gérer la session</Text>
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
          hint={sessionHint(session, configuredCamion)}
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
                Alert.alert('Session requise', 'Ouvrez d’abord une session commerciale avant de créer une facture.')
                return
              }

              navigation.navigate('InvoiceCreate')
            }}
          >
            <MaterialCommunityIcons name="file-document-plus-outline" size={20} color={T.primary} />
            <Text style={s.quickLabel}>Nouvelle facture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Factures')}>
            <MaterialCommunityIcons name="printer-wireless" size={20} color={T.info} />
            <Text style={s.quickLabel}>Mes factures</Text>
          </TouchableOpacity>
        </View>
        <View style={s.quickGrid}>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Clients')}>
            <MaterialCommunityIcons name="account-group-outline" size={20} color={T.warning} />
            <Text style={s.quickLabel}>Mes clients</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('Session')}>
            <MaterialCommunityIcons name="truck-fast-outline" size={20} color={T.success} />
            <Text style={s.quickLabel}>Ma session</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Dernières factures</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Factures')}>
            <Text style={s.linkText}>Tout voir</Text>
          </TouchableOpacity>
        </View>

        {loading && invoices.length === 0 ? (
          <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
        ) : invoices.length === 0 ? (
          <Text style={s.emptyText}>Aucune facture enregistrée pour ce compte.</Text>
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
                  label={item.payment_status === 'paid' ? 'Réglée' : 'À suivre'}
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
  sessionSummaryCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  sessionSummaryLabel: {
    fontSize: 12,
    color: T.textMuted,
  },
  sessionSummaryValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: T.primaryDark,
  },
  sessionSummaryMeta: {
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
