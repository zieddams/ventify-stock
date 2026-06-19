import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import PageHeader from '../../components/PageHeader'
import { useAuth } from '../../contexts/AuthContext'
import StatusChip from '../../components/StatusChip'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCurrency, formatNumber, toNumber } from '../../utils/format'

function parseArray(data) {
  return Array.isArray(data) ? data : data?.data ?? []
}

function sortByName(items) {
  return [...items].sort((left, right) => String(left.name || left.label || '').localeCompare(String(right.name || right.label || '')))
}

function lineTotal(line) {
  return toNumber(line.qty) * toNumber(line.price)
}

function sanitizeNumber(value) {
  return value.replace(/[^0-9.]/g, '')
}

export default function InvoiceCreateScreen({ navigation, route }) {
  const { initialCustomer = null } = route?.params ?? {}
  const { canManageAllCustomers } = useAuth()
  const {
    session,
    captureCurrentLocation,
    syncInteraction,
  } = useTracking()
  const initialCustomerAppliedRef = useRef(false)
  const hasGlobalCustomerAccess = canManageAllCustomers()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [camionStock, setCamionStock] = useState({})
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [lines, setLines] = useState([])
  const [notes, setNotes] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false)
  const [productPickerVisible, setProductPickerVisible] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [lineEditorVisible, setLineEditorVisible] = useState(false)
  const [pendingProduct, setPendingProduct] = useState(null)
  const [pendingIndex, setPendingIndex] = useState(null)
  const [qtyInput, setQtyInput] = useState('1')
  const [priceInput, setPriceInput] = useState('')
  const [createCustomerVisible, setCreateCustomerVisible] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [newCustomerAddress, setNewCustomerAddress] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [customersResponse, productsResponse, paymentMethodsResponse, camionResponse] = await Promise.all([
        api.get('/customers'),
        api.get('/products'),
        api.get('/config/payment_method'),
        api.get('/camion'),
      ])

      const customerItems = sortByName(parseArray(customersResponse.data))
      const productItems = sortByName(parseArray(productsResponse.data))
      const paymentItems = parseArray(paymentMethodsResponse.data)

      setCustomers(customerItems)
      setProducts(productItems)
      setPaymentMethods(paymentItems.length > 0 ? paymentItems : [{
        value: 'cash',
        display_label: 'Espèces',
      }])
      setPaymentMethod(paymentItems.find((item) => item.is_default)?.value || paymentItems[0]?.value || 'cash')
      setCamionStock(camionResponse.data?.by_product_id ?? {})
    } catch (error) {
      Alert.alert('Chargement impossible', error.response?.data?.message || 'Les données mobiles ne sont pas accessibles.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (initialCustomerAppliedRef.current || !initialCustomer) {
      return
    }

    const matched = customers.find((item) => String(item.id) === String(initialCustomer.id))
    if (matched) {
      setSelectedCustomer(matched)
      initialCustomerAppliedRef.current = true
      return
    }

    if (!loading) {
      setSelectedCustomer(initialCustomer)
      initialCustomerAppliedRef.current = true
    }
  }, [customers, initialCustomer, loading])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((item) => (
      item.name?.toLowerCase().includes(q)
      || item.phone?.toLowerCase().includes(q)
      || item.address?.toLowerCase().includes(q)
      || item.owner?.name?.toLowerCase().includes(q)
    ))
  }, [customerQuery, customers])

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter((item) => (
      item.name?.toLowerCase().includes(q)
      || item.reference?.toLowerCase().includes(q)
    ))
  }, [productQuery, products])

  const subtotal = useMemo(() => lines.reduce((sum, item) => sum + lineTotal(item), 0), [lines])
  const paidValue = toNumber(paidAmount)

  const hasStockMap = Object.keys(camionStock).length > 0

  const openProductEditor = (product, index = null) => {
    setPendingProduct(product)
    setPendingIndex(index)
    const line = index !== null ? lines[index] : null

    setQtyInput(line ? String(line.qty) : '1')
    setPriceInput(line ? String(line.price) : String(toNumber(product.sale_price ?? product.depot_price ?? product.price)))
    setLineEditorVisible(true)
  }

  const saveLine = () => {
    const qty = toNumber(qtyInput)
    const price = toNumber(priceInput)

    if (!pendingProduct || qty <= 0 || price < 0) {
      Alert.alert('Ligne invalide', 'Vérifiez la quantité et le prix.')
      return
    }

    const availableQty = toNumber(camionStock[pendingProduct.id])
    if (hasStockMap && qty > availableQty) {
      Alert.alert(
        'Stock insuffisant',
        `${pendingProduct.name}: ${formatNumber(availableQty)} disponible(s) sur le camion.`,
      )
      return
    }

    const nextLine = {
      product_id: pendingProduct.id,
      product_name: pendingProduct.name,
      reference: pendingProduct.reference || null,
      unit: pendingProduct.unit || null,
      qty,
      price,
      buy_price: toNumber(pendingProduct.buy_price),
    }

    setLines((prev) => {
      if (pendingIndex !== null) {
        return prev.map((item, index) => (index === pendingIndex ? nextLine : item))
      }

      return [...prev, nextLine]
    })

    setLineEditorVisible(false)
    setPendingProduct(null)
    setPendingIndex(null)
  }

  const createCustomer = async () => {
    if (!newCustomerName.trim()) {
      Alert.alert('Client requis', 'Le nom du client est obligatoire.')
      return
    }

    try {
      const response = await api.post('/customers', {
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        address: newCustomerAddress.trim() || null,
      })

      const created = response.data
      const nextCustomers = sortByName([...customers, created])

      setCustomers(nextCustomers)
      setSelectedCustomer(created)
      await syncInteraction('customer-create', { includeLocation: false, refreshSession: false })
      setCreateCustomerVisible(false)
      setCustomerPickerVisible(false)
      setNewCustomerName('')
      setNewCustomerPhone('')
      setNewCustomerAddress('')
    } catch (error) {
      Alert.alert('Création impossible', error.response?.data?.message || 'Veuillez réessayer.')
    }
  }

  const saveInvoice = async () => {
    if (!selectedCustomer?.name) {
      Alert.alert('Client requis', 'Sélectionnez ou créez un client avant de continuer.')
      return
    }

    if (lines.length === 0) {
      Alert.alert('Facture vide', 'Ajoutez au moins une ligne produit.')
      return
    }

    if (hasStockMap) {
      const blocked = lines.find((item) => toNumber(item.qty) > toNumber(camionStock[item.product_id]))
      if (blocked) {
        Alert.alert(
          'Stock insuffisant',
          `${blocked.product_name}: ${formatNumber(camionStock[blocked.product_id])} disponible(s).`,
        )
        return
      }
    }

    setSaving(true)
    try {
      const currentLocation = await captureCurrentLocation('invoice')
      const coords = currentLocation?.coords

      const response = await api.post('/invoices', {
        customer_id: selectedCustomer.id || null,
        customer_name: selectedCustomer.name,
        customer_address: selectedCustomer.address || null,
        customer_phone: selectedCustomer.phone || null,
        customer_tax_id: selectedCustomer.tax_id || null,
        notes: notes.trim() || null,
        tax_rate: 0,
        paid_amount: paidValue,
        payment_method: paymentMethod || 'cash',
        route_session_id: session?.status === 'open' ? session.id : null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        lines: lines.map((item, index) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          reference: item.reference,
          unit: item.unit,
          qty: item.qty,
          price: item.price,
          sort_order: index,
          buy_price: item.buy_price,
        })),
      })

      await syncInteraction('invoice-created', { includeLocation: false, refreshSession: true })
      navigation.replace('InvoiceDetail', {
        id: response.data.id,
        initialInvoice: response.data,
      })
    } catch (error) {
      Alert.alert('Enregistrement impossible', error.response?.data?.message || 'Veuillez réessayer.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={T.primary} size="large" />
      </View>
    )
  }

  return (
    <>
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content}>
          <PageHeader
            title="Nouvelle facture"
            subtitle={session?.status === 'open'
              ? (hasGlobalCustomerAccess ? 'Session mobile active et base clients globale' : 'Session mobile active')
              : 'Session non ouverte - facture quand même possible'}
          />

          <View style={[s.sectionCard, cardShadow]}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Client</Text>
              <TouchableOpacity onPress={() => setCustomerPickerVisible(true)}>
                <Text style={s.linkText}>{selectedCustomer ? 'Changer' : 'Choisir'}</Text>
              </TouchableOpacity>
            </View>

            {!selectedCustomer ? (
              <TouchableOpacity style={s.selector} onPress={() => setCustomerPickerVisible(true)}>
                <MaterialCommunityIcons name="account-search-outline" size={20} color={T.primary} />
                <Text style={s.selectorText}>Sélectionner un client</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.customerCard}>
                <Text style={s.customerName}>{selectedCustomer.name}</Text>
                <Text style={s.customerMeta}>{selectedCustomer.phone || 'Sans numéro'}</Text>
                <Text style={s.customerMeta}>{selectedCustomer.address || 'Adresse non renseignée'}</Text>
                {selectedCustomer.owner?.name && (
                  <Text style={s.customerMeta}>Affecté: {selectedCustomer.owner.name}</Text>
                )}
              </View>
            )}
          </View>

          <View style={[s.sectionCard, cardShadow]}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Produits</Text>
              <TouchableOpacity style={s.smallButton} onPress={() => setProductPickerVisible(true)}>
                <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                <Text style={s.smallButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>

            {lines.length === 0 ? (
              <TouchableOpacity style={s.emptyLines} onPress={() => setProductPickerVisible(true)}>
                <MaterialCommunityIcons name="package-variant-closed-plus" size={30} color={T.textMuted} />
                <Text style={s.emptyLinesText}>Ajouter votre première ligne produit</Text>
              </TouchableOpacity>
            ) : (
              lines.map((line, index) => {
                const available = toNumber(camionStock[line.product_id])
                const blocked = hasStockMap && toNumber(line.qty) > available
                return (
                  <View key={`${line.product_id}-${index}`} style={[s.lineCard, blocked && s.lineCardAlert]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lineName}>{line.product_name}</Text>
                      <Text style={s.lineMeta}>
                        {formatNumber(line.qty)} {line.unit || 'u'} x {formatCurrency(line.price)}
                      </Text>
                      {hasStockMap && (
                        <Text style={[s.lineMeta, blocked && { color: T.warning }]}>
                          Stock camion: {formatNumber(available)}
                        </Text>
                      )}
                    </View>
                    <View style={s.lineActions}>
                      <Text style={s.lineAmount}>{formatCurrency(lineTotal(line))}</Text>
                      <View style={s.iconActions}>
                        <TouchableOpacity style={s.iconButton} onPress={() => {
                          const product = products.find((item) => item.id === line.product_id)
                          if (product) openProductEditor(product, index)
                        }}>
                          <MaterialCommunityIcons name="pencil-outline" size={16} color={T.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.iconButton}
                          onPress={() => setLines((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color={T.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )
              })
            )}
          </View>

          <View style={[s.sectionCard, cardShadow]}>
            <Text style={s.sectionTitle}>Paiement & notes</Text>

            <Text style={s.fieldLabel}>Mode de paiement</Text>
            <View style={s.wrapRow}>
              {paymentMethods.map((item) => {
                const active = paymentMethod === item.value
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[s.methodChip, active && s.methodChipActive]}
                    onPress={() => setPaymentMethod(item.value)}>
                    <Text style={[s.methodChipText, active && s.methodChipTextActive]}>
                      {item.display_label || item.label || item.value}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={s.fieldLabel}>Montant payé</Text>
            <TextInput
              style={s.input}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={T.textMuted}
              value={paidAmount}
              onChangeText={(value) => setPaidAmount(sanitizeNumber(value))}
            />

            <Text style={s.fieldLabel}>Notes</Text>
            <TextInput
              style={[s.input, s.notesInput]}
              placeholder="Informations de livraison, retour client, etc."
              placeholderTextColor={T.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          <View style={[s.totalCard, cardShadow]}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Sous-total</Text>
              <Text style={s.totalValue}>{formatCurrency(subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Payé maintenant</Text>
              <Text style={s.totalValue}>{formatCurrency(paidValue)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabelStrong}>Reste à régler</Text>
              <Text style={s.totalValueStrong}>{formatCurrency(Math.max(subtotal - paidValue, 0))}</Text>
            </View>
          </View>

          {!session || session.status !== 'open' ? (
            <View style={s.noticeWarning}>
              <MaterialCommunityIcons name="information-outline" size={18} color={T.warning} />
              <Text style={s.noticeWarningText}>
                La facture sera envoyée sans session terrain ouverte. Ouvrez la session si vous voulez suivre la tournée et les chargements.
              </Text>
            </View>
          ) : (
            <View style={s.noticeInfo}>
              <MaterialCommunityIcons name="crosshairs-gps" size={18} color={T.info} />
              <Text style={s.noticeInfoText}>
                La facture utilisera la session #{session.id} et tentera de capturer la position GPS actuelle.
              </Text>
            </View>
          )}

          <TouchableOpacity style={[s.primaryButton, saving && s.buttonDisabled]} onPress={saveInvoice} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Enregistrer la facture</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={customerPickerVisible} animationType="slide" onRequestClose={() => setCustomerPickerVisible(false)}>
        <View style={s.modalRoot}>
          <PageHeader
            title="Choisir un client"
            subtitle="Recherche mobile"
            actionIcon="close"
            onActionPress={() => setCustomerPickerVisible(false)}
          />

            <TextInput
              style={s.searchInput}
              placeholder="Nom, téléphone, adresse, propriétaire"
              placeholderTextColor={T.textMuted}
              value={customerQuery}
              onChangeText={setCustomerQuery}
          />

          <TouchableOpacity style={s.secondaryButton} onPress={() => setCreateCustomerVisible(true)}>
            <Text style={s.secondaryButtonText}>Créer un nouveau client</Text>
          </TouchableOpacity>

          <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
            {filteredCustomers.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={s.modalCard}
                onPress={() => {
                  setSelectedCustomer(item)
                  setCustomerPickerVisible(false)
                }}>
                <Text style={s.modalTitle}>{item.name}</Text>
                <Text style={s.modalMeta}>{item.phone || 'Sans numéro'}</Text>
                <Text style={s.modalMeta}>{item.address || 'Adresse non renseignée'}</Text>
                {item.owner?.name && <Text style={s.modalMeta}>Affecté: {item.owner.name}</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={productPickerVisible} animationType="slide" onRequestClose={() => setProductPickerVisible(false)}>
        <View style={s.modalRoot}>
          <PageHeader
            title="Ajouter un produit"
            subtitle="Tarif mobile et stock camion"
            actionIcon="close"
            onActionPress={() => setProductPickerVisible(false)}
          />

          <TextInput
            style={s.searchInput}
            placeholder="Nom ou référence"
            placeholderTextColor={T.textMuted}
            value={productQuery}
            onChangeText={setProductQuery}
          />

          <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
            {filteredProducts.map((item) => {
              const available = toNumber(camionStock[item.id])
              const isOut = hasStockMap && available <= 0
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.modalCard, isOut && { opacity: 0.7 }]}
                  onPress={() => {
                    setProductPickerVisible(false)
                    openProductEditor(item)
                  }}>
                  <View style={s.modalCardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalTitle}>{item.name}</Text>
                      <Text style={s.modalMeta}>{item.reference || item.unit || 'Produit'}</Text>
                    </View>
                    <Text style={s.modalPrice}>{formatCurrency(item.sale_price ?? item.depot_price ?? item.price)}</Text>
                  </View>
                  <View style={s.wrapRow}>
                    {hasStockMap && (
                      <StatusChip
                        label={isOut ? 'Stock camion vide' : `Camion ${formatNumber(available)}`}
                        tone={isOut ? 'danger' : 'success'}
                      />
                    )}
                    <StatusChip label={`Min ${formatNumber(Math.max(toNumber(item.min_stock, 1), 1))}`} tone="neutral" />
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={lineEditorVisible} transparent animationType="fade" onRequestClose={() => setLineEditorVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{pendingProduct?.name || 'Produit'}</Text>
            <Text style={s.dialogText}>{pendingProduct?.reference || pendingProduct?.unit || 'Édition de ligne'}</Text>

            <Text style={s.fieldLabel}>Quantité</Text>
            <TextInput
              style={s.input}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={T.textMuted}
              value={qtyInput}
              onChangeText={(value) => setQtyInput(sanitizeNumber(value))}
            />

            <Text style={s.fieldLabel}>Prix unitaire</Text>
            <TextInput
              style={s.input}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={T.textMuted}
              value={priceInput}
              onChangeText={(value) => setPriceInput(sanitizeNumber(value))}
            />

            <View style={s.totalPreview}>
              <Text style={s.totalLabel}>Total ligne</Text>
              <Text style={s.totalValueStrong}>{formatCurrency(toNumber(qtyInput) * toNumber(priceInput))}</Text>
            </View>

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={() => setLineEditorVisible(false)}>
                <Text style={s.dialogSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogPrimary} onPress={saveLine}>
                <Text style={s.dialogPrimaryText}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={createCustomerVisible} transparent animationType="fade" onRequestClose={() => setCreateCustomerVisible(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Nouveau client</Text>
            <Text style={s.dialogText}>
              Création rapide depuis le mobile. Le client sera affecté à votre compte et visible pour les rôles globaux.
            </Text>

            <Text style={s.fieldLabel}>Nom</Text>
            <TextInput
              style={s.input}
              placeholder="Nom du client"
              placeholderTextColor={T.textMuted}
              value={newCustomerName}
              onChangeText={setNewCustomerName}
            />

            <Text style={s.fieldLabel}>Téléphone</Text>
            <TextInput
              style={s.input}
              placeholder="+216 ..."
              placeholderTextColor={T.textMuted}
              value={newCustomerPhone}
              onChangeText={setNewCustomerPhone}
            />

            <Text style={s.fieldLabel}>Adresse</Text>
            <TextInput
              style={s.input}
              placeholder="Adresse de livraison"
              placeholderTextColor={T.textMuted}
              value={newCustomerAddress}
              onChangeText={setNewCustomerAddress}
            />

            <View style={s.dialogActions}>
              <TouchableOpacity style={s.dialogSecondary} onPress={() => setCreateCustomerVisible(false)}>
                <Text style={s.dialogSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.dialogPrimary} onPress={createCustomer}>
                <Text style={s.dialogPrimaryText}>Créer</Text>
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.background,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
    marginBottom: 14,
  },
  totalCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.primary,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
  },
  selectorText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  customerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    padding: 14,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  customerMeta: {
    marginTop: 4,
    fontSize: 13,
    color: T.textSecondary,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: T.primary,
  },
  smallButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  emptyLines: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 28,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: T.border,
    borderStyle: 'dashed',
    backgroundColor: T.surfaceAlt,
  },
  emptyLinesText: {
    fontSize: 14,
    color: T.textMuted,
  },
  lineCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    marginBottom: 10,
  },
  lineCardAlert: {
    borderColor: '#fdba74',
    backgroundColor: '#fff7ed',
  },
  lineName: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  lineMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  lineActions: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  lineAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: T.primaryDark,
  },
  iconActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: T.surface,
  },
  fieldLabel: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: T.textMuted,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.text,
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  methodChipActive: {
    borderColor: T.primary,
    backgroundColor: '#ccfbf1',
  },
  methodChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
  },
  methodChipTextActive: {
    color: T.primaryDark,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  totalLabel: {
    fontSize: 13,
    color: T.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  totalLabelStrong: {
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  totalValueStrong: {
    fontSize: 16,
    fontWeight: '800',
    color: T.primaryDark,
  },
  noticeWarning: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 14,
  },
  noticeWarningText: {
    flex: 1,
    fontSize: 13,
    color: T.warning,
  },
  noticeInfo: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    marginBottom: 14,
  },
  noticeInfoText: {
    flex: 1,
    fontSize: 13,
    color: T.info,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 16,
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
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    marginBottom: 14,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: T.background,
    padding: 20,
    paddingTop: 60,
  },
  searchInput: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    paddingHorizontal: 14,
    fontSize: 14,
    color: T.text,
    marginBottom: 14,
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 14,
    marginBottom: 10,
  },
  modalCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  modalMeta: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  modalPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: T.primaryDark,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    borderRadius: 22,
    backgroundColor: T.surface,
    padding: 20,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: T.text,
  },
  dialogText: {
    marginTop: 6,
    fontSize: 14,
    color: T.textSecondary,
  },
  totalPreview: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
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
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: T.surfaceAlt,
    borderWidth: 1,
    borderColor: T.border,
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
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: T.primary,
  },
  dialogPrimaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
})
