import { MaterialCommunityIcons } from '@expo/vector-icons'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { T } from '../theme'

export default function QuantityStepperField({
  title,
  subtitle,
  helper,
  icon = 'package-variant-closed',
  iconColor = T.primary,
  value = '',
  onChangeText,
  disabled = false,
}) {
  const numericValue = Number(value || 0)
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0

  const applyDelta = (delta) => {
    const nextValue = Math.max(0, safeValue + delta)
    onChangeText?.(nextValue > 0 ? String(nextValue) : '')
  }

  return (
    <View style={[s.root, disabled && s.rootDisabled]}>
      <View style={s.iconWrap}>
        <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
      </View>

      <View style={s.copy}>
        <Text style={s.title}>{title}</Text>
        {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
        {!!helper && <Text style={s.helper}>{helper}</Text>}
      </View>

      <View style={s.stepper}>
        <TouchableOpacity
          style={[s.stepButton, disabled && s.stepButtonDisabled]}
          disabled={disabled || safeValue <= 0}
          onPress={() => applyDelta(-1)}
        >
          <MaterialCommunityIcons name="minus" size={16} color={disabled ? T.textMuted : T.textSecondary} />
        </TouchableOpacity>

        <TextInput
          style={s.input}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={T.textMuted}
          value={value}
          editable={!disabled}
          onChangeText={onChangeText}
        />

        <TouchableOpacity
          style={[s.stepButton, disabled && s.stepButtonDisabled]}
          disabled={disabled}
          onPress={() => applyDelta(1)}
        >
          <MaterialCommunityIcons name="plus" size={16} color={disabled ? T.textMuted : T.primary} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    padding: 14,
  },
  rootDisabled: {
    opacity: 0.6,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7fb',
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: T.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: T.textMuted,
  },
  helper: {
    marginTop: 5,
    fontSize: 12,
    color: T.textSecondary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  stepButtonDisabled: {
    backgroundColor: '#f8fafc',
  },
  input: {
    width: 68,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
    color: T.text,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
})
