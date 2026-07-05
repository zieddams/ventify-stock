// Production Bluetooth thermal-printer service - replaces the old
// expo-print + Sharing(RawBT) pipeline for the "Thermique" action.
//
// Design goals (see docs/thermal-printer-integration-plan.md for the full
// history/decisions):
// - Single static printer profile (GOOJPRT PT-210, 58mm paper-width preset).
// - The paired MAC address is chosen once and remembered (SecureStore),
//   mirroring the token/user storage pattern already used in api.js.
// - Every call surfaces a "stage" callback so the UI can show
//   permission/scan/connect/print progress instead of one opaque spinner.
// - Verbose native errors are normalized into a small set of reasons the UI
//   can react to directly (permission missing, no paired printer, printer
//   unreachable, print failed) instead of leaking raw ESC/POS/driver text.

import { Linking, PermissionsAndroid, Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { ThermalPrinter } from '@finan-me/react-native-thermal-printer'

const PRINTER_ADDRESS_KEY = 'irtiwaa_thermal_printer_address'

// The PT-210 is commonly marketed as "58mm paper" with a ~48mm/384-dot
// printable width - that is normal for this printer class (paper roll width
// and printable width are different numbers). The library's paperWidthMm
// option only accepts discrete presets (32 | 58 | 80), so 58 is correct here,
// not 48.
export const PT210_PRINTER_OPTIONS = {
  paperWidthMm: 58,
  encoding: 'UTF8',
  marginMm: 1,
}

export const PrinterReason = {
  PERMISSION_DENIED: 'permission_denied',
  PERMISSION_PERMANENTLY_DENIED: 'permission_permanently_denied',
  NO_PAIRED_PRINTER: 'no_paired_printer',
  MULTIPLE_PAIRED_DEVICES: 'multiple_paired_devices',
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

export function openAppSettings() {
  return Linking.openSettings()
}

export async function getStoredPrinterAddress() {
  return SecureStore.getItemAsync(PRINTER_ADDRESS_KEY)
}

export async function savePrinterAddress(macAddress) {
  await SecureStore.setItemAsync(PRINTER_ADDRESS_KEY, macAddress)
}

export async function clearStoredPrinterAddress() {
  await SecureStore.deleteItemAsync(PRINTER_ADDRESS_KEY)
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

// Resolves which printer address to use for this print job:
// - a previously saved address is reused directly (the "static config"),
// - otherwise, if exactly one paired device is available it is adopted and
//   remembered automatically (no settings screen needed for the common case
//   of a single dedicated printer),
// - otherwise (0 or 2+ candidates) this throws so the UI can react (prompt
//   the user to pair the printer, or show a lightweight inline chooser).
export async function resolvePrinterAddress() {
  const stored = await getStoredPrinterAddress()
  if (stored) {
    return stored
  }

  const paired = await listPairedDevices()

  if (paired.length === 0) {
    throw new ThermalPrinterError(
      PrinterReason.NO_PAIRED_PRINTER,
      'No paired Bluetooth printer found. Pair the PT-210 in Android Bluetooth settings first.',
    )
  }

  if (paired.length === 1) {
    await savePrinterAddress(paired[0].address)
    return paired[0].address
  }

  throw new ThermalPrinterError(
    PrinterReason.MULTIPLE_PAIRED_DEVICES,
    'Multiple paired Bluetooth devices found - choose which one is the printer.',
    { devices: paired },
  )
}

// Full connect + print pipeline used by the real "Thermique" button.
// `documentBuilder` returns the @finan-me document content array (see
// src/utils/thermalReceipt.js). `onStage` is called with one of:
// 'permission' | 'locating' | 'connecting' | 'printing' | 'done'
export async function printThermalDocument(documentBuilder, { onStage = noop, macAddress } = {}) {
  onStage('permission')
  await ensureBluetoothPermission()

  onStage('locating')
  const address = macAddress || await resolvePrinterAddress()

  onStage('connecting')
  let testResult
  try {
    testResult = await ThermalPrinter.testConnection(toBluetoothAddress(address))
  } catch (error) {
    throw new ThermalPrinterError(
      PrinterReason.CONNECTION_FAILED,
      error?.message || 'Could not reach the printer.',
      { code: error?.code },
    )
  }

  if (!testResult?.success) {
    throw new ThermalPrinterError(
      PrinterReason.CONNECTION_FAILED,
      testResult?.error?.message || 'Could not reach the printer.',
      { code: testResult?.error?.code, suggestion: testResult?.error?.suggestion },
    )
  }

  onStage('printing')
  const document = documentBuilder()

  const job = {
    printers: [{ address: toBluetoothAddress(address), options: PT210_PRINTER_OPTIONS }],
    documents: [document],
  }

  let result
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
    throw new ThermalPrinterError(
      PrinterReason.PRINT_FAILED,
      'Printing failed.',
      { results: result.results },
    )
  }

  onStage('done')
  return result
}
