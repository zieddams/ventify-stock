import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import api from '../../services/api'

const T = {
  teal: '#0d9488', bg: '#f1f5f9', card: '#ffffff',
  base: '#0f172a', secondary: '#475569', muted: '#94a3b8', border: '#e2e8f0',
  green: '#059669', red: '#dc2626', amber: '#d97706',
}

function fmt(n) {
  return new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3 }).format(n ?? 0)
}

function StatusPill({ status }) {
  const MAP = {
    draft:     { label: 'Brouillon', bg: '#f1f5f9', color: T.muted },
    sent:      { label: 'Envoyée',   bg: '#eff6ff', color: '#2563eb' },
    paid:      { label: 'Payée',     bg: '#ecfdf5', color: T.green },
    cancelled: { label: 'Annulée',   bg: '#fef2f2', color: T.red },
  }
  const st = MAP[status] ?? MAP.draft
  return (
    <View style={[s.pill, { backgroundColor: st.bg }]}>
      <Text style={[s.pillText, { color: st.color }]}>{st.label}</Text>
    </View>
  )
}

export default function InvoicesScreen() {
  const [invoices,   setInvoices]  = useState([])
  const [loading,    setLoading]   = useState(true)
  const [refreshing, setRefreshing]= useState(false)
  const [search,     setSearch]    = useState('')
  const navigation = useNavigation()

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const r = await api.get('/invoices', { params: { period: 'month' } })
      setInvoices(r.data)
    } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = invoices.filter(i =>
    !search || i.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    i.number?.includes(search)
  )

  const renderItem = ({ item }) => (
    <TouchableOpacity style={s.row} activeOpacity={0.7}
      onPress={() => navigation.navigate('InvoiceDetail', { id: item.id })}>
      <View style={s.rowLeft}>
        <Text style={s.rowNum}>{item.number}</Text>
        <Text style={s.rowCustomer}>{item.customer_name}</Text>
        <Text style={s.rowDate}>{new Date(item.created_at).toLocaleDateString('fr-FR')}</Text>
      </View>
      <View style={s.rowRight}>
        <Text style={s.rowTotal}>{fmt(item.total)} TND</Text>
        <StatusPill status={item.status?.value ?? item.status} />
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={s.root}>
      {/* Search */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Rechercher…"
          placeholderTextColor={T.muted}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => navigation.navigate('InvoiceCreate')}>
          <Text style={s.newBtnText}>+ Nouvelle</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={T.teal} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.teal} />}
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListEmptyComponent={
            <View style={s.empty}><Text style={s.emptyText}>Aucune facture</Text></View>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: T.bg },
  searchWrap:  { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8 },
  searchInput: { flex: 1, backgroundColor: T.card, borderColor: T.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: T.base },
  newBtn:      { backgroundColor: T.teal, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  newBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  row:         { backgroundColor: T.card, marginHorizontal: 16, marginVertical: 4, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  rowLeft:     { flex: 1 },
  rowNum:      { fontSize: 12, fontFamily: 'monospace', color: T.teal, fontWeight: '700' },
  rowCustomer: { fontSize: 15, fontWeight: '600', color: T.base, marginTop: 2 },
  rowDate:     { fontSize: 11, color: T.muted, marginTop: 2 },
  rowRight:    { alignItems: 'flex-end', gap: 6 },
  rowTotal:    { fontSize: 15, fontWeight: '700', color: T.base },
  pill:        { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  pillText:    { fontSize: 11, fontWeight: '600' },
  sep:         { height: 0 },
  empty:       { alignItems: 'center', marginTop: 60 },
  emptyText:   { color: T.muted, fontSize: 14 },
})
