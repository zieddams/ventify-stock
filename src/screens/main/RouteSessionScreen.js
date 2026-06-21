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
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../contexts/AuthContext'
import { useTracking } from '../../contexts/TrackingContext'
import { listRouteSessions } from '../../services/routeSessionService'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCurrency, formatDateTime, formatNumber, formatTime, routeStatusLabel, toNumber } from '../../utils/format'

function parseItems(data) {
  return Array.isArray(data) ? data : data?.data ?? []
}

function numericInput(value) {
  return value.replace(/[^0-9.]/g, '')
}

export default function RouteSessionScreen() {
  const navigation = useNavigation()
  const { isRep } = useAuth()
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
  const [camionStockByProductId, setCamionStockByProductId] = useState({})
  const [sessionHistory, setSessionHistory] = useState([])
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
      const [productsResponse, camionsResponse, camionResponse, , historyResponse] = await Promise.all([
        api.get('/products'),
        api.get('/camions'),
        api.get('/camion'),
        refreshSessionDetails(),
        listRouteSessions({ per_page: 6 }),
      ])

      setProducts(parseItems(productsResponse.data))
      setCamions(parseItems(camionsResponse.data))
      setCamionStockByProductId(camionResponse.data?.by_product_id ?? {})
      setSessionHistory(parseItems(historyResponse))
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Le module session n’a pas pu être chargé.')
    } finally {
      setRefreshing(false)
    }
  }, [refreshSessionDetails])

  useFocusEffect(useCallback(() => {
    load()
    const interval = setInterval(() => refreshSessionDetails(), 45000)

    return () => clearInterval(interval)
  }, [load, refreshSessionDetails]))

  useEffect(() => {
    if (session?.id) {
      load()
    }
  }, [load, session?.id, session?.status, session?.updated_at])

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

  const activeCamions = camions.filter((camion) => camion.active !== false)
  const selectedCamion = activeCamions.find((camion) => String(camion.id) === String(selectedCamionId)) ?? null
  const currentSessionOpen = session?.status === 'open'
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

    return products.filter((product) => {
      const depotQty = toNumber(product.depot_qty)
      const hasDraft = toNumber(startLoadDraft[product.id]) > 0
      const searchable = !needle || product.name?.toLowerCase().includes(needle) || product.reference?.toLowerCase().includes(needle)

      return searchable && (depotQty > 0 || hasDraft)
    })
  }, [products, search, startLoadDraft])

  const submitStartSession = async () => {
    if (!selectedCamionId) {
      Alert.alert('Camion requis', 'Choisissez le camion physique de la tournée.')
      return
    }

    if (selectedLines.length === 0) {
      Alert.alert('Chargement requis', 'Ajoutez au moins une ligne de chargement initial pour démarrer la session.')
      return
    }

    const blocked = selectedLines.find((line) => {
      const product = products.find((entry) => entry.id === line.product_id)
      return toNumber(line.qty_loaded) > toNumber(product?.depot_qty)
    })

    if (blocked) {
      const product = products.find((entry) => entry.id === blocked.product_id)
      Alert.alert(
        'Stock dépôt insuffisant',
        `${product?.name || 'Produit'}: ${formatNumber(product?.depot_qty)} disponible(s) au dépôt.`,
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
      Alert.alert('Session impossible', err.response?.data?.message || err.message || 'Veuillez réessayer.')
    }
  }

  const submitClose = async () => {
    try {
      await endSession({
        cash_collected: toNumber(cashCollected),
        credit_collected: toNumber(creditCollected),
      })
      setCloseVisible(false)
      setCashCollected('')
      setCreditCollected('')
      await load()
    } catch (err) {
      Alert.alert('Clôture impossible', err.response?.data?.message || err.message || 'Veuillez réessayer.')
    }
  }

  if (!isRep()) {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <PageHeader
          title="Session commerciale"
          subtitle="Camion, chargement initial et état courant."
        />

        <View style={[s.emptyCard, cardShadow]}>
          <MaterialCommunityIcons name="account-lock-outline" size={34} color={T.primary} />
          <Text style={s.emptyTitle}>Compte commercial requis</Text>
          <Text style={s.emptyText}>
            L’ouverture et la gestion d’une session mobile doivent être testées avec un compte commercial pour rester alignées avec les routes API de session.
          </Text>
        </View>
      </ScrollView>
    )
  }

  return (
    <>
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
      >
        <PageHeader
          title="Session commerciale"
          subtitle="Choisissez le camion, chargez le stock puis démarrez votre journée."
        />

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
                  <Text style={s.summaryTitle}>Démarrer la session</Text>
                  <Text style={s.summarySub}>
                    Si une session vous est affectée depuis le web, elle apparaîtra ici automatiquement. Sinon, démarrez-la depuis ce mobile.
                  </Text>
                </View>
                <StatusChip label="À ouvrir" tone="warning" />
              </View>

              <View style={s.camionCard}>
                <Text style={s.boxLabel}>Camion sélectionné</Text>
                <Text style={s.boxValue}>{selectedCamion?.name || 'Aucun camion choisi'}</Text>
                <Text style={s.boxMeta}>
                  {selectedCamion?.plate
                    ? `Immatriculation ${selectedCamion.plate}`
                    : 'Choisissez le camion physique avant d’ouvrir la session.'}
                </Text>
                <TouchableOpacity style={s.secondaryButton} onPress={() => setCamionPickerVisible(true)}>
                  <Text style={s.secondaryButtonText}>Choisir le camion</Text>
                </TouchableOpacity>
              </View>

              <View style={s.infoCard}>
                <MaterialCommunityIcons name="information-outline" size={18} color={T.info} />
                <Text style={s.infoCardText}>
                  Le stock affiché vient du dépôt. Le backend contrôle les quantités et empêche tout chargement supérieur au stock disponible.
                </Text>
              </View>
            </View>

            <View style={[s.sectionCard, cardShadow]}>
              <Text style={s.sectionTitle}>Chargement initial</Text>
              <TextInput
                style={s.searchInput}
                placeholder="Rechercher un produit du dépôt"
                placeholderTextColor={T.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              {filteredProducts.length === 0 ? (
                <View style={s.inlineEmpty}>
                  <MaterialCommunityIcons name="package-variant-closed" size={28} color={T.textMuted} />
                  <Text style={s.inlineEmptyTitle}>Aucun produit disponible</Text>
                  <Text style={s.inlineEmptyText}>
                    Les produits sans stock dépôt restent masqués tant qu’aucune quantité n’est saisie.
                  </Text>
                </View>
              ) : (
                <View style={s.rowsWrap}>
                  {filteredProducts.map((product) => {
                    const depotQty = toNumber(product.depot_qty)
                    const camionQty = toNumber(camionStockByProductId[product.id])
                    const draftQty = startLoadDraft[product.id] ?? ''

                    return (
                      <View key={product.id} style={s.productRow}>
                        <View style={s.rowIcon}>
                          <MaterialCommunityIcons name="truck-delivery-outline" size={18} color={T.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rowTitle}>{product.name}</Text>
                          <Text style={s.rowMeta}>{product.reference || product.unit || 'Produit'}</Text>
                          <Text style={s.rowStats}>
                            Dépôt {formatNumber(depotQty)} | Camion {formatNumber(camionQty)} | Min {formatNumber(Math.max(toNumber(product.min_stock, 1), 1))}
                          </Text>
                        </View>
                        <TextInput
                          style={s.qtyInput}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={T.textMuted}
                          value={draftQty}
                          onChangeText={(value) => setStartLoadDraft((current) => ({ ...current, [product.id]: numericInput(value) }))}
                        />
                      </View>
                    )
                  })}
                </View>
              )}

              <View style={s.startFooter}>
                <Text style={s.startFooterText}>
                  {selectedLines.length} ligne(s) | {formatNumber(selectedLines.reduce((sum, line) => sum + toNumber(line.qty_loaded), 0))} unité(s)
                </Text>
                <TouchableOpacity style={[s.primaryButton, busy && s.buttonDisabled]} onPress={submitStartSession} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Démarrer la session</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={[s.summaryCard, cardShadow]}>
              <View style={s.summaryTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.summaryTitle}>Session du {session.session_date}</Text>
                  <Text style={s.summarySub}>
                    Cette session reste synchronisée avec la plateforme web. Les ventes, recharges et retours alimentent automatiquement le suivi.
                  </Text>
                </View>
                <StatusChip label={routeStatusLabel(session.status)} tone={currentSessionOpen ? 'success' : 'info'} />
              </View>

              <View style={s.factGrid}>
                <View style={s.factItem}>
                  <Text style={s.factLabel}>Ouverture</Text>
                  <Text style={s.factValue}>{formatTime(session.opened_at)}</Text>
                </View>
                <View style={s.factItem}>
                  <Text style={s.factLabel}>Camion</Text>
                  <Text style={s.factValue}>{session.camion?.name || 'Aucun camion assigné'}</Text>
                </View>
                <View style={s.factItem}>
                  <Text style={s.factLabel}>Dernière mise à jour</Text>
                  <Text style={s.factValue}>{session.updated_at ? formatTime(session.updated_at) : '--'}</Text>
                </View>
              </View>

              <View style={s.camionCard}>
                <Text style={s.boxLabel}>Camion physique</Text>
                <Text style={s.boxValue}>{session.camion?.name || 'Aucun camion assigné'}</Text>
                <Text style={s.boxMeta}>
                  {session.camion?.plate
                    ? `Immatriculation ${session.camion.plate}`
                    : 'Aucune immatriculation disponible pour cette session.'}
                </Text>
              </View>

              {currentSessionOpen ? (
                <View style={s.actionStack}>
                  <TouchableOpacity style={s.primaryButton} onPress={() => navigation.navigate('Reappro', { mode: 'load' })}>
                    <Text style={s.primaryButtonText}>Recharger le camion</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.secondaryButton} onPress={() => navigation.navigate('Reappro', { mode: 'returns' })}>
                    <Text style={s.secondaryButtonText}>Retours et écarts</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.secondaryButton} onPress={() => setCloseVisible(true)}>
                    <Text style={s.secondaryButtonText}>Clôturer la session</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.closedMetrics}>
                  <View style={s.closedMetric}>
                    <Text style={s.factLabel}>Total vendu</Text>
                    <Text style={s.closedValue}>{formatCurrency(session.total_sold)}</Text>
                  </View>
                  <View style={s.closedMetric}>
                    <Text style={s.factLabel}>Bénéfice</Text>
                    <Text style={s.closedValue}>{formatCurrency(session.profit_total)}</Text>
                  </View>
                  <View style={s.closedMetric}>
                    <Text style={s.factLabel}>Clôturée</Text>
                    <Text style={s.closedValue}>{formatTime(session.closed_at)}</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={[s.sectionCard, cardShadow]}>
              <Text style={s.sectionTitle}>Lignes de session</Text>

              {loading && (session.lines ?? []).length === 0 ? (
                <ActivityIndicator color={T.primary} style={{ marginVertical: 22 }} />
              ) : (session.lines ?? []).length === 0 ? (
                <Text style={s.emptyText}>Aucune ligne de session n’a encore été enregistrée.</Text>
              ) : (
                (session.lines ?? []).map((line) => (
                  <View key={line.id || line.product_id} style={s.lineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lineName}>{line.product?.name || 'Produit'}</Text>
                      <Text style={s.lineMeta}>
                        Chargé {formatNumber(line.qty_loaded)} | Retour {formatNumber(line.qty_returned)} | Vendu {formatNumber(line.qty_sold)}
                      </Text>
                    </View>
                    <Text style={s.linePrice}>{line.unit_price ? formatCurrency(line.unit_price) : '--'}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        <View style={[s.sectionCard, cardShadow]}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Historique récent</Text>
            <Text style={s.sectionHint}>6 dernières sessions</Text>
          </View>

          {sessionHistory.length === 0 ? (
            <Text style={s.emptyText}>Aucune session enregistrée pour ce compte.</Text>
          ) : (
            sessionHistory.map((item) => (
              <View key={item.id} style={s.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.historyTitle}>
                    {item.session_date || 'Date inconnue'} · {item.camion?.name || 'Sans camion'}
                  </Text>
                  <Text style={s.historyMeta}>
                    Ouverture {formatDateTime(item.opened_at)}{item.closed_at ? ` · Clôture ${formatDateTime(item.closed_at)}` : ''}
                  </Text>
                  <Text style={s.historyMeta}>
                    {item.camion?.plate || 'Immatriculation non renseignée'} · {formatCurrency(item.total_sold || 0)}
                  </Text>
                </View>
                <StatusChip
                  label={routeStatusLabel(item.status)}
                  tone={item.status === 'open' ? 'success' : 'info'}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={camionPickerVisible} transparent animationType="fade" onRequestClose={() => setCamionPickerVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialogLarge}>
            <Text style={s.dialogTitle}>Choisir le camion</Text>
            <Text style={s.dialogText}>
              Sélectionnez le camion réel de la session. Un camion occupé ne peut pas être réutilisé pour une autre session ouverte.
            </Text>

            <ScrollView style={s.camionList} contentContainerStyle={{ gap: 10 }}>
              {activeCamions.length === 0 ? (
                <View style={s.camionEmptyCard}>
                  <MaterialCommunityIcons name="truck-outline" size={22} color={T.textMuted} />
                  <Text style={s.camionEmptyTitle}>Aucun camion actif</Text>
                  <Text style={s.camionEmptyText}>Le back-office doit d’abord créer et activer les camions physiques.</Text>
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
                          {camion.plate || 'Immatriculation non renseignée'}
                        </Text>
                        <Text style={[s.camionOptionMeta, selected && { color: 'rgba(255,255,255,0.82)' }]}>
                          {disabled
                            ? `Occupé par ${camion.current_route_session?.rep?.name || 'une autre session'}`
                            : camion.workflow_status_label || 'Disponible'}
                        </Text>
                        <View style={s.camionOptionBadges}>
                          <StatusChip
                            label={camion.workflow_status_label || 'Disponible'}
                            tone={disabled ? 'warning' : selected ? 'info' : 'success'}
                          />
                          {camion.current_route_session?.zone?.name ? (
                            <StatusChip label={camion.current_route_session.zone.name} tone="neutral" />
                          ) : null}
                        </View>
                      </View>
                      {selected ? <MaterialCommunityIcons name="check-circle" size={20} color="#fff" /> : null}
                    </TouchableOpacity>
                  )
                })
              )}
            </ScrollView>

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={() => setCamionPickerVisible(false)}>
                <Text style={s.dialogSecondaryText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={closeVisible} transparent animationType="fade" onRequestClose={() => setCloseVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Clôturer la session</Text>
            <Text style={s.dialogText}>Enregistrez les montants collectés avant la fermeture de la session.</Text>

            <Text style={s.fieldLabel}>Cash collecté</Text>
            <TextInput
              style={s.fieldInput}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={T.textMuted}
              value={cashCollected}
              onChangeText={(value) => setCashCollected(numericInput(value))}
            />

            <Text style={s.fieldLabel}>Crédit collecté</Text>
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
                <Text style={s.dialogSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dialogPrimary, busy && s.buttonDisabled]} onPress={submitClose} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.dialogPrimaryText}>Clôturer</Text>}
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
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  camionCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  boxLabel: {
    fontSize: 12,
    color: T.textMuted,
  },
  boxValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: T.info,
  },
  boxMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
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
    fontSize: 15,
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
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  closedMetrics: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  closedMetric: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: T.surfaceAlt,
  },
  closedValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  sectionCard: {
    backgroundColor: T.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 12,
    color: T.textMuted,
  },
  searchInput: {
    marginTop: 12,
    height: 50,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    color: T.text,
    backgroundColor: T.surfaceAlt,
  },
  rowsWrap: {
    marginTop: 14,
    gap: 10,
  },
  productRow: {
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
  startFooter: {
    marginTop: 16,
    gap: 10,
  },
  startFooterText: {
    fontSize: 12,
    color: T.textMuted,
  },
  inlineEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  inlineEmptyTitle: {
    marginTop: 12,
    fontSize: 16,
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
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoCardText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: T.textSecondary,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  lineName: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  lineMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  linePrice: {
    fontSize: 13,
    fontWeight: '800',
    color: T.primaryDark,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  historyMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 22,
  },
  dialog: {
    backgroundColor: T.surface,
    borderRadius: 22,
    padding: 22,
  },
  dialogLarge: {
    backgroundColor: T.surface,
    borderRadius: 22,
    padding: 22,
    maxHeight: '82%',
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: T.text,
  },
  dialogText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: T.textSecondary,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  dialogSecondary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  dialogSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  dialogPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: T.primary,
  },
  dialogPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: T.textMuted,
    textTransform: 'uppercase',
  },
  fieldInput: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '700',
    color: T.text,
    backgroundColor: T.surfaceAlt,
  },
  camionList: {
    marginTop: 18,
    maxHeight: 340,
  },
  camionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  camionOptionSelected: {
    borderColor: T.primary,
    backgroundColor: T.primary,
  },
  camionOptionDisabled: {
    opacity: 0.5,
  },
  camionOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  camionOptionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  camionOptionMeta: {
    marginTop: 3,
    fontSize: 12,
    color: T.textMuted,
  },
  camionOptionBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  camionEmptyCard: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  camionEmptyTitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  camionEmptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: T.textSecondary,
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
