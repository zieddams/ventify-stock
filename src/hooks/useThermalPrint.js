// Shared print-flow state machine used by both InvoiceDetailScreen and
// InvoicesScreen for the real "Thermique" action. Centralizes: stage
// tracking (permission/locating/connecting/printing), the
// permission-denied / no-paired-printer / choose-a-printer error reactions,
// and the inline printer-selection chooser - so both screens behave
// identically instead of re-implementing the same retry logic twice.
//
// The chooser now appears on every single print (not just when multiple
// devices are paired) - the printer address is never remembered/cached
// between prints anymore, by explicit user request, so every print always
// re-scans and requires an explicit tap to establish a fresh connection.

import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import {
  PrinterReason,
  ThermalPrinterError,
  openAppSettings,
  printThermalDocument,
} from '../services/thermalPrinter'

// Builds the alert body for a real print/connection failure: the actual
// native error detail (now correctly extracted - see thermalPrinter.js's
// Map/Array fix), then the library's own per-error-code suggestion when it
// has one (e.g. "Pair the printer in Bluetooth settings first" - native-side
// text, not localized, same as the error message itself), then a translated
// general checklist so there's always something actionable in the user's
// own language even when the specific error has no suggestion attached.
function buildFailureBody(tScope, error) {
  const lines = [error.message || tScope('retry')]
  if (error.suggestion && error.suggestion !== error.message) {
    lines.push(error.suggestion)
  }
  lines.push(tScope('thermalTroubleshootingHint'))
  return lines.join('\n\n')
}

// Offers a direct "Retry" action for errors the library itself flags as
// retryable (timeouts, dropped connections, printer temporarily offline -
// see PrintError.isRetryable() in the library) instead of forcing the user
// to find the print button again. Reuses the same already-confirmed printer
// address rather than re-showing the device picker: the address isn't what
// failed here (the earlier test_connection already succeeded on it), so
// re-asking "which printer" would be a confusing, pointless extra step.
function buildFailureButtons(tScope, error, onRetry) {
  if (!error.retryable) {
    return undefined
  }

  return [
    { text: tScope('thermalCancelAction'), style: 'cancel' },
    { text: tScope('thermalRetryAction'), onPress: onRetry },
  ]
}

// `tScope` maps a short key ('thermalStagePermission', 'thermalPermissionTitle', ...)
// to the caller's already-namespaced i18n lookup, e.g. (key) => t(`invoiceDetail.${key}`)
export function useThermalPrint(tScope) {
  const [printing, setPrinting] = useState(false)
  const [stage, setStage] = useState(null)
  const [progressPercent, setProgressPercent] = useState(null)
  const [chooserDevices, setChooserDevices] = useState(null)
  const [pendingDocumentBuilder, setPendingDocumentBuilder] = useState(null)

  const stageLabel = {
    permission: tScope('thermalStagePermission'),
    bluetooth: tScope('thermalStageBluetooth'),
    locating: tScope('thermalStageLocating'),
    connecting: tScope('thermalStageConnecting'),
    rendering: tScope('thermalStageRendering'),
    printing: tScope('thermalStagePrinting'),
  }[stage] ?? null

  const run = useCallback(async (documentBuilder, macAddress) => {
    setPrinting(true)
    setStage(null)
    setProgressPercent(null)

    try {
      await printThermalDocument(documentBuilder, {
        macAddress,
        onStage: (nextStage) => setStage(nextStage),
        onProgress: (percent) => setProgressPercent(percent),
      })
      return true
    } catch (error) {
      if (error instanceof ThermalPrinterError) {
        if (error.reason === PrinterReason.PERMISSION_PERMANENTLY_DENIED) {
          Alert.alert(tScope('thermalPermissionTitle'), tScope('thermalPermissionText'), [
            { text: tScope('thermalCancelAction'), style: 'cancel' },
            { text: tScope('thermalPermissionSettingsAction'), onPress: () => openAppSettings() },
          ])
          return false
        }

        if (error.reason === PrinterReason.PERMISSION_DENIED) {
          Alert.alert(tScope('thermalPermissionTitle'), tScope('thermalPermissionText'), [
            { text: tScope('thermalCancelAction'), style: 'cancel' },
            { text: tScope('thermalPermissionRetryAction'), onPress: () => run(documentBuilder, macAddress) },
          ])
          return false
        }

        if (error.reason === PrinterReason.BLUETOOTH_DISABLED) {
          Alert.alert(tScope('thermalBluetoothOffTitle'), tScope('thermalBluetoothOffText'), [
            { text: tScope('thermalCancelAction'), style: 'cancel' },
            { text: tScope('thermalPermissionRetryAction'), onPress: () => run(documentBuilder, macAddress) },
          ])
          return false
        }

        if (error.reason === PrinterReason.NO_PAIRED_PRINTER) {
          Alert.alert(tScope('thermalNoPrinterTitle'), tScope('thermalNoPrinterText'))
          return false
        }

        if (error.reason === PrinterReason.SELECT_PRINTER) {
          setPendingDocumentBuilder(() => documentBuilder)
          setChooserDevices(error.devices ?? [])
          return false
        }

        Alert.alert(tScope('thermalErrorTitle'), buildFailureBody(tScope, error), buildFailureButtons(tScope, error, () => run(documentBuilder, macAddress)))
        return false
      }

      Alert.alert(tScope('thermalErrorTitle'), buildFailureBody(tScope, error), buildFailureButtons(tScope, error, () => run(documentBuilder, macAddress)))
      return false
    } finally {
      setPrinting(false)
      setStage(null)
      setProgressPercent(null)
    }
  }, [tScope])

  const chooseDevice = useCallback(async (address) => {
    setChooserDevices(null)
    const builder = pendingDocumentBuilder
    setPendingDocumentBuilder(null)
    if (builder) {
      await run(builder, address)
    }
  }, [pendingDocumentBuilder, run])

  const dismissChooser = useCallback(() => {
    setChooserDevices(null)
    setPendingDocumentBuilder(null)
  }, [])

  return { printing, stage, stageLabel, progressPercent, chooserDevices, run, chooseDevice, dismissChooser }
}
