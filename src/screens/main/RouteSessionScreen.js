import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import CompanyBrandCard from '../../components/CompanyBrandCard'
import PageHeader from '../../components/PageHeader'
import QuantityStepperField from '../../components/QuantityStepperField'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import {
  formatCount,
  formatCurrency,
  formatElapsedSince,
  formatNumber,
  formatTime,
  routeStatusLabel,
  toNumber,
} from '../../utils/format'

function parseItems(data) {
  return Array.isArray(data) ? data : data?.data ?? []
}

function numericInput(value) {
  return value.replace(/[^0-9.]/g, '')
}

function buildCloseDefaults(session) {
  const apiDefaults = session?.close_defaults
  const invoices = Array.isArray(session?.invoices)
    ? session.invoices.filter((invoice) => invoice?.status !== 'cancelled')
    : []

  if (apiDefaults) {
    return {
      invoiceCount: Number(apiDefaults.invoice_count ?? invoices.length ?? 0),
      totalSold: toNumber(apiDefaults.total_sold),
      cashCollected: toNumber(apiDefaults.cash_collected),
      creditTotal: toNumber(apiDefaults.credit_total),
    }
  }

  return {
    invoiceCount: invoices.length,
    totalSold: invoices.reduce((sum, invoice) => sum + toNumber(invoice?.total), 0),
    cashCollected: invoices.reduce((sum, invoice) => sum + toNumber(invoice?.paid_amount), 0),
    creditTotal: invoices.reduce(
      (sum, invoice) => sum + Math.max(toNumber(invoice?.total) - toNumber(invoice?.paid_amount), 0),
      0,
    ),
  }
}

