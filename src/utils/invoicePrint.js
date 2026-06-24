import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
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

function documentLang() {
  return getRuntimeLocale().startsWith('ar') ? 'ar' : 'fr'
}

function fallbackText(value, key = 'documents.common.empty') {
  return value ?? t(key)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function pdfTemplate(title, subtitle, body) {
  return `
    <!doctype html>
    <html lang="${documentLang()}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #0f172a;
            padding: 28px;
          }
          .hero {
            border: 1px solid #cbd5e1;
            border-radius: 18px;
            padding: 20px;
            margin-bottom: 20px;
            background: #f8fafc;
          }
          .title {
            font-size: 22px;
            font-weight: 700;
            margin: 0 0 4px;
          }
          .subtitle {
            color: #475569;
            font-size: 12px;
            margin: 0;
          }
          .chips {
            margin-top: 12px;
          }
          .chip {
            display: inline-block;
            margin-right: 8px;
            margin-bottom: 8px;
            padding: 6px 10px;
            border-radius: 999px;
            background: #e2e8f0;
            color: #0f172a;
            font-size: 11px;
            font-weight: 700;
          }
          .section {
            margin-bottom: 18px;
          }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            margin: 0 0 10px;
          }
          .meta-grid {
            width: 100%;
            border-collapse: collapse;
          }
          .meta-grid td {
            padding: 8px 0;
            border-bottom: 1px solid #e2e8f0;
            font-size: 12px;
          }
          .meta-grid td:last-child {
            text-align: right;
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #475569;
            border-bottom: 1px solid #cbd5e1;
            padding: 10px 0;
          }
          td {
            font-size: 12px;
            padding: 10px 0;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
          }
          td:last-child,
          th:last-child {
            text-align: right;
          }
          .totals {
            margin-top: 14px;
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 12px;
          }
          .totals-row.strong {
            font-size: 15px;
            font-weight: 700;
            color: #0f766e;
          }
          .muted {
            color: #64748b;
          }
          .footer {
            margin-top: 18px;
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="hero">
          <h1 class="title">${escapeHtml(title)}</h1>
          <p class="subtitle">${escapeHtml(subtitle)}</p>
        </div>
        ${body}
      </body>
    </html>
  `
}

function thermalTemplate(title, subtitle, body) {
  return `
    <!doctype html>
    <html lang="${documentLang()}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #020617;
            width: 72mm;
            margin: 0 auto;
            padding: 7mm 5mm 8mm;
            font-size: 11px;
            line-height: 1.35;
          }
          .center {
            text-align: center;
          }
          .title {
            font-size: 18px;
            font-weight: 700;
            margin: 0;
          }
          .subtitle {
            margin: 4px 0 0;
            font-size: 11px;
            color: #475569;
          }
          .rule {
            border-top: 1px dashed #94a3b8;
            margin: 10px 0;
          }
          .meta-row,
          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding: 2px 0;
          }
          .meta-label,
          .muted {
            color: #64748b;
          }
          .chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
          }
          .chip {
            border: 1px solid #cbd5e1;
            border-radius: 999px;
            padding: 3px 7px;
            font-size: 10px;
            font-weight: 700;
          }
          .line {
            padding: 8px 0;
            border-bottom: 1px dashed #cbd5e1;
          }
          .line-name {
            font-size: 11px;
            font-weight: 700;
          }
          .line-meta,
          .line-total {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin-top: 2px;
          }
          .section-title {
            margin: 0 0 6px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .total-row.strong {
            font-size: 13px;
            font-weight: 700;
          }
          .footer {
            margin-top: 10px;
            text-align: center;
            font-size: 10px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <div class="center">
          <h1 class="title">${escapeHtml(title)}</h1>
          <p class="subtitle">${escapeHtml(subtitle)}</p>
        </div>
        ${body}
      </body>
    </html>
  `
}

function buildInvoiceBody(invoice) {
  const invoiceStatus = invoiceStatusLabel(unwrapStatus(invoice?.status))
  const paymentStatus = paymentStatusLabel(unwrapStatus(invoice?.payment_status))
  const lines = Array.isArray(invoice?.lines) ? invoice.lines : []
  const emptyText = t('documents.common.empty')

  return `
    <div class="chips">
      <span class="chip">${escapeHtml(invoiceStatus)}</span>
      <span class="chip">${escapeHtml(paymentStatus)}</span>
      ${invoice?.rep_name ? `<span class="chip">${escapeHtml(invoice.rep_name)}</span>` : ''}
    </div>

    <div class="section">
      <h2 class="section-title">${escapeHtml(t('documents.invoice.customerSection'))}</h2>
      <table class="meta-grid">
        <tr><td>${escapeHtml(t('documents.invoice.fields.name'))}</td><td>${escapeHtml(fallbackText(invoice?.customer_name))}</td></tr>
        <tr><td>${escapeHtml(t('documents.invoice.fields.phone'))}</td><td>${escapeHtml(fallbackText(invoice?.customer_phone))}</td></tr>
        <tr><td>${escapeHtml(t('documents.invoice.fields.address'))}</td><td>${escapeHtml(fallbackText(invoice?.customer_address))}</td></tr>
        <tr><td>${escapeHtml(t('documents.invoice.fields.date'))}</td><td>${escapeHtml(formatDateTime(invoice?.created_at))}</td></tr>
        <tr><td>${escapeHtml(t('documents.invoice.fields.session'))}</td><td>${escapeHtml(invoice?.route_session_id ? `#${invoice.route_session_id}` : t('documents.common.noneSession'))}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">${escapeHtml(t('documents.invoice.linesSection'))}</h2>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t('documents.invoice.headers.product'))}</th>
            <th>${escapeHtml(t('documents.invoice.headers.quantity'))}</th>
            <th>${escapeHtml(t('documents.invoice.headers.unitPrice'))}</th>
            <th>${escapeHtml(t('documents.invoice.headers.total'))}</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((line) => `
            <tr>
              <td>
                <strong>${escapeHtml(line.product_name || t('documents.invoice.productFallback'))}</strong><br />
                <span class="muted">${escapeHtml(line.reference || line.unit || '')}</span>
              </td>
              <td>${escapeHtml(line.qty ?? emptyText)}</td>
              <td>${escapeHtml(formatCurrency(line.price))}</td>
              <td>${escapeHtml(formatCurrency(line.total))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="totals-row"><span>${escapeHtml(t('documents.invoice.totals.subtotal'))}</span><span>${escapeHtml(formatCurrency(invoice?.subtotal))}</span></div>
      <div class="totals-row"><span>${escapeHtml(t('documents.invoice.totals.tax'))}</span><span>${escapeHtml(formatCurrency(invoice?.tax_amount))}</span></div>
      <div class="totals-row"><span>${escapeHtml(t('documents.invoice.totals.paid'))}</span><span>${escapeHtml(formatCurrency(invoice?.paid_amount))}</span></div>
      <div class="totals-row strong"><span>${escapeHtml(t('documents.invoice.totals.total'))}</span><span>${escapeHtml(formatCurrency(invoice?.total))}</span></div>
    </div>

    <div class="footer">
      ${escapeHtml(t('documents.invoice.footer'))}
    </div>
  `
}

function buildInvoiceListBody({ invoices, subtitle }) {
  const total = invoices.reduce((sum, item) => sum + Number(item?.total ?? 0), 0)

  return `
    <div class="section">
      <h2 class="section-title">${escapeHtml(t('documents.invoiceList.filterSection'))}</h2>
      <table class="meta-grid">
        <tr><td>${escapeHtml(t('documents.invoiceList.filterContext'))}</td><td>${escapeHtml(subtitle)}</td></tr>
        <tr><td>${escapeHtml(t('documents.invoiceList.filterCount'))}</td><td>${escapeHtml(invoices.length)}</td></tr>
        <tr><td>${escapeHtml(t('documents.invoiceList.headers.total'))}</td><td>${escapeHtml(formatCurrency(total))}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">${escapeHtml(t('documents.invoiceList.listSection'))}</h2>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t('documents.invoiceList.headers.number'))}</th>
            <th>${escapeHtml(t('documents.invoiceList.headers.customer'))}</th>
            <th>${escapeHtml(t('documents.invoiceList.headers.rep'))}</th>
            <th>${escapeHtml(t('documents.invoiceList.headers.date'))}</th>
            <th>${escapeHtml(t('documents.invoiceList.headers.total'))}</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((item) => `
            <tr>
              <td>${escapeHtml(fallbackText(item.number))}</td>
              <td>${escapeHtml(fallbackText(item.customer_name))}</td>
              <td>${escapeHtml(fallbackText(item.rep_name))}</td>
              <td>${escapeHtml(formatDateTime(item.created_at))}</td>
              <td>${escapeHtml(formatCurrency(item.total))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      ${escapeHtml(t('documents.invoiceList.footer', { date: formatDateTime(new Date().toISOString()) }))}
    </div>
  `
}

function buildThermalInvoiceBody(invoice) {
  const invoiceStatus = invoiceStatusLabel(unwrapStatus(invoice?.status))
  const paymentStatus = paymentStatusLabel(unwrapStatus(invoice?.payment_status))
  const lines = Array.isArray(invoice?.lines) ? invoice.lines : []
  const emptyText = t('documents.common.empty')

  return `
    <div class="chips">
      <span class="chip">${escapeHtml(invoiceStatus)}</span>
      <span class="chip">${escapeHtml(paymentStatus)}</span>
    </div>
    <div class="rule"></div>
    <div class="meta-row"><span class="meta-label">${escapeHtml(t('documents.invoice.customerSection'))}</span><span>${escapeHtml(fallbackText(invoice?.customer_name))}</span></div>
    <div class="meta-row"><span class="meta-label">${escapeHtml(t('documents.invoice.fields.phone'))}</span><span>${escapeHtml(fallbackText(invoice?.customer_phone))}</span></div>
    <div class="meta-row"><span class="meta-label">${escapeHtml(t('documents.invoice.fields.date'))}</span><span>${escapeHtml(formatDateTime(invoice?.created_at))}</span></div>
    <div class="meta-row"><span class="meta-label">${escapeHtml(t('documents.invoice.fields.session'))}</span><span>${escapeHtml(invoice?.route_session_id ? `#${invoice.route_session_id}` : t('documents.common.noneSession'))}</span></div>
    <div class="rule"></div>
    <div class="section-title">${escapeHtml(t('documents.invoice.linesSection'))}</div>
    ${lines.map((line) => `
      <div class="line">
        <div class="line-name">${escapeHtml(line.product_name || t('documents.invoice.productFallback'))}</div>
        <div class="line-meta">
          <span class="muted">${escapeHtml(line.reference || line.unit || '')}</span>
          <span>${escapeHtml(line.qty ?? emptyText)} x ${escapeHtml(formatCurrency(line.price))}</span>
        </div>
        <div class="line-total">
          <span class="muted">${escapeHtml(t('documents.invoice.lineTotal'))}</span>
          <span>${escapeHtml(formatCurrency(line.total))}</span>
        </div>
      </div>
    `).join('')}
    <div class="rule"></div>
    <div class="total-row"><span>${escapeHtml(t('documents.invoice.totals.subtotal'))}</span><span>${escapeHtml(formatCurrency(invoice?.subtotal))}</span></div>
    <div class="total-row"><span>${escapeHtml(t('documents.invoice.totals.tax'))}</span><span>${escapeHtml(formatCurrency(invoice?.tax_amount))}</span></div>
    <div class="total-row"><span>${escapeHtml(t('documents.invoice.totals.paid'))}</span><span>${escapeHtml(formatCurrency(invoice?.paid_amount))}</span></div>
    <div class="total-row strong"><span>${escapeHtml(t('documents.invoice.totals.total'))}</span><span>${escapeHtml(formatCurrency(invoice?.total))}</span></div>
    <div class="footer">${escapeHtml(t('documents.invoice.thermalFooter'))}</div>
  `
}

function buildThermalInvoiceListBody({ invoices, subtitle }) {
  const total = invoices.reduce((sum, item) => sum + Number(item?.total ?? 0), 0)

  return `
    <div class="rule"></div>
    <div class="meta-row"><span class="meta-label">${escapeHtml(t('documents.invoiceList.filterContext'))}</span><span>${escapeHtml(subtitle)}</span></div>
    <div class="meta-row"><span class="meta-label">${escapeHtml(t('documents.invoiceList.filterCount'))}</span><span>${escapeHtml(invoices.length)}</span></div>
    <div class="meta-row"><span class="meta-label">${escapeHtml(t('documents.invoiceList.headers.total'))}</span><span>${escapeHtml(formatCurrency(total))}</span></div>
    <div class="rule"></div>
    <div class="section-title">${escapeHtml(t('documents.invoiceList.listSection'))}</div>
    ${invoices.map((item) => `
      <div class="line">
        <div class="line-name">${escapeHtml(fallbackText(item.number))}</div>
        <div class="line-meta">
          <span>${escapeHtml(fallbackText(item.customer_name))}</span>
          <span>${escapeHtml(formatDateTime(item.created_at))}</span>
        </div>
        <div class="line-total">
          <span class="muted">${escapeHtml(fallbackText(item.rep_name))}</span>
          <span>${escapeHtml(formatCurrency(item.total))}</span>
        </div>
      </div>
    `).join('')}
    <div class="footer">${escapeHtml(t('documents.invoiceList.thermalFooter'))}</div>
  `
}

async function shareHtmlAsPdf(html, dialogTitle) {
  const file = await Print.printToFileAsync({ html, base64: false })
  const resolvedDialogTitle = dialogTitle || t('documents.common.shareDialog')

  if (!await Sharing.isAvailableAsync()) {
    throw new Error(t('documents.common.shareUnavailable'))
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    dialogTitle: resolvedDialogTitle,
  })

  return file
}

function invoiceTitle(invoice) {
  return invoice?.number || t('documents.invoice.titleFallback')
}

function invoiceSubtitle(invoice) {
  return invoice?.customer_name
    ? `${invoice.customer_name} - ${formatDateTime(invoice.created_at)}`
    : t('documents.invoice.subtitleFallback')
}

export async function printInvoiceDocument(invoice) {
  return shareHtmlAsPdf(
    thermalTemplate(invoiceTitle(invoice), invoiceSubtitle(invoice), buildThermalInvoiceBody(invoice)),
    t('documents.invoice.printDialog'),
  )
}

export async function shareInvoiceDocument(invoice) {
  return shareHtmlAsPdf(
    pdfTemplate(invoiceTitle(invoice), invoiceSubtitle(invoice), buildInvoiceBody(invoice)),
    t('documents.common.shareDialog'),
  )
}

export async function printInvoiceListDocument({ invoices, title, subtitle }) {
  const resolvedTitle = title || t('documents.invoiceList.titleFallback')
  const resolvedSubtitle = subtitle || t('documents.invoiceList.subtitleFallback')

  return shareHtmlAsPdf(
    thermalTemplate(resolvedTitle, resolvedSubtitle, buildThermalInvoiceListBody({ invoices, subtitle: resolvedSubtitle })),
    t('documents.invoiceList.printDialog'),
  )
}

export async function shareInvoiceListDocument({ invoices, title, subtitle }) {
  const resolvedTitle = title || t('documents.invoiceList.titleFallback')
  const resolvedSubtitle = subtitle || t('documents.invoiceList.subtitleFallback')

  return shareHtmlAsPdf(
    pdfTemplate(resolvedTitle, resolvedSubtitle, buildInvoiceListBody({ invoices, subtitle: resolvedSubtitle })),
    t('documents.common.shareDialog'),
  )
}
