import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { InvoiceReceiptPrintable } from '../../components/print/ReceiptPrintable'
import ThermalPrintProgressModal from '../../components/print/ThermalPrintProgressModal'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { useTracking } from '../../contexts/TrackingContext'
import { useThermalPrint } from '../../hooks/useThermalPrint'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { resolveBrandName } from '../../utils/branding'
import { shareInvoiceDocument } from '../../utils/invoicePrint'
import { captureReceiptImage } from '../../utils/thermalReceiptImage'
import { fetchDocumentCompanyProfile, mergeCompanyInfo } from '../../utils/documentCompanyProfile'
import {
  formatCurrency,
  formatDateTime,
  invoiceStatusLabel,
  paymentStatusLabel,
  unwrapStatus,
} from '../../utils/format'

export default function InvoiceDetailScreen({ route }) {
  const { id, initialInvoice } = route.params ?? {}
  const { t } = useI18n()
  const { user } = useAuth()
  const { syncInteraction } = useTracking()
  const thermal = useThermalPrint((key) => t(`invoiceDetail.${key}`))
  const printableRef = useRef(null)
  const [invoice, setInvoice] = useState(initialInvoice ?? null)
  const [loading, setLoading] = useState(!initialInvoice)
  const [refreshing, setRefreshing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [customerDetail, setCustomerDetail] = useState(null)
  const [companyProfile, setCompanyProfile] = useState(null)

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

  // The invoice only snapshots customer_name/phone/address/tax_id at
  // creation time - it does not carry the customer's CIN (national ID),
  // which was added to the Customer model separately. Rather than change
  // the API/invoice schema, fetch the full customer record directly (the
  // route already exists and is authorized for a rep's own customers) so
  // the printed receipt can show it alongside the other customer fields.
  useEffect(() => {
    let cancelled = false

    if (!invoice?.customer_id) {
      setCustomerDetail(null)
      return undefined
    }

    api.get(`/customers/${invoice.customer_id}`)
      .then((response) => {
        if (!cancelled) setCustomerDetail(response.data)
      })
      .catch(() => {
        if (!cancelled) setCustomerDetail(null)
      })

    return () => {
      cancelled = true
    }
  }, [invoice?.customer_id])

  // Extra company identity data (siret, business-activity header note) that
  // already exists via the web "Documents" settings page but isn't part of
  // the Company model's own columns - see documentCompanyProfile.js for why
  // this reuses that existing, already-deployed settings form instead of a
  // new backend field.
  useEffect(() => {
    let cancelled = false

    fetchDocumentCompanyProfile().then((profile) => {
      if (!cancelled) setCompanyProfile(profile)
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading && !invoice) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={T.primary} size="large" />
      </View>
    )
  }

  const invoiceStatus = unwrapStatus(invoice?.status)
  const paymentStatus = unwrapStatus(invoice?.payment_status)

  const companyInfo = mergeCompanyInfo({
    companyName: resolveBrandName(user),
    companyAddress: user?.company?.address,
    companyPhone: user?.company?.phone,
    companyEmail: user?.company?.email,
    companyTaxId: user?.company?.tax_id,
  }, companyProfile ?? {})

  const handlePrint = async () => {
    if (!invoice) return

    const ok = await thermal.run(() => captureReceiptImage(printableRef.current))
    if (ok) {
      await syncInteraction('invoice-thermal', { includeLocation: false, refreshSession: false })
    }
  }

  const handleShare = async () => {
    if (!invoice) return

    setSharing(true)
    try {
      await shareInvoiceDocument(invoice)
      await syncInteraction('invoice-pdf', { includeLocation: false, refreshSession: false })
    } catch (error) {
      Alert.alert(t('invoiceDetail.shareErrorTitle'), error.message || t('invoiceDetail.retry'))
    } finally {
      setSharing(false)
    }
  }

  return (
    <>
    {/* Off-screen receipt layout captured as an image at print time (see
        src/utils/thermalReceiptImage.js) - never visible to the user. */}
    <View style={s.offscreenPrintable} pointerEvents="none">
      <InvoiceReceiptPrintable
        ref={printableRef}
        invoice={invoice}
        companyInfo={companyInfo}
        customerCin={customerDetail?.cin}
        user={user}
      />
    </View>
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
    >
      <View style={[s.hero, cardShadow]}>
        <Text style={s.heroNumber}>{invoice?.number || t('invoiceDetail.fallbackNumber')}</Text>
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
          <TouchableOpacity style={s.heroActionButton} onPress={handlePrint} disabled={thermal.printing}>
            {thermal.printing ? (
              <View style={s.heroActionLoading}>
                <ActivityIndicator size="small" color={T.primary} />
                {!!thermal.stageLabel && <Text style={s.heroActionStage}>{thermal.stageLabel}</Text>}
              </View>
            ) : (
              <>
                <MaterialCommunityIcons name="printer-outline" size={16} color={T.primary} />
                <Text style={s.heroActionLabel}>{t('invoiceDetail.thermalAction')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.heroActionButton} onPress={handleShare} disabled={sharing}>
            {sharing ? (
              <ActivityIndicator size="small" color={T.primary} />
            ) : (
              <>
                <MaterialCommunityIcons name="share-variant-outline" size={16} color={T.primary} />
                <Text style={s.heroActionLabel}>{t('invoiceDetail.pdfAction')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <Text style={s.heroHint}>{t('invoiceDetail.heroHint')}</Text>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>{t('invoiceDetail.amountsTitle')}</Text>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>{t('invoiceDetail.amounts.subtotal')}</Text>
          <Text style={s.amountValue}>{formatCurrency(invoice?.subtotal)}</Text>
        </View>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>{t('invoiceDetail.amounts.tax')}</Text>
          <Text style={s.amountValue}>{formatCurrency(invoice?.tax_amount)}</Text>
        </View>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>{t('invoiceDetail.amounts.total')}</Text>
          <Text style={s.amountTotal}>{formatCurrency(invoice?.total)}</Text>
        </View>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>{t('invoiceDetail.amounts.paid')}</Text>
          <Text style={s.amountValue}>{formatCurrency(invoice?.paid_amount)}</Text>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>{t('invoiceDetail.customerTitle')}</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="account-outline" size={18} color={T.primary} />
          <Text style={s.infoText}>{invoice?.customer_name || '--'}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="phone-outline" size={18} color={T.primary} />
          <Text style={s.infoText}>{invoice?.customer_phone || t('invoiceDetail.noPhone')}</Text>
        </View>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={T.primary} />
          <Text style={s.infoText}>{invoice?.customer_address || t('invoiceDetail.noAddress')}</Text>
        </View>
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>{t('invoiceDetail.linesTitle')}</Text>
        {(invoice?.lines ?? []).length === 0 ? (
          <Text style={s.emptyText}>{t('invoiceDetail.noLines')}</Text>
        ) : (
          invoice.lines.map((line) => (
            <View key={line.id || `${line.product_id}-${line.product_name}`} style={s.lineRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.lineName}>{line.product_name}</Text>
                <Text style={s.lineMeta}>
                  {line.qty} {line.unit || t('invoiceDetail.unitFallback')} x {formatCurrency(line.price)}
                </Text>
              </View>
              <Text style={s.lineTotal}>{formatCurrency(line.total)}</Text>
            </View>
          ))
        )}
      </View>

      <View style={[s.sectionCard, cardShadow]}>
        <Text style={s.sectionTitle}>{t('invoiceDetail.contextTitle')}</Text>
        <View style={s.infoRow}>
          <MaterialCommunityIcons name="truck-outline" size={18} color={T.info} />
          <Text style={s.infoText}>
            {invoice?.route_session_id ? t('invoiceDetail.sessionLabel', { id: invoice.route_session_id }) : t('invoiceDetail.noSession')}
          </Text>
        </View>
      </View>
    </ScrollView>

      <ThermalPrintProgressModal
        visible={thermal.printing}
        title={t('invoiceDetail.thermalProgressTitle')}
        stage={thermal.stage}
        stageLabel={thermal.stageLabel}
        progressPercent={thermal.progressPercent}
      />

      <Modal visible={!!thermal.chooserDevices?.length} transparent animationType="fade" onRequestClose={thermal.dismissChooser}>
        <View style={s.chooserBackdrop}>
          <View style={[s.chooserCard, cardShadow]}>
            <Text style={s.chooserTitle}>{t('invoiceDetail.thermalChooseTitle')}</Text>
            <Text style={s.chooserText}>{t('invoiceDetail.thermalChooseText')}</Text>
            {(thermal.chooserDevices ?? []).map((device) => (
              <TouchableOpacity
                key={device.address}
                style={s.chooserRow}
                onPress={() => thermal.chooseDevice(device.address)}
              >
                <Text style={s.chooserDeviceName}>{device.name || device.address}</Text>
                <Text style={s.chooserDeviceAddress}>{device.address}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.chooserCancel} onPress={thermal.dismissChooser}>
              <Text style={s.chooserCancelText}>{t('invoiceDetail.thermalCancelAction')}</Text>
            </TouchableOpacity>
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
  heroActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingVertical: 14,
  },
  heroActionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: T.primary,
  },
  heroHint: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: T.textMuted,
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
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
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
    fontSize: 15,
    fontWeight: '800',
    color: T.primaryDark,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: T.textSecondary,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  lineName: {
    fontSize: 14,
    fontWeight: '800',
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
    color: T.primaryDark,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 13,
    color: T.textMuted,
  },
  heroActionLoading: {
    alignItems: 'center',
    gap: 4,
  },
  heroActionStage: {
    fontSize: 10,
    fontWeight: '700',
    color: T.textMuted,
  },
  chooserBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  chooserCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: T.surface,
    padding: 20,
  },
  chooserTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  chooserText: {
    marginTop: 6,
    fontSize: 12,
    color: T.textMuted,
  },
  chooserRow: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 12,
    padding: 12,
  },
  chooserDeviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  chooserDeviceAddress: {
    marginTop: 2,
    fontSize: 11,
    color: T.textMuted,
  },
  chooserCancel: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 10,
  },
  chooserCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
  },
  offscreenPrintable: {
    position: 'absolute',
    top: 0,
    left: -9999,
    opacity: 0,
  },
})
