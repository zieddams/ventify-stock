import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert,
} from 'react-native'
import { useAuth } from '../../contexts/AuthContext'

const T = {
  teal:  '#0d9488',
  tealD: '#0f766e',
  bg:    '#f1f5f9',
  card:  '#ffffff',
  base:  '#0f172a',
  muted: '#94a3b8',
  border:'#e2e8f0',
  red:   '#dc2626',
}

export default function LoginScreen() {
  const { login }        = useAuth()
  const [email, setEmail]= useState('')
  const [pass,  setPass] = useState('')
  const [busy,  setBusy] = useState(false)
  const [err,   setErr]  = useState('')

  const handleLogin = async () => {
    if (!email.trim() || !pass) return
    setBusy(true); setErr('')
    try {
      await login(email.trim(), pass)
    } catch (e) {
      const msg = e.response?.data?.message ?? e.response?.data?.error ?? 'Email ou mot de passe incorrect'
      setErr(msg)
    } finally { setBusy(false) }
  }

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoWrap}>
          <View style={s.logoCircle}>
            <Text style={s.logoIcon}>💧</Text>
          </View>
          <Text style={s.logoTitle}>El Irtiwaa</Text>
          <Text style={s.logoSub}>Gestion commerciale</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Connexion</Text>

          {!!err && (
            <View style={s.errBox}>
              <Text style={s.errText}>{err}</Text>
            </View>
          )}

          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="votre@email.com"
            placeholderTextColor={T.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={s.label}>Mot de passe</Text>
          <TextInput
            style={s.input}
            value={pass}
            onChangeText={setPass}
            placeholder="••••••••"
            placeholderTextColor={T.muted}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            style={[s.btn, busy && s.btnDisabled]}
            onPress={handleLogin}
            disabled={busy}
            activeOpacity={0.8}>
            {busy
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnText}>Se connecter</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={s.version}>v1.0.0 · El Irtiwaa</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: T.bg },
  scroll:     { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoWrap:   { alignItems: 'center', marginBottom: 32 },
  logoCircle: { width: 72, height: 72, borderRadius: 20, backgroundColor: T.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: T.teal, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  logoIcon:   { fontSize: 32 },
  logoTitle:  { fontSize: 24, fontWeight: '700', color: T.base, letterSpacing: -0.5 },
  logoSub:    { fontSize: 13, color: T.muted, marginTop: 2 },
  card:       { backgroundColor: T.card, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16, elevation: 3 },
  cardTitle:  { fontSize: 18, fontWeight: '700', color: T.base, marginBottom: 20 },
  errBox:     { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  errText:    { color: T.red, fontSize: 13 },
  label:      { fontSize: 12, fontWeight: '600', color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:      { backgroundColor: T.bg, borderColor: T.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, color: T.base, marginBottom: 16 },
  btn:        { backgroundColor: T.teal, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4, shadowColor: T.teal, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
  version:    { textAlign: 'center', color: T.muted, fontSize: 11, marginTop: 24 },
})
