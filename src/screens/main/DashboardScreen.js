import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'

const T = {
  teal: '#0d9488', bg: '#f1f5f9', card: '#ffffff',
  base: '#0f172a', secondary: '#475569', muted: '#94a3b8',
  border: '#e2e8f0', green: '#059669', red: '#dc2626',
}

function fmt(n) {
  return new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 3 }).format(n ?? 0)
}

function KpiCard({ label, value, color = T.teal, icon }) {
  return (
    <View style={[s.kpi, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color }]}>{value}</Text>
    </View>
  )
}

export default function DashboardScreen() {
  const { user, logout } = useAuth()
  const [stats,      setStats]     = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [refreshing, setRefreshing]= useState(false)

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const r = await api.get('/stats')
      setStats(r.data)
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.teal} />}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Bonjour, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={s.headerSub}>El Irtiwaa · {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Déco.</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={T.teal} size="large" style={{ marginTop: 60 }} />
      ) : stats ? (
        <>
          {/* KPIs */}
          <Text style={s.sectionTitle}>Aujourd'hui</Text>
          <View style={s.kpiGrid}>
            <KpiCard label="CA aujourd'hui"   value={fmt(stats.today_revenue) + ' TND'} color={T.teal} />
            <KpiCard label="CA ce mois"       value={fmt(stats.month_revenue) + ' TND'} color='#3b82f6' />
            <KpiCard label="Bénéfice du mois" value={fmt(stats.month_profit)  + ' TND'} color={T.green} />
            <KpiCard label="Impayés"          value={fmt(stats.unpaid_total)  + ' TND'} color={T.red} />
          </View>

          <View style={s.kpiGrid}>
            <KpiCard label="Factures / mois"  value={stats.month_invoices ?? 0} color='#8b5cf6' />
            <KpiCard label="Routes ouvertes"  value={stats.open_routes ?? 0}    color='#f59e0b' />
          </View>

          {/* Low stock */}
          {(stats.low_depot_stock ?? []).length > 0 && (
            <View style={s.alertCard}>
              <Text style={s.alertTitle}>⚠ Stock bas au dépôt</Text>
              {stats.low_depot_stock.slice(0, 5).map((item, i) => (
                <View key={i} style={s.alertRow}>
                  <Text style={s.alertName}>{item.product?.name}</Text>
                  <Text style={s.alertQty}>{item.qty} {item.product?.unit}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>Tableau de bord non disponible</Text>
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: T.bg },
  scroll:       { padding: 20, paddingBottom: 40 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerTitle:  { fontSize: 20, fontWeight: '700', color: T.base },
  headerSub:    { fontSize: 12, color: T.muted, marginTop: 2 },
  logoutBtn:    { backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  logoutText:   { color: T.red, fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: T.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  kpiGrid:      { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpi:          { flex: 1, backgroundColor: T.card, borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  kpiLabel:     { fontSize: 11, color: T.muted, marginBottom: 6 },
  kpiValue:     { fontSize: 15, fontWeight: '700' },
  alertCard:    { backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 8 },
  alertTitle:   { fontSize: 13, fontWeight: '700', color: '#ea580c', marginBottom: 10 },
  alertRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  alertName:    { fontSize: 13, color: T.base },
  alertQty:     { fontSize: 13, fontWeight: '700', color: T.red },
  emptyWrap:    { alignItems: 'center', marginTop: 60 },
  emptyText:    { color: T.muted, fontSize: 14 },
})
