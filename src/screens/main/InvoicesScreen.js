import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../contexts/AuthContext'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { printInvoiceListDocument, shareInvoiceListDocument } from '../../utils/invoicePrint'
import {
  formatCurrency,
  formatDateTime,
  invoiceStatusLabel,
  paymentStatusLabel,
  unwrapStatus,
} from '../../utils/format'

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tout' },
]

function parseItems(data) {
  return Array.isArray(data) ? data : data?.data ?? []
}

function periodLabel(period) {
  return PERIOD_OPTIONS.find((item) => item.value === period)?.label || 'Tout'
}

export default function InvoicesScreen() {
  const navigation = useNavigation()
  const { user, canManageAllCustomers } = useAuth()
  const { session, syncInteraction } = useTracking()
  const [invoices, setInvoices] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('month')
  const [selectedRepId, setSelectedRepId] = useState('')
  const [repFilterVisible, setRepFilterVisible] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const hasGlobalInvoiceAccess = canManageAllCustomers()

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

    try {
      const params = {}
      if (period !== 'all') {
        params.period = period
      }
      if (selectedRepId) {
        params.rep_id = selectedRepId
      }

      const requests = [api.get('/invoices', { params })]
      if (hasGlobalInvoiceAccess && users.length === 0) {
        requests.push(api.get('/users'))
      }

      const [invoicesResponse, usersResponse] = await Promise.all(requests)

      setInvoices(parseItems(invoicesResponse.data))
      if (usersResponse) {
        setUsers(parseItems(usersResponse.data))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [hasGlobalInvoiceAccess, period, selectedRepId, users.length])

  useFocusEffect(useCallback(() => {
    load()
    const interval = setInterval(() => load(), 45000)
    return () => clearInterval(interval)
  }, [load]))

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices

    return invoices.filter((item) => (
      item.number?.toLowerCase().includes(q)
      || item.customer_name?.toLowerCase().includes(q)
      || item.rep_name?.toLowerCase().includes(q)
    ))
  }, [invoices, search])

  const assignableUsers = useMemo(() => (
    users.filter((entry) => entry.active && ['rep', 'admin', 'developer', 'comptable'].includes(entry.role))
  ), [users])

  const selectedRep = useMemo(() => (
    assignableUsers.find((entry) => String(entry.id) === String(selectedRepId))
  ), [assignableUsers, selectedRepId])

  const filterSummary = useMemo(() => {
    const parts = [`Periode: ${periodLabel(period)}`]

    if (hasGlobalInvoiceAccess) {
      if (selectedRepId && selectedRep) {
        parts.push(`Compte: ${selectedRep.name}`)
      } else {
        parts.push('Compte: Toute l equipe')
      }
    } else if (user?.name) {
      parts.push(`Compte: ${user.name}`)
    }

    if (search.trim()) {
      parts.push(`Recherche: ${search.trim()}`)
    }

    return parts.join(' | ')
  }, [hasGlobalInvoiceAccess, period, search, selectedRep, selectedRepId, user?.name])

  const handlePrintList = async () => {
    if (filtered.length === 0) {
      Alert.alert('Aucune facture', 'Aucune facture ne correspond au filtre courant.')
      return
    }

    setPrinting(true)
    try {
      await printInvoiceListDocument({
        invoices: filtered,
        title: 'Liste factures mobile',
        subtitle: filterSummary,
      })
      await syncInteraction('invoice-list-thermal', { includeLocation: false, refreshSession: false })
    } catch (error) {
      Alert.alert('Transfert thermique impossible', error.message || 'Veuillez reessayer.')
    } finally {
      setPrinting(false)
    }
  }

  const handleShareList = async () => {
    if (filtered.length === 0) {
      Alert.alert('Aucune facture', 'Aucune facture ne correspond au filtre courant.')
      return
    }

    setSharing(true)
    try {
      await shareInvoiceListDocument({
        invoices: filtered,
        title: 'Liste factures mobile',
        subtitle: filterSummary,
      })
      await syncInteraction('invoice-list-pdf', { includeLocation: false, refreshSession: false })
    } catch (error) {
      Alert.alert('Partage impossible', error.message || 'Veuillez reessayer.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <View style={s.root}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const paymentStatus = unwrapStatus(item.payment_status)
          const invoiceStatus = unwrapStatus(item.status)

          return (
            <TouchableOpacity
              style={[s.row, cardShadow]}
              activeOpacity={0.82}
              onPress={() => navigation.navigate('InvoiceDetail', { id: item.id, initialInvoice: item })}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowNumber}>{item.number}</Text>
                <Text style={s.rowCustomer}>{item.customer_name}</Text>
                <Text style={s.rowDate}>{formatDateTime(item.created_at)}</Text>
                {hasGlobalInvoiceAccess && !!item.rep_name && (
                  <Text style={s.rowRep}>Commercial: {item.rep_name}</Text>
                )}
                <View style={s.pills}>
                  <StatusChip
                    label={invoiceStatusLabel(invoiceStatus)}
                    tone={invoiceStatus === 'paid' ? 'success' : invoiceStatus === 'cancelled' ? 'danger' : 'info'}
                  />
                  <StatusChip
                    label={paymentStatusLabel(paymentStatus)}
                    tone={paymentStatus === 'paid' ? 'success' : paymentStatus === 'partial' ? 'warning' : 'danger'}
                  />
                </View>
              </View>
              <View style={s.rowRight}>
                <Text style={s.rowTotal}>{formatCurrency(item.total)}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={T.textMuted} />
              </View>
            </TouchableOpacity>
          )
        }}
        ListHeaderComponent={(
          <View style={s.headerWrap}>
            <PageHeader
              title="Factures"
              subtitle={session?.status === 'open' ? 'Session du jour active' : 'Suivi facture mobile'}
              actionIcon="file-document-plus-outline"
              actionLabel="Nouvelle"
              onActionPress={() => navigation.navigate('InvoiceCreate')}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.periodRow}>
              {PERIOD_OPTIONS.map((item) => {
                const active = period === item.value
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[s.periodChip, active && s.periodChipActive]}
                    onPress={() => setPeriod(item.value)}>
                    <Text style={[s.periodChipText, active && s.periodChipTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            <View style={s.toolsRow}>
              {hasGlobalInvoiceAccess && (
                <TouchableOpacity style={s.toolButtonWide} onPress={() => setRepFilterVisible(true)}>
                  <MaterialCommunityIcons name="account-filter-outline" size={16} color={T.primary} />
                  <Text style={s.toolButtonLabel} numberOfLines={1}>
                    {selectedRep ? selectedRep.name : 'Toute l equipe'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={s.toolButton} onPress={handlePrintList} disabled={printing}>
                {printing ? (
                  <ActivityIndicator size="small" color={T.primary} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="printer-outline" size={16} color={T.primary} />
                    <Text style={s.toolButtonLabel}>Thermique</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={s.toolButton} onPress={handleShareList} disabled={sharing}>
                {sharing ? (
                  <ActivityIndicator size="small" color={T.primary} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="file-pdf-box" size={16} color={T.primary} />
                    <Text style={s.toolButtonLabel}>PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={s.searchCard}>
              <MaterialCommunityIcons name="magnify" size={18} color={T.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Rechercher une facture, un client, un commercial"
                placeholderTextColor={T.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <Text style={s.filterHint}>{filterSummary}</Text>
            <Text style={s.printHint}>Thermique ouvre votre application Bluetooth externe. PDF garde une copie a partager.</Text>
          </View>
        )}
        ListEmptyComponent={(
          <View style={s.emptyWrap}>
            {loading ? (
              <ActivityIndicator color={T.primary} size="large" />
            ) : (
              <>
                <MaterialCommunityIcons name="file-document-outline" size={34} color={T.textMuted} />
                <Text style={s.emptyText}>Aucune facture sur ce filtre.</Text>
              </>
            )}
          </View>
        )}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
      />

      <Modal visible={repFilterVisible} animationType="slide" onRequestClose={() => setRepFilterVisible(false)}>
        <View style={s.modalRoot}>
          <PageHeader
            title="Filtre commercial"
            subtitle="Roles globaux"
            actionIcon="close"
            onActionPress={() => setRepFilterVisible(false)}
          />

          <TouchableOpacity
            style={s.filterOption}
            onPress={() => {
              setSelectedRepId('')
              setRepFilterVisible(false)
            }}>
            <Text style={s.filterOptionTitle}>Toute l equipe</Text>
            <Text style={s.filterOptionMeta}>Afficher toutes les factures disponibles</Text>
          </TouchableOpacity>

          {!!user?.id && (
            <TouchableOpacity
              style={s.filterOption}
              onPress={() => {
                setSelectedRepId(String(user.id))
                setRepFilterVisible(false)
              }}>
              <Text style={s.filterOptionTitle}>Mon compte</Text>
              <Text style={s.filterOptionMeta}>{user.name}</Text>
            </TouchableOpacity>
          )}

          <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
            {assignableUsers.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={s.filterOption}
                onPress={() => {
                  setSelectedRepId(String(entry.id))
                  setRepFilterVisible(false)
                }}>
                <Text style={s.filterOptionTitle}>{entry.name}</Text>
                <Text style={s.filterOptionMeta}>{entry.role} - {entry.email}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
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
    gap: 10,
  },
  headerWrap: {
    marginBottom: 6,
  },
  periodRow: {
    gap: 8,
    paddingBottom: 10,
  },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  periodChipActive: {
    borderColor: T.primary,
    backgroundColor: '#dbeafe',
  },
  periodChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textMuted,
  },
  periodChipTextActive: {
    color: T.primary,
  },
  toolsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  toolButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  toolButtonWide: {
    flex: 1.35,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  toolButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: T.primary,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: T.text,
  },
  filterHint: {
    marginBottom: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  printHint: {
    marginBottom: 8,
    fontSize: 12,
    color: T.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    marginBottom: 10,
  },
  rowNumber: {
    fontSize: 13,
    fontWeight: '800',
    color: T.primaryDark,
  },
  rowCustomer: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: T.text,
  },
  rowDate: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  rowRep: {
    marginTop: 4,
    fontSize: 12,
    color: T.primaryDark,
    fontWeight: '700',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  rowRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  rowTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
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
  modalRoot: {
    flex: 1,
    backgroundColor: T.background,
    padding: 20,
  },
  filterOption: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 16,
    marginBottom: 10,
  },
  filterOptionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  filterOptionMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
})
