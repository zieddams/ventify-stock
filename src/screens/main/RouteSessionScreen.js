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
import { useFocusEffect } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCurrency, formatDateTime, formatNumber, formatTime, routeStatusLabel, toNumber } from '../../utils/format'

function locationText(location) {
  const source = location?.coords ?? location
  if (!Number.isFinite(source?.latitude) || !Number.isFinite(source?.longitude)) return 'Aucune position remontee.'
  return `${source.latitude.toFixed(5)}, ${source.longitude.toFixed(5)}`
}

function numericInput(value) {
  return value.replace(/[^0-9.]/g, '')
}

export default function RouteSessionScreen() {
  const {
    session,
    loading,
    busy,
    currentLocation,
    locationPermission,
    trackingState,
    refreshSessionDetails,
    startSession,
    captureCurrentLocation,
    addLoad,
    recordReturns,
    endSession,
  } = useTracking()

  const [products, setProducts] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [loadVisible, setLoadVisible] = useState(false)
  const [returnsVisible, setReturnsVisible] = useState(false)
  const [closeVisible, setCloseVisible] = useState(false)
  const [startVisible, setStartVisible] = useState(false)
  const [search, setSearch] = useState('')
  const [loadDraft, setLoadDraft] = useState({})
  const [returnsDraft, setReturnsDraft] = useState({})
  const [cashCollected, setCashCollected] = useState('')
  const [creditCollected, setCreditCollected] = useState('')
  const [camions, setCamions] = useState([])
  const [selectedCamionId, setSelectedCamionId] = useState('')

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)

    try {
      const [productsResponse, camionsResponse] = await Promise.all([
        api.get('/products'),
        api.get('/camions'),
        refreshSessionDetails(),
      ])

      setProducts(Array.isArray(productsResponse.data) ? productsResponse.data : [])
      setCamions(Array.isArray(camionsResponse.data) ? camionsResponse.data : [])
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
    if (camions.length === 0) {
      setSelectedCamionId('')
      return
    }

    const preferredCamion = camions.find((camion) => camion.is_available !== false) ?? camions[0]

    setSelectedCamionId((current) => (
      camions.some((camion) => String(camion.id) === String(current))
        ? current
        : String(preferredCamion.id)
    ))
  }, [camions])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((item) => (
      item.name?.toLowerCase().includes(q)
      || item.reference?.toLowerCase().includes(q)
    ))
  }, [products, search])

  const lines = session?.lines ?? []
  const latestLocation = currentLocation?.coords ? currentLocation : session?.latestLocation
  const isOpen = session?.status === 'open'
  const configuredCamion = session?.camion ?? null
  const activeCamions = camions.filter((camion) => camion.active !== false)
  const selectedCamion = activeCamions.find((camion) => String(camion.id) === String(selectedCamionId)) ?? null
  const selectedCamionBlocked = selectedCamion?.is_available === false && selectedCamion?.id !== configuredCamion?.id

  const submitLoad = async () => {
    const payload = Object.entries(loadDraft)
      .map(([productId, qty]) => ({
        product_id: Number(productId),
        qty_loaded: toNumber(qty),
      }))
      .filter((item) => item.qty_loaded > 0)

    if (payload.length === 0) {
      Alert.alert('Chargement', 'Ajoutez au moins une quantite a charger.')
      return
    }

    try {
      await addLoad(payload)
      setLoadDraft({})
      setLoadVisible(false)
      setSearch('')
    } catch (error) {
      Alert.alert('Chargement impossible', error.response?.data?.message || error.message || 'Veuillez reessayer.')
    }
  }

  const submitReturns = async () => {
    const payload = Object.entries(returnsDraft)
      .map(([productId, qty]) => ({
        product_id: Number(productId),
        qty_returned: toNumber(qty),
      }))
      .filter((item) => item.qty_returned > 0)

    if (payload.length === 0) {
      Alert.alert('Retours', 'Ajoutez au moins une quantite retour.')
      return
    }

    try {
      await recordReturns(payload)
      setReturnsDraft({})
      setReturnsVisible(false)
    } catch (error) {
      Alert.alert('Retours impossibles', error.response?.data?.message || error.message || 'Veuillez reessayer.')
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
    } catch (error) {
      Alert.alert('Cloture impossible', error.response?.data?.message || error.message || 'Veuillez reessayer.')
    }
  }

  const submitStartSession = async () => {
    try {
      await startSession(selectedCamionId ? { camion_id: Number(selectedCamionId) } : {})
      setStartVisible(false)
    } catch (error) {
      Alert.alert('Session impossible', error.response?.data?.message || error.message || 'Veuillez reessayer.')
    }
  }

  return (
    <>
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}>
        <PageHeader
          title="Session & GPS"
          subtitle="Suivi 20 s, camion reel et audit de reappro."
          actionIcon="crosshairs-gps"
          actionLabel="Sync"
          onActionPress={() => captureCurrentLocation('manual')}
        />

        {!session ? (
          <View style={[s.emptyCard, cardShadow]}>
            <MaterialCommunityIcons name="truck-fast-outline" size={34} color={T.primary} />
            <Text style={s.emptyTitle}>Aucune session ouverte</Text>
            <Text style={s.emptyText}>
              Choisissez le camion physique du jour pour activer le suivi GPS et auditer les chargements.
            </Text>
            <TouchableOpacity
              style={[s.primaryButton, busy && s.buttonDisabled]}
              onPress={() => setStartVisible(true)}
              disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Choisir le camion</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={[s.summaryCard, cardShadow]}>
              <View style={s.summaryTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.summaryTitle}>Session du {session.session_date}</Text>
                  <Text style={s.summarySub}>Etat, tracking 20 s et reappro en temps reel si le backend le permet.</Text>
                </View>
                <StatusChip
                  label={routeStatusLabel(session.status)}
                  tone={isOpen ? 'success' : 'info'}
                />
              </View>

              <View style={s.factGrid}>
                <View style={s.factItem}>
                  <Text style={s.factLabel}>Ouverture</Text>
                  <Text style={s.factValue}>{formatTime(session.opened_at)}</Text>
                </View>
                <View style={s.factItem}>
                  <Text style={s.factLabel}>Points GPS</Text>
                  <Text style={s.factValue}>{session.locations_count || 0}</Text>
                </View>
                <View style={s.factItem}>
                  <Text style={s.factLabel}>Permission GPS</Text>
                  <Text style={s.factValue}>{locationPermission === 'granted' ? 'OK' : 'A verifier'}</Text>
                </View>
              </View>

              <View style={s.camionCard}>
                <Text style={s.locationLabel}>Camion physique assigne</Text>
                <Text style={s.locationValue}>{configuredCamion?.name || 'Aucun camion assigne'}</Text>
                <Text style={s.locationMeta}>
                  {configuredCamion?.plate
                    ? `Immatriculation ${configuredCamion.plate}`
                    : activeCamions.length > 0
                      ? 'Affectez un camion pour lier la session au vehicule reel.'
                      : 'Aucun camion actif configure pour le moment.'}
                </Text>
              </View>

              <View style={s.bannerRow}>
                <StatusChip
                  label={trackingState.active ? 'Tracking actif' : 'Tracking en attente'}
                  tone={trackingState.active ? 'success' : 'warning'}
                />
                <StatusChip
                  label={trackingState.lastSyncAt ? `Dernier sync ${formatTime(trackingState.lastSyncAt)}` : 'Sync manuel possible'}
                  tone={trackingState.lastSyncAt ? 'info' : 'neutral'}
                />
              </View>

              <View style={s.locationBox}>
                <Text style={s.locationLabel}>Derniere position mobile</Text>
                <Text style={s.locationValue}>{locationText(latestLocation)}</Text>
                <Text style={s.locationMeta}>
                  {session.latestLocation?.recorded_at
                    ? `Serveur: ${formatDateTime(session.latestLocation.recorded_at)}`
                    : 'Position serveur non disponible pour cette session.'}
                </Text>
              </View>

              {!!trackingState.error && (
                <View style={s.noticeWarning}>
                  <MaterialCommunityIcons name="map-marker-alert-outline" size={18} color={T.warning} />
                  <Text style={s.noticeWarningText}>{trackingState.error}</Text>
                </View>
              )}

              {isOpen && !configuredCamion && (
                <View style={s.noticeWarning}>
                  <MaterialCommunityIcons name="truck-alert-outline" size={18} color={T.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.noticeWarningText}>
                      Cette session est ouverte sans camion physique affecte.
                    </Text>
                    <TouchableOpacity style={s.noticeAction} onPress={() => setStartVisible(true)}>
                      <Text style={s.noticeActionText}>Affecter un camion maintenant</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={s.actionStack}>
                {isOpen && (
                  <>
                    <TouchableOpacity style={s.primaryButton} onPress={() => setLoadVisible(true)}>
                      <Text style={s.primaryButtonText}>Reappro camion</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.secondaryButton} onPress={() => setReturnsVisible(true)}>
                      <Text style={s.secondaryButtonText}>Declarer les retours</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.secondaryButton} onPress={() => setCloseVisible(true)}>
                      <Text style={s.secondaryButtonText}>Cloturer la session</Text>
                    </TouchableOpacity>
                  </>
                )}

                {!isOpen && (
                  <View style={s.closedMetrics}>
                    <View style={s.closedMetric}>
                      <Text style={s.factLabel}>Total vendu</Text>
                      <Text style={s.closedValue}>{formatCurrency(session.total_sold)}</Text>
                    </View>
                    <View style={s.closedMetric}>
                      <Text style={s.factLabel}>Benefice</Text>
                      <Text style={s.closedValue}>{formatCurrency(session.profit_total)}</Text>
                    </View>
                    <View style={s.closedMetric}>
                      <Text style={s.factLabel}>Cloturee</Text>
                      <Text style={s.closedValue}>{formatTime(session.closed_at)}</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            <View style={[s.sectionCard, cardShadow]}>
              <Text style={s.sectionTitle}>Audit des lignes session</Text>

              {loading && lines.length === 0 ? (
                <ActivityIndicator color={T.primary} style={{ marginVertical: 22 }} />
              ) : lines.length === 0 ? (
                <Text style={s.emptyText}>Aucun chargement n a encore ete enregistre.</Text>
              ) : (
                lines.map((line) => (
                  <View key={line.id || line.product_id} style={s.lineRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lineName}>{line.product?.name || 'Produit'}</Text>
                      <Text style={s.lineMeta}>
                        Charge {formatNumber(line.qty_loaded)} / Retour {formatNumber(line.qty_returned)} / Vendu {formatNumber(line.qty_sold)}
                      </Text>
                    </View>
                    <Text style={s.linePrice}>
                      {line.unit_price ? formatCurrency(line.unit_price) : '--'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={loadVisible} animationType="slide" onRequestClose={() => setLoadVisible(false)}>
        <View style={s.modalRoot}>
          <PageHeader
            title="Reappro camion"
            subtitle="Depot vers camion et notification terrain"
            actionIcon="close"
            onActionPress={() => {
              setLoadVisible(false)
              setSearch('')
            }}
          />

          <TextInput
            style={s.searchInput}
            placeholder="Rechercher un produit"
            placeholderTextColor={T.textMuted}
            value={search}
            onChangeText={setSearch}
          />

          <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
            {filteredProducts.map((product) => (
              <View key={product.id} style={s.modalRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalRowTitle}>{product.name}</Text>
                  <Text style={s.modalRowMeta}>{product.reference || product.unit || 'Produit'}</Text>
                </View>
                <TextInput
                  style={s.qtyInput}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={T.textMuted}
                  value={loadDraft[product.id] ?? ''}
                  onChangeText={(value) => setLoadDraft((prev) => ({ ...prev, [product.id]: numericInput(value) }))}
                />
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={[s.primaryButton, busy && s.buttonDisabled]} onPress={submitLoad} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Valider le chargement</Text>}
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={startVisible} transparent animationType="fade" onRequestClose={() => setStartVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialogLarge}>
            <Text style={s.dialogTitle}>{session ? 'Affecter un camion' : 'Demarrer la session'}</Text>
            <Text style={s.dialogText}>
              Choisissez le camion physique de cette tournee et verifiez son statut actuel. Si aucun camion n est configure, vous pouvez continuer sans affectation.
            </Text>

            <ScrollView style={s.camionList} contentContainerStyle={{ gap: 10 }}>
              {activeCamions.length === 0 ? (
                <View style={s.camionEmptyCard}>
                  <MaterialCommunityIcons name="truck-outline" size={22} color={T.textMuted} />
                  <Text style={s.camionEmptyTitle}>Aucun camion actif</Text>
                  <Text style={s.camionEmptyText}>
                    Le back-office doit d abord creer les camions physiques. Vous pouvez quand meme ouvrir la session.
                  </Text>
                </View>
              ) : (
                activeCamions.map((camion) => {
                  const selected = String(camion.id) === String(selectedCamionId)
                  const disabled = camion.is_available === false && camion.id !== configuredCamion?.id

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
                          {camion.plate || 'Immatriculation non renseignee'}
                        </Text>
                        <Text style={[s.camionOptionMeta, selected && { color: 'rgba(255,255,255,0.82)' }]}>
                          {disabled
                            ? `Occupe par ${camion.current_route_session?.rep?.name || 'une autre session'}`
                            : camion.current_route_session?.rep?.name
                              ? `Session ${camion.current_route_session.rep.name}`
                              : 'Disponible'}
                        </Text>
                        <View style={s.camionOptionBadges}>
                          <StatusChip
                            label={disabled ? 'Occupe' : camion.active === false ? 'Inactif' : selected ? 'Selectionne' : 'Disponible'}
                            tone={disabled ? 'warning' : camion.active === false ? 'danger' : selected ? 'info' : 'success'}
                          />
                          {camion.current_route_session?.zone?.name && (
                            <StatusChip label={camion.current_route_session.zone.name} tone="neutral" />
                          )}
                        </View>
                      </View>
                      {selected && <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />}
                    </TouchableOpacity>
                  )
                })
              )}
            </ScrollView>

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={() => setStartVisible(false)}>
                <Text style={s.dialogSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.dialogPrimary, busy && s.buttonDisabled]}
                onPress={submitStartSession}
                disabled={busy || (activeCamions.length > 0 && (!selectedCamionId || selectedCamionBlocked))}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.dialogPrimaryText}>
                    {activeCamions.length > 0
                      ? (session ? 'Affecter le camion' : 'Demarrer avec ce camion')
                      : 'Continuer sans camion'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={returnsVisible} animationType="slide" onRequestClose={() => setReturnsVisible(false)}>
        <View style={s.modalRoot}>
          <PageHeader
            title="Retours depot"
            subtitle="Declarer le restant retourne"
            actionIcon="close"
            onActionPress={() => setReturnsVisible(false)}
          />

          <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
            {lines.length === 0 ? (
              <Text style={s.emptyText}>Aucune ligne ouverte pour les retours.</Text>
            ) : (
              lines.map((line) => (
                <View key={line.product_id} style={s.modalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalRowTitle}>{line.product?.name || 'Produit'}</Text>
                    <Text style={s.modalRowMeta}>
                      Charge {formatNumber(line.qty_loaded)} - deja retourne {formatNumber(line.qty_returned)}
                    </Text>
                  </View>
                  <TextInput
                    style={s.qtyInput}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={T.textMuted}
                    value={returnsDraft[line.product_id] ?? ''}
                    onChangeText={(value) => setReturnsDraft((prev) => ({ ...prev, [line.product_id]: numericInput(value) }))}
                  />
                </View>
              ))
            )}
          </ScrollView>

          <TouchableOpacity style={[s.primaryButton, busy && s.buttonDisabled]} onPress={submitReturns} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Valider les retours</Text>}
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={closeVisible} transparent animationType="fade" onRequestClose={() => setCloseVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Cloturer la session</Text>
            <Text style={s.dialogText}>
              Enregistrez les montants encaisses avant de fermer la session du jour.
            </Text>

            <Text style={s.fieldLabel}>Cash collecte</Text>
            <TextInput
              style={s.fieldInput}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={T.textMuted}
              value={cashCollected}
              onChangeText={(value) => setCashCollected(numericInput(value))}
            />

            <Text style={s.fieldLabel}>Credit collecte</Text>
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
              <TouchableOpacity style={s.dialogPrimary} onPress={submitClose}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.dialogPrimaryText}>Cloturer</Text>}
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
  bannerRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  locationBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  camionCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  locationLabel: {
    fontSize: 12,
    color: T.textMuted,
  },
  locationValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '800',
    color: T.info,
  },
  locationMeta: {
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
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  closedMetrics: {
    flexDirection: 'row',
    gap: 10,
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
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
    marginBottom: 8,
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
  modalRoot: {
    flex: 1,
    backgroundColor: T.background,
    padding: 20,
    paddingTop: 60,
  },
  searchInput: {
    height: 50,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    color: T.text,
    backgroundColor: T.surface,
    marginBottom: 14,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  modalRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  modalRowMeta: {
    marginTop: 3,
    fontSize: 12,
    color: T.textMuted,
  },
  qtyInput: {
    width: 84,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    fontSize: 15,
    fontWeight: '700',
    color: T.text,
    textAlign: 'center',
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
  noticeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  noticeWarningText: {
    flex: 1,
    fontSize: 13,
    color: T.warning,
  },
  noticeAction: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(217,119,6,0.14)',
  },
  noticeActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: T.warning,
  },
})
