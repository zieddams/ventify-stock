import Constants from 'expo-constants'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
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
import api, { BASE_URL } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { T, cardShadow } from '../../theme'

function CapabilityChip({ icon, label }) {
  return (
    <View style={s.capabilityChip}>
      <MaterialCommunityIcons name={icon} size={16} color={T.primary} />
      <Text style={s.capabilityText}>{label}</Text>
    </View>
  )
}

const API_HOST_LABEL = BASE_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

function firstApiErrorMessage(errors) {
  return Object.values(errors ?? {}).flat().find(Boolean)
}

function describeApiError(err, forConnectivity = false) {
  if (err.response) {
    const payload = err.response.data
    const message =
      payload?.message
      || payload?.error
      || firstApiErrorMessage(payload?.errors)

    if (message) {
      return message
    }

    return forConnectivity
      ? `API joignable, mais reponse invalide (${err.response.status}).`
      : `Erreur API (${err.response.status}).`
  }

  if (err.code === 'ECONNABORTED') {
    return forConnectivity
      ? 'API de production trop lente ou indisponible.'
      : 'Connexion API expiree. Verifiez la connectivite.'
  }

  if (err.message === 'Network Error') {
    return forConnectivity
      ? 'API de production inaccessible depuis ce mobile.'
      : 'Connexion API impossible. Verifiez internet ou l URL de production.'
  }

  return err.message || (forConnectivity ? 'API de production indisponible.' : 'Connexion impossible.')
}

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [apiStatus, setApiStatus] = useState({ state: 'checking', message: 'Verification de l API production...' })
  const version = Constants.expoConfig?.version || '1.2.1'

  const checkApiStatus = async () => {
    setApiStatus({ state: 'checking', message: 'Verification de l API production...' })

    try {
      const response = await api.get('/system/ping', { timeout: 7000 })
      const dbHealthy = response.data?.db_ok !== false
      setApiStatus({
        state: dbHealthy ? 'online' : 'warning',
        message: dbHealthy
          ? 'API production joignable.'
          : 'API joignable, mais la base de donnees ne repond pas correctement.',
      })
    } catch (err) {
      setApiStatus({ state: 'offline', message: describeApiError(err, true) })
    }
  }

  useEffect(() => {
    checkApiStatus()
  }, [])

  const handleLogin = async () => {
    if (!email.trim() || !password) return
    setBusy(true)
    setError('')

    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(describeApiError(err))

      if (!err.response || err.response.status >= 500) {
        setApiStatus({ state: 'offline', message: describeApiError(err, true) })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.backgroundBubbleOne} />
      <View style={s.backgroundBubbleTwo} />
      <View style={s.backgroundBubbleThree} />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.hero}>
          <View style={s.logo}>
            <MaterialCommunityIcons name="water-outline" size={36} color="#fff" />
          </View>
          <Text style={s.title}>El Irtiwaa Mobile</Text>
          <Text style={s.subtitle}>
            Session terrain, GPS et facturation relies a la plateforme de production.
          </Text>
        </View>

        <View style={s.capabilities}>
          <CapabilityChip icon="map-marker-radius-outline" label="GPS session" />
          <CapabilityChip icon="pulse" label="Presence mobile" />
          <CapabilityChip icon="sync" label="Mises a jour live" />
        </View>

        <View style={[s.card, cardShadow]}>
          <Text style={s.cardTitle}>Connexion</Text>
          <Text style={s.cardSubtitle}>Utilisez votre compte terrain ou staff.</Text>

          <View
            style={[
              s.apiStatusBox,
              apiStatus.state === 'online' && s.apiStatusOnline,
              apiStatus.state === 'warning' && s.apiStatusWarning,
              apiStatus.state === 'offline' && s.apiStatusOffline,
              apiStatus.state === 'checking' && s.apiStatusChecking,
            ]}>
            <MaterialCommunityIcons
              name={
                apiStatus.state === 'online'
                  ? 'cloud-check-outline'
                  : apiStatus.state === 'warning'
                    ? 'cloud-alert-outline'
                    : apiStatus.state === 'offline'
                      ? 'cloud-off-outline'
                      : 'cloud-sync-outline'
              }
              size={18}
              color={
                apiStatus.state === 'online'
                  ? '#047857'
                  : apiStatus.state === 'warning'
                    ? '#b45309'
                    : apiStatus.state === 'offline'
                      ? T.danger
                      : T.primary
              }
            />
            <View style={s.apiStatusCopy}>
              <Text style={s.apiStatusTitle}>{apiStatus.message}</Text>
              <Text style={s.apiStatusMeta}>{API_HOST_LABEL}</Text>
            </View>
            <TouchableOpacity
              style={s.apiRetryButton}
              onPress={checkApiStatus}
              disabled={apiStatus.state === 'checking'}>
              {apiStatus.state === 'checking'
                ? <ActivityIndicator size="small" color={T.primary} />
                : <MaterialCommunityIcons name="refresh" size={18} color={T.primary} />}
            </TouchableOpacity>
          </View>

          {!!error && (
            <View style={s.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={T.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="votre@email.com"
            placeholderTextColor={T.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={s.label}>Mot de passe</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Votre mot de passe"
            placeholderTextColor={T.textMuted}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity style={[s.primaryButton, busy && s.buttonDisabled]} onPress={handleLogin} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Se connecter</Text>}
          </TouchableOpacity>
        </View>

        <View style={s.footerCard}>
          <Text style={s.footerTitle}>Build mobile {version}</Text>
          <Text style={s.footerText}>
            Cible production, presence app, et suivi GPS disponibles selon vos autorisations.
          </Text>
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
  apiStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  apiStatusOnline: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  apiStatusWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  apiStatusOffline: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  apiStatusChecking: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  apiStatusCopy: {
    flex: 1,
  },
  apiStatusTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: T.text,
  },
  apiStatusMeta: {
    marginTop: 2,
    fontSize: 11,
    color: T.textMuted,
  },
  apiRetryButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
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
