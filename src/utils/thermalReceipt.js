// Builds the @finan-me/react-native-thermal-printer document content array
// (text/table/line/cut) for invoices - the ESC/POS-native replacement for the
// old HTML/PDF thermalTemplate in invoicePrint.js.
//
// All business data (customer, lines, totals) comes from the invoice payload
// already fetched from the API; company identity comes from the logged-in
// user's company object. Nothing here hardcodes a specific company's name or
// contact details - if the API has not populated a given company field yet,
// that line is simply omitted rather than falling back to a static brand.

import { getRuntimeLocale, translate } from '../i18n/locales'
import {
  formatCurrency,
  formatDateTime,
  invoiceStatusLabel,
  paymentStatusLabel,
  unwrapStatus,
} from './format'

function t(key, params = {}) {
  return translate(getRuntimeLocale(), key, params)
}

function cleanString(value) {
  const str = String(value ?? '').trim()
  return str.length ? str : ''
}

// `companyName` is expected to already be resolved by the caller via
// `resolveBrandName(user)` (src/utils/branding.js) - the same helper used
// everywhere else in the app for company identity, including its existing
// "no company / developer account" fallback. This module intentionally does
// not invent its own fallback brand string.
function companyHeaderLines({ companyName, companyAddress, companyPhone, companyTaxId } = {}) {
  const lines = []
  const name = cleanString(companyName)

  if (name) {
    lines.push({ type: 'text', content: name, style: { align: 'center', bold: true, size: 'double' } })
  }

  const address = cleanString(companyAddress)
  if (address) {
    lines.push({ type: 'text', content: address, style: { align: 'center' } })
  }

  const contactBits = [cleanString(companyPhone), cleanString(companyTaxId)].filter(Boolean)
  if (contactBits.length) {
    lines.push({ type: 'text', content: contactBits.join(' - '), style: { align: 'center' } })
  }

  return lines
}

function fallbackText(value, key = 'documents.common.empty') {
  return cleanString(value) || t(key)
}

export function buildInvoiceReceiptDocument(invoice, companyInfo = {}) {
  const invoiceStatus = invoiceStatusLabel(unwrapStatus(invoice?.status))
  const paymentStatus = paymentStatusLabel(unwrapStatus(invoice?.payment_status))
  const lines = Array.isArray(invoice?.lines) ? invoice.lines : []

  const rows = lines.map((line) => [
    cleanString(line.product_name) || t('documents.invoice.productFallback'),
    String(line.qty ?? ''),
    formatCurrency(line.total),
  ])

  return [
    ...companyHeaderLines(companyInfo),
    { type: 'line' },
    { type: 'text', content: invoice?.number || t('documents.invoice.titleFallback'), style: { align: 'center', bold: true } },
    { type: 'text', content: `${invoiceStatus} - ${paymentStatus}`, style: { align: 'center' } },
    { type: 'line' },
    { type: 'text', content: `${t('documents.invoice.fields.name')}: ${fallbackText(invoice?.customer_name)}` },
    { type: 'text', content: `${t('documents.invoice.fields.phone')}: ${fallbackText(invoice?.customer_phone)}` },
    { type: 'text', content: `${t('documents.invoice.fields.date')}: ${formatDateTime(invoice?.created_at)}` },
    { type: 'line' },
    {
      type: 'table',
      headers: [t('documents.invoice.headers.product'), t('documents.invoice.headers.quantity'), t('documents.invoice.headers.total')],
      rows,
      columnWidths: [55, 15, 30],
      alignments: ['left', 'center', 'right'],
    },
    { type: 'line' },
    { type: 'columns', columns: [{ content: t('documents.invoice.totals.subtotal'), width: 60 }, { content: formatCurrency(invoice?.subtotal), width: 40, align: 'right' }] },
    { type: 'columns', columns: [{ content: t('documents.invoice.totals.tax'), width: 60 }, { content: formatCurrency(invoice?.tax_amount), width: 40, align: 'right' }] },
    { type: 'columns', columns: [{ content: t('documents.invoice.totals.paid'), width: 60 }, { content: formatCurrency(invoice?.paid_amount), width: 40, align: 'right' }] },
    { type: 'columns', columns: [{ content: t('documents.invoice.totals.total'), width: 60, style: { bold: true } }, { content: formatCurrency(invoice?.total), width: 40, align: 'right', style: { bold: true, size: 'double_width' } }] },
    { type: 'line' },
    { type: 'text', content: t('documents.invoice.footer'), style: { align: 'center' } },
    { type: 'feed', lines: 3 },
    { type: 'cut' },
  ]
}

export function buildInvoiceListReceiptDocument({ invoices, title, subtitle, ...companyInfo }) {
  const total = invoices.reduce((sum, item) => sum + Number(item?.total ?? 0), 0)

  const rows = invoices.map((item) => [
    fallbackText(item.number),
    fallbackText(item.customer_name),
    formatCurrency(item.total),
  ])

  return [
    ...companyHeaderLines(companyInfo),
    { type: 'line' },
    { type: 'text', content: title || t('documents.invoiceList.titleFallback'), style: { align: 'center', bold: true } },
    { type: 'text', content: subtitle || t('documents.invoiceList.subtitleFallback'), style: { align: 'center' } },
    { type: 'line' },
    { type: 'columns', columns: [{ content: t('documents.invoiceList.filterCount'), width: 60 }, { content: String(invoices.length), width: 40, align: 'right' }] },
    { type: 'columns', columns: [{ content: t('documents.invoiceList.headers.total'), width: 60, style: { bold: true } }, { content: formatCurrency(total), width: 40, align: 'right', style: { bold: true } }] },
    { type: 'line' },
    {
      type: 'table',
      headers: [t('documents.invoiceList.headers.number'), t('documents.invoiceList.headers.customer'), t('documents.invoiceList.headers.total')],
      rows,
      columnWidths: [30, 40, 30],
      alignments: ['left', 'left', 'right'],
    },
    { type: 'line' },
    { type: 'text', content: t('documents.invoiceList.footer', { date: formatDateTime(new Date().toISOString()) }), style: { align: 'center' } },
    { type: 'feed', lines: 3 },
    { type: 'cut' },
  ]
}
