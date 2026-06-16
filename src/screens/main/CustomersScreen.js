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
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCurrency } from '../../utils/format'

export default function CustomersScreen() {
  const navigation = useNavigation()
  const { isAdmin } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

    try {
      const response = await api.get('/customers')
      setCustomers(Array.isArray(response.data) ? response.data : response.data?.data ?? [])
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
    const needle = search.trim().toLowerCase()
    if (!needle) return customers

    return customers.filter((item) => (
      item.name?.toLowerCase().includes(needle)
      || item.phone?.toLowerCase().includes(needle)
      || item.address?.toLowerCase().includes(needle)
      || item.owner?.name?.toLowerCase().includes(needle)
    ))
  }, [customers, search])

  return (
    <View style={s.root}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const mapped = Number.isFinite(item?.lat) && Number.isFinite(item?.lng)
          const hasCredit = Number(item?.credit_balance ?? 0) > 0

          return (
            <TouchableOpacity
              style={[s.row, cardShadow]}
              activeOpacity={0.84}
              onPress={() => navigation.navigate('InvoiceCreate', { initialCustomer: item })}>
              <View style={s.rowIcon}>
                <MaterialCommunityIcons name="account-outline" size={18} color={T.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowName}>{item.name}</Text>
                <Text style={s.rowMeta}>{item.phone || 'Sans numero'}</Text>
                <Text style={s.rowMeta}>{item.address || 'Adresse non renseignee'}</Text>
                {isAdmin() && (
                  <Text style={s.rowOwner}>
                    Affecte: {item.owner?.name || 'Back office'}
                  </Text>
                )}
                <View style={s.badges}>
                  <View style={[s.badge, mapped ? s.badgeSuccess : s.badgeWarning]}>
                    <MaterialCommunityIcons
                      name={mapped ? 'map-marker-check-outline' : 'map-marker-alert-outline'}
                      size={14}
                      color={mapped ? '#047857' : '#b45309'}
                    />
                    <Text style={[s.badgeText, mapped ? s.badgeTextSuccess : s.badgeTextWarning]}>
                      {mapped ? 'Carte OK' : 'A geolocaliser'}
                    </Text>
                  </View>
                  {hasCredit && (
                    <View style={[s.badge, s.badgeDanger]}>
                      <MaterialCommunityIcons name="credit-card-outline" size={14} color="#b91c1c" />
                      <Text style={[s.badgeText, s.badgeTextDanger]}>
                        Credit {formatCurrency(item.credit_balance)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={s.actionButton}
                onPress={() => navigation.navigate('InvoiceCreate', { initialCustomer: item })}>
                <MaterialCommunityIcons name="file-document-plus-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </TouchableOpacity>
          )
        }}
        ListHeaderComponent={(
          <View style={s.headerWrap}>
            <PageHeader
              title="Clients"
              subtitle={isAdmin() ? 'Vision complete et affectation par commercial' : 'Votre liste client mobile'}
              actionIcon="file-document-plus-outline"
              actionLabel="Facture"
              onActionPress={() => navigation.navigate('InvoiceCreate')}
            />

            <View style={s.searchCard}>
              <MaterialCommunityIcons name="magnify" size={18} color={T.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Rechercher un client ou un commercial"
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
                <MaterialCommunityIcons name="account-group-outline" size={34} color={T.textMuted} />
                <Text style={s.emptyText}>Aucun client sur ce filtre.</Text>
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
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surfaceAlt,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  rowMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  rowOwner: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: T.primaryDark,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeSuccess: {
    backgroundColor: '#d1fae5',
  },
  badgeWarning: {
    backgroundColor: '#fef3c7',
  },
  badgeDanger: {
    backgroundColor: '#fee2e2',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextSuccess: {
    color: '#047857',
  },
  badgeTextWarning: {
    color: '#b45309',
  },
  badgeTextDanger: {
    color: '#b91c1c',
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.primary,
    alignSelf: 'center',
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
