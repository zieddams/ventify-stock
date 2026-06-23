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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import QuantityStepperField from '../../components/QuantityStepperField'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../contexts/AuthContext'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCount, formatNumber, formatTime, toNumber } from '../../utils/format'

function parseItems(data) {
  return Array.isArray(data) ? data : data?.data ?? []
}

function numericInput(value) {
  return value.replace(/[^0-9.]/g, '')
}

export default function ReapproScreen() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { isRep } = useAuth()
  const {
    session,
    loading,
    busy,
    refreshSessionDetails,
    addLoad,
  } = useTracking()

  const [products, setProducts] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [loadDraft, setLoadDraft] = useState({})
  const [error, setError] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    }

    try {
      const [productsResponse] = await Promise.all([
        api.get('/products'),
        refreshSessionDetails(),
      ])

      setProducts(parseItems(productsResponse.data))
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
  }, [load, session?.id, session?.status])

  const isOpen = session?.status === 'open'
  const lineByProductId = useMemo(
    () => (session?.lines ?? []).reduce((carry, line) => {
      carry[line.product_id] = line
      return carry
    }, {}),
    [session?.lines],
  )

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return products
      .filter((product) => {
        const searchable = !needle
          || product.name?.toLowerCase().includes(needle)
          || product.reference?.toLowerCase().includes(needle)

        return searchable && (toNumber(product.depot_qty) > 0 || toNumber(loadDraft[product.id]) > 0)
      })
      .sort((left, right) => {
        const leftSelected = toNumber(loadDraft[left.id]) > 0 ? 1 : 0
        const rightSelected = toNumber(loadDraft[right.id]) > 0 ? 1 : 0

        if (leftSelected !== rightSelected) {
          return rightSelected - leftSelected
        }

        return String(left.name || '').localeCompare(String(right.name || ''), 'fr')
      })
  }, [products, search, loadDraft])

  const selectedLines = useMemo(
    () => Object.entries(loadDraft)
      .map(([productId, qty]) => ({
        product_id: Number(productId),
        qty_loaded: toNumber(qty),
      }))
      .filter((item) => item.qty_loaded > 0),
    [loadDraft],
  )

  const selectedTotalQty = useMemo(
    () => selectedLines.reduce((sum, line) => sum + toNumber(line.qty_loaded), 0),
    [selectedLines],
  )

  const submit = async () => {
    if (selectedLines.length === 0) {
      Alert.alert('Reappro', 'Ajoutez au moins une quantite a charger.')
      return
    }

    const blocked = selectedLines.find((line) => {
      const product = products.find((entry) => entry.id === line.product_id)
      return toNumber(line.qty_loaded) > toNumber(product?.depot_qty)
    })

    if (blocked) {
      const product = products.find((entry) => entry.id === blocked.product_id)
      Alert.alert('Stock depot insuffisant', `${product?.name || 'Produit'} depasse le stock depot disponible.`)
      return
    }

    try {
      await addLoad(selectedLines)
      setLoadDraft({})
      await load()
      Alert.alert('Chargement enregistre', 'La recharge camion a bien ete synchronisee.')
    } catch (err) {
      Alert.alert('Chargement impossible', err.response?.data?.message || err.message || 'Veuillez reessayer.')
    }
  }

  if (!isRep()) {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <PageHeader title="Reappro camion" subtitle="Recharge du camion depuis le depot." />
        <View style={[s.emptyCard, cardShadow]}>
          <MaterialCommunityIcons name="account-lock-outline" size={34} color={T.primary} />
          <Text style={s.emptyTitle}>Compte commercial requis</Text>
          <Text style={s.emptyText}>La recharge mobile est reservee au compte commercial qui porte la session du jour.</Text>
        </View>
      </ScrollView>
    )
  }

  const footerBottom = insets.bottom + 12

  return (
    <>
      <ScrollView
        style={s.root}
        contentContainerStyle={[s.content, { paddingBottom: 148 + footerBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
      >
        <PageHeader
          title="Reappro camion"
          subtitle="Ajoutez du stock a la session active."
          actionIcon="truck-cargo-container"
          actionLabel="Stock"
          onActionPress={() => navigation.navigate('Tabs', { screen: 'Stock' })}
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
              Ouvrez d abord la session du jour avec un camion physique pour declarer une recharge.
            </Text>
            <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Tabs', { screen: 'Session' })}>
              <Text style={s.primaryButtonText}>Ouvrir la session</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={[s.heroCard, cardShadow]}>
              <View style={s.heroTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.heroTitle}>Session en cours</Text>
                  <Text style={s.heroSubtitle}>
                    {session.camion?.name
                      ? `${session.camion.name}${session.camion?.plate ? ` · ${session.camion.plate}` : ''}`
                      : 'Camion non affecte'}
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
                  <Text style={s.factLabel}>Lignes session</Text>
                  <Text style={s.factValue}>{formatCount((session.lines ?? []).length)}</Text>
                </View>
                <View style={s.factItem}>
                  <Text style={s.factLabel}>Camion</Text>
                  <Text style={s.factValue}>{session.camion?.name || 'Aucun'}</Text>
                </View>
              </View>
            </View>

            <View style={[s.sectionCard, cardShadow]}>
              <Text style={s.sectionTitle}>Produits a charger</Text>
              <TextInput
                style={s.searchInput}
                placeholder="Rechercher un produit du depot"
                placeholderTextColor={T.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              {loading && products.length === 0 ? (
                <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
              ) : filteredProducts.length === 0 ? (
                <View style={s.emptyInline}>
                  <MaterialCommunityIcons name="package-variant-closed" size={28} color={T.textMuted} />
                  <Text style={s.emptyInlineTitle}>Aucun produit disponible</Text>
                  <Text style={s.emptyInlineText}>
                    Essayez une autre recherche ou attendez un nouveau stock depot.
                  </Text>
                </View>
              ) : (
                <View style={s.rowsWrap}>
                  {filteredProducts.map((product) => {
                    const line = lineByProductId[product.id] ?? null
                    const draftQty = loadDraft[product.id] ?? ''
                    const currentLoaded = toNumber(line?.qty_loaded)
                    const unitLabel = product.unit || 'u'
                    const subtitleParts = [product.reference, unitLabel].filter(Boolean)
                    const detailParts = [
                      `Depot ${formatNumber(toNumber(product.depot_qty))} ${unitLabel}`,
                      `Camion ${formatNumber(currentLoaded)} ${unitLabel}`,
                    ]

                    return (
                      <QuantityStepperField
                        key={product.id}
                        title={product.name}
                        subtitle={subtitleParts.join(' - ') || 'Produit'}
                        helper={detailParts.join(' - ')}
                        icon="truck-delivery-outline"
                        value={draftQty}
                        layout="stacked"
                        onChangeText={(value) => setLoadDraft((current) => ({ ...current, [product.id]: numericInput(value) }))}
                      />
                    )
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {!!session && isOpen && (
        <View style={[s.footerCard, { bottom: footerBottom }]}>
          <Text style={s.footerText}>
            {selectedLines.length} ligne(s) · {formatNumber(selectedTotalQty)} unite(s)
          </Text>
          <TouchableOpacity style={[s.footerButton, busy && s.buttonDisabled]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.footerButtonText}>Valider la recharge</Text>}
          </TouchableOpacity>
        </View>
      )}
    </>
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
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
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
  emptyInline: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyInlineTitle: {
    marginTop: 10,
    fontSize: 15,
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
    fontSize: 14,
    fontWeight: '800',
  },
  footerCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 16,
    gap: 12,
    ...cardShadow,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
  },
  footerButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 15,
    backgroundColor: T.primary,
  },
  footerButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
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
  buttonDisabled: {
    opacity: 0.7,
  },
})
