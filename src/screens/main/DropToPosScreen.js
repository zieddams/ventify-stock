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
import { useI18n } from '../../contexts/I18nContext'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { fetchPosDepots } from '../../services/stockTransferService'
import { T, cardShadow } from '../../theme'
import { formatCount, formatQty, formatTime, toNumber } from '../../utils/format'

function numericInput(value) {
  return value.replace(/[^0-9.]/g, '')
}

export default function DropToPosScreen() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { t } = useI18n()
  const {
    session,
    loading,
    busy,
    refreshSessionDetails,
    dropAtPos,
  } = useTracking()

  const [camionStock, setCamionStock] = useState([])
  const [posDepots, setPosDepots] = useState([])
  const [selectedPosDepotId, setSelectedPosDepotId] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [dropDraft, setDropDraft] = useState({})
  const [error, setError] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    }

    try {
      const [camionResponse, posDepotsResponse] = await Promise.all([
        api.get('/camion'),
        fetchPosDepots(),
        refreshSessionDetails(),
      ])

      setCamionStock(Array.isArray(camionResponse.data?.stock) ? camionResponse.data.stock : [])
      setPosDepots(posDepotsResponse)
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || t('dropToPos.loadError'))
    } finally {
      setRefreshing(false)
    }
  }, [refreshSessionDetails, t])

  useFocusEffect(useCallback(() => {
    load()
  }, [load]))

  useEffect(() => {
    if (session?.id) {
      load()
    }
  }, [load, session?.id, session?.status])

  useEffect(() => {
    if (!selectedPosDepotId && posDepots.length === 1) {
      setSelectedPosDepotId(String(posDepots[0].id))
    }
  }, [posDepots, selectedPosDepotId])

  const isOpen = session?.status === 'open'
  const stockByProductId = useMemo(
    () => camionStock.reduce((carry, item) => {
      carry[item.product_id] = item
      return carry
    }, {}),
    [camionStock],
  )

  const filteredStock = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return camionStock
      .filter((item) => {
        const name = item.product?.name ?? ''
        const reference = item.product?.reference ?? ''
        const searchable = !needle
          || name.toLowerCase().includes(needle)
          || reference.toLowerCase().includes(needle)

        return searchable && toNumber(item.qty) > 0
      })
      .sort((left, right) => {
        const leftSelected = toNumber(dropDraft[left.product_id]) > 0 ? 1 : 0
        const rightSelected = toNumber(dropDraft[right.product_id]) > 0 ? 1 : 0

        if (leftSelected !== rightSelected) {
          return rightSelected - leftSelected
        }

        return String(left.product?.name || '').localeCompare(String(right.product?.name || ''), 'fr')
      })
  }, [camionStock, dropDraft, search])

  const selectedLines = useMemo(
    () => Object.entries(dropDraft)
      .map(([productId, qty]) => ({
        product_id: Number(productId),
        qty: toNumber(qty),
      }))
      .filter((item) => item.qty > 0),
    [dropDraft],
  )

  const selectedTotalQty = useMemo(
    () => selectedLines.reduce((sum, line) => sum + toNumber(line.qty), 0),
    [selectedLines],
  )

  const submit = async () => {
    if (!selectedPosDepotId) {
      Alert.alert(t('dropToPos.posRequiredTitle'), t('dropToPos.posRequiredText'))
      return
    }

    if (selectedLines.length === 0) {
      Alert.alert(t('dropToPos.title'), t('dropToPos.emptyDrop'))
      return
    }

    const blocked = selectedLines.find((line) => {
      const stockItem = stockByProductId[line.product_id]
      return toNumber(line.qty) > toNumber(stockItem?.qty)
    })

    if (blocked) {
      const stockItem = stockByProductId[blocked.product_id]
      Alert.alert(
        t('dropToPos.insufficientStockTitle'),
        t('dropToPos.insufficientStockText', { product: stockItem?.product?.name || t('dropToPos.productFallback') }),
      )
      return
    }

    try {
      await dropAtPos(Number(selectedPosDepotId), selectedLines)
      setDropDraft({})
      await load()
      Alert.alert(t('dropToPos.savedTitle'), t('dropToPos.savedText'))
    } catch (err) {
      Alert.alert(t('dropToPos.failedTitle'), err.response?.data?.message || err.message || t('dropToPos.retry'))
    }
  }

  const footerBottom = insets.bottom + 12

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingBottom: 148 + footerBottom }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
    >
      <PageHeader
        title={t('dropToPos.title')}
        subtitle={t('dropToPos.pageSubtitle')}
      />

      {!!error && (
        <View style={s.noticeDanger}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
          <Text style={s.noticeDangerText}>{error}</Text>
        </View>
      )}

      {!session || !isOpen ? (
        <View style={[s.emptyCard, cardShadow]}>
          <MaterialCommunityIcons name="storefront-outline" size={34} color={T.primary} />
          <Text style={s.emptyTitle}>{t('dropToPos.sessionRequiredTitle')}</Text>
          <Text style={s.emptyText}>{t('dropToPos.sessionRequiredText')}</Text>
          <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Tabs', { screen: t('navigation.session') })}>
            <Text style={s.primaryButtonText}>{t('dropToPos.openSessionAction')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={[s.heroCard, cardShadow]}>
            <View style={s.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitle}>{t('dropToPos.currentSessionTitle')}</Text>
                <Text style={s.heroSubtitle}>
                  {session.camion?.name
                    ? `${session.camion.name}${session.camion?.plate ? ` · ${session.camion.plate}` : ''}`
                    : t('dropToPos.noCamionAssigned')}
                </Text>
              </View>
              <StatusChip label={t('dropToPos.openStatus')} tone="success" />
            </View>

            <View style={s.factGrid}>
              <View style={s.factItem}>
                <Text style={s.factLabel}>{t('dropToPos.metrics.openedAt')}</Text>
                <Text style={s.factValue}>{formatTime(session.opened_at)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>{t('dropToPos.metrics.camionLines')}</Text>
                <Text style={s.factValue}>{formatCount(camionStock.filter((item) => toNumber(item.qty) > 0).length)}</Text>
              </View>
            </View>
          </View>

          <View style={[s.sectionCard, cardShadow]}>
            <Text style={s.sectionTitle}>{t('dropToPos.destinationTitle')}</Text>
            {posDepots.length === 0 ? (
              <View style={s.inlineEmpty}>
                <MaterialCommunityIcons name="storefront-outline" size={26} color={T.textMuted} />
                <Text style={s.inlineEmptyTitle}>{t('dropToPos.noPosTitle')}</Text>
                <Text style={s.inlineEmptyText}>{t('dropToPos.noPosText')}</Text>
              </View>
            ) : (
              <View style={s.posList}>
                {posDepots.map((depot) => {
                  const selected = String(depot.id) === String(selectedPosDepotId)

                  return (
                    <TouchableOpacity
                      key={depot.id}
                      style={[s.posOption, selected && s.posOptionSelected]}
                      onPress={() => setSelectedPosDepotId(String(depot.id))}
                    >
                      <MaterialCommunityIcons name="storefront-outline" size={18} color={selected ? '#fff' : T.primary} />
                      <Text style={[s.posOptionText, selected && { color: '#fff' }]}>{depot.name}</Text>
                      {selected ? <MaterialCommunityIcons name="check-circle" size={18} color="#fff" /> : null}
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </View>

          <View style={[s.sectionCard, cardShadow]}>
            <Text style={s.sectionTitle}>{t('dropToPos.productsTitle')}</Text>
            <TextInput
              style={s.searchInput}
              placeholder={t('dropToPos.searchPlaceholder')}
              placeholderTextColor={T.textMuted}
              value={search}
              onChangeText={setSearch}
            />

            {loading && camionStock.length === 0 ? (
              <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
            ) : filteredStock.length === 0 ? (
              <View style={s.inlineEmpty}>
                <MaterialCommunityIcons name="package-variant-closed" size={28} color={T.textMuted} />
                <Text style={s.inlineEmptyTitle}>{t('dropToPos.noProductsTitle')}</Text>
                <Text style={s.inlineEmptyText}>{t('dropToPos.noProductsText')}</Text>
              </View>
            ) : (
              <View style={s.rowsWrap}>
                {filteredStock.map((item) => {
                  const draftQty = dropDraft[item.product_id] ?? ''
                  const unitLabel = item.product?.unit || t('dropToPos.unitFallback')

                  return (
                    <QuantityStepperField
                      key={item.product_id}
                      title={item.product?.name || t('dropToPos.productFallback')}
                      titleAccessory={t('dropToPos.camionStockLabel', { value: formatQty(toNumber(item.qty)), unit: unitLabel })}
                      detailRows={[[
                        item.product?.reference
                          ? t('dropToPos.referenceLabel', { value: item.product.reference })
                          : t('dropToPos.referenceMissing'),
                      ]]}
                      icon="storefront-outline"
                      value={draftQty}
                      layout="stacked"
                      onChangeText={(value) => setDropDraft((current) => ({ ...current, [item.product_id]: numericInput(value) }))}
                    />
                  )
                })}
              </View>
            )}
          </View>
        </>
      )}

      {!!session && isOpen && (
        <View style={[s.footerCard, { bottom: footerBottom }]}>
          <Text style={s.footerText}>
            {t('dropToPos.footerSummary', { lines: selectedLines.length, units: formatQty(selectedTotalQty) })}
          </Text>
          <TouchableOpacity style={[s.footerButton, busy && s.buttonDisabled]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.footerButtonText}>{t('dropToPos.submitAction')}</Text>}
          </TouchableOpacity>
        </View>
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
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  posList: {
    marginTop: 14,
    gap: 10,
  },
  posOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  posOptionSelected: {
    backgroundColor: T.primary,
    borderColor: T.primary,
  },
  posOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
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
  inlineEmpty: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  inlineEmptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  inlineEmptyText: {
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
