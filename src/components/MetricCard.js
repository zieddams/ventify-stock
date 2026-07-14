import { MaterialCommunityIcons } from '@expo/vector-icons'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { T, cardShadow } from '../theme'

export default function MetricCard({ label, value, hint, icon = 'chart-box', color = T.primary, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.75 } : {}

  return (
    <Wrapper style={[s.card, cardShadow]} {...wrapperProps}>
      <View style={s.topRow}>
        <View style={[s.iconWrap, { backgroundColor: `${color}18` }]}>
          <MaterialCommunityIcons name={icon} size={20} color={color} />
        </View>
        {!!onPress && <MaterialCommunityIcons name="chevron-right" size={20} color={T.textMuted} />}
      </View>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, { color }]}>{value}</Text>
      {!!hint && <Text style={s.hint}>{hint}</Text>}
    </Wrapper>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    color: T.textMuted,
    marginBottom: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: T.textSecondary,
  },
})

