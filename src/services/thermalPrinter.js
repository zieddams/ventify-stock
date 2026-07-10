// Production Bluetooth thermal-printer service - replaces the old
// expo-print + Sharing(RawBT) pipeline for the "Thermique" action.
//
// Design goals (see docs/thermal-printer-integration-plan.md for the full
// history/decisions):
// - Single static printer profile (GOOJPRT PT-210, 58mm paper-width preset).
// - Every call surfaces a "stage" callback so the UI can show
//   permission/scan/connect/print progress instead of one opaque spinner.
// - Verbose native errors are normalized into a small set of reasons the UI
//   can react to directly (permission missing, no paired printer, printer
//   unreachable, print failed) instead of leaking raw ESC/POS/driver text.
//
// IMPORTANT (2026-07-06): this used to silently remember the chosen printer
// address (SecureStore, then also an in-memory cache) and skip straight to
// connecting on later prints. In practice that made the second print in a
// row unreliable - the user reported prints failing/getting stuck after the
// very first successful one. Per explicit user request, every print now
// always re-scans for paired devices and always requires an explicit tap on
// the printer (even when there is exactly one paired device) before
// connecting, so every print gets a deliberate, fresh connection attempt
// instead of reusing a potentially stale cached address.

import { Linking, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native'
import { BluetoothStateManager, ThermalPrinter } from '@finan-me/react-native-thermal-printer'
import { logPrintEvent } from '../utils/printDiagnostics'

// Custom event emitted by our own native patch (see
// patches/@finan-me+react-native-thermal-printer+*.patch) from inside the
// chunked Bluetooth send loop, so the UI can show a real transfer
// percentage instead of one opaque "printing..." spinner for the whole
// (potentially tens-of-KB) receipt image.
const EVENT_PRINT_TRANSFER_PROGRESS = 'EVENT_PRINT_TRANSFER_PROGRESS'
const printerEventEmitter = new NativeEventEmitter(NativeModules.RNThermalPrinter)

// The PT-210 is commonly marketed as "58mm paper" with a ~48mm/384-dot
// printable width - that is normal for this printer class (paper roll width
// and printable width are different numbers). The library's paperWidthMm
// option only accepts discrete presets (32 | 58 | 80), so 58 is correct here,
// not 48.
export const PT210_PRINTER_OPTIONS = {
  paperWidthMm: 58,
  encoding: 'UTF8',
  marginMm: 0,
}

// Same value as the existing test-connection retry delay below - both exist
// for the identical documented reason (SPP sockets on some printers/phones
// need a moment to fully release after a socket closes).
const CONNECTION_SETTLE_MS = 900

export const PrinterReason = {
  PERMISSION_DENIED: 'permission_denied',
  PERMISSION_PERMANENTLY_DENIED: 'permission_permanently_denied',
  BLUETOOTH_DISABLED: 'bluetooth_disabled',
  NO_PAIRED_PRINTER: 'no_paired_printer',
  SELECT_PRINTER: 'select_printer',
  CONNECTION_FAILED: 'connection_failed',
  PRINT_FAILED: 'print_failed',
  UNKNOWN: 'unknown',
}

export class ThermalPrinterError extends Error {
  constructor(reason, message, extra = {}) {
    super(message)
    this.name = 'ThermalPrinterError'
    this.reason = reason
    Object.assign(this, extra)
  }
}

function noop() {}

async function requestBluetoothPermission() {
  if (Platform.OS !== 'android') {
    return { granted: true, permanentlyDenied: false }
  }

  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ])

    const granted = (
      results['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED
      && results['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
    )

    const permanentlyDenied = Object.values(results).some(
      (value) => value === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    )

    return { granted, permanentlyDenied }
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)

  return {
    granted: result === PermissionsAndroid.RESULTS.GRANTED,
    permanentlyDenied: result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
  }
}

export async function ensureBluetoothPermission() {
  const { granted, permanentlyDenied } = await requestBluetoothPermission()

  if (granted) {
    return true
  }

  throw new ThermalPrinterError(
    permanentlyDenied ? PrinterReason.PERMISSION_PERMANENTLY_DENIED : PrinterReason.PERMISSION_DENIED,
    'Bluetooth permission is required to print.',
  )
}

