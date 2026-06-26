import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useI18n } from '../contexts/I18nContext'
import { useMobileUpdate } from '../contexts/MobileUpdateContext'
import { T } from '../theme'

function progressPercent(progress) {
  const ratio = Number(progress?.ratio || 0)

  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(ratio * 100)))
}

export default function GlobalUpdateProgressBar() {
  const insets = useSafeAreaInsets()
  const { t } = useI18n()
  const { updateState } = useMobileUpdate()

  const visible = updateState.status === 'downloading' || updateState.status === 'paused'

  if (!visible) {
    return null
  }

  const percent = progressPercent(updateState.progress)
  const title = updateState.status === 'paused'
    ? t('profile.downloadPaused')
    : t('profile.downloadContinuing')
  const subtitle = updateState.version
    ? t('profile.downloadBannerVersion', { version: updateState.version, percent })
    : `${percent}%`

  return (
    <View style={[s.wrap, { bottom: Math.max(insets.bottom, 10) + 72 }]}>
      <View style={s.card}>
        <View style={s.copy}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>

        <Text style={s.percent}>{percent}%</Text>
        <View style={s.bar}>
          <View style={[s.fill, { width: `${percent}%` }]} />
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  copy: {
    paddingRight: 50,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    color: T.textSecondary,
  },
  percent: {
    position: 'absolute',
    top: 12,
    right: 14,
    fontSize: 12,
    fontWeight: '800',
    color: T.text,
  },
  bar: {
    marginTop: 10,
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#dbeafe',
  },
  fill: {
    height: '100%',
    backgroundColor: T.primary,
  },
})
