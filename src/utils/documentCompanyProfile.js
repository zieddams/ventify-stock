// Fetches the richer, freeform company-identity data that already exists
// via the "Documents" settings page on the web app (Config > Documents >
// Company Profile / Header note) but is NOT part of the Company model's
// own address/phone/tax_id columns. This mirrors the merge logic already
// used by the older src/utils/invoicePrint.js PDF/share path (see
// resolveInvoiceDocumentContext there) so the new thermal-image receipt and
// the PDF fallback stay consistent, and so admins can fill in company
// siret/phone/address/activity-description themselves via a form that
// already exists and is already deployed - no API/backend change needed.
//
// Precedence: the Company model's own fields (user.company.*) win when
// non-empty (they are the "real" record), the settings-based profile is
// only a fallback/extra source for fields the Company model doesn't have
// at all (legal_name, siret) or hasn't been filled in yet.

import api from '../services/api'

const DOCUMENT_COMPANY_PROFILE_SETTING_KEY = 'documents.company_profile'
const DOCUMENT_INVOICE_PRINTING_SETTING_KEY = 'documents.invoice_printing'

function cleanText(value) {
  return String(value ?? '').trim()
}

function splitMultilineText(value) {
  return cleanText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeCompanyProfile(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  return {
    legal_name: cleanText(source.legal_name),
    siret: cleanText(source.siret),
    tax_id: cleanText(source.tax_id),
    phone: cleanText(source.phone),
    email: cleanText(source.email),
    address: cleanText(source.address),
  }
}

function normalizeInvoicePrinting(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  return {
    header_note: cleanText(source.header_note),
  }
}

// Returns { companyLegalName, companySiret, companyTaxId, companyPhone,
// companyEmail, companyAddress, headerNoteLines }. Never throws - on any
// fetch error this just resolves to all-empty values so the receipt still
// prints using whatever user.company.* fields are available.
export async function fetchDocumentCompanyProfile() {
  try {
    const response = await api.get('/settings', { params: { group: 'documents' } })
    const rows = Array.isArray(response.data) ? response.data : []
    const byKey = rows.reduce((carry, item) => {
      if (item?.key) carry[item.key] = item?.value
      return carry
    }, {})

    const profile = normalizeCompanyProfile(byKey[DOCUMENT_COMPANY_PROFILE_SETTING_KEY])
    const invoicePrinting = normalizeInvoicePrinting(byKey[DOCUMENT_INVOICE_PRINTING_SETTING_KEY])

    return {
      companyLegalName: profile.legal_name,
      companySiret: profile.siret,
      companyTaxIdFallback: profile.tax_id,
      companyPhoneFallback: profile.phone,
      companyEmailFallback: profile.email,
      companyAddressFallback: profile.address,
      headerNoteLines: splitMultilineText(invoicePrinting.header_note).slice(0, 2),
    }
  } catch {
    return {
      companyLegalName: '',
      companySiret: '',
      companyTaxIdFallback: '',
      companyPhoneFallback: '',
      companyEmailFallback: '',
      companyAddressFallback: '',
      headerNoteLines: [],
    }
  }
}

// Merges the Company model's own fields (entity - the "real" record) with
// the settings-based fallback/extra fields, entity wins whenever it has a
// non-empty value. Produces the flat prop shape ReceiptPrintable expects.
export function mergeCompanyInfo(entityInfo = {}, profile = {}) {
  return {
    companyName: entityInfo.companyName,
    companyLegalName: profile.companyLegalName,
    companySiret: profile.companySiret,
    companyAddress: cleanText(entityInfo.companyAddress) || profile.companyAddressFallback,
    companyPhone: cleanText(entityInfo.companyPhone) || profile.companyPhoneFallback,
    companyEmail: cleanText(entityInfo.companyEmail) || profile.companyEmailFallback,
    companyTaxId: cleanText(entityInfo.companyTaxId) || profile.companyTaxIdFallback,
    headerNoteLines: profile.headerNoteLines ?? [],
  }
}