export default function RouteSessionScreen() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { user, isRep } = useAuth()
  const { t } = useI18n()
  const {
    session,
    loading,
    busy,
    refreshSessionDetails,
    startSession,
    endSession,
  } = useTracking()

  const [products, setProducts] = useState([])
  const [camions, setCamions] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [camionPickerVisible, setCamionPickerVisible] = useState(false)
  const [closeVisible, setCloseVisible] = useState(false)
  const [search, setSearch] = useState('')
  const [startLoadDraft, setStartLoadDraft] = useState({})
  const [cashCollected, setCashCollected] = useState('')
  const [creditCollected, setCreditCollected] = useState('')
  const [selectedCamionId, setSelectedCamionId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    }

    try {
      const [productsResponse, camionsResponse] = await Promise.all([
        api.get('/products'),
        api.get('/camions'),
        refreshSessionDetails(),
      ])

      setProducts(parseItems(productsResponse.data))
      setCamions(parseItems(camionsResponse.data))
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || t('routeSession.loadError'))
    } finally {
      setRefreshing(false)
    }
  }, [refreshSessionDetails, t])

  useFocusEffect(useCallback(() => {
    load()
    const interval = setInterval(() => refreshSessionDetails(), 45000)

    return () => clearInterval(interval)
  }, [load, refreshSessionDetails]))

  useEffect(() => {
    if (session?.camion?.id) {
      setSelectedCamionId(String(session.camion.id))
      return
    }

    const availableCamion = camions.find((camion) => camion.active !== false && camion.is_available !== false) ?? camions[0]

    if (!selectedCamionId && availableCamion?.id) {
      setSelectedCamionId(String(availableCamion.id))
    }
  }, [camions, selectedCamionId, session?.camion?.id])

  const closeDefaults = useMemo(() => buildCloseDefaults(session), [session])

  useEffect(() => {
    if (!closeVisible) {
      return
    }

    setCashCollected(closeDefaults.cashCollected.toFixed(3))
    setCreditCollected(closeDefaults.creditTotal.toFixed(3))
  }, [closeDefaults.cashCollected, closeDefaults.creditTotal, closeVisible])

  const activeCamions = camions.filter((camion) => camion.active !== false)
  const selectedCamion = activeCamions.find((camion) => String(camion.id) === String(selectedCamionId)) ?? null
  const selectedLines = useMemo(
    () => Object.entries(startLoadDraft)
      .map(([productId, qty]) => ({
        product_id: Number(productId),
        qty_loaded: toNumber(qty),
      }))
      .filter((item) => item.qty_loaded > 0),
    [startLoadDraft],
  )

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase()

    return products
      .filter((product) => {
        const searchable = !needle
          || product.name?.toLowerCase().includes(needle)
          || product.reference?.toLowerCase().includes(needle)

        return searchable && (toNumber(product.depot_qty) > 0 || toNumber(startLoadDraft[product.id]) > 0)
      })
      .sort((left, right) => {
        const leftSelected = toNumber(startLoadDraft[left.id]) > 0 ? 1 : 0
        const rightSelected = toNumber(startLoadDraft[right.id]) > 0 ? 1 : 0

        if (leftSelected !== rightSelected) {
          return rightSelected - leftSelected
        }

        return String(left.name || '').localeCompare(String(right.name || ''), 'fr')
      })
  }, [products, search, startLoadDraft])

  const selectedTotalQty = useMemo(
    () => selectedLines.reduce((sum, line) => sum + toNumber(line.qty_loaded), 0),
    [selectedLines],
  )

  const submitStartSession = async () => {
    if (!selectedCamionId) {
      Alert.alert(t('routeSession.camionRequiredTitle'), t('routeSession.camionRequiredText'))
      return
    }

    if (selectedLines.length === 0) {
      Alert.alert(t('routeSession.loadRequiredTitle'), t('routeSession.loadRequiredText'))
      return
    }

    const blocked = selectedLines.find((line) => {
      const product = products.find((entry) => entry.id === line.product_id)
      return toNumber(line.qty_loaded) > toNumber(product?.depot_qty)
    })

    if (blocked) {
      const product = products.find((entry) => entry.id === blocked.product_id)
      Alert.alert(
        t('routeSession.insufficientStockTitle'),
        t('routeSession.insufficientStockText', { product: product?.name || t('routeSession.productFallback') }),
      )
      return
    }

    try {
      await startSession({
        camion_id: Number(selectedCamionId),
        lines: selectedLines,
      })

      setStartLoadDraft({})
      setSearch('')
      await load()
    } catch (err) {
      Alert.alert(t('routeSession.startFailedTitle'), err.response?.data?.message || err.message || t('routeSession.retry'))
    }
  }

  const submitClose = async () => {
    try {
      const closedSession = await endSession({
        cash_collected: toNumber(cashCollected),
        credit_collected: toNumber(creditCollected),
      })

      setCloseVisible(false)
      setCashCollected('')
      setCreditCollected('')

      Alert.alert(
        t('routeSession.closedTitle'),
        t('routeSession.closedSummary', {
          sales: formatCurrency(closedSession?.total_sold || 0),
          credit: formatCurrency(closedSession?.credit_given || 0),
          cash: formatCurrency(closedSession?.cash_collected || 0),
        }),
      )
    } catch (err) {
      Alert.alert(t('routeSession.closeFailedTitle'), err.response?.data?.message || err.message || t('routeSession.retry'))
    }
  }

  if (!isRep()) {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <PageHeader
          title={t('routeSession.title')}
          subtitle={t('routeSession.repRequiredSubtitle')}
        />

        <CompanyBrandCard user={user} style={s.brandCard} />

        <View style={[s.emptyCard, cardShadow]}>
          <MaterialCommunityIcons name="account-lock-outline" size={34} color={T.primary} />
          <Text style={s.emptyTitle}>{t('routeSession.repRequiredTitle')}</Text>
          <Text style={s.emptyText}>
            {t('routeSession.repRequiredText')}
          </Text>
        </View>
      </ScrollView>
    )
  }

  const footerBottom = insets.bottom + 12

  return (
    <>
      <ScrollView
        style={s.root}
        contentContainerStyle={[s.content, !session && { paddingBottom: 148 + footerBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
      >
        <PageHeader
          title={t('routeSession.title')}
          subtitle={session ? t('routeSession.openSubtitle') : t('routeSession.closedSubtitle')}
          actionIcon="truck-cargo-container"
          actionLabel={t('navigation.stock')}
          onActionPress={() => navigation.navigate('Stock')}
        />

        <CompanyBrandCard user={user} style={s.brandCard} />

        {!!error && (
          <View style={s.noticeDanger}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
            <Text style={s.noticeDangerText}>{error}</Text>
          </View>
        )}

        {!session ? (
          <>
            <View style={[s.summaryCard, cardShadow]}>
            <View style={s.summaryTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryTitle}>{t('routeSession.newSessionTitle')}</Text>
                <Text style={s.summarySub}>
                    {t('routeSession.newSessionText')}
                  </Text>
              </View>
                <StatusChip label={t('routeSession.toOpenStatus')} tone="warning" />
              </View>

              <View style={s.camionCard}>
                <Text style={s.boxLabel}>{t('routeSession.selectedCamion')}</Text>
                <Text style={s.boxValue}>{selectedCamion?.name || t('routeSession.noCamionSelected')}</Text>
                <Text style={s.boxMeta}>
                  {selectedCamion?.plate
                    ? t('routeSession.plateLabel', { plate: selectedCamion.plate })
                    : t('routeSession.chooseCamionHint')}
                </Text>
                <TouchableOpacity style={s.secondaryButton} onPress={() => setCamionPickerVisible(true)}>
                  <Text style={s.secondaryButtonText}>{t('routeSession.chooseCamionAction')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[s.sectionCard, cardShadow]}>
              <Text style={s.sectionTitle}>{t('routeSession.initialLoadTitle')}</Text>
              <TextInput
                style={s.searchInput}
                placeholder={t('routeSession.searchPlaceholder')}
                placeholderTextColor={T.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              {loading && products.length === 0 ? (
                <ActivityIndicator color={T.primary} style={{ marginVertical: 24 }} />
              ) : filteredProducts.length === 0 ? (
                <View style={s.inlineEmpty}>
                  <MaterialCommunityIcons name="package-variant-closed" size={28} color={T.textMuted} />
                  <Text style={s.inlineEmptyTitle}>{t('routeSession.noProductsTitle')}</Text>
                  <Text style={s.inlineEmptyText}>
                    {t('routeSession.noProductsText')}
                  </Text>
                </View>
              ) : (
                <View style={s.rowsWrap}>
                  {filteredProducts.map((product) => {
                    const draftQty = startLoadDraft[product.id] ?? ''
                    const isSelected = toNumber(draftQty) > 0

                    return (
                      <QuantityStepperField
                        key={product.id}
                        title={product.name}
                        subtitle={product.reference || product.unit || t('routeSession.productFallback')}
                        helper={isSelected ? t('routeSession.helperSelected') : t('routeSession.helperAvailable')}
                        icon="truck-delivery-outline"
                        value={draftQty}
                        onChangeText={(value) => setStartLoadDraft((current) => ({ ...current, [product.id]: numericInput(value) }))}
                      />
                    )
                  })}
                </View>
              )}
            </View>
          </>
        ) : (
          <View style={[s.summaryCard, cardShadow]}>
            <View style={s.summaryTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.summaryTitle}>{t('routeSession.todaySessionTitle')}</Text>
                <Text style={s.summarySub}>{t('routeSession.todaySessionText')}</Text>
              </View>
              <StatusChip label={routeStatusLabel(session.status)} tone="success" />
            </View>

            <View style={s.factGrid}>
              <View style={s.factItem}>
                <Text style={s.factLabel}>{t('routeSession.metrics.openedAt')}</Text>
                <Text style={s.factValue}>{formatTime(session.opened_at)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>{t('routeSession.metrics.duration')}</Text>
                <Text style={s.factValue}>{formatElapsedSince(session.opened_at)}</Text>
              </View>
              <View style={s.factItem}>
                <Text style={s.factLabel}>{t('routeSession.metrics.camion')}</Text>
                <Text style={s.factValue}>{session.camion?.name || t('routeSession.noCamionSelected')}</Text>
              </View>
            </View>

            <View style={s.metricsGrid}>
              <View style={s.metricCard}>
                <Text style={s.metricLabel}>{t('routeSession.metrics.sales')}</Text>
                <Text style={s.metricValue}>{formatCurrency(session.total_sold || 0)}</Text>
              </View>
              <View style={s.metricCard}>
                <Text style={s.metricLabel}>{t('routeSession.metrics.credit')}</Text>
                <Text style={s.metricValue}>{formatCurrency(session.credit_given || 0)}</Text>
              </View>
              <View style={s.metricCard}>
                <Text style={s.metricLabel}>{t('routeSession.metrics.invoices')}</Text>
                <Text style={s.metricValue}>{formatCount(closeDefaults.invoiceCount)}</Text>
              </View>
            </View>

            <View style={s.actionStack}>
              <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Reappro')}>
                <Text style={s.primaryButtonText}>{t('routeSession.restockCamion')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Stock')}>
                <Text style={s.secondaryButtonText}>{t('routeSession.viewStock')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryButton} onPress={() => setCloseVisible(true)}>
                <Text style={s.secondaryButtonText}>{t('routeSession.closeAction')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {!session && (
        <View style={[s.footerCard, { bottom: footerBottom }]}>
          <Text style={s.footerText}>
            {t('routeSession.footerSummary', { lines: selectedLines.length, units: formatNumber(selectedTotalQty) })}
          </Text>
          <TouchableOpacity style={[s.footerButton, busy && s.buttonDisabled]} onPress={submitStartSession} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.footerButtonText}>{t('routeSession.startAction')}</Text>}
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={camionPickerVisible} transparent animationType="fade" onRequestClose={() => setCamionPickerVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialogLarge}>
            <Text style={s.dialogTitle}>{t('routeSession.chooseCamionTitle')}</Text>
            <Text style={s.dialogText}>
              {t('routeSession.chooseCamionText')}
            </Text>

            <ScrollView style={s.camionList} contentContainerStyle={{ gap: 10 }}>
              {activeCamions.length === 0 ? (
                <View style={s.camionEmptyCard}>
                  <MaterialCommunityIcons name="truck-outline" size={22} color={T.textMuted} />
                  <Text style={s.camionEmptyTitle}>{t('routeSession.noActiveCamionTitle')}</Text>
                  <Text style={s.camionEmptyText}>{t('routeSession.noActiveCamionText')}</Text>
                </View>
              ) : (
                activeCamions.map((camion) => {
                  const selected = String(camion.id) === String(selectedCamionId)
                  const disabled = camion.is_available === false && camion.id !== session?.camion?.id

                  return (
                    <TouchableOpacity
                      key={camion.id}
                      style={[
                        s.camionOption,
                        selected && s.camionOptionSelected,
                        disabled && s.camionOptionDisabled,
                      ]}
                      disabled={disabled}
                      onPress={() => setSelectedCamionId(String(camion.id))}
                    >
                      <View style={s.camionOptionIcon}>
                        <MaterialCommunityIcons name="truck-fast-outline" size={20} color={selected ? '#fff' : T.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.camionOptionTitle, selected && { color: '#fff' }]}>{camion.name}</Text>
                        <Text style={[s.camionOptionMeta, selected && { color: 'rgba(255,255,255,0.82)' }]}>
                          {camion.plate || t('routeSession.noPlate')}
                        </Text>
                        <Text style={[s.camionOptionMeta, selected && { color: 'rgba(255,255,255,0.82)' }]}>
                          {disabled
                            ? t('routeSession.occupiedBy', { name: camion.current_route_session?.rep?.name || t('routeSession.otherSession') })
                            : camion.workflow_status_label || t('routeSession.availableStatus')}
                        </Text>
                      </View>
                      {selected ? <MaterialCommunityIcons name="check-circle" size={20} color="#fff" /> : null}
                    </TouchableOpacity>
                  )
                })
              )}
            </ScrollView>

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={() => setCamionPickerVisible(false)}>
                <Text style={s.dialogSecondaryText}>{t('common.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={closeVisible} transparent animationType="fade" onRequestClose={() => setCloseVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{t('routeSession.closeDialogTitle')}</Text>
            <Text style={s.dialogText}>{t('routeSession.closeDialogText')}</Text>

            <View style={s.infoCard}>
              <MaterialCommunityIcons name="cash-register" size={18} color={T.info} />
              <Text style={s.infoCardText}>
                {t('routeSession.closeDialogSummary', {
                  invoices: closeDefaults.invoiceCount,
                  sales: formatCurrency(closeDefaults.totalSold),
                  cash: formatCurrency(closeDefaults.cashCollected),
                  credit: formatCurrency(closeDefaults.creditTotal),
                })}
              </Text>
            </View>

            <Text style={s.fieldLabel}>{t('routeSession.cashField')}</Text>
            <TextInput
              style={s.fieldInput}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={T.textMuted}
              value={cashCollected}
              onChangeText={(value) => setCashCollected(numericInput(value))}
            />

            <Text style={s.fieldLabel}>{t('routeSession.creditField')}</Text>
            <TextInput
              style={s.fieldInput}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={T.textMuted}
              value={creditCollected}
              onChangeText={(value) => setCreditCollected(numericInput(value))}
            />

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={() => setCloseVisible(false)}>
                <Text style={s.dialogSecondaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dialogPrimary, busy && s.buttonDisabled]} onPress={submitClose} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.dialogPrimaryText}>{t('routeSession.closeConfirm')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  brandCard: {
    marginBottom: 14,
  },
  emptyCard: {
    backgroundColor: T.surface,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.border,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 20,
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
  summaryCard: {
    backgroundColor: T.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 14,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: T.text,
  },
  summarySub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: T.textSecondary,
  },
  camionCard: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    padding: 16,
  },
  boxLabel: {
    fontSize: 11,
    color: T.textMuted,
  },
  boxValue: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: '800',
    color: T.text,
  },
  boxMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  sectionCard: {
    backgroundColor: T.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 14,
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
    marginTop: 6,
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: '#f4fbfa',
    padding: 12,
  },
  metricLabel: {
    fontSize: 11,
    color: T.textMuted,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  actionStack: {
    marginTop: 16,
    gap: 10,
  },
  primaryButton: {
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.46)',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 20,
  },
  dialogLarge: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 20,
    maxHeight: '82%',
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: T.text,
  },
  dialogText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: T.textSecondary,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  dialogPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: T.primary,
  },
  dialogPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  dialogSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  dialogSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  fieldLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: T.textMuted,
  },
  fieldInput: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
    color: T.text,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#eef6ff',
  },
  infoCardText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: T.textSecondary,
  },
  camionList: {
    marginTop: 16,
  },
  camionEmptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  camionEmptyTitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  camionEmptyText: {
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
    color: T.textSecondary,
  },
  camionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    padding: 14,
  },
  camionOptionSelected: {
    backgroundColor: T.primary,
    borderColor: T.primary,
  },
  camionOptionDisabled: {
    opacity: 0.6,
  },
  camionOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  camionOptionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  camionOptionMeta: {
    marginTop: 3,
    fontSize: 12,
    color: T.textSecondary,
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
