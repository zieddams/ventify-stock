import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import StatusChip from '../../components/StatusChip'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { printInvoiceDocument, shareInvoiceDocument } from '../../utils/invoicePrint'
import {
  formatCurrency,
  formatDateTime,
  invoiceStatusLabel,
  paymentStatusLabel,
  unwrapStatus,
} from '../../utils/format'

export default function InvoiceDetailScreen({ route }) {
  const { id, initialInvoice } = route.params ?? {}
  const { syncInteraction } = useTracking()
  const [invoice, setInvoice] = useState(initialInvoice ?? null)
  const [loading, setLoading] = useState(!initialInvoice)
  const [refreshing, setRefreshing] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [sharing, setSharing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (!id) return
    if (isRefresh) setRefreshing(true)

    try {
      const response = await api.get(`/invoices/${id}`)
      setInvoice(response.data)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id])

  useFocusEffect(useCallback(() => {
    if (!initialInvoice || id) {
      load()
    }
  }, [id, initialInvoice, load]))

  if (loading && !invoice) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={T.primary} size="large" />
      </View>
    )
  }

  const invoiceStatus = unwrapStatus(invoice?.status)
  const paymentStatus = unwrapStatus(invoice?.payment_status)

  const handlePrint = async () => {
    if (!invoice) return

    setPrinting(true)
    try {
      await printInvoiceDocument(invoice)
      await syncInteraction('invoice-thermal', { includeLocation: false, refreshSession: false })
    } catch (error) {
      Alert.alert('Transfert thermique impossible', error.message || 'Veuillez réessayer.')
    } finally {
      setPrinting(false)
    }
  }

  const handleShare = async () => {
    if (!invoice) return

    setSharing(true)
    try {
      await shareInvoiceDocument(invoice)
      await syncInteraction('invoice-pdf', { includeLocation: false, refreshSession: false })
    } catch (error) {
      Alert.alert('Partage impossible', error.message || 'Veuillez réessayer.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}>
      <View style={[s.hero, cardShadow]}>
        <Text style={s.heroNumber}>{invoice?.number || 'Facture'}</Text>
        <Text style={s.heroCustomer}>{invoice?.customer_name}</Text>
        <Text style={s.heroMeta}>{formatDateTime(invoice?.created_at)}</Text>
        <View style={s.heroPills}>
          <StatusChip
            label={invoiceStatusLabel(invoiceStatus)}
            tone={invoiceStatus === 'paid' ? 'success' : invoiceStatus === 'cancelled' ? 'danger' : 'info'}
          />
          <StatusChip
            label={paymentStatusLabel(paymentStatus)}
            tone={paymentStatus === 'paid' ? 'success' : paymentStatus === 'partial' ? 'warning' : 'danger'}
          />
        </View>
        <View style={s.heroActions}>
          <TouchableOpacity style={s.heroActionButton} onPress={handlePrint} disabled={printing}>
            {printing ? (
              <ActivityIndicator size="small" color={T.primary} />
            ) : (
              <>
                <MaterialCommunityIcons name="printer-outline" size={16} color={T.primary} />
                <Text style={s.heroActionLabel}>Thermique</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.heroActionButton} onPress={handleShare} disabled={sharing}>
            {sharing ? (
              <ActivityIndicator size="small" color={T.primary} />
            ) : (
              <>
                <MaterialCommunityIcons name="share-variant-outline" size={16} color={T.primary} />
                <Text style={s.heroActionLabel}>PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <Text style={s.heroHint}>Le bouton Thermique envoie la facture vers votre application Bluetooth externe.</Text>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Montants</Text>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>Sous-total</Text>
          <Text style={s.amountValue}>{formatCurrency(invoice?.subtotal)}</Text>
        </View>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>TVA</Text>
          <Text style={s.amountValue}>{formatCurrency(invoice?.tax_amount)}</Text>
        </View>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>Total</Text>
          <Text style={s.amountTotal}>{formatCurrency(invoice?.total)}</Text>
        </View>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>Paye</Text>
          <Text style={s.amountValue}>{formatCurrency(invoice?.paid_amount)}</Text>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Client</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="account-outline" size={18} color={T.primary} />
          <Text style={s.infoText}>{invoice?.customer_name || '--'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="phone-outline" size={18} color={T.primary} />
          <Text style={s.infoText}>{invoice?.customer_phone || 'Aucun numero'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={T.primary} />
          <Text style={s.infoText}>{invoice?.customer_address || 'Adresse non renseignée'}</Text>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Lignes facture</Text>
        {(invoice?.lines ?? []).length === 0 ? (
          <Text style={s.emptyText}>Aucune ligne sur cette facture.</Text>
        ) : (
          invoice.lines.map((line) => (
            <View key={line.id || `${line.product_id}-${line.product_name}`} style={s.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.lineName}>{line.product_name}</Text>
                <Text style={s.lineMeta}>
                  {line.qty} {line.unit || 'u'} x {formatCurrency(line.price)}
                </Text>
              </View>
              <Text style={s.lineTotal}>{formatCurrency(line.total)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>Contexte mobile</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="truck-outline" size={18} color={T.info} />
          <Text style={s.infoText}>
            {invoice?.route_session_id ? `Session #${invoice.route_session_id}` : 'Aucune session associée'}
          </Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color={T.info} />
          <Text style={s.infoText}>
            {Number.isFinite(invoice?.latitude) && Number.isFinite(invoice?.longitude)
              ? `${invoice.latitude.toFixed(5)}, ${invoice.longitude.toFixed(5)}`
              : 'Coordonnées GPS non remontées'}
          </Text>
        </View>
      </View>
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.background,
  },
  hero: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 20,
    marginBottom: 14,
  },
  heroNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: T.primaryDark,
  },
  heroCustomer: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: T.text,
  },
  heroMeta: {
    marginTop: 6,
    fontSize: 13,
    color: T.textMuted,
  },
  heroPills: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  heroHint: {
    marginTop: 10,
    fontSize: 12,
    color: T.textMuted,
  },
  heroActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroActionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.primary,
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
    marginBottom: 10,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  amountLabel: {
    fontSize: 13,
    color: T.textSecondary,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  amountTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: T.primaryDark,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: T.text,
  },
  lineRow: {
    flexDirection: 'row',
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
  lineTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: T.primary,
  },
  emptyText: {
    fontSize: 13,
    color: T.textMuted,
  },
})
