// Full-screen printing overlay shown for the entire duration of a thermal
// print job (permission -> bluetooth -> locating -> connecting -> rendering
// -> printing -> done), shared by InvoiceDetailScreen and InvoicesScreen.
//
// WHY THIS EXISTS: the old UI only showed a tiny spinner + one-line stage
// label inside the print button itself. The user asked for a proper
// "printing" loading screen with a real transfer percentage and more detail
// (similar to how the old RawBT app surfaced print progress), instead of one
// opaque spinner for the whole job - especially useful now that a full
// receipt image transfer can take several seconds on Bluetooth Classic.
//
// The percentage is only meaningful during the 'printing' stage (it comes
// from the native chunked-send progress event - see
// src/services/thermalPrinter.js and the patch-package native patch). Every
// earlier stage shows an indeterminate spinner instead, since there is
// nothing to measure a percentage against yet.

import { Modal, StyleSheet, Text, View } from 'react-native'
import { ActivityIndicator } from 'react-native'
import { T } from '../../theme'

export default function ThermalPrintProgressModal({
  visible,
  title,
  stage,
  stageLabel,
  progressPercent,
  deviceHint,
}) {
  const hasPercent = stage === 'printing' && typeof progressPercent === 'number' && progressPercent >= 0
  const percent = hasPercent ? Math.max(0, Math.min(100, Math.round(progressPercent))) : null

  return (
    <Modal visible={!!visible} transparent animationType="fade" statusBarTranslucent>
      <View style={st.backdrop}>
        <View style={st.card}>
          {percent === null ? (
            <ActivityIndicator size="large" color={T.primary} />
          ) : (
            <View style={st.percentWrap}>
              <Text style={st.percentText}>{percent}%</Text>
            </View>
          )}

          {!!title && <Text style={st.title}>{title}</Text>}
          {!!stageLabel && <Text style={st.stage}>{stageLabel}</Text>}

          {percent !== null && (
            <View style={st.barTrack}>
              <View style={[st.barFill, { width: `${percent}%` }]} />
            </View>
          )}

          {!!deviceHint && <Text style={st.hint}>{deviceHint}</Text>}
        </View>
      </View>
    </Modal>
  )
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: T.surface,
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  percentWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: T.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  percentText: {
    fontSize: 22,
    fontWeight: '800',
    color: T.primaryDark,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: T.text,
    textAlign: 'center',
    marginTop: 6,
  },
  stage: {
    fontSize: 14,
    color: T.textSecondary,
    textAlign: 'center',
  },
  barTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: T.border,
    overflow: 'hidden',
    marginTop: 6,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: T.primary,
  },
  hint: {
    fontSize: 12,
    color: T.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
})
