// PHASE 0 SPIKE - throwaway validation code, not wired into real invoice printing yet.
//
// Goal: confirm @finan-me/react-native-thermal-printer can pair-list, connect to,
// and print a raw ESC/POS test slip on the GOOJPRT PT-210 from this actual app
// build, before any real invoice/UI work happens. See
// docs/thermal-printer-integration-plan.md for the full phased plan.
//
// This module is intentionally verbose (logs everything) - Phase 0 is a
// diagnostic tool for you to read directly, not the hidden-log production
// design from later phases.

import { PermissionsAndroid, Platform } from 'react-native'
import { ThermalPrinter } from '@finan-me/react-native-thermal-printer'

// The PT-210 is commonly marketed as "58mm paper" with a ~48mm/384-dot
// printable width (this is normal for this printer class - paper roll width
// and printable width are different numbers). The library's paperWidthMm
// option only accepts 32 | 58 | 80, so 58 is the correct preset here, not 48.
export const PT210_PRINTER_OPTIONS = {
  paperWidthMm: 58,
  encoding: 'UTF8',
  marginMm: 1,
}

export async function requestBluetoothPermissions() {
  if (Platform.OS !== 'android') {
    return true
  }

  if (Platform.Version >= 31) {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ])

    return (
      granted['android.permission.BLUETOOTH_SCAN'] === 'granted'
      && granted['android.permission.BLUETOOTH_CONNECT'] === 'granted'
    )
  }

  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
  return granted === PermissionsAndroid.RESULTS.GRANTED
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

// Returns the OS-paired ("bonded") devices only. We deliberately do not surface
// live-discovery ("found") results in the real settings screen later - the user
// pairs the PT-210 once via Android's own Bluetooth settings (same requirement
// RawBT has today), and the app just lets them pick which paired device is
// "the printer".
//
// NOTE: ThermalPrinter.scanDevices() resolves with {success, error} only - the
// actual bonded-device list comes back via the EVENT_DEVICE_ALREADY_PAIRED
// event, not the promise result. See src/services/thermalPrinter.js for the
// full writeup of this library quirk (confirmed via native source).
export function scanPairedDevices() {
  return new Promise((resolve) => {
    let settled = false
    const subs = []
    const cleanup = () => {
      subs.forEach((sub) => sub?.remove())
      ThermalPrinter.stopScanDevices?.().catch(() => {})
    }
    const finish = (devices) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(devices)
    }
    subs.push(ThermalPrinter.addDiscoveryEventListener(
      ThermalPrinter.EVENT_DEVICE_ALREADY_PAIRED,
      (data) => finish(parseDeviceListPayload(data?.devices)),
    ))
    subs.push(ThermalPrinter.addDiscoveryEventListener(
      ThermalPrinter.EVENT_DEVICE_DISCOVER_DONE,
      (data) => finish(parseDeviceListPayload(data?.paired)),
    ))
    subs.push(ThermalPrinter.addDiscoveryEventListener(
      ThermalPrinter.EVENT_BLUETOOTH_NOT_SUPPORT,
      () => finish([]),
    ))
    ThermalPrinter.scanDevices().catch(() => {})
    setTimeout(() => finish([]), 6000)
  })
}

export function toBluetoothAddress(macAddress) {
  return `bt:${macAddress}`
}

export async function testPrinterConnection(macAddress) {
  // testConnection only takes the address - printer options (paper width,
  // encoding) are a printReceipt/job-time concern, not a connection-time one.
  return ThermalPrinter.testConnection(toBluetoothAddress(macAddress))
}

// Live connection status ('connecting' | 'connected' | 'disconnected') for the
// status pill in the real settings screen (Phase 2). Returns an unsubscribe fn.
export function subscribeToConnectionState(onChange) {
  const subscription = ThermalPrinter.addConnectionEventListener(
    ThermalPrinter.EVENT_CONNECTION_STATE_CHANGED,
    onChange,
  )

  return () => ThermalPrinter.removeConnectionEventListener(subscription)
}

export async function printSpikeTestSlip(macAddress) {
  const job = {
    printers: [
      {
        address: toBluetoothAddress(macAddress),
        options: PT210_PRINTER_OPTIONS,
      },
    ],
    documents: [
      [
        { type: 'text', content: 'EL IRTIWAA - TEST', style: { align: 'center', bold: true, size: 'double' } },
        { type: 'text', content: 'Phase 0 spike print', style: { align: 'center' } },
        { type: 'line' },
        { type: 'text', content: `Printed: ${new Date().toISOString()}` },
        { type: 'line' },
        {
          type: 'table',
          headers: ['Item', 'Qty', 'Price'],
          rows: [
            ['Sample product', '2', '10.000'],
            ['Another line', '1', '25.500'],
          ],
          columnWidths: [50, 20, 30],
          alignments: ['left', 'center', 'right'],
        },
        { type: 'line' },
        { type: 'text', content: 'TOTAL: 45.500', style: { bold: true } },
        { type: 'feed', lines: 3 },
        { type: 'cut' },
      ],
    ],
  }

  return ThermalPrinter.printReceipt(job)
}
