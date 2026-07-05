// Hidden, off-screen receipt layouts rendered with real RN Text/View so the
// thermal printer receives a rasterized image instead of raw ESC/POS text.
//
// WHY THIS EXISTS: the ESC/POS text path (see src/utils/thermalReceipt.js,
// now unused for these two documents) always sends raw UTF-8 bytes to the
// printer with no real codepage translation (confirmed by reading
// @finan-me/react-native-thermal-printer's own encodeVietnamese() source -
// it just does `new TextEncoder().encode(text)` regardless of the requested
// encoding/codepage). The GOOJPRT PT-210's firmware has no real UTF-8 or
// Arabic font support, so any accented French or Arabic text sent as text
// came out as garbled/Chinese-looking glyphs. Rendering the receipt as an
// image sidesteps the printer's font ROM entirely - Android draws the text
// itself (correct Arabic shaping + French accents), and the printer just
// reproduces the picture.
//
// These components are captured via `react-native-view-shot`'s captureRef()
// (see src/utils/thermalReceiptImage.js) - they are never meant to be
// visible on screen, only mounted off-screen so React Native lays them out.

import { forwardRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { getRuntimeLocale, translate } from '../../i18n/locales'
import {
  formatCurrency,
  formatDateTime,
  invoiceStatusLabel,
  paymentStatusLabel,
  unwrapStatus,
} from '../../utils/format'

// The PT-210 (and this class of 58mm printer generally) has a ~48mm/384-dot
// printable width at the standard 203 DPI (8 dots/mm) thermal-printer
// resolution. Rendering the hidden view at exactly this pixel width, and
// capturing at pixelRatio 1 / forcing the output width to match, keeps a
// 1:1 mapping between what we render and what actually prints - no
// resampling surprises from device pixel density.
export const RECEIPT_IMAGE_WIDTH_PX = 384

function t(key, params) {
  return translate(getRuntimeLocale(), key, params)
}

function cleanString(value) {
  return String(value ?? '').trim()
}

function fallbackText(value, key = 'documents.common.empty') {
  return cleanString(value) || t(key)
}

function CompanyHeader({ companyName, companyAddress, companyPhone, companyTaxId } = {}) {
  const name = cleanString(companyName)
  const address = cleanString(companyAddress)
  const contactBits = [cleanString(companyPhone), cleanString(companyTaxId)].filter(Boolean)

  return (
    <>
      {!!name && <Text style={[st.center, st.bold, st.big]}>{name}</Text>}
      {!!address && <Text style={st.center}>{address}</Text>}
      {!!contactBits.length && <Text style={st.center}>{contactBits.join(' - ')}</Text>}
    </>
  )
}

function Separator() {
  return <View style={st.hr} />
}

function TotalsRow({ label, value, emphasize = false }) {
  return (
    <View style={st.row}>
      <Text style={[st.cell, emphasize && st.bold, { flex: 3 }]}>{label}</Text>
      <Text style={[st.cell, st.rightText, emphasize && st.bold, emphasize && st.big, { flex: 2 }]}>{value}</Text>
    </View>
  )
}

export const InvoiceReceiptPrintable = forwardRef(function InvoiceReceiptPrintable({ invoice, companyInfo }, ref) {
  const invoiceStatus = invoiceStatusLabel(unwrapStatus(invoice?.status))
  const paymentStatus = paymentStatusLabel(unwrapStatus(invoice?.payment_status))
  const lines = Array.isArray(invoice?.lines) ? invoice.lines : []

  return (
    <View ref={ref} collapsable={false} style={st.page}>
      <CompanyHeader {...companyInfo} />
      <Separator />
      <Text style={[st.center, st.bold]}>{invoice?.number || t('documents.invoice.titleFallback')}</Text>
      <Text style={st.center}>{invoiceStatus} - {paymentStatus}</Text>
      <Separator />
      <Text style={st.line}>{t('documents.invoice.fields.name')}: {fallbackText(invoice?.customer_name)}</Text>
      <Text style={st.line}>{t('documents.invoice.fields.phone')}: {fallbackText(invoice?.customer_phone)}</Text>
      <Text style={st.line}>{t('documents.invoice.fields.date')}: {formatDateTime(invoice?.created_at)}</Text>
      <Separator />
      <View style={st.row}>
        <Text style={[st.cell, st.bold, { flex: 3 }]}>{t('documents.invoice.headers.product')}</Text>
        <Text style={[st.cell, st.bold, st.centerText, { flex: 1 }]}>{t('documents.invoice.headers.quantity')}</Text>
        <Text style={[st.cell, st.bold, st.rightText, { flex: 2 }]}>{t('documents.invoice.headers.total')}</Text>
      </View>
      {lines.length === 0 && (
        <Text style={st.line}>{t('documents.common.empty')}</Text>
      )}
      {lines.map((line, idx) => (
        <View key={line.id ?? `${line.product_id ?? idx}-${idx}`} style={st.row}>
          <Text style={[st.cell, { flex: 3 }]}>{cleanString(line.product_name) || t('documents.invoice.productFallback')}</Text>
          <Text style={[st.cell, st.centerText, { flex: 1 }]}>{String(line.qty ?? '')}</Text>
          <Text style={[st.cell, st.rightText, { flex: 2 }]}>{formatCurrency(line.total)}</Text>
        </View>
      ))}
      <Separator />
      <TotalsRow label={t('documents.invoice.totals.subtotal')} value={formatCurrency(invoice?.subtotal)} />
      <TotalsRow label={t('documents.invoice.totals.tax')} value={formatCurrency(invoice?.tax_amount)} />
      <TotalsRow label={t('documents.invoice.totals.paid')} value={formatCurrency(invoice?.paid_amount)} />
      <TotalsRow label={t('documents.invoice.totals.total')} value={formatCurrency(invoice?.total)} emphasize />
      <Separator />
      <Text style={st.center}>{t('documents.invoice.footer')}</Text>
    </View>
  )
})

export const InvoiceListReceiptPrintable = forwardRef(function InvoiceListReceiptPrintable(
  { invoices, title, subtitle, companyInfo },
  ref,
) {
  const items = Array.isArray(invoices) ? invoices : []
  const total = items.reduce((sum, item) => sum + Number(item?.total ?? 0), 0)

  return (
    <View ref={ref} collapsable={false} style={st.page}>
      <CompanyHeader {...companyInfo} />
      <Separator />
      <Text style={[st.center, st.bold]}>{title || t('documents.invoiceList.titleFallback')}</Text>
      {!!subtitle && <Text style={st.center}>{subtitle}</Text>}
      <Separator />
      <View style={st.row}>
        <Text style={[st.cell, { flex: 3 }]}>{t('documents.invoiceList.filterCount')}</Text>
        <Text style={[st.cell, st.rightText, { flex: 2 }]}>{String(items.length)}</Text>
      </View>
      <View style={st.row}>
        <Text style={[st.cell, st.bold, { flex: 3 }]}>{t('documents.invoiceList.headers.total')}</Text>
        <Text style={[st.cell, st.rightText, st.bold, { flex: 2 }]}>{formatCurrency(total)}</Text>
      </View>
      <Separator />
      <View style={st.row}>
        <Text style={[st.cell, st.bold, { flex: 2 }]}>{t('documents.invoiceList.headers.number')}</Text>
        <Text style={[st.cell, st.bold, { flex: 3 }]}>{t('documents.invoiceList.headers.customer')}</Text>
        <Text style={[st.cell, st.bold, st.rightText, { flex: 2 }]}>{t('documents.invoiceList.headers.total')}</Text>
      </View>
      {items.map((item, idx) => (
        <View key={item.id ?? idx} style={st.row}>
          <Text style={[st.cell, { flex: 2 }]}>{fallbackText(item.number)}</Text>
          <Text style={[st.cell, { flex: 3 }]}>{fallbackText(item.customer_name)}</Text>
          <Text style={[st.cell, st.rightText, { flex: 2 }]}>{formatCurrency(item.total)}</Text>
        </View>
      ))}
      <Separator />
      <Text style={st.center}>{t('documents.invoiceList.footer', { date: formatDateTime(new Date().toISOString()) })}</Text>
    </View>
  )
})

const st = StyleSheet.create({
  page: {
    width: RECEIPT_IMAGE_WIDTH_PX,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  center: {
    textAlign: 'center',
    color: '#000000',
    fontSize: 15,
    marginTop: 3,
  },
  bold: {
    fontWeight: '800',
  },
  big: {
    fontSize: 19,
  },
  line: {
    color: '#000000',
    fontSize: 14,
    marginTop: 4,
  },
  hr: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#000000',
    marginVertical: 9,
  },
  row: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 4,
  },
  cell: {
    color: '#000000',
    fontSize: 13,
  },
  centerText: {
    textAlign: 'center',
  },
  rightText: {
    textAlign: 'right',
  },
})
