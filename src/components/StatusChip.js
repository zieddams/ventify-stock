import { StyleSheet, Text, View } from 'react-native'
import { T } from '../theme'

const TONES = {
  neutral: { bg: T.surfaceAlt, color: T.textSecondary },
  success: { bg: '#dcfce7', color: T.success },
  warning: { bg: '#fef3c7', color: T.warning },
  danger: { bg: '#fee2e2', color: T.danger },
  info: { bg: '#dbeafe', color: T.info },
}

export default function StatusChip({ label, tone = 'neutral' }) {
  const style = TONES[tone] ?? TONES.neutral

  return (
    <View style={[s.root, { backgroundColor: style.bg }]}>
      <Text style={[s.label, { color: style.color }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
})

