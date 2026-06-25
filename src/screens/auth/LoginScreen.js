import Constants from 'expo-constants'
import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { useAuth } from '../../contexts/AuthContext'
import { useI18n } from '../../contexts/I18nContext'
import { T, cardShadow } from '../../theme'
import { DEFAULT_BRAND_SOURCE } from '../../utils/branding'

function CapabilityChip({ icon, label }) {
  return (
    <View style={s.capabilityChip}>
      <MaterialCommunityIcons name={icon} size={16} color={T.primary} />
      <Text style={s.capabilityText}>{label}</Text>
    </View>
  )
}

function firstApiErrorMessage(errors) {
  return Object.values(errors ?? {}).flat().find(Boolean)
}

function resolveErrorMessage(err, t) {
  if (err?.response) {
    const payload = err.response.data
    const message = payload?.message || payload?.error || firstApiErrorMessage(payload?.errors)

    if (message) {
      return message
    }

    return t('login.apiError', { status: err.response.status })
  }

  if (err?.code === 'ECONNABORTED') {
    return t('login.networkTimeout')
  }

  if (err?.message === 'Network Error') {
    return t('login.networkUnavailable')
  }

  return err?.message || t('login.genericError')
}

export default function LoginScreen() {
  const { login, authError, clearAuthError } = useAuth()
  const { locale, setLocale, supportedLocales, t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const version = Constants.expoConfig?.version || Constants.nativeAppVersion || '0.0.0'

  const handleLogin = async () => {
    if (!email.trim() || !password) return

    setBusy(true)
    setError('')
    clearAuthError?.()

    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(resolveErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={s.backgroundBubbleOne} />
      <View style={s.backgroundBubbleTwo} />
      <View style={s.backgroundBubbleThree} />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <View style={s.logo}>
            <Image source={DEFAULT_BRAND_SOURCE} style={s.logoImage} resizeMode="contain" />
          </View>
          <Text style={s.title}>{t('login.title')}</Text>
          <Text style={s.subtitle}>{t('login.subtitle')}</Text>
        </View>

        <View style={s.languageRow}>
          {supportedLocales.map((item) => {
            const active = locale === item.code

            return (
              <TouchableOpacity
                key={item.code}
                style={[s.languageChip, active && s.languageChipActive]}
                onPress={() => { void setLocale(item.code, { persist: false }) }}
              >
                <Text style={[s.languageChipText, active && s.languageChipTextActive]}>
                  {item.short} · {item.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={s.capabilities}>
          <CapabilityChip icon="truck-fast-outline" label={t('login.session')} />
          <CapabilityChip icon="account-group-outline" label={t('login.customers')} />
          <CapabilityChip icon="printer-wireless" label={t('login.billing')} />
        </View>

        <View style={[s.card, cardShadow]}>
          <Text style={s.cardTitle}>{t('login.cardTitle')}</Text>
          <Text style={s.cardSubtitle}>{t('login.cardSubtitle')}</Text>

          {!!(error || authError) && (
            <View style={s.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
              <Text style={s.errorText}>{error || authError}</Text>
            </View>
          )}

          <Text style={s.label}>{t('login.email')}</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              if (error) setError('')
              clearAuthError?.()
            }}
            placeholder={t('login.emailPlaceholder')}
            placeholderTextColor={T.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={s.label}>{t('login.password')}</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={(value) => {
              setPassword(value)
              if (error) setError('')
              clearAuthError?.()
            }}
            placeholder={t('login.passwordPlaceholder')}
            placeholderTextColor={T.textMuted}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity style={[s.primaryButton, busy && s.buttonDisabled]} onPress={handleLogin} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>{t('login.submit')}</Text>}
          </TouchableOpacity>
        </View>

        <View style={s.footerCard}>
          <Text style={s.footerTitle}>{t('common.version')} {version}</Text>
          <Text style={s.footerText}>{t('login.footer')}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#e7f7f3',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingVertical: 40,
  },
  backgroundBubbleOne: {
    position: 'absolute',
    top: 40,
    right: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(13, 148, 136, 0.18)',
  },
  backgroundBubbleTwo: {
    position: 'absolute',
    top: 170,
    left: -45,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(37, 99, 235, 0.10)',
  },
  backgroundBubbleThree: {
    position: 'absolute',
    bottom: 70,
    right: 28,
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(5, 150, 105, 0.14)',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.primary,
    marginBottom: 16,
  },
  logoImage: {
    width: 44,
    height: 44,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: T.text,
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: T.textSecondary,
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  languageChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  languageChipActive: {
    borderColor: T.primary,
    backgroundColor: 'rgba(13, 148, 136, 0.12)',
  },
  languageChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textSecondary,
  },
  languageChipTextActive: {
    color: T.primary,
  },
  capabilities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 18,
  },
  capabilityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(13, 148, 136, 0.18)',
  },
  capabilityText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textSecondary,
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    padding: 22,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: T.text,
  },
  cardSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    color: T.textMuted,
  },
  label: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: T.textMuted,
    textTransform: 'uppercase',
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    fontSize: 15,
    color: T.text,
    marginBottom: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: T.danger,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingVertical: 16,
    backgroundColor: T.primary,
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  footerCard: {
    marginTop: 18,
    alignItems: 'center',
  },
  footerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: T.textSecondary,
  },
  footerText: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    color: T.textMuted,
  },
})
