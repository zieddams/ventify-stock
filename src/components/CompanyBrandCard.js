import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { T } from '../theme'
import {
  DEFAULT_BRAND_SOURCE,
  resolveBrandCaption,
  resolveBrandHint,
  resolveBrandImageSource,
  resolveBrandName,
} from '../utils/branding'

export default function CompanyBrandCard({ user, style }) {
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    setLogoFailed(false)
  }, [user?.company?.logo_url])

  const imageSource = logoFailed ? DEFAULT_BRAND_SOURCE : resolveBrandImageSource(user)

  return (
    <View style={[s.card, style]}>
      <View style={s.logoShell}>
        <Image
          source={imageSource}
          style={s.logo}
          resizeMode="contain"
          onError={() => setLogoFailed(true)}
        />
      </View>

      <View style={s.copy}>
        <Text style={s.caption}>{resolveBrandCaption(user)}</Text>
        <Text style={s.title} numberOfLines={1}>{resolveBrandName(user)}</Text>
        <Text style={s.hint}>{resolveBrandHint(user)}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surface,
  },
  logoShell: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 42,
    height: 42,
  },
  copy: {
    flex: 1,
  },
  caption: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: T.textMuted,
  },
  title: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '800',
    color: T.text,
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: T.textSecondary,
  },
})