// Verifies the Bluetooth radio itself is actually on (separate from app
// permission - a phone can grant the permission once and then have
// Bluetooth toggled off later). On Android, BluetoothStateManager.enable()
// shows the system "Turn on Bluetooth?" dialog directly, so a user who
// turned it off between prints gets prompted right here instead of a
// confusing downstream "connection failed" error.
export async function ensureBluetoothEnabled() {
  if (Platform.OS !== 'android') {
    return true
  }

  let state
  try {
    state = await BluetoothStateManager.getState()
  } catch {
    // If the state check itself fails, don't block printing on it - let the
    // real connect attempt surface the actual problem instead.
    return true
  }

  if (state === 'PoweredOn') {
    return true
  }

  try {
    await BluetoothStateManager.enable()
    state = await BluetoothStateManager.getState()
  } catch {
    // enable() can throw if the user dismisses the system dialog - fall
    // through to the state re-check below either way.
  }

  if (state === 'PoweredOn') {
    return true
  }

  throw new ThermalPrinterError(
    PrinterReason.BLUETOOTH_DISABLED,
    'Bluetooth is turned off. Turn it on to print.',
  )
}

export function openAppSettings() {
  return Linking.openSettings()
}

function toBluetoothAddress(macAddress) {
  return macAddress.startsWith('bt:') ? macAddress : `bt:${macAddress}`
}

