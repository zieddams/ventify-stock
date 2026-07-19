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
// way width is. No logo image is printed here (dropped by request - keeps
// the receipt shorter and avoids a blurry rasterized image on this
// hardware); the company name text is the only header identity shown.

import { forwardRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { translate } from '../../i18n/locales'
import { unwrapStatus } from '../../utils/format'

// The user asked for printed receipts to always be French, regardless of
// which language the app UI is currently running in (the app-wide locale
// can be ar-TN, and both the translation lookup AND Intl number/date
// formatting would otherwise follow that - including Arabic-Indic digit
// glyphs (٠١٢٣) from Intl.NumberFormat('ar-TN', ...), which is very likely
// what looked like "still Arabic" even after the text-rendering fix. Every
// formatter below is pinned to fr-TN independent of the app's runtime
// locale/format.js helpers (which are intentionally left following the
// runtime locale for on-screen UI elsewhere in the app).

// The PT-210 (and this class of 58mm printer generally) has a ~48mm/384-dot
// printable width at the standard 203 DPI (8 dots/mm) thermal-printer
// resolution. Rendering the hidden view at exactly this pixel width, and
// capturing at pixelRatio 1 / forcing the output width to match, keeps a
// 1:1 mapping between what we render and what actually prints - no
// resampling surprises from device pixel density. Height is not
// constrained - the receipt can run longer to fit more information at a
// larger, more legible font size.
export const RECEIPT_IMAGE_WIDTH_PX = 384

const PRINT_LOCALE = 'fr-TN'

function t(key, params) {
  return translate(PRINT_LOCALE, key, params)
}

const MONEY_FORMATTER = new Intl.NumberFormat(PRINT_LOCALE, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(PRINT_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formatAmountNumber(value) {
  const n = Number(value)
  return MONEY_FORMATTER.format(Number.isFinite(n) ? n : 0)
}

// Renders the "TND" suffix in a smaller nested Text than the amount itself -
// on 58mm thermal paper, a full-size "123.000 TND" wraps to a second line or
// crowds the row; keeping the suffix small lets every amount stay on one line.
function MoneyText({ value, style }) {
  return (
    <Text style={style}>
      {formatAmountNumber(value)}
      <Text style={st.currencySuffix}> TND</Text>
    </Text>
  )
}

function formatDateTime(value) {
  if (!value) return '--'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '--' : DATE_TIME_FORMATTER.format(date)
}

// Only payment status (Payee / Partielle / Impayee) is ever printed on the
// receipt - the invoice workflow status (Brouillon/Envoyee/Annulee) is an
// internal/app concept and never belongs on a document handed directly to
// the customer, so it is intentionally not rendered here at all.
const PAYMENT_STATUS_LABELS_FR = {
  unpaid: 'Impayée',
  partial: 'Partielle',
  paid: 'Payée',
}

function paymentStatusLabel(status) {
  return PAYMENT_STATUS_LABELS_FR[unwrapStatus(status)] ?? PAYMENT_STATUS_LABELS_FR.unpaid
}

function cleanString(value) {
  return String(value ?? '').trim()
}

function fallbackText(value, key = 'documents.common.empty') {
  return cleanString(value) || t(key)
}

function CompanyHeader({
  companyName,
  companyLegalName,
  companyAddress,
  companyPhone,
  companyEmail,
  companyTaxId,
  companySiret,
  headerNoteLines,
} = {}) {
  const name = cleanString(companyName)
  const legalName = cleanString(companyLegalName)
  const address = cleanString(companyAddress)
  const contactBits = [cleanString(companyPhone), cleanString(companyEmail)].filter(Boolean)
  const taxId = cleanString(companyTaxId)
  const siret = cleanString(companySiret)
  const noteLines = Array.isArray(headerNoteLines) ? headerNoteLines.filter(Boolean) : []

  return (
    <>
      {!!name && <Text style={[st.center, st.bold, st.brand]}>{name}</Text>}
      {/* Freeform business-activity/tagline lines (e.g. "Vente Gros eaux et
          boisson gazeuse..."), configured via the existing web "Documents"
          settings page (Config > Documents > Header note) - no new backend
          field needed, this is the same header_note the old PDF template
          already supports. */}
      {noteLines.map((line, idx) => (
        <Text key={idx} style={st.center}>{line}</Text>
      ))}
      {!!legalName && legalName.toLowerCase() !== name.toLowerCase() && (
        <Text style={st.center}>{legalName}</Text>
      )}
      {!!address && <Text style={st.center}>{address}</Text>}
      {!!contactBits.length && <Text style={st.center}>{contactBits.join(' - ')}</Text>}
      {(!!taxId || !!siret) && (
        <Text style={[st.center, st.badge]}>
          {[
            taxId ? `${t('documents.invoice.fields.taxId')} : ${taxId}` : '',
            siret ? `SIRET : ${siret}` : '',
          ].filter(Boolean).join('   -   ')}
        </Text>
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
      <MoneyText value={value} style={[st.cell, st.rightText, emphasize && st.bold, emphasize && st.totalBig, { flex: 2 }]} />
    </View>
  )
}

export const InvoiceReceiptPrintable = forwardRef(function InvoiceReceiptPrintable(
  { invoice, companyInfo, customerCin, user },
  ref,
) {
  const paymentStatus = paymentStatusLabel(unwrapStatus(invoice?.payment_status))
  const lines = Array.isArray(invoice?.lines) ? invoice.lines : []

  return (
    <View ref={ref} collapsable={false} style={st.page}>
      <CompanyHeader {...companyInfo} />
      <Separator />
      <Text style={[st.center, st.bold, st.docTitle]}>{t('documents.invoice.titleFallback')}</Text>
      <Text style={[st.center, st.bold, st.docNumber]}>{t('documents.invoice.numberPrefix')} {invoice?.number || '-'}</Text>
      <Text style={st.center}>{paymentStatus}</Text>
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
          <MoneyText value={line.total} style={[st.cell, st.rightText, { flex: 2 }]} />
        </View>
      ))}
      <Separator />
      <TotalsRow label={t('documents.invoice.totals.paid')} value={invoice?.paid_amount} />
      <TotalsRow label={t('documents.invoice.totals.total')} value={invoice?.total} emphasize />
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
      <CompanyHeader {...companyInfo} />
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
        <MoneyText value={total} style={[st.cell, st.rightText, st.bold, { flex: 2 }]} />
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
            <MoneyText value={item.total} style={[st.cell, st.rightText, { flex: 2 }]} />
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
    paddingHorizontal: 6,
    paddingVertical: 20,
  },
  center: {
    textAlign: 'center',
    color: '#000000',
    fontSize: 22,
    marginTop: 4,
  },
  bold: {
    fontWeight: '800',
  },
  brand: {
    fontSize: 25,
  },
  currencySuffix: {
    fontSize: 14,
  },
  badge: {
    fontSize: 20,
    marginTop: 6,
  },
  docTitle: {
    fontSize: 28,
    marginTop: 8,
  },
  docNumber: {
    fontSize: 23,
    marginTop: 3,
  },
  line: {
    color: '#000000',
    fontSize: 21,
  },
  fieldRow: {
    flexDirection: 'row',
    marginTop: 7,
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
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    marginTop: 7,
    gap: 4,
  },
  cell: {
    color: '#000000',
    fontSize: 21,
  },
  totalBig: {
    fontSize: 28,
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
    marginTop: 3,
    fontSize: 16,
    color: '#333333',
  },
})
