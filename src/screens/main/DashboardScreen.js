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

function locationText(location) {
  const source = location?.coords ?? location
  if (!Number.isFinite(source?.latitude) || !Number.isFinite(source?.longitude)) return 'Aucune position capturee.'
  return `${source.latitude.toFixed(5)}, ${source.longitude.toFixed(5)}`
}

export default function DashboardScreen() {
  const navigation = useNavigation()
  const { user, isRep } = useAuth()
  const {
    session,
    currentLocation,
    locationPermission,
    trackingState,
    refreshSession,
  } = useTracking()

  const [invoices, setInvoices] = useState([])
  const [stock, setStock] = useState([])
  const [configuredCamion, setConfiguredCamion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

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

  const latestLocation = currentLocation?.coords ? currentLocation : session?.latestLocation
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
        subtitle="Votre espace mobile commercial"
        actionIcon="cog-outline"
        actionLabel="Reglages"
        onActionPress={() => navigation.navigate('Reglages')}
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
            <Text style={s.heroTitle}>Mon activite du jour</Text>
            <Text style={s.heroSubtitle}>
              Facturation mobile, session commerciale et stock camion lies a votre compte courant.
            </Text>
          </View>
          <StatusChip
            label={session ? routeStatusLabel(session.status) : 'Sans session'}
            tone={sessionTone}
          />
        </View>

        {!isRep() ? (
          <View style={s.infoBlock}>
            <Text style={s.infoBlockTitle}>Mode terrain reserve au compte commercial</Text>
            <Text style={s.infoBlockText}>
              Ce compte peut consulter les donnees mobiles, mais l ouverture et la gestion d une session doivent etre testees avec un compte commercial.
            </Text>
          </View>
        ) : !session ? (
          <>
            <Text style={s.heroText}>
              Aucune session ouverte pour aujourd hui. Choisissez le camion reel et le chargement initial pour demarrer la session.
            </Text>
            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Session')} activeOpacity={0.85}>
                <MaterialCommunityIcons name="truck-fast-outline" size={18} color="#fff" />
                <Text style={s.primaryButtonText}>Demarrer la session</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Session')}>
                <Text style={s.secondaryButtonText}>Voir le module session</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={s.factGrid}>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Ouverte</Text>
                <Text style={s.factValue}>{formatTime(session.opened_at)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Camion</Text>
                <Text style={s.factValue}>{session.camion?.name || configuredCamion?.name || 'A definir'}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Sync</Text>
                <Text style={s.factValue}>{locationPermission === 'granted' ? 'OK' : 'A valider'}</Text>
              </View>
            </View>

            <View style={s.bannerRow}>
              <StatusChip
                label={trackingState.active ? 'Synchronisation active' : 'Synchronisation en attente'}
                tone={trackingState.active ? 'success' : 'warning'}
              />
              <StatusChip
                label={trackingState.lastSyncAt ? `Sync ${formatTime(trackingState.lastSyncAt)}` : 'Sync auto'}
                tone={trackingState.lastSyncAt ? 'info' : 'neutral'}
              />
            </View>

            <View style={s.locationCard}>
              <Text style={s.locationLabel}>Derniere position synchronisee</Text>
              <Text style={s.locationValue}>{locationText(latestLocation)}</Text>
              <Text style={s.locationMeta}>
                {session.latestLocation?.recorded_at
                  ? `Serveur: ${formatDateTime(session.latestLocation.recorded_at)}`
                  : 'La prochaine position sera envoyee au prochain releve.'}
              </Text>
            </View>

            <View style={s.heroActions}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Session')}>
                <MaterialCommunityIcons name="map-marker-path" size={18} color="#fff" />
                <Text style={s.primaryButtonText}>Gerer la session</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Reappro')}>
                <Text style={s.secondaryButtonText}>Reappro camion</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={s.grid}>
        <MetricCard
          label="Factures jour"
          value={formatCount(todayInvoices.length)}
          hint={formatCurrency(todayRevenue)}
          icon="file-document-outline"
          color={T.primary}
        />
        <MetricCard
          label="Factures mois"
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
          label="Derniere sync"
          value={trackingState.lastSyncAt ? formatTime(trackingState.lastSyncAt) : '--'}
          hint={trackingState.error || 'Session et suivi auto en arriere-plan'}
          icon="crosshairs-gps"
          color={trackingState.error ? T.warning : T.success}
        />
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Actions rapides</Text>
        <View style={s.quickGrid}>
          <TouchableOpacity style={s.quickAction} onPress={() => navigation.navigate('InvoiceCreate')}>
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
  locationMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
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

