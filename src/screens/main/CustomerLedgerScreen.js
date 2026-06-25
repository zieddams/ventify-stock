import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useMemo, useState } from 'react'
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
import PageHeader from '../../components/PageHeader'
import { useI18n } from '../../contexts/I18nContext'
import { useTracking } from '../../contexts/TrackingContext'
import api from '../../services/api'
import { T, cardShadow } from '../../theme'
import { formatCurrency, formatDateTime, paymentStatusLabel } from '../../utils/format'
import { filterPaymentMethodsByScope } from '../../utils/paymentMethodScopes'

function parseArray(value) {
  return Array.isArray(value) ? value : value?.data ?? []
}

function buildPaymentState(defaultMethod, invoiceId = '') {
  return {
    amount: '',
    method: defaultMethod,
    invoice_id: invoiceId ? String(invoiceId) : '',
    note: '',
  }
}

function SummaryCard({ label, value, hint, tone = T.text, surface = T.surface }) {
  return (
    <View style={[s.summaryCard, cardShadow, { backgroundColor: surface }]}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={[s.summaryValue, { color: tone }]}>{value}</Text>
      {!!hint && <Text style={s.summaryHint}>{hint}</Text>}
    </View>
  )
}

export default function CustomerLedgerScreen({ route }) {
  const customer = route?.params?.customer ?? null
  const { t } = useI18n()
  const { syncInteraction } = useTracking()
  const [ledger, setLedger] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [paymentMethods, setPaymentMethods] = useState([])
  const [pay, setPay] = useState(() => buildPaymentState('cash'))
  const [paying, setPaying] = useState(false)
  const [invoicePickerVisible, setInvoicePickerVisible] = useState(false)

  const availablePaymentMethods = paymentMethods.length > 0
    ? paymentMethods
    : [{ value: 'cash', display_label: t('customers.ledger.cashFallback') }]
  const defaultPaymentMethod = availablePaymentMethods[0]?.value ?? 'cash'

  const load = useCallback(async (isRefresh = false) => {
    if (!customer?.id) {
      setLoading(false)
      return
    }

    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const [ledgerResponse, paymentMethodsResponse] = await Promise.all([
        api.get(`/customers/${customer.id}/ledger`),
        api.get('/config/payment_method'),
      ])

      const nextPaymentMethods = filterPaymentMethodsByScope(parseArray(paymentMethodsResponse.data), 'customer')

      setLedger(ledgerResponse.data)
      setPaymentMethods(nextPaymentMethods)
      setPay((current) => ({
        ...current,
        method: current.method || nextPaymentMethods[0]?.value || 'cash',
      }))
      setError('')
    } catch (requestError) {
      setError(requestError.response?.data?.message || t('customers.ledger.loadFailedText'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [customer?.id, t])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  const openInvoices = ledger?.open_invoices ?? []
  const transactions = ledger?.transactions ?? []
  const selectedInvoice = openInvoices.find((entry) => String(entry.id) === String(pay.invoice_id)) ?? null

  const submitPayment = async () => {
    if (!customer?.id) {
      return
    }

    if (!pay.amount || Number(pay.amount) <= 0) {
      Alert.alert(t('customers.ledger.amountRequiredTitle'), t('customers.ledger.amountRequiredText'))
      return
    }

    setPaying(true)

    try {
      await api.post('/payments', {
        customer_id: customer.id,
        invoice_id: pay.invoice_id || null,
        amount: Number(pay.amount),
        method: pay.method || defaultPaymentMethod,
        note: pay.note || null,
      })

      await load()
      setPay(buildPaymentState(defaultPaymentMethod))
      await syncInteraction('customer-credit-payment', { includeLocation: false, refreshSession: true })
      Alert.alert(t('customers.ledger.paymentSavedTitle'), t('customers.ledger.paymentSavedText'))
    } catch (requestError) {
      Alert.alert(t('customers.ledger.paymentFailedTitle'), requestError.response?.data?.message || t('customers.ledger.retry'))
    } finally {
      setPaying(false)
    }
  }

  const paymentPills = useMemo(
    () => availablePaymentMethods.map((method) => ({
      value: method.value,
      label: method.display_label || method.label || method.value,
    })),
    [availablePaymentMethods],
  )

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={T.primary} />}
      >
        <PageHeader
          title={t('customers.ledgerTitle')}
          subtitle={t('customers.ledger.subtitle', { name: customer?.name || t('customers.ownerUnknown') })}
        />

        {!customer?.id ? (
          <View style={[s.noticeCard, cardShadow]}>
            <Text style={s.noticeText}>{t('customers.ledger.customerMissing')}</Text>
          </View>
        ) : loading && !ledger ? (
          <View style={[s.loadingCard, cardShadow]}>
            <ActivityIndicator color={T.primary} size="large" />
            <Text style={s.loadingText}>{t('customers.ledger.loading')}</Text>
          </View>
        ) : (
          <>
            {!!error && (
              <View style={[s.noticeDanger, cardShadow]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
                <Text style={s.noticeDangerText}>{error}</Text>
              </View>
            )}

            {ledger && (
              <>
                <View style={s.summaryGrid}>
                  <SummaryCard
                    label={t('customers.ledger.customerBalance')}
                    value={formatCurrency(ledger.customer.credit_balance)}
                    hint={t('customers.ledger.openInvoicesCount', { count: ledger.summary?.open_invoice_count ?? 0 })}
                    tone={Number(ledger.customer.credit_balance) > 0 ? T.danger : T.success}
                    surface={Number(ledger.customer.credit_balance) > 0 ? '#fff1f2' : '#ecfdf5'}
                  />
                  <SummaryCard
                    label={t('customers.ledger.openRemaining')}
                    value={formatCurrency(ledger.summary?.open_due_total ?? 0)}
                    hint={ledger.customer.credit_limit
                      ? t('customers.ledger.limitWithValue', { value: formatCurrency(ledger.customer.credit_limit) })
                      : t('customers.ledger.limitUndefined')}
                    tone={T.text}
                  />
                  <SummaryCard
                    label={t('customers.ledger.paymentEvents')}
                    value={String(ledger.summary?.payment_event_count ?? 0)}
                    hint={t('customers.ledger.lastActivity', { value: formatDateTime(ledger.summary?.last_activity_at) })}
                    tone={T.primary}
                  />
                  <SummaryCard
                    label={t('customers.ledger.assignedAccount')}
                    value={ledger.customer.owner?.name || t('customers.ownerUnknown')}
                    hint={ledger.customer.owner?.role || t('customers.ledger.noRole')}
                    tone={T.info}
                  />
                </View>

                <View style={[s.sectionCard, cardShadow]}>
                  <View style={s.sectionHeader}>
                    <View>
                      <Text style={s.sectionTitle}>{t('customers.ledger.newPaymentTitle')}</Text>
                      <Text style={s.sectionSubtitle}>{t('customers.ledger.newPaymentSubtitle')}</Text>
                    </View>
                    <MaterialCommunityIcons name="cash-plus" size={20} color={T.primary} />
                  </View>

                  <Text style={s.fieldLabel}>{t('customers.ledger.amountLabelShort')}</Text>
                  <TextInput
                    style={s.input}
                    keyboardType="decimal-pad"
                    placeholder={t('customers.ledger.amountPlaceholder')}
                    placeholderTextColor={T.textMuted}
                    value={pay.amount}
                    onChangeText={(value) => setPay((current) => ({ ...current, amount: value }))}
                  />

                  <Text style={s.fieldLabel}>{t('customers.ledger.paymentMethodField')}</Text>
                  <View style={s.pillWrap}>
                    {paymentPills.map((method) => {
                      const active = pay.method === method.value

                      return (
                        <TouchableOpacity
                          key={method.value}
                          style={[s.methodPill, active && s.methodPillActive]}
                          onPress={() => setPay((current) => ({ ...current, method: method.value }))}
                        >
                          <Text style={[s.methodPillText, active && s.methodPillTextActive]}>{method.label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  <Text style={s.fieldLabel}>{t('customers.ledger.invoiceTargetLabel')}</Text>
                  <TouchableOpacity style={s.selector} onPress={() => setInvoicePickerVisible(true)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.selectorTitle}>
                        {selectedInvoice ? selectedInvoice.number : t('customers.ledger.autoAllocate')}
                      </Text>
                      <Text style={s.selectorSubtitle}>
                        {selectedInvoice
                          ? t('customers.ledger.remainingLabel', { value: formatCurrency(selectedInvoice.due_amount) })
                          : t('customers.ledger.autoAllocateHint')}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={T.textMuted} />
                  </TouchableOpacity>

                  <Text style={s.fieldLabel}>{t('customers.ledger.noteField')}</Text>
                  <TextInput
                    style={[s.input, s.textarea]}
                    multiline
                    placeholder={t('customers.ledger.notePlaceholder')}
                    placeholderTextColor={T.textMuted}
                    value={pay.note}
                    onChangeText={(value) => setPay((current) => ({ ...current, note: value }))}
                  />

                  <Text style={s.helperText}>{t('customers.ledger.surplusHint')}</Text>

                  <TouchableOpacity style={s.primaryButton} onPress={submitPayment} disabled={paying}>
                    {paying ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="check-circle-outline" size={18} color="#fff" />
                        <Text style={s.primaryButtonText}>{t('customers.ledger.collectNow')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={[s.sectionCard, cardShadow]}>
                  <View style={s.sectionHeader}>
                    <View>
                      <Text style={s.sectionTitle}>{t('customers.ledger.openInvoicesTitle')}</Text>
                      <Text style={s.sectionSubtitle}>{t('customers.ledger.openInvoicesHint')}</Text>
                    </View>
                    <MaterialCommunityIcons name="file-document-outline" size={20} color={T.warning} />
                  </View>

                  {openInvoices.length === 0 ? (
                    <Text style={s.emptyText}>{t('customers.ledger.noOpenInvoices')}</Text>
                  ) : (
                    openInvoices.map((invoice) => (
                      <View key={invoice.id} style={s.recordCard}>
                        <View style={s.recordTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.recordTitle}>{invoice.number}</Text>
                            <Text style={s.recordMeta}>
                              {invoice.rep_name || t('customers.ledger.repUnknown')} · {formatDateTime(invoice.created_at)}
                            </Text>
                            <Text style={s.recordMeta}>
                              {invoice.route_session_id
                                ? t('customers.ledger.sessionWithCamion', {
                                    id: invoice.route_session_id,
                                    camion: invoice.camion_name || t('customers.ledger.camionUnknown'),
                                  })
                                : t('customers.ledger.noSessionAttached')}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            <Text style={s.recordAmount}>{formatCurrency(invoice.due_amount)}</Text>
                            <View style={s.statusChip}>
                              <Text style={s.statusChipText}>{paymentStatusLabel(invoice.payment_status)}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                <View style={[s.sectionCard, cardShadow]}>
                  <View style={s.sectionHeader}>
                    <View>
                      <Text style={s.sectionTitle}>{t('customers.ledger.historyTitle')}</Text>
                      <Text style={s.sectionSubtitle}>{t('customers.ledger.historyHint')}</Text>
                    </View>
                    <MaterialCommunityIcons name="history" size={20} color={T.info} />
                  </View>

                  {transactions.length === 0 ? (
                    <Text style={s.emptyText}>{t('customers.ledger.noTransactions')}</Text>
                  ) : (
                    transactions.map((transaction) => (
                      <View key={transaction.id} style={s.recordCard}>
                        <View style={s.recordTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.recordTitle}>
                              {transaction.type === 'charge'
                                ? t('customers.ledger.chargeLabel')
                                : transaction.type === 'payment'
                                  ? t('customers.ledger.paymentLabel')
                                  : t('customers.ledger.adjustmentLabel')}
                            </Text>
                            <Text style={s.recordMeta}>{formatDateTime(transaction.created_at)}</Text>
                            <Text style={s.recordMeta}>
                              {transaction.invoice_number || t('customers.ledger.withoutInvoice')}
                              {transaction.rep_name ? ` · ${transaction.rep_name}` : ''}
                            </Text>
                            <Text style={s.recordMeta}>
                              {transaction.payment_method
                                ? t('customers.ledger.paymentMethodValue', { value: transaction.payment_method })
                                : t('customers.ledger.paymentMethodUnknown')}
                              {transaction.payment_note ? ` · ${transaction.payment_note}` : ''}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            <Text style={[s.recordAmount, { color: Number(transaction.amount) < 0 ? T.success : T.danger }]}>
                              {Number(transaction.amount) > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
                            </Text>
                            <Text style={s.balanceText}>{t('customers.ledger.balanceLabel', { value: formatCurrency(transaction.balance_after) })}</Text>
                          </View>
                        </View>

                        {(transaction.allocations ?? []).length > 0 && (
                          <View style={s.allocationWrap}>
                            {transaction.allocations.map((allocation, index) => (
                              <View key={`${transaction.id}-${allocation.invoice_id || index}`} style={s.allocationCard}>
                                <Text style={s.allocationTitle}>{allocation.invoice_number || t('customers.ledger.invoiceUnknown')}</Text>
                                <Text style={s.allocationText}>{t('customers.ledger.amountAllocation', { value: formatCurrency(allocation.amount) })}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={invoicePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInvoicePickerVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('customers.ledger.invoicePickerTitle')}</Text>
            <Text style={s.modalText}>{t('customers.ledger.invoicePickerSubtitle')}</Text>

            <TouchableOpacity
              style={s.invoiceOption}
              onPress={() => {
                setPay((current) => ({ ...current, invoice_id: '' }))
                setInvoicePickerVisible(false)
              }}
            >
              <Text style={s.invoiceOptionTitle}>{t('customers.ledger.autoAllocate')}</Text>
              <Text style={s.invoiceOptionText}>{t('customers.ledger.autoAllocateHint')}</Text>
            </TouchableOpacity>

            {openInvoices.map((invoice) => (
              <TouchableOpacity
                key={invoice.id}
                style={s.invoiceOption}
                onPress={() => {
                  setPay((current) => ({ ...current, invoice_id: String(invoice.id) }))
                  setInvoicePickerVisible(false)
                }}
              >
                <Text style={s.invoiceOptionTitle}>{invoice.number}</Text>
                <Text style={s.invoiceOptionText}>{t('customers.ledger.remainingLabel', { value: formatCurrency(invoice.due_amount) })}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={s.modalCloseButton} onPress={() => setInvoicePickerVisible(false)}>
              <Text style={s.modalCloseButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.background,
  },
  content: {
    padding: 20,
    paddingBottom: 44,
    gap: 14,
  },
  loadingCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: T.textMuted,
  },
  noticeCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
  },
  noticeText: {
    fontSize: 13,
    color: T.textSecondary,
  },
  noticeDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeDangerText: {
    flex: 1,
    fontSize: 13,
    color: T.danger,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    padding: 14,
  },
  summaryLabel: {
    fontSize: 11,
    color: T.textMuted,
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryHint: {
    marginTop: 4,
    fontSize: 12,
    color: T.textSecondary,
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    padding: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: T.text,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  input: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.text,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  methodPillActive: {
    backgroundColor: T.primary,
    borderColor: T.primary,
  },
  methodPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textSecondary,
  },
  methodPillTextActive: {
    color: '#fff',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  selectorSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: T.textMuted,
  },
  helperText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: T.textMuted,
  },
  primaryButton: {
    marginTop: 14,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: T.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  recordCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    padding: 14,
    marginBottom: 10,
  },
  recordTop: {
    flexDirection: 'row',
    gap: 12,
  },
  recordTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  recordMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: T.textSecondary,
  },
  recordAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: T.danger,
  },
  statusChip: {
    borderRadius: 999,
    backgroundColor: T.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: T.primaryDark,
  },
  balanceText: {
    fontSize: 11,
    color: T.textMuted,
  },
  allocationWrap: {
    marginTop: 10,
    gap: 8,
  },
  allocationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  allocationTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: T.text,
  },
  allocationText: {
    marginTop: 4,
    fontSize: 11,
    color: T.textSecondary,
  },
  emptyText: {
    fontSize: 13,
    color: T.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 22,
    backgroundColor: T.surface,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: T.text,
  },
  modalText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: T.textSecondary,
  },
  invoiceOption: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  invoiceOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  invoiceOptionText: {
    marginTop: 4,
    fontSize: 12,
    color: T.textMuted,
  },
  modalCloseButton: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
  },
  modalCloseButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: T.textSecondary,
  },
})
