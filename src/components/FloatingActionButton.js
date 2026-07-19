import { MaterialCommunityIcons } from '@expo/vector-icons'
import { StyleSheet, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { T, cardShadow } from '../theme'

export default function FloatingActionButton({ icon, onPress, disabled = false, bottom }) {
  const insets = useSafeAreaInsets()
  const offset = bottom ?? insets.bottom + 20

  return (
    <TouchableOpacity
      style={[s.root, { bottom: offset }, disabled && s.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <MaterialCommunityIcons name={icon} size={26} color="#fff" />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.primary,
    ...cardShadow,
  },
  disabled: {
    opacity: 0.6,
  },
})