function parseDeviceListPayload(raw) {
  if (!raw) {
    return []
  }

  if (Array.isArray(raw)) {
    return raw
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Lists OS-paired ("bonded") Bluetooth devices only - we never do live
// discovery of unpaired devices. The user pairs the PT-210 once from
// Android's own Bluetooth settings (same requirement RawBT had), and this
// service only needs to know which already-paired device is "the printer".
//
// IMPORTANT: `ThermalPrinter.scanDevices()` does NOT resolve with the paired
// device list, despite its TS type suggesting `Promise<{paired, found}>`.
// The native side (BluetoothDiscovery.kt) resolves that promise with just
// `{ success, error }` and instead emits the actual bonded-device list
// asynchronously via the `EVENT_DEVICE_ALREADY_PAIRED` event (fired right
// after reading `BluetoothAdapter.bondedDevices`, before any live discovery
// even starts). Trusting the promise return value here always produced an
// empty list, which is why every print attempt hit "no paired printer" even
// with the PT-210 correctly paired in Android Bluetooth settings. Fixed by
// listening for that event (with `EVENT_DEVICE_DISCOVER_DONE` and a timeout
// as fallbacks) instead of reading the promise result.
export function listPairedDevices() {
  return new Promise((resolve) => {
    let settled = false
    const subscriptions = []

    const cleanup = () => {
      subscriptions.forEach((sub) => sub?.remove())
      ThermalPrinter.stopScanDevices?.().catch(() => {})
    }

    const finish = (devices) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(devices)
    }

    subscriptions.push(
      ThermalPrinter.addDiscoveryEventListener(
        ThermalPrinter.EVENT_DEVICE_ALREADY_PAIRED,
        (data) => finish(parseDeviceListPayload(data?.devices)),
      ),
    )
    subscriptions.push(
      ThermalPrinter.addDiscoveryEventListener(
        ThermalPrinter.EVENT_DEVICE_DISCOVER_DONE,
        (data) => finish(parseDeviceListPayload(data?.paired)),
      ),
    )
    subscriptions.push(
      ThermalPrinter.addDiscoveryEventListener(
        ThermalPrinter.EVENT_BLUETOOTH_NOT_SUPPORT,
        () => finish([]),
      ),
    )

    // Kick off the native scan - this is what triggers the events above.
    // A discovery-start failure (e.g. live-scan permission/location issue)
    // does not matter for us: the paired-device event already fires before
    // that failure is even possible, since bonded devices are read first.
    ThermalPrinter.scanDevices().catch(() => {})

    // Safety net in case no event ever arrives (older library version,
    // unexpected native behavior, etc.) so the UI never hangs forever.
    setTimeout(() => finish([]), 6000)
  })
}

// Always lists paired devices and requires an explicit tap on the printer
// to use for this job - even when exactly one is paired - so every print
// gets a deliberate, fresh connection attempt instead of silently reusing a
// remembered address (see the file-level comment for why this changed).
export async function resolvePrinterAddress() {
  const paired = await listPairedDevices()

  if (paired.length === 0) {
    throw new ThermalPrinterError(
      PrinterReason.NO_PAIRED_PRINTER,
      'No paired Bluetooth printer found. Pair the PT-210 in Android Bluetooth settings first.',
    )
  }

  throw new ThermalPrinterError(
    PrinterReason.SELECT_PRINTER,
    'Select which paired device is the printer.',
    { devices: paired },
  )
}

// Full connect + print pipeline used by the real "Thermique" button.
// `documentBuilder` returns (or resolves to, since it may be async - e.g.
// capturing a receipt image via react-native-view-shot, see
// src/utils/thermalReceiptImage.js) the @finan-me document content array.
// `onStage` is called with one of:
// 'permission' | 'bluetooth' | 'locating' | 'connecting' | 'rendering' | 'printing' | 'done'
// `onProgress(percent)` is called with a 0-100 whole-number transfer
// percentage while the receipt image is actually being sent (stage
// 'printing') - see the native EVENT_PRINT_TRANSFER_PROGRESS wiring below.
export async function printThermalDocument(documentBuilder, { onStage = noop, onProgress = noop, macAddress } = {}) {
  const startedAt = Date.now()
  const elapsed = () => Date.now() - startedAt

  logPrintEvent('print_start', { cachedAddress: !!macAddress })

  try {
    onStage('permission')
    await ensureBluetoothPermission()
    logPrintEvent('permission_ok', { ms: elapsed() })

    onStage('bluetooth')
    await ensureBluetoothEnabled()
    logPrintEvent('bluetooth_ok', { ms: elapsed() })

    onStage('locating')
    const address = macAddress || await resolvePrinterAddress()
    logPrintEvent('address_resolved', { address, ms: elapsed() })

    onStage('connecting')
    // Classic Bluetooth (SPP) sockets on some printers/phones take a moment
    // to fully release right after the previous print job disconnects, which
    // can make the very next print's connection attempt fail transiently.
    // One short automatic retry covers that common case instead of surfacing
    // a scary error (and forcing the user to try again manually) for what is
    // really just a "give it a second" race condition.
    const btAddress = toBluetoothAddress(address)
    let testResult
    let lastError = null

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        testResult = await ThermalPrinter.testConnection(btAddress)
        lastError = null
      } catch (error) {
        lastError = error
        testResult = null
      }

      logPrintEvent('test_connection_attempt', {
        attempt,
        success: !!testResult?.success,
        error: lastError?.message || testResult?.error?.message || null,
        ms: elapsed(),
      })

      if (testResult?.success) {
        break
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 900))
      }
    }

    if (lastError) {
      throw new ThermalPrinterError(
        PrinterReason.CONNECTION_FAILED,
        lastError?.message || 'Could not reach the printer.',
        { code: lastError?.code },
      )
    }

    if (!testResult?.success) {
      throw new ThermalPrinterError(
        PrinterReason.CONNECTION_FAILED,
        testResult?.error?.message || 'Could not reach the printer.',
        { code: testResult?.error?.code, suggestion: testResult?.error?.suggestion, retryable: testResult?.error?.retryable },
      )
    }

    logPrintEvent('connection_ok', { ms: elapsed() })
    const testConnectionClosedAt = Date.now()

    onStage('rendering')
    const document = await documentBuilder()
    logPrintEvent('rendering_done', { ms: elapsed() })

    // IMPORTANT: testConnection() above opens and immediately closes its own
    // throwaway socket just to confirm the printer is reachable before we
    // spend time rendering - it shares no connection with the real print
    // below, which opens a brand-new socket to the same address moments
    // later. Rendering usually takes long enough on its own to cover the
    // "moment to fully release" window noted above, but a short/simple
    // receipt on a fast device can render in well under that time, landing
    // the real connect attempt inside that same window. Make the minimum
    // gap explicit instead of hoping rendering happened to take long enough.
    const settleRemainingMs = CONNECTION_SETTLE_MS - (Date.now() - testConnectionClosedAt)
    if (settleRemainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, settleRemainingMs))
    }
    logPrintEvent('connection_settled', { waitedMs: Math.max(0, settleRemainingMs), ms: elapsed() })

    onStage('printing')
    onProgress(0)
    const job = {
      printers: [{ address: btAddress, options: PT210_PRINTER_OPTIONS }],
      documents: [document],
    }

    // Listen for our own patched-in native progress events for the duration
    // of this transfer only - always removed in `finally` so we never leak
    // a listener across print attempts. Every event is logged (not just
    // shown as a %) so that if a transfer stalls, the diagnostic log shows
    // exactly the last byte count reached and how long ago, instead of just
    // a frozen percentage with no further information.
    let lastLoggedPercent = -1
    const progressSubscription = printerEventEmitter.addListener(
      EVENT_PRINT_TRANSFER_PROGRESS,
      (payload) => {
        const sent = Number(payload?.sent) || 0
        const total = Number(payload?.total) || 0
        const percent = total > 0 ? Math.round((sent / total) * 100) : 0
        onProgress(percent)
        if (percent !== lastLoggedPercent) {
          lastLoggedPercent = percent
          logPrintEvent('transfer_progress', { sent, total, percent, ms: elapsed() })
        }
      },
    )

    let result
    try {
      try {
        result = await ThermalPrinter.printReceipt(job)
      } catch (error) {
        throw new ThermalPrinterError(
          PrinterReason.PRINT_FAILED,
          error?.message || 'Printing failed.',
          { code: error?.code },
        )
      }

      if (result && result.success === false) {
        // IMPORTANT (2026-07-08, corrected 2026-07-10): this used to always
        // throw the flat literal "Printing failed." here, discarding
        // whatever specific error the native side actually returned in
        // `result.results`. A same-day fix tried to read the first failing
        // entry out of `result.results`, but assumed it was a plain array -
        // the library's actual TS types (`MultiPrinterResult.results:
        // Map<string, PrinterResult>`) and its real JS implementation
        // (`printer.ts`'s handler functions all build a `new Map()`) return
        // a genuine `Map`, not an array. `Array.isArray(Map)` is always
        // `false`, so that fix silently never actually ran and every native
        // failure kept surfacing as the same flat "Printing failed." - a
        // real repro log confirmed this exactly (code=undefined step=
        // undefined suggestion=undefined on a real device failure after
        // this "fix" had already shipped). Each Map value is a
        // `PrinterResult` whose `error` is a real `PrintError` (has
        // message/code/step/suggestion/retryable) - read it from the Map's
        // values instead.
        const resultEntries = result.results instanceof Map
          ? Array.from(result.results.values())
          : (Array.isArray(result.results) ? result.results : [])
        const failedEntry = resultEntries.find((entry) => entry?.success === false)
        const nativeError = failedEntry?.error

        throw new ThermalPrinterError(
          PrinterReason.PRINT_FAILED,
          nativeError?.message || 'Printing failed.',
          {
            code: nativeError?.code,
            suggestion: nativeError?.suggestion,
            step: nativeError?.step,
            retryable: nativeError?.retryable,
            results: result.results,
          },
        )
      }
    } finally {
      progressSubscription.remove()
    }

    onProgress(100)
    onStage('done')
    logPrintEvent('print_success', { ms: elapsed() })
    return result
  } catch (error) {
    logPrintEvent('print_error', {
      reason: error?.reason || 'unknown',
      message: error?.message || String(error),
      code: error?.code,
      step: error?.step,
      suggestion: error?.suggestion,
      ms: elapsed(),
    })
    throw error
  }
}
