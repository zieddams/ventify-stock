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
  layout = 'inline',
}) {
  const numericValue = Number(value || 0)
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0
  const isStacked = layout === 'stacked'

  const applyDelta = (delta) => {
    const nextValue = Math.max(0, safeValue + delta)
    onChangeText?.(nextValue > 0 ? String(nextValue) : '')
  }

  const stepperNode = (
    <View style={[s.stepper, isStacked && s.stepperStacked]}>
      <TouchableOpacity
        style={[s.stepButton, isStacked && s.stepButtonStacked, disabled && s.stepButtonDisabled]}
        disabled={disabled || safeValue <= 0}
        onPress={() => applyDelta(-1)}
      >
        <MaterialCommunityIcons name="minus" size={16} color={disabled ? T.textMuted : T.textSecondary} />
      </TouchableOpacity>

      <TextInput
        style={[s.input, isStacked && s.inputStacked]}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={T.textMuted}
        value={value}
        editable={!disabled}
        onChangeText={onChangeText}
      />

      <TouchableOpacity
        style={[s.stepButton, isStacked && s.stepButtonStacked, disabled && s.stepButtonDisabled]}
        disabled={disabled}
        onPress={() => applyDelta(1)}
      >
        <MaterialCommunityIcons name="plus" size={16} color={disabled ? T.textMuted : T.primary} />
      </TouchableOpacity>
    </View>
  )

  return (
    <View style={[s.root, isStacked && s.rootStacked, disabled && s.rootDisabled]}>
      <View style={[s.primaryRow, isStacked && s.primaryRowStacked]}>
        <View style={s.iconWrap}>
          <MaterialCommunityIcons name={icon} size={18} color={iconColor} />
        </View>

        <View style={s.copy}>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          {!!subtitle && <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>}
          {!!helper && <Text style={s.helper} numberOfLines={2}>{helper}</Text>}
        </View>

        {!isStacked && stepperNode}
      </View>

      {isStacked && <View style={s.secondaryRow}>{stepperNode}</View>}
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
  rootStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  rootDisabled: {
    opacity: 0.6,
  },
  primaryRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryRowStacked: {
    alignItems: 'flex-start',
  },
  secondaryRow: {
    paddingLeft: 52,
    alignItems: 'flex-end',
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
  stepperStacked: {
    width: '100%',
    justifyContent: 'flex-end',
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
  stepButtonStacked: {
    width: 32,
    height: 32,
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
  inputStacked: {
    width: 72,
    height: 38,
  },
})
