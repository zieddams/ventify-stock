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
//
// Layout follows the user's real paper invoice pad ("Facture" - company
// header, N°, Client/Date strip, Quantite/Designation/P.U./Montant table)
// adapted to the printer's fixed 384px width, with a taller receipt and
// larger fonts than the first pass since paper length isn't constrained the
// way width is. Company logo is optional and only shown when the company
// has configured a real logo (never the shared app-default icon) - printing
// in black & white is expected and fine on this hardware.

import { forwardRef } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { resolveCompanyLogoUrl } from '../../utils/branding'
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
// resampling surprises from device pixel density. Height is not
// constrained - the receipt can run longer to fit more information at a
// larger, more legible font size.
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

function CompanyHeader({ user, companyName, companyAddress, companyPhone, companyEmail, companyTaxId } = {}) {
  const name = cleanString(companyName)
  const address = cleanString(companyAddress)
  const logoUrl = resolveCompanyLogoUrl(user)
  const contactBits = [cleanString(companyPhone), cleanString(companyEmail)].filter(Boolean)
  const taxId = cleanString(companyTaxId)

  return (
    <>
      {!!logoUrl && (
        <Image source={{ uri: logoUrl }} style={st.logo} resizeMode="contain" />
      )}
      {!!name && <Text style={[st.center, st.bold, st.brand]}>{name}</Text>}
      {!!address && <Text style={st.center}>{address}</Text>}
      {!!contactBits.length && <Text style={st.center}>{contactBits.join(' - ')}</Text>}
      {!!taxId && (
        <Text style={[st.center, st.badge]}>{t('documents.invoice.fields.taxId')} : {taxId}</Text>
      )}
    </>
  )
}

function Separator() {
  return <View style={st.hr} />
}

function FieldRow({ label, value }) {
  if (!cleanString(value)) return null

  return (
    <View style={st.fieldRow}>
      <Text style={[st.line, st.bold, st.fieldLabel]}>{label}</Text>
      <Text style={[st.line, st.fieldValue]}>{value}</Text>
    </View>
  )
}

function TotalsRow({ label, value, emphasize = false }) {
  return (
    <View style={st.row}>
      <Text style={[st.cell, emphasize && st.bold, emphasize && st.totalBig, { flex: 3 }]}>{label}</Text>
      <Text style={[st.cell, st.rightText, emphasize && st.bold, emphasize && st.totalBig, { flex: 2 }]}>{value}</Text>
    </View>
  )
}

export const InvoiceReceiptPrintable = forwardRef(function InvoiceReceiptPrintable(
  { invoice, companyInfo, customerCin, user },
  ref,
) {
  const invoiceStatus = invoiceStatusLabel(unwrapStatus(invoice?.status))
  const paymentStatus = paymentStatusLabel(unwrapStatus(invoice?.payment_status))
  const lines = Array.isArray(invoice?.lines) ? invoice.lines : []

  return (
    <View ref={ref} collapsable={false} style={st.page}>
      <CompanyHeader user={user} {...companyInfo} />
      <Separator />
      <Text style={[st.center, st.bold, st.docTitle]}>{t('documents.invoice.titleFallback')}</Text>
      <Text style={[st.center, st.bold, st.docNumber]}>{t('documents.invoice.numberPrefix')} {invoice?.number || '-'}</Text>
      <Text style={st.center}>{invoiceStatus} - {paymentStatus}</Text>
      <Separator />
      <FieldRow label={t('documents.invoice.fields.name')} value={fallbackText(invoice?.customer_name)} />
      <FieldRow label={t('documents.invoice.fields.phone')} value={invoice?.customer_phone} />
      <FieldRow label={t('documents.invoice.fields.address')} value={invoice?.customer_address} />
      <FieldRow label={t('documents.invoice.fields.taxId')} value={invoice?.customer_tax_id} />
      <FieldRow label={t('documents.invoice.fields.cin')} value={customerCin} />
      <FieldRow label={t('documents.invoice.fields.rep')} value={invoice?.rep_name} />
      <FieldRow label={t('documents.invoice.fields.date')} value={formatDateTime(invoice?.created_at)} />
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
      <Text style={[st.center, st.bold]}>{t('documents.invoice.footer')}</Text>
    </View>
  )
})

export const InvoiceListReceiptPrintable = forwardRef(function InvoiceListReceiptPrintable(
  { invoices, title, subtitle, companyInfo, user },
  ref,
) {
  const items = Array.isArray(invoices) ? invoices : []
  const total = items.reduce((sum, item) => sum + Number(item?.total ?? 0), 0)

  return (
    <View ref={ref} collapsable={false} style={st.page}>
      <CompanyHeader user={user} {...companyInfo} />
      <Separator />
      <Text style={[st.center, st.bold, st.docTitle]}>{title || t('documents.invoiceList.titleFallback')}</Text>
      {!!subtitle && <Text style={st.center}>{subtitle}</Text>}
      <Text style={st.center}>{t('documents.invoice.fields.date')} : {formatDateTime(new Date().toISOString())}</Text>
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
        <View key={item.id ?? idx} style={st.listItem}>
          <View style={st.row}>
            <Text style={[st.cell, { flex: 2 }]}>{fallbackText(item.number)}</Text>
            <Text style={[st.cell, { flex: 3 }]}>{fallbackText(item.customer_name)}</Text>
            <Text style={[st.cell, st.rightText, { flex: 2 }]}>{formatCurrency(item.total)}</Text>
          </View>
          {!!cleanString(item.rep_name) && (
            <Text style={st.listItemMeta}>{t('documents.invoice.fields.rep')} : {item.rep_name}</Text>
          )}
        </View>
      ))}
      <Separator />
      <Text style={[st.center, st.bold]}>{t('documents.invoiceList.footer', { date: formatDateTime(new Date().toISOString()) })}</Text>
    </View>
  )
})

const st = StyleSheet.create({
  page: {
    width: RECEIPT_IMAGE_WIDTH_PX,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  logo: {
    alignSelf: 'center',
    width: 160,
    height: 70,
    marginBottom: 6,
  },
  center: {
    textAlign: 'center',
    color: '#000000',
    fontSize: 16,
    marginTop: 3,
  },
  bold: {
    fontWeight: '800',
  },
  brand: {
    fontSize: 22,
  },
  badge: {
    fontSize: 14,
    marginTop: 5,
  },
  docTitle: {
    fontSize: 20,
    marginTop: 6,
  },
  docNumber: {
    fontSize: 17,
    marginTop: 2,
  },
  line: {
    color: '#000000',
    fontSize: 15,
  },
  fieldRow: {
    flexDirection: 'row',
    marginTop: 5,
    gap: 6,
  },
  fieldLabel: {
    flex: 2,
  },
  fieldValue: {
    flex: 3,
  },
  hr: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#000000',
    marginVertical: 10,
  },
  row: {
    flexDirection: 'row',
    marginTop: 5,
    gap: 4,
  },
  cell: {
    color: '#000000',
    fontSize: 15,
  },
  totalBig: {
    fontSize: 20,
  },
  centerText: {
    textAlign: 'center',
  },
  rightText: {
    textAlign: 'right',
  },
  listItem: {
    marginTop: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#d4d4d4',
  },
  listItemMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#333333',
  },
})
