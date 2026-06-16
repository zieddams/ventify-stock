import { MaterialCommunityIcons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { T, cardShadow } from '../theme'

export default function MetricCard({ label, value, hint, icon = 'chart-box', color = T.primary }) {
  return (
    <View style={[s.card, cardShadow]}>
      <View style={[s.iconWrap, { backgroundColor: `${color}18` }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, { color }]}>{value}</Text>
      {!!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: T.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  iconWrap: {
    alignSelf: 'flex-start',
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: T.textMuted,
    marginBottom: 6,
  },
  value: {
    fontSize: 19,
    fontWeight: '800',
  },
  hint: {
    marginTop: 6,
    fontSize: 11,
    color: T.textSecondary,
  },
})

