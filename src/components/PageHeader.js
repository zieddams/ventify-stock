import { MaterialCommunityIcons } from '@expo/vector-icons'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { T } from '../theme'

export default function PageHeader({ title, subtitle, actionIcon, actionLabel, onActionPress }) {
  return (
    <View style={s.root}>
      <View style={s.copy}>
        <Text style={s.title}>{title}</Text>
        {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </View>

      {(actionIcon || actionLabel) && (
        <TouchableOpacity style={s.action} onPress={onActionPress} activeOpacity={0.8}>
          {!!actionIcon && <MaterialCommunityIcons name={actionIcon} size={18} color={T.primary} />}
          {!!actionLabel && <Text style={s.actionLabel}>{actionLabel}</Text>}
        </TouchableOpacity>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: T.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: T.textMuted,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.primary,
  },
})

