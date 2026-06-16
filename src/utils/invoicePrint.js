import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import {
  formatCurrency,
  formatDateTime,
  invoiceStatusLabel,
  paymentStatusLabel,
  unwrapStatus,
} from './format'

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
    <html lang="fr">
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

function buildInvoiceBody(invoice) {
  const invoiceStatus = invoiceStatusLabel(unwrapStatus(invoice?.status))
  const paymentStatus = paymentStatusLabel(unwrapStatus(invoice?.payment_status))
  const lines = Array.isArray(invoice?.lines) ? invoice.lines : []

  return `
    <div class="chips">
      <span class="chip">${escapeHtml(invoiceStatus)}</span>
      <span class="chip">${escapeHtml(paymentStatus)}</span>
      ${invoice?.rep_name ? `<span class="chip">${escapeHtml(invoice.rep_name)}</span>` : ''}
    </div>

    <div class="section">
      <h2 class="section-title">Client</h2>
      <table class="meta-grid">
        <tr><td>Nom</td><td>${escapeHtml(invoice?.customer_name || '--')}</td></tr>
        <tr><td>Telephone</td><td>${escapeHtml(invoice?.customer_phone || '--')}</td></tr>
        <tr><td>Adresse</td><td>${escapeHtml(invoice?.customer_address || '--')}</td></tr>
        <tr><td>Date</td><td>${escapeHtml(formatDateTime(invoice?.created_at))}</td></tr>
        <tr><td>Session</td><td>${escapeHtml(invoice?.route_session_id ? `#${invoice.route_session_id}` : 'Aucune')}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">Lignes</h2>
      <table>
        <thead>
          <tr>
            <th>Produit</th>
            <th>Qte</th>
            <th>PU</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((line) => `
            <tr>
              <td>
                <strong>${escapeHtml(line.product_name || 'Produit')}</strong><br />
                <span class="muted">${escapeHtml(line.reference || line.unit || '')}</span>
              </td>
              <td>${escapeHtml(line.qty ?? '--')}</td>
              <td>${escapeHtml(formatCurrency(line.price))}</td>
              <td>${escapeHtml(formatCurrency(line.total))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="totals-row"><span>Sous-total</span><span>${escapeHtml(formatCurrency(invoice?.subtotal))}</span></div>
      <div class="totals-row"><span>TVA</span><span>${escapeHtml(formatCurrency(invoice?.tax_amount))}</span></div>
      <div class="totals-row"><span>Paye</span><span>${escapeHtml(formatCurrency(invoice?.paid_amount))}</span></div>
      <div class="totals-row strong"><span>Total</span><span>${escapeHtml(formatCurrency(invoice?.total))}</span></div>
    </div>

    <div class="footer">
      Genere depuis la plateforme mobile Irtiwaa.
    </div>
  `
}

function buildInvoiceListBody({ invoices, subtitle }) {
  const total = invoices.reduce((sum, item) => sum + Number(item?.total ?? 0), 0)

  return `
    <div class="section">
      <h2 class="section-title">Filtre</h2>
      <table class="meta-grid">
        <tr><td>Contexte</td><td>${escapeHtml(subtitle)}</td></tr>
        <tr><td>Nombre de factures</td><td>${escapeHtml(invoices.length)}</td></tr>
        <tr><td>Total</td><td>${escapeHtml(formatCurrency(total))}</td></tr>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">Liste</h2>
      <table>
        <thead>
          <tr>
            <th>Numero</th>
            <th>Client</th>
            <th>Commercial</th>
            <th>Date</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((item) => `
            <tr>
              <td>${escapeHtml(item.number || '--')}</td>
              <td>${escapeHtml(item.customer_name || '--')}</td>
              <td>${escapeHtml(item.rep_name || '--')}</td>
              <td>${escapeHtml(formatDateTime(item.created_at))}</td>
              <td>${escapeHtml(formatCurrency(item.total))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Rapport mobile genere le ${escapeHtml(formatDateTime(new Date().toISOString()))}.
    </div>
  `
}

async function shareHtmlAsPdf(html) {
  const file = await Print.printToFileAsync({ html, base64: false })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Partager le PDF',
    })
  }

  return file
}

export async function printInvoiceDocument(invoice) {
  const title = invoice?.number || 'Facture mobile'
  const subtitle = invoice?.customer_name
    ? `${invoice.customer_name} - ${formatDateTime(invoice.created_at)}`
    : 'Detail facture'

  return Print.printAsync({
    html: pdfTemplate(title, subtitle, buildInvoiceBody(invoice)),
  })
}

export async function shareInvoiceDocument(invoice) {
  const title = invoice?.number || 'Facture mobile'
  const subtitle = invoice?.customer_name
    ? `${invoice.customer_name} - ${formatDateTime(invoice.created_at)}`
    : 'Detail facture'

  return shareHtmlAsPdf(pdfTemplate(title, subtitle, buildInvoiceBody(invoice)))
}

export async function printInvoiceListDocument({ invoices, title = 'Liste factures', subtitle = 'Rapport mobile' }) {
  return Print.printAsync({
    html: pdfTemplate(title, subtitle, buildInvoiceListBody({ invoices, subtitle })),
  })
}

export async function shareInvoiceListDocument({ invoices, title = 'Liste factures', subtitle = 'Rapport mobile' }) {
  return shareHtmlAsPdf(pdfTemplate(title, subtitle, buildInvoiceListBody({ invoices, subtitle })))
}
