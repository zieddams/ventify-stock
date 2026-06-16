import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
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
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import {
  formatCurrency,
  formatDateTime,
  invoiceStatusLabel,
  paymentStatusLabel,
  unwrapStatus,
} from '../../utils/format'

export default function InvoicesScreen() {
  const navigation = useNavigation()
  const { session } = useTracking()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

    try {
      const response = await api.get('/invoices', {
        params: { period: 'month' },
      })
      setInvoices(Array.isArray(response.data) ? response.data : response.data?.data ?? [])
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter((item) => (
      item.number?.toLowerCase().includes(q)
      || item.customer_name?.toLowerCase().includes(q)
      || item.rep_name?.toLowerCase().includes(q)
    ))
  }, [invoices, search])

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
              subtitle={session?.status === 'open' ? 'Session du jour active' : 'Suivi mensuel mobile'}
              actionIcon="file-document-plus-outline"
              actionLabel="Nouvelle"
              onActionPress={() => navigation.navigate('InvoiceCreate')}
            />

            <View style={s.searchCard}>
              <MaterialCommunityIcons name="magnify" size={18} color={T.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Rechercher une facture ou un client"
                placeholderTextColor={T.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>
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
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: T.text,
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
})

