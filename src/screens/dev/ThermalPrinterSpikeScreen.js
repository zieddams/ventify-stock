// PHASE 0 SPIKE SCREEN - throwaway, not part of the real invoice/print flow.
//
// Purpose: let you (developer role only) manually validate, on your actual
// Infinix phone against your actual GOOJPRT PT-210, that
// @finan-me/react-native-thermal-printer can list paired devices, connect,
// and print a raw ESC/POS test slip - before any of Phases 1-5 in
// docs/thermal-printer-integration-plan.md are built.
//
// Deliberately verbose: every state/error is shown directly on screen so you
// can read it during manual testing. Hidden-log design is a Phase 1+ concern.

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import PageHeader from '../../components/PageHeader'
import StatusChip from '../../components/StatusChip'
import { T, cardShadow } from '../../theme'
import {
  printSpikeTestSlip,
  requestBluetoothPermissions,
  scanPairedDevices,
  subscribeToConnectionState,
  testPrinterConnection,
} from '../../services/thermalPrinterSpike'

function toneForStatus(status) {
  if (status === 'connected') return 'success'
  if (status === 'connecting') return 'warning'
  if (status === 'error') return 'danger'
  return 'neutral'
}

export default function ThermalPrinterSpikeScreen() {
  const [permissionOk, setPermissionOk] = useState(null)
  const [devices, setDevices] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('idle')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])

  const appendLog = useCallback((line) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 40))
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToConnectionState((data) => {
      appendLog(`event: ${JSON.stringify(data)}`)
      if (data?.address === selectedAddress) {
        setConnectionStatus(data?.state ?? 'idle')
      }
    })

    return unsubscribe
  }, [appendLog, selectedAddress])

  const handleRequestPermissions = async () => {
    setBusy(true)
    try {
      const ok = await requestBluetoothPermissions()
      setPermissionOk(ok)
      appendLog(`permissions granted: ${ok}`)
    } catch (error) {
      appendLog(`permission request failed: ${error?.message ?? String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleScan = async () => {
    setLoadingDevices(true)
    try {
      const paired = await scanPairedDevices()
      setDevices(paired)
      appendLog(`paired devices found: ${paired.length}`)
    } catch (error) {
      appendLog(`scanPairedDevices failed: ${error?.message ?? String(error)}`)
    } finally {
      setLoadingDevices(false)
    }
  }

  const handleTestConnection = async (address) => {
    setSelectedAddress(address)
    setConnectionStatus('connecting')
    setBusy(true)
    try {
      const result = await testPrinterConnection(address)
      appendLog(`testConnection result: ${JSON.stringify(result)}`)
      setConnectionStatus(result?.success ? 'connected' : 'error')
    } catch (error) {
      appendLog(`testConnection threw: ${error?.code ?? ''} ${error?.message ?? String(error)}`)
      setConnectionStatus('error')
    } finally {
      setBusy(false)
    }
  }

  const handleTestPrint = async () => {
    if (!selectedAddress) return
    setBusy(true)
    try {
      const result = await printSpikeTestSlip(selectedAddress)
      appendLog(`printReceipt result: ${JSON.stringify(result)}`)
    } catch (error) {
      appendLog(`printReceipt threw: ${error?.code ?? ''} ${error?.message ?? String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <PageHeader
        title="Printer spike (dev only)"
        subtitle="Phase 0 - validate the PT-210 directly, outside RawBT"
      />

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>1. Bluetooth permissions</Text>
        <TouchableOpacity style={s.button} onPress={handleRequestPermissions} disabled={busy}>
          <Text style={s.buttonText}>Request permissions</Text>
        </TouchableOpacity>
        {permissionOk !== null ? (
          <StatusChip label={permissionOk ? 'Granted' : 'Denied'} tone={permissionOk ? 'success' : 'danger'} />
        ) : null}
      </View>

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>2. Paired devices</Text>
        <Text style={s.cardText}>
          Pair the PT-210 from Android's own Bluetooth settings first - this screen only lists
          already-paired ("bonded") devices, it does not do live discovery.
        </Text>
        <TouchableOpacity style={s.button} onPress={handleScan} disabled={busy}>
          {loadingDevices ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>List paired devices</Text>}
        </TouchableOpacity>
        {devices.map((device) => (
          <TouchableOpacity
            key={device.address}
            style={[s.deviceRow, selectedAddress === device.address && s.deviceRowSelected]}
            onPress={() => handleTestConnection(device.address)}
            disabled={busy}
          >
            <Text style={s.deviceName}>{device.name || '(unnamed)'}</Text>
            <Text style={s.deviceAddress}>{device.address}</Text>
          </TouchableOpacity>
        ))}
        {!devices.length ? <Text style={s.cardText}>No paired devices listed yet.</Text> : null}
      </View>

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>3. Connection status</Text>
        <StatusChip label={connectionStatus} tone={toneForStatus(connectionStatus)} />
        <Text style={s.cardText}>{selectedAddress || 'No device selected'}</Text>
      </View>

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>4. Test print</Text>
        <TouchableOpacity
          style={[s.button, !selectedAddress && s.buttonDisabled]}
          onPress={handleTestPrint}
          disabled={busy || !selectedAddress}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Print ESC/POS test slip</Text>}
        </TouchableOpacity>
      </View>

      <View style={[s.card, cardShadow]}>
        <Text style={s.cardTitle}>Raw log (this screen only - not the production hidden-log design)</Text>
        {log.map((line, index) => (
          <Text key={index} style={s.logLine}>{line}</Text>
        ))}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: T.surface,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: T.text,
  },
  cardText: {
    fontSize: 12,
    color: T.textMuted,
  },
  button: {
    backgroundColor: T.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  deviceRow: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    padding: 10,
  },
  deviceRowSelected: {
    borderColor: T.primary,
    backgroundColor: T.surfaceAlt,
  },
  deviceName: {
    fontSize: 13,
    fontWeight: '700',
    color: T.text,
  },
  deviceAddress: {
    fontSize: 11,
    color: T.textMuted,
  },
  logLine: {
    fontSize: 10,
    color: T.textMuted,
    fontFamily: 'monospace',
  },
})
