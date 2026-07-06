// On-device diagnostic log for thermal-print attempts.
//
// WHY THIS EXISTS: print reliability issues (stuck transfers, connection
// failures) are hard to diagnose blind - there is no way for a developer
// without physical access to the printer/phone to see what actually
// happened during a real attempt. Rather than building a whole server-side
// logging pipeline (which would need API/web changes and a deploy this
// session has no access to), this keeps a simple rolling log in memory on
// the device itself, and the user can share it directly (via the OS share
// sheet - email, WhatsApp, copy to notes, etc.) right after a test print so
// it can be read back verbatim, with exact timestamps/stages/byte counts/
// error codes - much faster and more reliable than re-describing what
// happened from memory.

const MAX_ENTRIES = 300
let entries = []

function nowIso() {
  return new Date().toISOString()
}

export function logPrintEvent(event, detail = {}) {
  entries.push({ ts: nowIso(), event, detail })
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES)
  }
}

export function clearPrintDiagnostics() {
  entries = []
}

function formatDetail(detail) {
  if (!detail || typeof detail !== 'object' || Object.keys(detail).length === 0) {
    return ''
  }

  try {
    return ' ' + Object.entries(detail)
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' ')
  } catch {
    return ''
  }
}

// Returns the whole rolling log as plain text, newest last, ready to paste
// or share as-is.
export function getPrintDiagnosticsText() {
  if (entries.length === 0) {
    return 'Aucune tentative d\'impression enregistrée depuis le dernier lancement de l\'application.'
  }

  return entries
    .map((entry) => `${entry.ts}  ${entry.event}${formatDetail(entry.detail)}`)
    .join('\n')
}

export function hasPrintDiagnostics() {
  return entries.length > 0
}
