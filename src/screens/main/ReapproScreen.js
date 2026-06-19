import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { formatDateTime, formatNumber, formatTime, toNumber } from '../../utils/format'

function parseItems(data) {
  return Array.isArray(data) ? data : data?.data ?? []
}

function numericInput(value) {
  return value.replace(/[^0-9.]/g, '')
}

export default function ReapproScreen({ route }) {
  const navigation = useNavigation()
  const { isRep } = useAuth()
  const {
    session,
    loading,
    busy,
    refreshSessionDetails,
    addLoad,
    recordReturns,
  } = useTracking()

  const [products, setProducts] = useState([])
  const [camionStockByProductId, setCamionStockByProductId] = useState({})
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState(route?.params?.mode === 'returns' ? 'returns' : 'load')
  const [loadDraft, setLoadDraft] = useState({})
  const [returnsDraft, setReturnsDraft] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    setMode(route?.params?.mode === 'returns' ? 'returns' : 'load')
  }, [route?.params?.mode])

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

    try {
      const [productsResponse, camionResponse] = await Promise.all([
        api.get('/products'),
        api.get('/camion'),
        refreshSessionDetails(),
      ])

      setProducts(parseItems(productsResponse.data))
      setCamionStockByProductId(camionResponse.data?.by_product_id ?? {})
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Le module reappro n a pas pu etre charge.')
    } finally {
      setRefreshing(false)
    }
  }, [refreshSessionDetails])

  useFocusEffect(useCallback(() => {
    load()
  }, [load]))

  useEffect(() => {
    if (session?.id) {
      load()
    }
  }, [load, session?.id, session?.status, session?.updated_at])

  const lineByProductId = useMemo(
    () => (session?.lines ?? []).reduce((carry, line) => {
      carry[line.product_id] = line
      return carry
    }, {}),
    [session?.lines],
  )

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()

    const baseProducts = mode === 'returns'
      ? products.filter((product) => {
        const line = lineByProductId[product.id]
        const camionQty = toNumber(camionStockByProductId[product.id])
        return !!line || camionQty > 0
      })
      : products.filter((product) => toNumber(product.depot_qty) > 0 || toNumber(loadDraft[product.id]) > 0)

    return baseProducts.filter((item) => {
      if (!needle) return true
      return item.name?.toLowerCase().includes(needle) || item.reference?.toLowerCase().includes(needle)
    })
  }, [camionStockByProductId, lineByProductId, loadDraft, mode, products, search])

  const isOpen = session?.status === 'open'
  const activeDraft = mode === 'returns' ? returnsDraft : loadDraft

  const submit = async () => {
    const payload = Object.entries(activeDraft)
      .map(([productId, qty]) => (
        mode === 'returns'
          ? { product_id: Number(productId), qty_returned: toNumber(qty) }
          : { product_id: Number(productId), qty_loaded: toNumber(qty) }
      ))
      .filter((item) => (mode === 'returns' ? item.qty_returned : item.qty_loaded) > 0)

    if (payload.length === 0) {
      Alert.alert(
        mode === 'returns' ? 'Retours' : 'Reappro',
        mode === 'returns' ? 'Ajoutez au moins une quantite de retour.' : 'Ajoutez au moins une quantite a charger.',
      )
      return
    }

    if (mode === 'load') {
      const blocked = payload.find((line) => {
        const product = products.find((entry) => entry.id === line.product_id)
        return toNumber(line.qty_loaded) > toNumber(product?.depot_qty)
      })

      if (blocked) {
        const product = products.find((entry) => entry.id === blocked.product_id)
        Alert.alert('Stock depot insuffisant', `${product?.name || 'Produit'}: ${formatNumber(product?.depot_qty)} disponible(s).`)
        return
      }
    }

    if (mode === 'returns') {
      const blocked = payload.find((line) => {
        const productId = line.product_id
        const sessionLine = lineByProductId[productId]
        const camionQty = toNumber(camionStockByProductId[productId])
        const maxReturnable = Math.max(0, toNumber(sessionLine?.qty_loaded) - toNumber(sessionLine?.qty_returned))
        return toNumber(line.qty_returned) > camionQty || toNumber(line.qty_returned) > maxReturnable
      })

      if (blocked) {
        const product = products.find((entry) => entry.id === blocked.product_id)
        Alert.alert('Retour impossible', `${product?.name || 'Produit'} depasse le stock camion restant ou le maximum retournable.`)
        return
      }
    }

    try {
      if (mode === 'returns') {
        await recordReturns(payload)
        setReturnsDraft({})
      } else {
        await addLoad(payload)
        setLoadDraft({})
      }

      await load()

      Alert.alert(
        mode === 'returns' ? 'Retours enregistres' : 'Chargement enregistre',
        mode === 'returns'
          ? 'Les retours depot ont ete synchronises avec la session.'
          : 'Le chargement depot vers camion a ete synchronise avec la session.',
      )
    } catch (err) {
      Alert.alert(
        mode === 'returns' ? 'Retours impossibles' : 'Chargement impossible',
        err.response?.data?.message || err.message || 'Veuillez reessayer.',
      )
    }
  }

  const updateDraftValue = (productId, value) => {
    if (mode === 'returns') {
      setReturnsDraft((current) => ({ ...current, [productId]: numericInput(value) }))
      return
    }

    setLoadDraft((current) => ({ ...current, [productId]: numericInput(value) }))
  }

  if (!isRep()) {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <PageHeader title="Reappro camion" subtitle="Depot, camion et ecarts de tournee." />
        <View style={[s.emptyCard, cardShadow]}>
          <MaterialCommunityIcons name="account-lock-outline" size={34} color={T.primary} />
          <Text style={s.emptyTitle}>Compte commercial requis</Text>
          <Text style={s.emptyText}>Le reappro mobile est reserve au compte commercial qui porte la session terrain du jour.</Text>
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
    >
      <PageHeader
        title="Reappro camion"
        subtitle="Depot, camion et ecarts lies a la session mobile."
        actionIcon="map-marker-path"
        actionLabel="Session"
        onActionPress={() => navigation.navigate('Tabs', { screen: 'Session' })}
      />

      {!!error && (
        <View style={s.noticeDanger}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
          <Text style={s.noticeDangerText}>{error}</Text>
        </View>
      )}

      {!session || !isOpen ? (
        <View style={[s.emptyCard, cardShadow]}>
          <MaterialCommunityIcons name="truck-fast-outline" size={34} color={T.primary} />
          <Text style={s.emptyTitle}>Session ouverte requise</Text>
          <Text style={s.emptyText}>
            Ouvrez d abord la session du jour avec un camion physique pour declarer les chargements et retours.
          </Text>
          <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Tabs', { screen: 'Session' })}>
            <Text style={s.primaryButtonText}>Ouvrir Session</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={[s.heroCard, cardShadow]}>
            <View style={s.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitle}>Session du {session.session_date}</Text>
                <Text style={s.heroSubtitle}>
                  {session.camion?.name
                    ? `${session.camion.name}${session.camion?.plate ? ` | ${session.camion.plate}` : ''}`
                    : 'Camion physique non affecte'}
                </Text>
              </View>
              <StatusChip label="Session ouverte" tone="success" />
            </View>

            <View style={s.factGrid}>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Ouverture</Text>
                <Text style={s.factValue}>{formatTime(session.opened_at)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Lignes</Text>
                <Text style={s.factValue}>{formatNumber((session.lines ?? []).length, 0)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>Derniere sync</Text>
                <Text style={s.factValue}>{formatDateTime(session.updated_at)}</Text>
              </View>
            </View>

            <View style={s.noticeCard}>
              <MaterialCommunityIcons name="sync-circle" size={18} color={T.info} />
              <Text style={s.noticeText}>
                Chaque validation met a jour la session mobile, le stock camion du compte et les notifications cote plateforme.
              </Text>
            </View>
          </View>

          <View style={[s.sectionCard, cardShadow]}>
            <View style={s.segmentedWrap}>
              <TouchableOpacity
                style={[s.segmentButton, mode === 'load' && s.segmentButtonActive]}
                onPress={() => setMode('load')}
              >
                <MaterialCommunityIcons name="truck-delivery-outline" size={18} color={mode === 'load' ? '#fff' : T.textSecondary} />
                <Text style={[s.segmentLabel, mode === 'load' && s.segmentLabelActive]}>Chargement</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.segmentButton, mode === 'returns' && s.segmentButtonActive]}
                onPress={() => setMode('returns')}
              >
                <MaterialCommunityIcons name="keyboard-return" size={18} color={mode === 'returns' ? '#fff' : T.textSecondary} />
                <Text style={[s.segmentLabel, mode === 'returns' && s.segmentLabelActive]}>Retours</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.searchInput}
              placeholder={mode === 'returns' ? 'Rechercher un produit charge' : 'Rechercher un produit du depot'}
              placeholderTextColor={T.textMuted}
              value={search}
              onChangeText={setSearch}
            />

            {loading && products.length === 0 ? (
              <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
            ) : filteredProducts.length === 0 ? (
              <View style={s.emptyInline}>
                <MaterialCommunityIcons name="package-variant-closed" size={28} color={T.textMuted} />
                <Text style={s.emptyInlineTitle}>{mode === 'returns' ? 'Aucun produit a retourner' : 'Aucun produit disponible'}</Text>
                <Text style={s.emptyInlineText}>
                  {mode === 'returns'
                    ? 'Les retours apparaissent seulement pour les produits deja engages dans la session.'
                    : 'Essayez une autre recherche ou attendez un nouveau stock depot.'}
                </Text>
              </View>
            ) : (
              <View style={s.rowsWrap}>
                {filteredProducts.map((product) => {
                  const line = lineByProductId[product.id] ?? null
                  const depotQty = toNumber(product.depot_qty)
                  const camionQty = toNumber(camionStockByProductId[product.id])
                  const maxReturnable = Math.max(0, toNumber(line?.qty_loaded) - toNumber(line?.qty_returned))

                  return (
                    <View key={product.id} style={s.row}>
                      <View style={s.rowIcon}>
                        <MaterialCommunityIcons
                          name={mode === 'returns' ? 'keyboard-return' : 'truck-delivery-outline'}
                          size={18}
                          color={mode === 'returns' ? T.warning : T.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle}>{product.name}</Text>
                        <Text style={s.rowMeta}>{product.reference || product.unit || 'Produit'}</Text>
                        <Text style={s.rowStats}>
                          {mode === 'returns'
                            ? `Camion ${formatNumber(camionQty)} | Retour max ${formatNumber(maxReturnable)} | Vendu ${formatNumber(line?.qty_sold)}`
                            : `Depot ${formatNumber(depotQty)} | Camion ${formatNumber(camionQty)} | Charge ${formatNumber(line?.qty_loaded)}`}
                        </Text>
                      </View>
                      <TextInput
                        style={s.qtyInput}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={T.textMuted}
                        value={activeDraft[product.id] ?? ''}
                        onChangeText={(value) => updateDraftValue(product.id, value)}
                      />
                    </View>
                  )
                })}
              </View>
            )}

            <TouchableOpacity style={[s.primaryButton, busy && s.buttonDisabled]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>{mode === 'returns' ? 'Valider les retours' : 'Valider le chargement'}</Text>}
            </TouchableOpacity>
          </View>
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
  emptyCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 24,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '800',
    color: T.text,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: T.textSecondary,
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
    marginBottom: 14,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
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
    fontSize: 13,
    fontWeight: '800',
    color: T.text,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#eef6ff',
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: T.textSecondary,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
  },
  segmentedWrap: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  segmentButtonActive: {
    borderColor: T.primary,
    backgroundColor: T.primary,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: T.textSecondary,
  },
  segmentLabelActive: {
    color: '#fff',
  },
  searchInput: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: T.text,
  },
  rowsWrap: {
    marginTop: 14,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    padding: 14,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7fb',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    color: T.textMuted,
  },
  rowStats: {
    marginTop: 5,
    fontSize: 12,
    color: T.textSecondary,
  },
  qtyInput: {
    width: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
    color: T.text,
    fontWeight: '800',
  },
  emptyInline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyInlineTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  emptyInlineText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: T.textSecondary,
  },
  primaryButton: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: T.primary,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
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




