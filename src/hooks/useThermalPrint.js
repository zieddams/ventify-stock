// Shared print-flow state machine used by both InvoiceDetailScreen and
// InvoicesScreen for the real "Thermique" action. Centralizes: stage
// tracking (permission/locating/connecting/printing), the
// permission-denied / no-paired-printer / choose-a-printer error reactions,
// and the inline multi-device chooser - so both screens behave identically
// instead of re-implementing the same retry logic twice.

import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import {
  PrinterReason,
  ThermalPrinterError,
  openAppSettings,
  printThermalDocument,
  savePrinterAddress,
} from '../services/thermalPrinter'

// `tScope` maps a short key ('thermalStagePermission', 'thermalPermissionTitle', ...)
// to the caller's already-namespaced i18n lookup, e.g. (key) => t(`invoiceDetail.${key}`)
export function useThermalPrint(tScope) {
  const [printing, setPrinting] = useState(false)
  const [stage, setStage] = useState(null)
  const [chooserDevices, setChooserDevices] = useState(null)
  const [pendingDocumentBuilder, setPendingDocumentBuilder] = useState(null)

  const stageLabel = {
    permission: tScope('thermalStagePermission'),
    locating: tScope('thermalStageLocating'),
    connecting: tScope('thermalStageConnecting'),
    printing: tScope('thermalStagePrinting'),
  }[stage] ?? null

  const run = useCallback(async (documentBuilder, macAddress) => {
    setPrinting(true)
    setStage(null)

    try {
      await printThermalDocument(documentBuilder, {
        macAddress,
        onStage: (nextStage) => setStage(nextStage),
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

        if (error.reason === PrinterReason.NO_PAIRED_PRINTER) {
          Alert.alert(tScope('thermalNoPrinterTitle'), tScope('thermalNoPrinterText'))
          return false
        }

        if (error.reason === PrinterReason.MULTIPLE_PAIRED_DEVICES) {
          setPendingDocumentBuilder(() => documentBuilder)
          setChooserDevices(error.devices ?? [])
          return false
        }

        Alert.alert(tScope('thermalErrorTitle'), error.message || tScope('retry'))
        return false
      }

      Alert.alert(tScope('thermalErrorTitle'), error?.message || tScope('retry'))
      return false
    } finally {
      setPrinting(false)
      setStage(null)
    }
  }, [tScope])

  const chooseDevice = useCallback(async (address) => {
    setChooserDevices(null)
    await savePrinterAddress(address)
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

  return { printing, stage, stageLabel, chooserDevices, run, chooseDevice, dismissChooser }
}
