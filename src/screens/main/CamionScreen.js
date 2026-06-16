import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator,
} from 'react-native'
import api from '../../services/api'

const T = {
  teal: '#0d9488', bg: '#f1f5f9', card: '#ffffff',
  base: '#0f172a', secondary: '#475569', muted: '#94a3b8', border: '#e2e8f0',
  amber: '#d97706', red: '#dc2626',
}

function fmt(n) { return Number(n ?? 0).toFixed(3) }

export default function CamionScreen() {
  const [stock,      setStock]     = useState([])
  const [loading,    setLoading]   = useState(true)
  const [refreshing, setRefreshing]= useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const r = await api.get('/camion')
      const items = Array.isArray(r.data) ? r.data : (r.data.stock ?? [])
      setStock(items)
    } catch {}
    setLoading(false); setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const renderItem = ({ item }) => {
    const minStock = Number(item.product?.min_stock ?? 0)
    const isLow = minStock > 0 ? Number(item.qty) <= minStock : Number(item.qty) < 5
    return (
      <View style={[s.row, isLow && s.rowLow]}>
        <View style={s.rowLeft}>
          <Text style={s.rowName}>{item.product?.name ?? '—'}</Text>
          <Text style={s.rowUnit}>
            {item.product?.unit ?? ''}
            {minStock > 0 ? ` · min ${fmt(minStock)}` : ''}
          </Text>
        </View>
        <View style={[s.badge, isLow ? s.badgeLow : s.badgeOk]}>
          <Text style={[s.badgeText, isLow ? { color: T.amber } : { color: T.teal }]}>
            {fmt(item.qty)}
          </Text>
        </View>
      </View>
    )
  }

  const totalValue = stock.reduce((s, item) => {
    const price = item.product?.depot_price ?? item.product?.price ?? 0
    return s + (parseFloat(item.qty) * parseFloat(price))
  }, 0)

  return (
    <View style={s.root}>
      {/* Summary card */}
      <View style={s.summary}>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Produits</Text>
          <Text style={s.summaryValue}>{stock.length}</Text>
        </View>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Stock bas</Text>
        <Text style={[s.summaryValue, { color: T.amber }]}>
          {stock.filter(i => {
            const minStock = Number(i.product?.min_stock ?? 0)
            return minStock > 0 ? Number(i.qty) <= minStock : Number(i.qty) < 5
          }).length}
        </Text>
        </View>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Valeur estimée</Text>
          <Text style={[s.summaryValue, { color: T.teal, fontSize: 13 }]}>{fmt(totalValue)} TND</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={T.teal} size="large" style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={stock}
          keyExtractor={(item, i) => String(item.product?.id ?? i)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.teal} />}
          ListEmptyComponent={
            <View style={s.empty}><Text style={s.emptyText}>Stock camion vide</Text></View>
          }
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: T.bg },
  summary:      { flexDirection: 'row', backgroundColor: T.card, margin: 16, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  summaryItem:  { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: T.muted, marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '700', color: T.base },
  row:          { backgroundColor: T.card, borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  rowLow:       { borderLeftWidth: 3, borderLeftColor: T.amber },
  rowLeft:      { flex: 1 },
  rowName:      { fontSize: 14, fontWeight: '600', color: T.base },
  rowUnit:      { fontSize: 11, color: T.muted, marginTop: 2 },
  badge:        { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  badgeOk:      { backgroundColor: 'rgba(13,148,136,0.1)' },
  badgeLow:     { backgroundColor: 'rgba(245,158,11,0.12)' },
  badgeText:    { fontSize: 15, fontWeight: '700', fontFamily: 'monospace' },
  empty:        { alignItems: 'center', marginTop: 60 },
  emptyText:    { color: T.muted, fontSize: 14 },
})
